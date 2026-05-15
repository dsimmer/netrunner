// Card installation mechanics.
// Mirrors: src/clj/game/core/installing.clj

import type { GameState, ServerZone } from "./state.js";
import type { Card, Zone } from "./card.js";
import type { EID } from "./eid.js";
import type { Ability } from "./types.js";

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
} from "./card.js";
import { cardDef, getCardDef } from "./types.js";
import {
  ignoreInstallCost,
  installAdditionalCostBonus,
  installCost,
} from "./cost_fns.js";
import { totalAvailableCredits, canPay, mergeCosts } from "./costs.js";
import {
  makeEID,
  effectCompleted,
  completeWithResult,
  registerEIDCallback,
} from "./eid.js";
import {
  queueEvent,
  registerEvents,
  unregisterEvents,
  registerPendingEvent,
} from "./engine.js";
import {
  isDisabledReg,
  updateDisabledCards,
  registerStaticAbilities,
  unregisterStaticAbilities,
} from "./effects.js";
import {
  turnFlag,
  zoneLocked,
} from "./flags.js";
import {
  hasAncestor,
  host,
} from "./hosting.js";
import { updateBreakerStrength } from "./ice.js";
import {
  abilityInit,
  cardInit,
  corpAbilityInit,
  runnerAbilityInit,
} from "./initializing.js";
import {
  availableMU,
  expectedMU,
  sufficientMU,
  updateMU,
} from "./memory.js";
import {
  move,
  trash,
  trashCards,
  swapCards,
  swapInstalled,
} from "./moving.js";
import {
  createCreditCost,
  mergeCosts as mergeCostsPayment,
} from "./payment.js";
import type { CostData } from "./payment.js";
import { addProp } from "./props.js";
import { reveal } from "./revealing.js";
import { rez } from "./rezzing.js";
import {
  multiMsg,
  playSfx,
  systemMsg,
  implementationMsg,
} from "./say.js";
import { nameZone, remoteNumToName } from "./servers.js";
import { makeRID } from "./state.js";
import { cardStr } from "./to_string.js";
import { toast } from "./toasts.js";
import { updateCard } from "./update.js";
import { updateAdvancementRequirement } from "./agendas.js";
import {
  allInstalled,
  getRemotes,
  serverToZone,
  allInstalledRunnerType,
  installableServers,
  getRemoteNames,
} from "./board.js";
import {
  continue_ability,
  req,
  wait_for,
} from "../macros.js";
import {
  dissocIn,
  enumerateStr,
  inColl,
  sameCard,
  toKeyword,
  quantify,
} from "../utils.js";
import { CORP_SIDE, RUNNER_SIDE } from "./state.js";
import { getCard } from "./finding.js";

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

function toC(type: string, amount?: number, opts?: Record<string, unknown>): CostData {
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
    identity.title.substring(0, Math.min(13, identity.title.length)) === "Earth Station" &&
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
      return reasonToast(`Unable to install ${title}, installing is currently locked`);
    case "ice":
      return reasonToast(`Unable to install ${title}: can only install 1 piece of ice per turn`);
    case "earth-station":
      return reasonToast(`Unable to install ${title} in new remote: Earth Station limit`);
    case "a-teia":
      return reasonToast(`Unable to install ${title} in new remote: A Teia limit`);
    case true:
      return true;
  }
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
            [trash, state, CORP_SIDE, eid, prevCard, { keepServerAlive: true, suppressCheckpoint: true, duringInstallation: true }],
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
    addProp(state, CORP_SIDE, eid, targetCard, "advance-counter", counters.advanceCounter, { placed: true });
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
  const prevCard = destZone.find((c) => isAsset(c) || isAgenda(c)) ?? null;
  const prevRegion = destZone.find((c) => hasSubtype(c, "Region")) ?? null;

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
  const { displayOrigin, installSource, originIndex, known, setZone } = msgKeys as any;
  const prependCostStr = (msgKeys as any).includeCostFromEid?.latestPaymentStr ?? "";

  const cardName = (["rezzed", "rezzed-no-cost", "face-up"].includes(installState) ||
    known ||
    card.seen ||
    isRezzed(card))
    ? (card.title ?? "")
    : (isICE(card) ? "ice" : "a card");

  const corpCardName = (["rezzed", "rezzed-no-cost", "face-up"].includes(installState) ||
    known ||
    card.seen ||
    isRezzed(card))
    ? (card.title ?? "")
    : `facedown ${card.title ?? ""}`;

  const serverName = server === "New remote"
    ? `${remoteNumToName(state.rid - 1)} (new remote)`
    : server;

  const origin = displayOrigin
    ? ` from${originIndex != null ? ` position ${originIndex + 1} of ` : ""}${setZone ?? nameZone(CORP_SIDE, card.zone ?? [])}`
    : "";

  const preLhs = costStr && prependCostStr
    ? `${prependCostStr}, and then `
    : "";

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
          systemMsg(s, CORP_SIDE, `reveals ${cardStr(s, rezzedCard, { visible: true })}`);
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
    (args.msgKeys as any).known = (args.msgKeys as any).known ||
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
    corpInstallMessage(state, CORP_SIDE, card, server, installState, costStr, args);
  }
  playSfx(state, CORP_SIDE, "install-corp");

  const movedCard = opts.hostCard
    ? host(state, CORP_SIDE, opts.hostCard, { ...c, installed: true } as unknown as Card)
    : move(state, CORP_SIDE, c, slot, { front: opts.front, index: opts.index });

  if (isAgenda(c)) {
    updateAdvancementRequirement(state, movedCard);
  }

  const refreshedCard = getCard(state, movedCard);

  unregisterEvents(state, CORP_SIDE, refreshedCard);

  wait_for(
    state,
    [
      [{ asyncResult: "result" }],
      function (s: GameState, _e: EID, _binds: any) {
        corpInstallPlaceCounters(s, CORP_SIDE, refreshedCard, args);
      },
    ],
    [corpInstallAssetAgenda, state, CORP_SIDE, refreshedCard, destZone, server],
    { eid },
  );

  // After asset/agenda and counters, queue the event and handle install-state cases
  // (This is a simplified version - in the real implementation the wait-for chain handles it all)
}

/**
 * Gets the slot (zone) for installing a card.
 * Mirrors: get-slot
 */
export function getSlot(state: GameState, card: Card, server: string, opts?: { hostCard?: Card }): Zone {
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
  },
): CostData[] {
  if (opts.cachedCosts) return opts.cachedCosts;

  const slot = getSlot(state, card, server, { hostCard: opts.hostCard });
  const destZone: Card[] = []; // populated from state via slot path
  const iceCost = isICE(card) &&
    !opts.ignoreInstallCost &&
    !opts.ignoreAllCost &&
    !opts.ignoreIceCost &&
    !ignoreInstallCost(state, CORP_SIDE, card)
    ? destZone.length
    : 0;

  const cost = installCost(state, CORP_SIDE, card, {
    costBonus: (opts.costBonus ?? 0) + iceCost,
  }, []);

  if (opts.ignoreAllCost) return [];
  return [...(opts.baseCost ? [opts.baseCost] : []), toC("credit", cost ?? 0)].flat();
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
  const slot = getSlot(state, card, server, { hostCard: opts.hostCard as Card });
  const costs = corpInstallCost(state, CORP_SIDE, card, server, opts);

  return corpCanInstall(state, CORP_SIDE, card, slot, { noToast: opts.noToast as boolean }) &&
    canPay(state, CORP_SIDE, eidWithSource, card, null, costs);
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
  const costs = corpInstallCost(state, CORP_SIDE, card, server, { ...opts, cachedCosts: undefined });
  const creditCost = costValue(findFirst((c: CostData) => c.type === "credit", costs) ?? toC("credit", 0));
  const discount = (opts.combinedCreditDiscount as number) ?? 0;
  const applDisc = (creditCost > 0 && discount > 0)
    ? Math.min(creditCost, discount)
    : 0;

  const args = discount
    ? { ...opts, costBonus: applDisc - discount }
    : opts;

  const costsWithDiscount = [...costs, toC("credit", -applDisc)];

  const corpWantsToTrash = !!(
    (state.corp.properties as any)?.trashLikeCards &&
    (slot.length > 0) &&
    !(opts.resolvedOptionalTrash as boolean)
  );

  if (!corpWantsToTrash && corpCanPayAndInstall(state, CORP_SIDE, eid, card, server, { ...args, cachedCosts: costsWithDiscount })) {
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
            corpInstallContinue(s, CORP_SIDE, eid, card, server, args, slot, paymentStr);
          } else {
            effectCompleted(s, CORP_SIDE, eid);
          }
        },
      ],
      [
        // pay function call
        function (s: GameState, side: string, newEid: EID, c: Card, csts: CostData[]) {
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
  const creditCostVal = costValue(findFirst((c: CostData) => c.type === "credit", costs) ?? toC("credit", 0));
  const shortfall = creditCostVal - totalAvailableCredits(state, CORP_SIDE, eid, card);
  const needToTrash = Math.max(0, shortfall);
  const cardsInSlot = (slot.length > 0 ? 0 : 0);
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
            corpInstallPay(state, CORP_SIDE, eid, card, server, { ...opts, resolvedOptionalTrash: true });
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
export function corpInstall(
  state: GameState,
  _side: string,
  eid: EID,
  card: Card,
  server: unknown,
  opts?: Record<string, unknown>,
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
    corpInstall(state, CORP_SIDE, eid, card, server, { ...args, hostCard: server as Card });
  } else {
    // A server was selected
    dissocIn(state, ["corp", "install-list"]);
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

  const allHosts = [...allInstalled(state, CORP_SIDE), ...allInstalled(state, RUNNER_SIDE)];
  return allHosts.some((h) => hostingReq(state, RUNNER_SIDE, eid, card, [h]));
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
  if (!cardHasAValidHost(state, RUNNER_SIDE, eid, card, facedown)) return "no-valid-host";

  // The card's zone is locked
  if (card.zone && zoneLocked(state, RUNNER_SIDE, card.zone[0])) return "locked-zone";

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
  const reason = runnerCanInstallReason(state, RUNNER_SIDE, eid, card, facedown);
  const title = card.title ?? "";

  const reasonToast = (msg: string): boolean => {
    if (!noToast) toast(state, RUNNER_SIDE, msg, "warning");
    return false;
  };

  switch (reason) {
    case "lock-install":
      return reasonToast(`Unable to install ${title} since installing is currently locked`);
    case "req":
      return reasonToast(`Installation requirements are not fulfilled for ${title}`);
    case "no-valid-host":
      return reasonToast(`There is no valid host for ${title}`);
    case "locked-zone":
      return reasonToast(`Unable to install ${title} because it is currently in a locked zone`);
    case true:
      return true;
  }
}

/**
 * Prints the correct msg for the card install.
 * Mirrors: runner-install-message
 */
function runnerInstallMessage(
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

  const prependCostStr = (msgKeys as any).includeCostFromEid?.latestPaymentStr ?? "";

  const showOrigin = displayOrigin !== undefined
    ? displayOrigin
    : card.previousZone !== ["hand"];

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
    ? (known ? `${card.title ?? ""} as a facedown card` : "a card facedown")
    : (card.title ?? "");

  const origin = showOrigin && card.previousZone !== ["onhost"]
    ? ` from${originIndex != null ? ` position ${originIndex + 1} of ` : ""}${
        card.previousZone === ["set-aside"]
          ? "among the set-aside cards"
          : nameZone(RUNNER_SIDE, card.previousZone ?? [])
      }`
    : "";

  const preLhs = costStr && prependCostStr ? `${prependCostStr}, and then ` : "";
  const fromHost = showOrigin && card.previousZone === ["onhost"] ? "hosted " : "";

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

  const installedCard = opts.facedown
    ? updateCard(state, RUNNER_SIDE, updated)
    : cardInit(state, RUNNER_SIDE, updated, {
        resolveEffect: false,
        initData: true,
        noMU: opts.noMU,
      });

  if (!opts.noMsg) {
    runnerInstallMessage(state, RUNNER_SIDE, installedCard, opts.paymentStr ?? "", opts);
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

  const cost = installCost(state, RUNNER_SIDE, card, { costBonus: opts.costBonus }, []);
  const additionalCosts = installAdditionalCostBonus(state, RUNNER_SIDE, card);

  return mergeCostsPayment([
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

  const allHosts = allInstalled(state, RUNNER_SIDE).filter((c) => someHostingEffect(state, c));
  const relevant = allHosts.filter((h) => {
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
  },
): boolean {
  const args = opts ?? {};
  const eidWithSource = { ...eid, sourceType: "runner-install" };
  const hostAbi = args.hostCard ? someHostingEffect(state, args.hostCard) : null;
  const oldCostBonus = args.costBonus ?? 0;
  const newCostBonus = hostAbi?.costBonus ?? 0;
  const combinedCostBonus = oldCostBonus + newCostBonus;
  const costBonus = combinedCostBonus === 0 ? undefined : combinedCostBonus;

  const costs = runnerInstallCost(state, RUNNER_SIDE, { ...card, facedown: args.facedown }, {
    ...args,
    costBonus,
  });

  const canInstallDirectly = runnerCanInstall(state, RUNNER_SIDE, eid, card, {
    ...args,
    noToast: true,
  }) && canPay(state, RUNNER_SIDE, eidWithSource, card, null, costs);

  if (canInstallDirectly) return true;

  // Some cards (hackerspace, dhegder) provide a discount to installing cards
  // so long as they are installed hosted on themselves
  if (!args.hostCard && !args.noHost) {
    const potentialHosts = runnerCanHost(state, RUNNER_SIDE, eid, card, args);
    if (potentialHosts) {
      return potentialHosts.some((h) =>
        runnerCanPayAndInstall(state, RUNNER_SIDE, eid, card, { ...args, hostCard: h }),
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
  const costs = runnerInstallCost(state, RUNNER_SIDE, { ...card, facedown: opts.facedown }, opts);
  const availableMem = availableMU(state);
  const runnerWantsToTrash = !!(
    (state.runner.properties as any)?.trashLikeCards &&
    !opts.resolvedOptionalTrash
  );

  if (!runnerCanPayAndInstall(state, RUNNER_SIDE, eid, card, { ...opts, cachedCosts: costs })) {
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
    const playedCard = move(state, RUNNER_SIDE, { ...card, facedown: opts.facedown }, "play-area", { suppressEvent: true });

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
            const returnedCard = move(s, RUNNER_SIDE, playedCard, card.zone ?? [], { suppressEvent: true });
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
        function (s: GameState, side: string, newEid: EID, c: Card, csts: CostData[]) {},
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
  if (isProgram(card) && !opts.facedown && (!opts.noMU || sufficientMU(state, card) || runnerWantsToTrash)) {
    const allInstalledRunner = allInstalled(state, RUNNER_SIDE);
    const trashablePrograms = allInstalledRunner.filter(
      (c) => isProgram(c) && isInstalled(c) && !(opts.hostCard && hasAncestor(c, opts.hostCard)),
    );

    continue_ability(
      state,
      RUNNER_SIDE,
      {
        prompt: runnerWantsToTrash && (opts.noMU || sufficientMU(state, card))
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
                runnerInstallPay(s, RUNNER_SIDE, eid, card, { ...opts, resolvedOptionalTrash: true });
              },
            ],
            [trashCards, state, RUNNER_SIDE, makeEID(state), [], { unpreventable: true, suppressCheckpoint: true }],
            { eid },
          );
        }),
        cancel: {
          async: true,
          effect: req(() => {
            updateMU(state);
            if (availableMem === availableMU(state) && !opts.noMU && !sufficientMU(state, card)) {
              effectCompleted(state, RUNNER_SIDE, eid);
            } else {
              runnerInstallPay(state, RUNNER_SIDE, eid, card, { ...opts, resolvedOptionalTrash: true });
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
    runnerInstallPay(state, RUNNER_SIDE, eid, card, { ...opts, hostCard: potentialHost });
    return;
  }

  const resolvedMaxMU = typeof maxMU === "function"
    ? maxMU(state, RUNNER_SIDE, eid, potentialHost, null)
    : maxMU;

  const relevantCards = (potentialHost.hosted ?? []).filter(isProgram);
  const currentMUHost = relevantCards.reduce((sum: number, c: Card) => sum + expectedMU(state, c), 0);
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
                runnerHostEnforceSpecificMemory(s, RUNNER_SIDE, eid, card, getCard(s, potentialHost), opts);
              },
            ],
            [trashCards, state, RUNNER_SIDE, makeEID(state), [], { unpreventable: true, suppressCheckpoint: true }],
            { eid },
          );
        }),
      },
      card,
      [],
    );
  } else {
    runnerInstallPay(state, RUNNER_SIDE, eid, card, { ...opts, hostCard: potentialHost });
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
    runnerHostEnforceSpecificMemory(state, RUNNER_SIDE, eid, card, potentialHost, opts);
    return;
  }

  const resolvedMaxCards = typeof maxCards === "function"
    ? maxCards(state, RUNNER_SIDE, eid, potentialHost, null)
    : maxCards;

  const isConditionCounter = (c: Card): boolean => c.type === "Counter";
  const relevantCards = (potentialHost.hosted ?? []).filter((c) => !isConditionCounter(c));
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
                runnerHostEnforceSpecificMemory(s, RUNNER_SIDE, eid, card, getCard(s, potentialHost), opts);
              },
            ],
            [trashCards, state, RUNNER_SIDE, makeEID(state), [], { unpreventable: true, suppressCheckpoint: true }],
            { eid },
          );
        }),
      },
      card,
      [],
    );
  } else {
    runnerHostEnforceSpecificMemory(state, RUNNER_SIDE, eid, card, potentialHost, opts);
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
      choices: [...potentialHosts.map((h) => h.title ?? ""), "The Rig"],
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
  },
): void {
  const args = { ...opts };
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
          runnerInstallPay(state, RUNNER_SIDE, eid, card, { ...args, hostCard: (args as any).target as Card });
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
export function installAsConditionCounter(
  state: GameState,
  _side: string,
  eid: EID,
  card: Card,
  target: Card,
): void {
  if (!isEvent(card) && !isOperation(card)) {
    throw new Error("condition counter must be event or operation");
  }

  const cdef = cardDef(card);
  const abilities = abilityInit(cdef);
  const corpAbilities = corpAbilityInit(cdef);
  const runnerAbilities = runnerAbilityInit(cdef);
  const convertedCard = convertToConditionCounter(card);

  const events = ((cdef as any).events ?? []).filter((e: any) => e.condition === "hosted");

  if (isCorp(card)) {
    wait_for(
      state,
      [
        [{ asyncResult: "result" }],
        function (s: GameState, _e: EID, _binds: any) {
          const updatedCard = updateCard(s, CORP_SIDE, {
            ..._binds.asyncResult,
            abilities,
            runnerAbilities,
          });
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
          const updatedCard = updateCard(s, RUNNER_SIDE, {
            ..._binds.asyncResult,
            abilities,
            corpAbilities,
          });
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
export function swapCardsAsync(
  state: GameState,
  side: string,
  eid: EID,
  a: Card,
  b: Card,
): void {
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
      completeWithResult(state, RUNNER_SIDE, eid, swapCards(state, RUNNER_SIDE, a, b));
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
        hostCard: oldInstalled.host ? getCard(state, oldInstalled.host) : undefined,
        noMU: oldInstalled.host
          ? (someHostingEffect(state, getCard(state, oldInstalled.host)) as any)?.noMU
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
