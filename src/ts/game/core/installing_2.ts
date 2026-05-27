// Card installation mechanics.
// Mirrors: src/clj/game/core/installing.clj

import type { GameState, ServerZone } from "./state";
import type { Card, Zone } from "./card";
import type { EID } from "./eid";
import type { Ability, Counter } from "./types";
import {
  isAgenda,
  isAsset,
  isCorp,
  isEvent,
  isICE,
  isInstalled,
  isOperation,
  isProgram,
  isResource,
  isUpgrade,
  isRezzed,
  getZone,
  getTitle,
  getType,
  hasSubtype,
} from "./card";
import { getCardDef } from "./types";
const cardDef = getCardDef;
import {
  ignoreInstallCost,
  installAdditionalCostBonus,
  installCost,
} from "./cost_fns";
import { totalAvailableCredits, canPay } from "./costs";
import { mergeCosts } from "./payment";
import {
  makeEID,
  effectCompleted,
  completeWithResult,
  registerEIDCallback,
} from "./eid";
import {
  queueEvent,
  registerEvents,
  unregisterEvents,
  registerPendingEvent,
} from "./engine";
import {
  isDisabledReg,
  updateDisabledCards,
  registerStaticAbilities,
  unregisterStaticAbilities,
} from "./effects";
import { turnFlag, zoneLocked } from "./flags";
import { hasAncestor, host } from "./hosting";
import { updateBreakerStrength } from "./ice";
import {
  abilityInit,
  cardInit,
  corpAbilityInit,
  runnerAbilityInit,
} from "./initializing";
import { availableMU, expectedMU, sufficientMU, updateMU } from "./memory";
import { move, trash, trashCards, swapCards, swapInstalled } from "./moving";
import { createCreditCost } from "./payment";
import type { CostData } from "./payment";
import { addProp } from "./props";
import { reveal } from "./revealing";
import { rez } from "./rezzing";
import { multiMsg, playSfx, systemMsg, implementationMsg } from "./say";
import { nameZone, remoteNumToName } from "./servers";
import { makeRID } from "./state";
import { cardStr } from "./to_string";
import { toast } from "./toasts";
import { updateCard } from "./update";
import { updateAdvancementRequirement } from "./agendas";
import {
  allInstalled,
  getRemotes,
  serverToZone,
  allInstalledRunnerType,
  installableServers,
  getRemoteNames,
} from "./board";
import { continue_ability, req, wait_for } from "../macros";
import {
  dissocIn,
  enumerateStr,
  inColl,
  sameCard,
  toKeyword,
  quantify,
} from "../utils";
import { CORP_SIDE, RUNNER_SIDE } from "./state";
import { getCard } from "./finding";

import {
  corpInstall,
  runnerCanInstall,
  runnerInstallMessage,
  toC,
} from "./installing_1";

/**
 * Mirrors: runner-install-continue
 */
export function runnerInstallContinue(
  state: GameState,
  _side: string,
  eid: EID,
  card: Card,
  opts: {
    previousZone?: Zone;
    hostCard?: Card;
    facedown?: boolean;
    noMU?: boolean;
    noMsg?: boolean;
    paymentStr?: string;
    costs?: CostData[];
  },
): void {
  const cardType = getType(card);
  const rigZone: Zone = opts.facedown
    ? ["rig", "facedown"]
    : ["rig", toKeyword(cardType)];

  const c = opts.hostCard
    ? host(state, RUNNER_SIDE, opts.hostCard, card)
    : move(state, RUNNER_SIDE, card, rigZone);

  const updated = {
    ...c,
    installed: "this-turn",
    new: true,
    previousZone: opts.previousZone,
  } as unknown as Card;

  let installedCard: Card;
  if (opts.facedown) {
    updateCard(state, RUNNER_SIDE, updated);
    installedCard = updated;
  } else {
    installedCard = cardInit(state, RUNNER_SIDE, updated, {
      resolveEffect: false,
      initData: true,
      noMu: (opts as any).noMU ?? (opts as any).noMu,
    }) as Card;
  }

  if (!opts.noMsg) {
    runnerInstallMessage(
      state,
      RUNNER_SIDE,
      installedCard,
      opts.paymentStr ?? "",
      opts,
    );
  }

  if (!opts.facedown) {
    implementationMsg(state, card);
  }

  const cdef = cardDef(card);
  const installSound = !opts.facedown ? (cdef as any).installSound : null;
  playSfx(state, RUNNER_SIDE, installSound ?? "install-runner");

  updateDisabledCards(state);

  if (!opts.facedown && isResource(card)) {
    (state.runner.register as any)["installed-resource"] = true;
  }

  if (!opts.facedown && hasSubtype(installedCard, "Icebreaker")) {
    updateBreakerStrength(state, RUNNER_SIDE, installedCard);
  }

  queueEvent(state, "runner-install", {
    card: getCard(state, installedCard),
    costs: opts.costs,
    facedown: opts.facedown,
  });

  const onInstall = !opts.facedown ? (cdef as any).onInstall : null;
  if (onInstall) {
    registerPendingEvent(state, "runner-install", installedCard, onInstall);
  }

  wait_for(
    state,
    [
      [{ asyncResult: "result" }],
      function (s: GameState, _e: EID, _binds: any) {
        completeWithResult(s, RUNNER_SIDE, eid, getCard(s, installedCard));
      },
    ],
    [], // checkpoint state nil
    { eid },
  );
}

/**
 * Get the total install cost for specified card.
 * Mirrors: runner-install-cost
 */
function runnerInstallCost(
  state: GameState,
  _side: string,
  card: Card,
  opts: {
    baseCost?: CostData;
    ignoreInstallCost?: boolean;
    ignoreAllCost?: boolean;
    facedown?: boolean;
    costBonus?: number;
    cachedCosts?: CostData[];
  },
): CostData[] {
  if (opts.cachedCosts) return opts.cachedCosts;
  if (opts.ignoreAllCost || opts.facedown) return [toC("credit", 0)];

  const cost = installCost(
    state,
    RUNNER_SIDE,
    card,
    { costBonus: opts.costBonus },
    [],
  );
  const additionalCosts = installAdditionalCostBonus(state, RUNNER_SIDE, card);

  return mergeCosts([
    opts.baseCost,
    !opts.ignoreInstallCost && !opts.facedown ? toC("credit", cost ?? 0) : null,
    additionalCosts,
  ]);
}

/**
 * Gets the first (only) host effect of a card, if it exists and is not disabled.
 * Mirrors: some-hosting-effect
 */
function someHostingEffect(state: GameState, card: Card | null): any {
  if (!card || isDisabledReg(state, card)) return null;
  const cdef = cardDef(card);
  const staticAbilities = (cdef as any).staticAbilities ?? [];
  return staticAbilities.find((ab: any) => ab.type === "can-host") ?? null;
}

/**
 * Gets a list of all cards that the runner can host the install target on.
 * Mirrors: runner-can-host
 */
function runnerCanHost(
  state: GameState,
  _side: string,
  eid: EID,
  card: Card,
  opts: { hostCard?: Card; facedown?: boolean },
): Card[] | null {
  if (opts.hostCard || opts.facedown) return null;

  const allHosts = allInstalled(state, RUNNER_SIDE).filter((c: any) =>
    someHostingEffect(state, c),
  );
  const relevant = allHosts.filter((h: any) => {
    const ab = someHostingEffect(state, h);
    return !ab || !ab.req || ab.req(state, RUNNER_SIDE, eid, h, [card]);
  });

  return relevant.length > 0 ? relevant : null;
}

/**
 * Checks if runner can pay and install the card.
 * Mirrors: runner-can-pay-and-install?
 */
export function runnerCanPayAndInstall(
  state: GameState,
  _side: string,
  eid: EID,
  card: Card,
  opts?: {
    facedown?: boolean;
    hostCard?: Card;
    noHost?: boolean;
    costBonus?: number;
    "cost-bonus"?: number;
    [k: string]: any;
  },
): boolean {
  const args = opts ?? {};
  const eidWithSource = { ...eid, sourceType: "runner-install" };
  const hostAbi = args.hostCard
    ? someHostingEffect(state, args.hostCard)
    : null;
  const oldCostBonus = args.costBonus ?? 0;
  const newCostBonus = hostAbi?.costBonus ?? 0;
  const combinedCostBonus = oldCostBonus + newCostBonus;
  const costBonus = combinedCostBonus === 0 ? undefined : combinedCostBonus;

  const costs = runnerInstallCost(
    state,
    RUNNER_SIDE,
    { ...card, facedown: args.facedown },
    {
      ...args,
      costBonus,
    },
  );

  const canInstallDirectly =
    runnerCanInstall(state, RUNNER_SIDE, eid, card, {
      ...args,
      noToast: true,
    }) && canPay(state, RUNNER_SIDE, eidWithSource, card, null, costs) != null;

  if (canInstallDirectly) return true;

  // Some cards (hackerspace, dhegder) provide a discount to installing cards
  // so long as they are installed hosted on themselves
  if (!args.hostCard && !args.noHost) {
    const potentialHosts = runnerCanHost(state, RUNNER_SIDE, eid, card, args);
    if (potentialHosts) {
      return potentialHosts.some((h: any) =>
        runnerCanPayAndInstall(state, RUNNER_SIDE, eid, card, {
          ...args,
          hostCard: h,
        }),
      );
    }
  }

  return false;
}

/**
 * Runner install payment handler.
 * Mirrors: runner-install-pay
 */
function runnerInstallPay(
  state: GameState,
  _side: string,
  eid: EID,
  card: Card,
  opts: {
    noMU?: boolean;
    facedown?: boolean;
    hostCard?: Card;
    resolvedOptionalTrash?: boolean;
  },
): void {
  const costs = runnerInstallCost(
    state,
    RUNNER_SIDE,
    { ...card, facedown: opts.facedown },
    opts,
  );
  const availableMem = availableMU(state);
  const runnerWantsToTrash = !!(
    (state.runner.properties as any)?.trashLikeCards &&
    !opts.resolvedOptionalTrash
  );

  if (
    !runnerCanPayAndInstall(state, RUNNER_SIDE, eid, card, {
      ...opts,
      cachedCosts: costs,
    } as any)
  ) {
    effectCompleted(state, RUNNER_SIDE, eid);
    return;
  }

  if (
    isProgram(card) &&
    !opts.facedown &&
    (!opts.noMU || sufficientMU(state, card)) &&
    !runnerWantsToTrash
  ) {
    // Enough MU and no trash needed
    const playedCard = move(
      state,
      RUNNER_SIDE,
      { ...card, facedown: opts.facedown },
      "play-area",
      { suppressEvent: true },
    );

    wait_for(
      state,
      [
        [{ asyncResult: "result" }],
        function (s: GameState, _e: EID, binds: any) {
          const paymentStr = (binds.asyncResult as any)?.msg;
          if (paymentStr) {
            runnerInstallContinue(s, RUNNER_SIDE, eid, playedCard, {
              ...opts,
              costs,
              previousZone: card.zone,
              paymentStr,
            });
          } else {
            const returnedCard = move(
              s,
              RUNNER_SIDE,
              playedCard,
              card.zone ?? [],
              { suppressEvent: true },
            );
            updateCard(s, RUNNER_SIDE, {
              ...returnedCard,
              cid: card.cid,
              previousZone: card.previousZone,
            });
            effectCompleted(s, RUNNER_SIDE, eid);
          }
        },
      ],
      [
        // pay handler
        function (
          s: GameState,
          side: string,
          newEid: EID,
          c: Card,
          csts: CostData[],
        ) {},
        state,
        RUNNER_SIDE,
        makeEID(state),
        card,
        costs,
      ],
      { eid },
    );
    return;
  }

  // Need to trash programs or not enough MU
  if (
    isProgram(card) &&
    !opts.facedown &&
    (!opts.noMU || sufficientMU(state, card) || runnerWantsToTrash)
  ) {
    const allInstalledRunner = allInstalled(state, RUNNER_SIDE);
    const trashablePrograms = allInstalledRunner.filter(
      (c) =>
        isProgram(c) &&
        isInstalled(c) &&
        !(opts.hostCard && hasAncestor(c, opts.hostCard)),
    );

    continue_ability(
      state,
      RUNNER_SIDE,
      {
        prompt:
          runnerWantsToTrash && (opts.noMU || sufficientMU(state, card))
            ? `Trash installed programs before installing ${card.title ?? ""}?`
            : `Insufficient MU to install ${card.title ?? ""}. Trash installed programs?`,
        choices: {
          max: trashablePrograms.length,
          card: (c: Card) =>
            isInstalled(c) &&
            !(opts.hostCard && hasAncestor(c, opts.hostCard)) &&
            isProgram(c),
        },
        async: true,
        effect: req(() => {
          wait_for(
            state,
            [
              [{ asyncResult: "result" }],
              function (s: GameState, _e: EID, _binds: any) {
                updateMU(s);
                runnerInstallPay(s, RUNNER_SIDE, eid, card, {
                  ...opts,
                  resolvedOptionalTrash: true,
                });
              },
            ],
            [
              trashCards,
              state,
              RUNNER_SIDE,
              makeEID(state),
              [],
              { unpreventable: true, suppressCheckpoint: true },
            ],
            { eid },
          );
        }),
        cancel: {
          async: true,
          effect: req(() => {
            updateMU(state);
            if (
              availableMem === availableMU(state) &&
              !opts.noMU &&
              !sufficientMU(state, card)
            ) {
              effectCompleted(state, RUNNER_SIDE, eid);
            } else {
              runnerInstallPay(state, RUNNER_SIDE, eid, card, {
                ...opts,
                resolvedOptionalTrash: true,
              });
            }
          }),
        },
      },
      card,
      [],
    );
    return;
  }

  // Fallback - not enough MU and can't trash
  effectCompleted(state, RUNNER_SIDE, eid);
}

/**
 * Enforces limits on the total MU a host can support during install.
 * Mirrors: runner-host-enforce-specific-memory
 */
function runnerHostEnforceSpecificMemory(
  state: GameState,
  _side: string,
  eid: EID,
  card: Card,
  potentialHost: Card,
  opts: Record<string, unknown>,
): void {
  const hostAbi = someHostingEffect(state, potentialHost);
  const maxMU = hostAbi?.maxMU;
  if (!maxMU || !isProgram(card)) {
    runnerInstallPay(state, RUNNER_SIDE, eid, card, {
      ...opts,
      hostCard: potentialHost,
    });
    return;
  }

  const resolvedMaxMU =
    typeof maxMU === "function"
      ? maxMU(state, RUNNER_SIDE, eid, potentialHost, null)
      : maxMU;

  const relevantCards = (potentialHost.hosted ?? []).filter(isProgram);
  const currentMUHost = relevantCards.reduce(
    (sum: number, c: Card) => sum + expectedMU(state, c),
    0,
  );
  const cardMU = expectedMU(state, card);
  const newMU = cardMU + currentMUHost;
  const toEliminate = newMU - resolvedMaxMU;

  if (toEliminate > 0) {
    continue_ability(
      state,
      RUNNER_SIDE,
      {
        prompt: `${potentialHost.title} can only handle ${resolvedMaxMU} MU of programs - trash programs on ${card.title} worth at least ${toEliminate} MU`,
        choices: {
          req: req(() => true),
          max: relevantCards.length,
          min: 1,
        },
        async: true,
        effect: req(() => {
          wait_for(
            state,
            [
              [{ asyncResult: "result" }],
              function (s: GameState, _e: EID, _binds: any) {
                updateMU(s);
                runnerHostEnforceSpecificMemory(
                  s,
                  RUNNER_SIDE,
                  eid,
                  card,
                  getCard(s, potentialHost) as Card,
                  opts,
                );
              },
            ],
            [
              trashCards,
              state,
              RUNNER_SIDE,
              makeEID(state),
              [],
              { unpreventable: true, suppressCheckpoint: true },
            ],
            { eid },
          );
        }),
      },
      card,
      [],
    );
  } else {
    runnerInstallPay(state, RUNNER_SIDE, eid, card, {
      ...opts,
      hostCard: potentialHost,
    });
  }
}

/**
 * Enforces limits on the number of hosted cards a host can have during install.
 * Mirrors: runner-host-enforce-card-limits
 */
function runnerHostEnforceCardLimits(
  state: GameState,
  _side: string,
  eid: EID,
  card: Card,
  potentialHost: Card,
  opts: Record<string, unknown>,
): void {
  const hostAbi = someHostingEffect(state, potentialHost);
  const maxCards = hostAbi?.maxCards;
  if (!maxCards) {
    runnerHostEnforceSpecificMemory(
      state,
      RUNNER_SIDE,
      eid,
      card,
      potentialHost,
      opts,
    );
    return;
  }

  const resolvedMaxCards =
    typeof maxCards === "function"
      ? maxCards(state, RUNNER_SIDE, eid, potentialHost, null)
      : maxCards;

  const isConditionCounter = (c: Card): boolean => c.type === "Counter";
  const relevantCards = (potentialHost.hosted ?? []).filter(
    (c) => !isConditionCounter(c),
  );
  const newTotal = 1 + relevantCards.length;
  const toDestroy = newTotal - resolvedMaxCards;

  if (toDestroy > 0) {
    continue_ability(
      state,
      RUNNER_SIDE,
      {
        prompt: `Insufficient Space - Choose at least ${quantify(toDestroy, "card")} on ${potentialHost.title} to trash`,
        choices: {
          req: req(() => true),
          min: toDestroy,
          max: relevantCards.length,
        },
        async: true,
        effect: req(() => {
          wait_for(
            state,
            [
              [{ asyncResult: "result" }],
              function (s: GameState, _e: EID, _binds: any) {
                updateMU(s);
                runnerHostEnforceSpecificMemory(
                  s,
                  RUNNER_SIDE,
                  eid,
                  card,
                  getCard(s, potentialHost) as Card,
                  opts,
                );
              },
            ],
            [
              trashCards,
              state,
              RUNNER_SIDE,
              makeEID(state),
              [],
              { unpreventable: true, suppressCheckpoint: true },
            ],
            { eid },
          );
        }),
      },
      card,
      [],
    );
  } else {
    runnerHostEnforceSpecificMemory(
      state,
      RUNNER_SIDE,
      eid,
      card,
      potentialHost,
      opts,
    );
  }
}

/**
 * Have the runner choose where they are hosting the given card.
 * Mirrors: runner-host-choice
 */
function runnerHostChoice(
  state: GameState,
  _side: string,
  eid: EID,
  card: Card,
  potentialHosts: Card[],
  opts: Record<string, unknown>,
): void {
  continue_ability(
    state,
    RUNNER_SIDE,
    {
      choices: [...potentialHosts.map((h: any) => h.title ?? ""), "The Rig"],
      prompt: `Choose a destination for ${card.title ?? ""}`,
      async: true,
      effect: req(() => {
        // target is selected choice
      }),
    },
    card,
    [],
  );
}

/**
 * Installs specified runner card if able.
 * Mirrors: runner-install
 */
export function runnerInstall(state: any, side?: any, eid?: any, card?: any, opts?: any): any;
export function runnerInstall(
  state: GameState,
  _side: string,
  eid: EID,
  card: Card,
  opts?: {
    hostCard?: Card;
    facedown?: boolean;
    costBonus?: number;
    noMU?: boolean;
    [key: string]: unknown;
  } | null,
): void {
  const args = { ...(opts ?? {}) };
  const eidWithSource = { ...eid, sourceType: "runner-install" };
  const cdef = cardDef(card);
  const hosting = (cdef as any).hosting;
  const hasHosting = !args.hostCard && !args.facedown && hosting;

  if (hasHosting) {
    continue_ability(
      state,
      RUNNER_SIDE,
      {
        choices: hosting,
        prompt: `Choose a card to host ${card.title ?? ""} on`,
        async: true,
        effect: req(() => {
          runnerInstallPay(state, RUNNER_SIDE, eid, card, {
            ...args,
            hostCard: (args as any).target as Card,
          });
        }),
      },
      card,
      [],
    );
  } else {
    const potentialHosts = runnerCanHost(state, RUNNER_SIDE, eid, card, args);
    if (potentialHosts) {
      runnerHostChoice(state, RUNNER_SIDE, eid, card, potentialHosts, args);
    } else {
      runnerInstallPay(state, RUNNER_SIDE, eid, card, args);
    }
  }
}

// ===========================================================================
// Condition counter installation
// ===========================================================================

/**
 * Install the event or operation onto the target as a condition counter.
 * Mirrors: install-as-condition-counter
 */
export function installAsConditionCounter(eid: EID, card: Card, target: Card): void;
export function installAsConditionCounter(state: GameState, side: string, eid: EID, card: Card, target: Card): void;
export function installAsConditionCounter(...rawArgs: any[]): void {
  let state: GameState, eid: EID, card: Card, target: Card;
  if (rawArgs.length === 3) {
    // shorthand without state — no-op (cannot install without state)
    return;
  }
  state = rawArgs[0];
  eid = rawArgs[2];
  card = rawArgs[3];
  target = rawArgs[4];
  if (!isEvent(card) && !isOperation(card)) {
    throw new Error("condition counter must be event or operation");
  }

  const cdef = cardDef(card);
  const abilities = abilityInit(cdef);
  const corpAbilities = corpAbilityInit(cdef);
  const runnerAbilities = runnerAbilityInit(cdef);
  const convertedCard = convertToConditionCounter(card);

  const events = ((cdef as any).events ?? []).filter(
    (e: any) => e.condition === "hosted",
  );

  if (isCorp(card)) {
    wait_for(
      state,
      [
        [{ asyncResult: "result" }],
        function (s: GameState, _e: EID, _binds: any) {
          const updatedCard = {
            ..._binds.asyncResult,
            abilities,
            runnerAbilities,
          } as Card;
          updateCard(s, CORP_SIDE, updatedCard);
          unregisterEvents(s, CORP_SIDE, updatedCard);
          unregisterStaticAbilities(s, CORP_SIDE, updatedCard);
          registerEvents(s, CORP_SIDE, updatedCard, events);
          registerStaticAbilities(s, CORP_SIDE, updatedCard);
          completeWithResult(s, CORP_SIDE, eid, updatedCard);
        },
      ],
      [
        corpInstall,
        state,
        CORP_SIDE,
        makeEID(state),
        convertedCard,
        target,
        { hostCard: target, ignoreAllCost: true },
      ],
      { eid },
    );
  } else {
    wait_for(
      state,
      [
        [{ asyncResult: "result" }],
        function (s: GameState, _e: EID, _binds: any) {
          const updatedCard = {
            ..._binds.asyncResult,
            abilities,
            corpAbilities,
          } as Card;
          updateCard(s, RUNNER_SIDE, updatedCard);
          unregisterEvents(s, RUNNER_SIDE, updatedCard);
          unregisterStaticAbilities(s, RUNNER_SIDE, updatedCard);
          registerEvents(s, RUNNER_SIDE, updatedCard, events);
          registerStaticAbilities(s, RUNNER_SIDE, updatedCard);
          completeWithResult(s, RUNNER_SIDE, eid, updatedCard);
        },
      ],
      [
        runnerInstall,
        state,
        RUNNER_SIDE,
        makeEID(state),
        convertedCard,
        { hostCard: target, ignoreAllCost: true },
      ],
      { eid },
    );
  }
}

/**
 * Converts a card to a condition counter.
 * Mirrors: convert-to-condition-counter
 */
function convertToConditionCounter(card: Card): Card {
  return {
    ...card,
    type: "Counter",
    subtype: "Condition Counter",
  };
}

// ===========================================================================
// Swap cards async
// ===========================================================================

/**
 * Swaps two cards when one or both aren't installed.
 * Mirrors: swap-cards-async
 */
export function swapCardsAsync(state: GameState, side: string, a: Card, b: Card): void;
export function swapCardsAsync(state: GameState, side: string, eid: EID, a: Card, b: Card): void;
export function swapCardsAsync(...args: any[]): void {
  let state: GameState, side: string, eid: EID, a: Card, b: Card;
  if (args.length === 4) {
    [state, side, a, b] = args as [GameState, string, Card, Card];
    eid = makeEID(state);
  } else {
    [state, side, eid, a, b] = args as [GameState, string, EID, Card, Card];
  }
  if (side === CORP_SIDE) {
    const result = swapCards(state, CORP_SIDE, a, b);
    const movedA = Array.isArray(result) ? (result[0] as Card) : result;
    const movedB = Array.isArray(result) ? (result[1] as Card) : result;
    const installEvent = [movedA, movedB].filter(isInstalled).length === 1;

    if (installEvent) {
      const installedCard = isInstalled(movedA) ? movedA : movedB;
      const cdef = cardDef(installedCard);
      queueEvent(state, "corp-install", {
        card: getCard(state, installedCard),
        installState: (cdef as any).installState,
      });
      wait_for(
        state,
        [
          [{ asyncResult: "result" }],
          function (s: GameState, _e: EID, _binds: any) {
            completeWithResult(s, CORP_SIDE, eid, result);
          },
        ],
        [], // checkpoint
        { eid },
      );
    } else {
      completeWithResult(state, CORP_SIDE, eid, result);
    }
  } else {
    // Runner side
    const aInstalled = isInstalled(a);
    const bInstalled = isInstalled(b);
    const installedCount = (aInstalled ? 1 : 0) + (bInstalled ? 1 : 0);

    if (installedCount === 0) {
      completeWithResult(
        state,
        RUNNER_SIDE,
        eid,
        swapCards(state, RUNNER_SIDE, a, b),
      );
    } else if (installedCount === 1) {
      const oldInstalled = aInstalled ? a : b;
      const toInstall = aInstalled ? b : a;
      const toInstallZone = getZone(toInstall);

      const movedA = move(state, RUNNER_SIDE, oldInstalled, toInstallZone, {
        index: oldInstalled.index,
        suppressEvent: true,
        swap: true,
      });

      const installArgs = {
        previousZone: toInstall.zone,
        hostCard: oldInstalled.host
          ? getCard(state, oldInstalled.host)
          : undefined,
        noMU: oldInstalled.host
          ? (someHostingEffect(state, getCard(state, oldInstalled.host)) as any)
              ?.noMU
          : undefined,
        noMsg: true,
      };

      wait_for(
        state,
        [
          [{ asyncResult: "result" }],
          function (s: GameState, _e: EID, _binds: any) {
            completeWithResult(s, RUNNER_SIDE, eid, [movedA, movedA]);
          },
        ],
        [runnerInstallContinue, state, RUNNER_SIDE, toInstall, installArgs],
        { eid },
      );
    } else {
      // Should not be possible (both installed)
      completeWithResult(state, RUNNER_SIDE, eid, null);
    }
  }
}
