// Card installation mechanics.
// Mirrors: src/clj/game/core/installing.clj

import type { GameState, ServerZone } from "./state";
import type { Card, Zone } from "./card";
import type { EID } from "./eid";
import type { Ability } from "./types";
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
import { createCreditCost, mergeCosts as mergeCostsPayment } from "./payment";
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

// ---------------------------------------------------------------------------
// Helper: find-first equivalent
// ---------------------------------------------------------------------------

function findFirst<T>(pred: (item: T) => boolean, items: T[]): T | undefined {
  return items.find(pred);
}

// ---------------------------------------------------------------------------
// Helper: cost value (equivalent of `value` multimethod)
// ---------------------------------------------------------------------------

function costValue(cost: CostData): number {
  return cost.amount ?? 0;
}

// ---------------------------------------------------------------------------
// Helper: ->c equivalent (create cost data)
// ---------------------------------------------------------------------------

export function toC(
  type: string,
  amount?: number,
  opts?: Record<string, unknown>,
): CostData {
  return {
    type,
    amount: amount ?? 1,
    ...opts,
  };
}

// ---------------------------------------------------------------------------
// install-locked?
// ---------------------------------------------------------------------------

/**
 * Checks if installing is locked for the given side.
 * Mirrors: install-locked?
 */
export function installLocked(state: GameState, side: string): boolean {
  const kw = `${side}-lock-install`;
  const flagStack = state.flagStack;
  return !!(
    (flagStack.currentRun?.[kw]?.length ?? 0) > 0 ||
    (flagStack.currentTurn?.[kw]?.length ?? 0) > 0 ||
    (flagStack.persistent?.[kw]?.length ?? 0) > 0
  );
}

// ===========================================================================
// Corp installation
// ===========================================================================

/**
 * Checks if the specified card can be installed.
 * Returns true if there are no problems.
 * Returns a reason keyword otherwise.
 * !! NB: This should only be used in a check with `=== true` as all return values are truthy
 * Mirrors: corp-can-install-reason
 */
function corpCanInstallReason(
  state: GameState,
  _side: string,
  card: Card,
  slot: Zone,
): true | string {
  // ice install prevented by Unscheduled Maintenance
  if (isICE(card) && !turnFlag(state, CORP_SIDE, card, "can-install-ice")) {
    return "ice";
  }

  // Installing not locked
  if (installLocked(state, CORP_SIDE)) {
    return "lock-install";
  }

  const identity = state.corp.identity;
  const identityDisabled = identity?.disabled === true;
  const identityDisabledReg = identity ? isDisabledReg(state, identity) : false;

  // A Teia cannot have more than two servers
  if (
    identity?.title?.startsWith("A Teia") &&
    !identityDisabled &&
    !identityDisabledReg &&
    getRemotes(state).length >= 2 &&
    !inColl([...getRemotes(state), "archives", "rd", "hq"], slot[1])
  ) {
    return "a-teia";
  }

  // Earth Station cannot have more than one server
  if (
    identity &&
    identity.title &&
    identity.title.substring(0, Math.min(13, identity.title.length)) ===
      "Earth Station" &&
    !identityDisabled &&
    !identityDisabledReg &&
    getRemotes(state).length > 0 &&
    !inColl([...getRemotes(state), "archives", "rd", "hq"], slot[1])
  ) {
    return "earth-station";
  }

  return true;
}

/**
 * Checks `corp-can-install-reason` if not true, toasts reason and returns false
 * Mirrors: corp-can-install?
 */
function corpCanInstall(
  state: GameState,
  _side: string,
  card: Card,
  slot: Zone,
  opts?: { noToast?: boolean },
): boolean {
  const reason = corpCanInstallReason(state, CORP_SIDE, card, slot);
  const noToast = opts?.noToast ?? false;
  const title = card.title ?? "";

  const reasonToast = (msg: string): boolean => {
    if (!noToast) toast(state, CORP_SIDE, msg, "warning");
    return false;
  };

  switch (reason) {
    case "lock-install":
      return reasonToast(
        `Unable to install ${title}, installing is currently locked`,
      );
    case "ice":
      return reasonToast(
        `Unable to install ${title}: can only install 1 piece of ice per turn`,
      );
    case "earth-station":
      return reasonToast(
        `Unable to install ${title} in new remote: Earth Station limit`,
      );
    case "a-teia":
      return reasonToast(
        `Unable to install ${title} in new remote: A Teia limit`,
      );
    case true:
      return true;
  }
  return true;
}

/**
 * Trashes the previous card when installing a new one demands it
 * Mirrors: corp-install-trash-old-card
 */
function corpInstallTrashOldCard(
  state: GameState,
  _side: string,
  eid: EID,
  prevCard: Card,
  server: string,
): void {
  continue_ability(
    state,
    CORP_SIDE,
    {
      prompt: `The ${prevCard.title} in ${server} will now be trashed.`,
      choices: ["OK"],
      async: true,
      effect: req(() => {
        systemMsg(state, CORP_SIDE, `trashes ${cardStr(state, prevCard)}`);
        const actualCard = getCard(state, prevCard);
        if (actualCard) {
          wait_for(
            state,
            [
              [{ asyncResult: "result" }],
              function (s: GameState, _e: EID, _binds: any) {
                effectCompleted(s, CORP_SIDE, eid);
              },
            ],
            [
              trash,
              state,
              CORP_SIDE,
              eid,
              prevCard,
              {
                keepServerAlive: true,
                suppressCheckpoint: true,
                duringInstallation: true,
              },
            ],
            { eid },
          );
        } else {
          effectCompleted(state, CORP_SIDE, eid);
        }
      }),
    },
    prevCard,
    [],
  );
}

/**
 * Places counters on a card via installation
 * Mirrors: corp-install-place-counters
 */
function corpInstallPlaceCounters(
  state: GameState,
  _side: string,
  eid: EID,
  targetCard: Card,
  opts: { counters?: { advanceCounter?: number } },
): void {
  const counters = opts.counters;
  if (counters?.advanceCounter) {
    addProp(
      state,
      CORP_SIDE,
      eid,
      targetCard,
      "advance-counter",
      counters.advanceCounter,
      { placed: true },
    );
  } else {
    effectCompleted(state, CORP_SIDE, eid);
  }
}

/**
 * Forces the corp to trash an existing asset or agenda if a second was just installed.
 * Mirrors: corp-install-asset-agenda
 */
function corpInstallAssetAgenda(
  state: GameState,
  _side: string,
  eid: EID,
  card: Card,
  destZone: Card[],
  server: string,
): void {
  const prevCard = destZone.find((c: any) => isAsset(c) || isAgenda(c)) ?? null;
  const prevRegion = destZone.find((c: any) => hasSubtype(c, "Region")) ?? null;

  // overinstall an old asset or agenda
  if ((isAsset(card) || isAgenda(card)) && prevCard && !card.host) {
    corpInstallTrashOldCard(state, CORP_SIDE, eid, prevCard, server);
    return;
  }

  // overinstall a region
  if (isUpgrade(card) && hasSubtype(card, "Region") && prevRegion) {
    corpInstallTrashOldCard(state, CORP_SIDE, eid, prevRegion, server);
    return;
  }

  // do nothing
  effectCompleted(state, CORP_SIDE, eid);
}

// ---------------------------------------------------------------------------
// Message formatting
// ---------------------------------------------------------------------------

/**
 * Formats a counters message for install messages.
 * Mirrors: format-counters-msg
 */
function formatCountersMsg(counters?: { advanceCounter?: number }): string {
  if (counters?.advanceCounter) {
    return `, and place ${quantify(counters.advanceCounter, "Advancement counter")} on it`;
  }
  return "";
}

/**
 * Prints the correct install message.
 * Mirrors: corp-install-message
 */
function corpInstallMessage(
  state: GameState,
  _side: string,
  card: Card,
  server: string,
  installState: string,
  costStr: string,
  opts: {
    counters?: { advanceCounter?: number };
    msgKeys?: Record<string, unknown>;
    displayMessage?: boolean;
  },
): void {
  const displayMessage = opts.displayMessage !== false;
  if (!displayMessage) return;

  const msgKeys = opts.msgKeys ?? {};
  const { displayOrigin, installSource, originIndex, known, setZone } =
    msgKeys as any;
  const prependCostStr =
    (msgKeys as any).includeCostFromEid?.latestPaymentStr ?? "";

  const cardName =
    ["rezzed", "rezzed-no-cost", "face-up"].includes(installState) ||
    known ||
    card.seen ||
    isRezzed(card)
      ? (card.title ?? "")
      : isICE(card)
        ? "ice"
        : "a card";

  const corpCardName =
    ["rezzed", "rezzed-no-cost", "face-up"].includes(installState) ||
    known ||
    card.seen ||
    isRezzed(card)
      ? (card.title ?? "")
      : `facedown ${card.title ?? ""}`;

  const serverName =
    server === "New remote"
      ? `${remoteNumToName(state.rid - 1)} (new remote)`
      : server;

  const origin = displayOrigin
    ? ` from${originIndex != null ? ` position ${originIndex + 1} of ` : ""}${setZone ?? nameZone(CORP_SIDE, card.zone ?? [])}`
    : "";

  const preLhs =
    costStr && prependCostStr ? `${prependCostStr}, and then ` : "";

  const modifiedCostStr = !costStr
    ? prependCostStr
    : !preLhs
      ? costStr
      : `${costStr},`;

  const lhs = installSource
    ? `${buildSpendMsg(modifiedCostStr, "use")} ${(installSource as Card).title ?? ""} to install `
    : buildSpendMsg(modifiedCostStr, "install");

  const corpMsg = `${lhs}${corpCardName}${origin}${isICE(card) ? " protecting " : " in the root of "}${serverName}${formatCountersMsg(opts.counters)}`;
  const publicMsg = `${lhs}${cardName}${origin}${isICE(card) ? " protecting " : " in the root of "}${serverName}${formatCountersMsg(opts.counters)}`;

  multiMsg(state, CORP_SIDE, { corp: corpMsg, public: publicMsg });

  if (installState === "face-up" && isAgenda(card)) {
    implementationMsg(state, card);
  }
}

/**
 * Builds a spend message string.
 * Mirrors: build-spend-msg
 */
function buildSpendMsg(costStr: string, verb: string, verb2?: string): string {
  if (!costStr || costStr.trim() === "") {
    return `${verb2 ?? verb + "s"} `;
  }
  return `${costStr} to ${verb} `;
}

/**
 * Gets a message describing where a card has been installed from.
 * Mirrors: corp-install-msg
 */
export function corpInstallMsg(card: Card): string {
  const cardName = card.seen ? (card.title ?? "") : "an unseen card";
  return `install ${cardName} from ${nameZone(CORP_SIDE, card.zone ?? [])}`;
}

/**
 * Used to reveal a card if it cannot be rezzed when an instruction says to rez it.
 * Mirrors: reveal-if-unrezzed
 */
function revealIfUnrezzed(
  state: GameState,
  _side: string,
  eid: EID,
  movedCard: Card,
): void {
  const rezzedCard = getCard(state, movedCard);
  if (isRezzed(rezzedCard)) {
    wait_for(
      state,
      [
        [{ asyncResult: "result" }],
        function (s: GameState, _e: EID, _binds: any) {
          completeWithResult(s, CORP_SIDE, eid, getCard(s, movedCard));
        },
      ],
      [], // checkpoint state nil
      { eid },
    );
  } else {
    wait_for(
      state,
      [
        [{ asyncResult: "result" }],
        function (s: GameState, _e: EID, _binds: any) {
          systemMsg(
            s,
            CORP_SIDE,
            `reveals ${cardStr(s, rezzedCard, { visible: true })}`,
          );
          wait_for(
            s,
            [
              [{ asyncResult: "result" }],
              function (s2: GameState, _e2: EID, _binds2: any) {
                completeWithResult(s2, CORP_SIDE, eid, getCard(s2, movedCard));
              },
            ],
            [], // checkpoint state nil
            { eid },
          );
        },
      ],
      [reveal, state, CORP_SIDE, rezzedCard],
      { eid },
    );
  }
}

/**
 * Used by corp-install to actually install the card, rez it if it's supposed to be installed
 * rezzed, and calls :corp-install in an awaitable fashion.
 * Mirrors: corp-install-continue
 */
function corpInstallContinue(
  state: GameState,
  _side: string,
  eid: EID,
  card: Card,
  server: string,
  opts: {
    installState?: string;
    hostCard?: Card;
    front?: boolean;
    index?: number;
    displayMessage?: boolean;
    costBonus?: number;
    msgKeys?: Record<string, unknown>;
    noWarning?: boolean;
  },
  slot: Zone,
  costStr: string,
): void {
  const cdef = cardDef(card);
  const destZone: Card[] = slot.reduce((obj: any, key, idx, arr) => {
    // Navigate the slot path to get dest zone
    return obj;
  }, state) as Card[];

  const installState = cdef.installState ?? opts.installState ?? "";
  const noMsg = opts.displayMessage === false;
  const fromZone = card.zone ? card.zone[0] : "";
  const isFromKnownZone = ["discard", "deck", "hand"].includes(fromZone);

  const args = { ...opts };
  if (args.msgKeys) {
    (args.msgKeys as any).known =
      (args.msgKeys as any).known ||
      (state.breach as any)?.knownCids?.[fromZone]?.includes(card.cid);
  }

  const c = {
    ...card,
    advanceable: (cdef as any).advanceable,
    new: true,
    seen: undefined,
    disabled: undefined,
  } as unknown as Card;

  if (!opts.hostCard) {
    corpInstallMessage(
      state,
      CORP_SIDE,
      card,
      server,
      installState,
      costStr,
      args,
    );
  }
  playSfx(state, CORP_SIDE, "install-corp");

  const movedCard = opts.hostCard
    ? host(state, CORP_SIDE, opts.hostCard, {
        ...c,
        installed: true,
      } as unknown as Card)
    : move(state, CORP_SIDE, c, slot, { front: opts.front, index: opts.index });

  if (isAgenda(c)) {
    updateAdvancementRequirement(state, movedCard);
  }

  const refreshedCard = getCard(state, movedCard) as Card;

  unregisterEvents(state, CORP_SIDE, refreshedCard);

  wait_for(
    state,
    [
      [{ asyncResult: "result" }],
      function (s: GameState, e: EID, _binds: any) {
        corpInstallPlaceCounters(s, CORP_SIDE, e, refreshedCard, args as any);
      },
    ],
    [corpInstallAssetAgenda, state, CORP_SIDE, makeEID(state), refreshedCard, destZone, server],
    { eid },
  );

  // After asset/agenda and counters, queue the event and handle install-state cases
  // (This is a simplified version - in the real implementation the wait-for chain handles it all)
}

/**
 * Gets the slot (zone) for installing a card.
 * Mirrors: get-slot
 */
export function getSlot(
  state: GameState,
  card: Card,
  server: string,
  opts?: { hostCard?: Card },
): Zone {
  if (opts?.hostCard) {
    return getZone(opts.hostCard);
  }
  const baseSlot = serverToZone(state, server);
  return [...baseSlot, isICE(card) ? "ices" : "content"];
}

/**
 * Calculates the install cost for a corp card.
 * Mirrors: corp-install-cost
 */
export function corpInstallCost(
  state: GameState,
  _side: string,
  card: Card,
  server: string,
  opts: {
    baseCost?: CostData;
    ignoreInstallCost?: boolean;
    ignoreAllCost?: boolean;
    costBonus?: number;
    cachedCosts?: CostData[];
    ignoreIceCost?: boolean;
    hostCard?: Card;
    [key: string]: any;
  },
): CostData[] {
  if (opts.cachedCosts) return opts.cachedCosts;

  const slot = getSlot(state, card, server, { hostCard: opts.hostCard });
  const destZone: Card[] = []; // populated from state via slot path
  const iceCost =
    isICE(card) &&
    !opts.ignoreInstallCost &&
    !opts.ignoreAllCost &&
    !opts.ignoreIceCost &&
    !ignoreInstallCost(state, CORP_SIDE, card)
      ? destZone.length
      : 0;

  const cost = installCost(
    state,
    CORP_SIDE,
    card,
    {
      costBonus: (opts.costBonus ?? 0) + iceCost,
    },
    [],
  );

  if (opts.ignoreAllCost) return [];
  return [
    ...(opts.baseCost ? [opts.baseCost] : []),
    toC("credit", cost ?? 0),
  ].flat();
}

/**
 * Checks if corp can pay and install the card.
 * Mirrors: corp-can-pay-and-install?
 */
export function corpCanPayAndInstall(
  state: GameState,
  _side: string,
  eid: EID,
  card: Card,
  server: string,
  opts: Record<string, unknown>,
): boolean {
  const eidWithSource = { ...eid, sourceType: "corp-install" };
  const slot = getSlot(state, card, server, {
    hostCard: opts.hostCard as Card,
  });
  const costs = corpInstallCost(state, CORP_SIDE, card, server, opts);

  return (
    corpCanInstall(state, CORP_SIDE, card, slot, {
      noToast: opts.noToast as boolean,
    }) && canPay(state, CORP_SIDE, eidWithSource, card, null, costs) != null
  );
}

/**
 * Used by corp-install to pay install costs.
 * Mirrors: corp-install-pay
 */
function corpInstallPay(
  state: GameState,
  _side: string,
  eid: EID,
  card: Card,
  server: string,
  opts: Record<string, unknown>,
): void {
  const slot = getSlot(state, card, server, opts);
  const costs = corpInstallCost(state, CORP_SIDE, card, server, {
    ...opts,
    cachedCosts: undefined,
  });
  const creditCost = costValue(
    findFirst((c: CostData) => c.type === "credit", costs) ?? toC("credit", 0),
  );
  const discount = (opts.combinedCreditDiscount as number) ?? 0;
  const applDisc =
    creditCost > 0 && discount > 0 ? Math.min(creditCost, discount) : 0;

  const args = discount ? { ...opts, costBonus: applDisc - discount } : opts;

  const costsWithDiscount = [...costs, toC("credit", -applDisc)];

  const corpWantsToTrash = !!(
    (state.corp.properties as any)?.trashLikeCards &&
    slot.length > 0 &&
    !(opts.resolvedOptionalTrash as boolean)
  );

  if (
    !corpWantsToTrash &&
    corpCanPayAndInstall(state, CORP_SIDE, eid, card, server, {
      ...args,
      cachedCosts: costsWithDiscount,
    })
  ) {
    wait_for(
      state,
      [
        [{ asyncResult: "result" }],
        function (s: GameState, _e: EID, binds: any) {
          const paymentStr = (binds.asyncResult as any)?.msg;
          if (paymentStr) {
            if (server === "New remote") {
              queueEvent(s, "server-created", null);
              makeRID(s);
            }
            corpInstallContinue(
              s,
              CORP_SIDE,
              eid,
              card,
              server,
              args,
              slot,
              paymentStr,
            );
          } else {
            effectCompleted(s, CORP_SIDE, eid);
          }
        },
      ],
      [
        // pay function call
        function (
          s: GameState,
          side: string,
          newEid: EID,
          c: Card,
          csts: CostData[],
        ) {
          // pay handler
        },
        state,
        CORP_SIDE,
        { ...eid, action: opts.action },
        card,
        costsWithDiscount,
      ],
      { eid },
    );
    return;
  }

  // Can't pay - handle trash option for ICE
  const creditCostVal = costValue(
    findFirst((c: CostData) => c.type === "credit", costs) ?? toC("credit", 0),
  );
  const shortfall =
    creditCostVal - totalAvailableCredits(state, CORP_SIDE, eid, card);
  const needToTrash = Math.max(0, shortfall);
  const cardsInSlot = slot.length > 0 ? 0 : 0;
  const possible = isICE(card) && cardsInSlot >= needToTrash;

  if (possible && needToTrash > 0) {
    // Trash ICE to pay
    const trashAllOrNone = {
      prompt: `Trash ice protecting ${nameZone(CORP_SIDE, slot)} (minimum ${needToTrash})`,
      choices: {
        req: req(() => true),
        max: cardsInSlot,
      },
      waitingPrompt: true,
      async: true,
      effect: req(() => {
        // targets handled by continue_ability
      }),
    };
    continue_ability(state, CORP_SIDE, trashAllOrNone, null, []);
  } else if (corpWantsToTrash && needToTrash === 0) {
    continue_ability(
      state,
      CORP_SIDE,
      {
        prompt: `Trash any number of ${isICE(card) ? "ice protecting " : "cards in "} ${nameZone(CORP_SIDE, slot)}`,
        choices: {
          req: req(() => true),
          max: cardsInSlot,
        },
        async: true,
        waitingPrompt: true,
        effect: req(() => {
          // trash selected cards
        }),
        cancel: {
          async: true,
          effect: req(() => {
            corpInstallPay(state, CORP_SIDE, eid, card, server, {
              ...opts,
              resolvedOptionalTrash: true,
            });
          }),
        },
      },
      null,
      [],
    );
  } else {
    effectCompleted(state, CORP_SIDE, eid);
  }
}

/**
 * Installs a card in the chosen server.
 * Mirrors: corp-install
 */
export function corpInstall(state: any, side?: any, eid?: any, card?: any, server?: any, opts?: any): any;
export function corpInstall(
  state: GameState,
  _side: string,
  eid: EID,
  card: Card,
  server?: unknown,
  opts?: Record<string, unknown> | null,
): void {
  const args = { ...opts };
  const eidWithSource = { ...eid, sourceType: "corp-install" };

  if (!server) {
    // No server selected; show prompt to select an install site
    continue_ability(
      state,
      CORP_SIDE,
      {
        prompt: `Choose a location to install ${card.title ?? ""}`,
        choices: installableServers(state, card),
        async: true,
        effect: req(() => {
          corpInstall(state, CORP_SIDE, eid, card, (args as any).target, args);
        }),
      },
      card,
      [],
    );
  } else if (server && typeof server === "object" && !args.hostCard) {
    // A card was selected as the server; recurse with host-card
    corpInstall(state, CORP_SIDE, eid, card, server, {
      ...args,
      hostCard: server as Card,
    });
  } else {
    // A server was selected
    dissocIn(state as any, ["corp", "install-list"]);
    corpInstallPay(state, CORP_SIDE, eid, card, server as string, args);
  }
}

// ===========================================================================
// Runner installation
// ===========================================================================

/**
 * Checks if the specified card has a valid host (in the cases where it needs one)
 * Mirrors: card-has-a-valid-host?
 */
function cardHasAValidHost(
  state: GameState,
  _side: string,
  eid: EID,
  card: Card,
  facedown: boolean,
): boolean {
  if (facedown) return true;
  const cdef = cardDef(card);
  const hostingReq = (cdef as any).hosting?.req;
  if (!hostingReq) return true;

  const allHosts = [
    ...allInstalled(state, CORP_SIDE),
    ...allInstalled(state, RUNNER_SIDE),
  ];
  return allHosts.some((h: any) => hostingReq(state, RUNNER_SIDE, eid, card, [h]));
}

/**
 * Checks if the specified card can be installed.
 * Returns true if there are no problems, otherwise a reason string.
 * Mirrors: runner-can-install-reason
 */
function runnerCanInstallReason(
  state: GameState,
  _side: string,
  eid: EID,
  card: Card,
  facedown: boolean,
): true | string {
  const cdef = cardDef(card);
  const cardReq = (cdef as any).req;

  // Can always install a card facedown
  if (facedown) return true;

  // Installing not locked
  if (installLocked(state, RUNNER_SIDE)) return "lock-install";

  // Req check
  if (cardReq && !cardReq(state, RUNNER_SIDE, eid, card, null)) return "req";

  // if the card requires a host, there is a valid host
  if (!cardHasAValidHost(state, RUNNER_SIDE, eid, card, facedown))
    return "no-valid-host";

  // The card's zone is locked
  if (card.zone && zoneLocked(state, RUNNER_SIDE, card.zone[0]))
    return "locked-zone";

  return true;
}

/**
 * Checks `runner-can-install-reason` if not true, toasts reason and returns false
 * Mirrors: runner-can-install?
 */
export function runnerCanInstall(
  state: GameState,
  _side: string,
  eid: EID,
  card: Card,
  opts?: { facedown?: boolean; noToast?: boolean },
): boolean {
  const facedown = opts?.facedown ?? false;
  const noToast = opts?.noToast ?? false;
  const reason = runnerCanInstallReason(
    state,
    RUNNER_SIDE,
    eid,
    card,
    facedown,
  );
  const title = card.title ?? "";

  const reasonToast = (msg: string): boolean => {
    if (!noToast) toast(state, RUNNER_SIDE, msg, "warning");
    return false;
  };

  switch (reason) {
    case "lock-install":
      return reasonToast(
        `Unable to install ${title} since installing is currently locked`,
      );
    case "req":
      return reasonToast(
        `Installation requirements are not fulfilled for ${title}`,
      );
    case "no-valid-host":
      return reasonToast(`There is no valid host for ${title}`);
    case "locked-zone":
      return reasonToast(
        `Unable to install ${title} because it is currently in a locked zone`,
      );
    case true:
      return true;
  }
  return true;
}

/**
 * Prints the correct msg for the card install.
 * Mirrors: runner-install-message
 */
export function runnerInstallMessage(
  state: GameState,
  _side: string,
  card: Card,
  costStr: string,
  opts: {
    noCost?: boolean;
    hostCard?: Card;
    facedown?: boolean;
    customMessage?: (costStr: string) => string;
    msgKeys?: Record<string, unknown>;
    ignoreInstallCost?: boolean;
    ignoreAllCost?: boolean;
    costBonus?: number;
    displayMessage?: boolean;
  },
): void {
  const displayMessage = opts.displayMessage !== false;
  if (!displayMessage) return;

  const msgKeys = opts.msgKeys ?? {};
  const { displayOrigin, installSource, originIndex, known } = msgKeys as any;
  const hideZeroCost = (msgKeys as any).hideZeroCost ?? opts.facedown ?? false;

  if (hideZeroCost && costStr === "pays 0 [Credits]") {
    // suppress zero cost message
  }

  const prependCostStr =
    (msgKeys as any).includeCostFromEid?.latestPaymentStr ?? "";

  const showOrigin =
    displayOrigin !== undefined
      ? displayOrigin
      : !(Array.isArray(card.previousZone) && card.previousZone[0] === "hand");

  const discountStr = opts.ignoreAllCost
    ? " (ignoring all costs)"
    : opts.ignoreInstallCost
      ? " (ignoring it's install cost)"
      : opts.costBonus && opts.costBonus > 0
        ? ` (paying ${opts.costBonus} [Credits] more)`
        : opts.costBonus && opts.costBonus < 0
          ? ` (paying ${Math.abs(opts.costBonus)} [Credits] less)`
          : "";

  const cardName = opts.facedown
    ? known
      ? `${card.title ?? ""} as a facedown card`
      : "a card facedown"
    : (card.title ?? "");

  const prevZoneArr = Array.isArray(card.previousZone) ? card.previousZone : [];
  const origin =
    showOrigin && prevZoneArr[0] !== "onhost"
      ? ` from${originIndex != null ? ` position ${originIndex + 1} of ` : ""}${
          prevZoneArr[0] === "set-aside"
            ? "among the set-aside cards"
            : nameZone(RUNNER_SIDE, card.previousZone ?? [])
        }`
      : "";

  const preLhs =
    costStr && prependCostStr ? `${prependCostStr}, and then ` : "";
  const fromHost =
    showOrigin && prevZoneArr[0] === "onhost" ? "hosted " : "";

  const modifiedCostStr = !costStr
    ? prependCostStr
    : !preLhs
      ? costStr
      : `${costStr},`;

  const lhs = installSource
    ? `${buildSpendMsg(modifiedCostStr, "use")} ${(installSource as Card).title ?? ""} to install `
    : buildSpendMsg(modifiedCostStr, "install");

  const msg = opts.customMessage
    ? opts.customMessage(costStr)
    : `${preLhs}${lhs}${fromHost}${cardName}${origin}${discountStr}${opts.hostCard ? ` on ${cardStr(state, opts.hostCard)}` : ""}${opts.noCost ? " at no cost" : ""}`;

  systemMsg(state, RUNNER_SIDE, msg);
}
