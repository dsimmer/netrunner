// Checkpoint logic: update all cards, expire effects, enforce uniqueness, and
// resolve pending abilities (reaction windows).
// Mirrors: src/clj/game/core/checkpoint.clj + the `checkpoint` defn in engine.clj

import type { GameState } from "./state";
import type { Card } from "./card";
import type { Effect } from "./state";
import type { EID } from "./eid";
import type { Ability } from "./types";
import { effectCompleted, makeEID } from "./eid";
import {
  allActiveInstalled,
  allInstalled,
  clearEmptyRemotes,
} from "./board";
import {
  consoleCard,
  isUnique,
  installed,
  isProgram,
  getTitle,
  getSide,
} from "./card";
import {
  unregisterLingeringEffects,
  updateDisabledCards,
  getEffectMaps,
  isDisabledReg,
} from "./effects";
import { unregisterFloatingEvents } from "./engine_2";
import {
  markPendingAbilities,
  triggerPendingAbilities,
} from "./engine_3";
import { resolveAbility } from "./engine_1";
import { updateAllIce, updateAllIcebreakers } from "./ice";
import {
  updateAllAdvancementRequirements,
  updateAllAgendaPoints,
} from "./agendas";
import { updateAllCardLabels } from "./initializing";
import { updateMu } from "./memory";
import { updateAllSubtypes } from "./subtypes";
import { updateTagStatus } from "./tags";
import { updateHandSize } from "./hand_size";
import { updateLink } from "./link";
import { generateRunnableZones } from "./actions";
import { checkWinByAgenda } from "./winning";
import { trashCards } from "./moving_2";
import { systemSay } from "./say";
import { cardStr } from "./to_string";
import { cardDef } from "./card_defs";
import { toKeyword } from "../utils";

/**
 * fake-checkpoint: iteratively update all cards until no more changes,
 * then clear empty remotes and generate runnable zones.
 * Mirrors: fake-checkpoint in checkpoint.clj
 */
export function fakeCheckpoint(state: GameState): void {
  for (let i = 0; i < 10; i++) {
    const changed: boolean[] = [
      updateAllIce(state, "corp"),
      updateAllIcebreakers(state, "runner"),
      updateAllCardLabels(state),
      updateAllAdvancementRequirements(state),
      updateAllAgendaPoints(state),
      updateLink(state),
      updateMu(state),
      updateHandSize(state, "corp"),
      updateHandSize(state, "runner"),
      updateAllSubtypes(state),
      updateTagStatus(state),
    ];

    if (!changed.some(Boolean)) break;
  }

  clearEmptyRemotes(state);
  generateRunnableZones(state, null, null);
}

// ---------------------------------------------------------------------------
// Helpers: trash-when-expired / unregister-expired-durations
// ---------------------------------------------------------------------------

/**
 * Run each :trash-when-expired effect handler for the given context maps.
 * Mirrors trash-when-expired + internal-trash-cards in engine.clj.
 *
 * In the clj version this chains async via wait-for. Each `value` fn is
 * expected to trash a single card synchronously. We invoke them in order and
 * tolerate either return shape.
 */
function trashWhenExpired(
  state: GameState,
  eid: EID,
  contextMaps: unknown[],
): void {
  if (!contextMaps || contextMaps.length === 0) return;
  const maps: Effect[] = getEffectMaps(
    state,
    "",
    "trash-when-expired",
    eid,
    contextMaps as Card[],
  );
  for (const m of maps) {
    try {
      if (typeof m.value === "function") {
        m.value(state, "", makeEID(state, eid), m.card ?? null, []);
      }
    } catch {
      // Per-handler failure shouldn't take down checkpoint
    }
  }
}

/**
 * Trash any cards flagged with :trash-when-expired, then drop expired
 * floating events and lingering effects.
 * Mirrors unregister-expired-durations in engine.clj.
 */
function unregisterExpiredDurations(
  state: GameState,
  eid: EID,
  durations: string[],
  contextMaps: unknown[],
): void {
  trashWhenExpired(state, eid, contextMaps);

  // Always clear :pending floating events
  unregisterFloatingEvents(state, "", "pending");

  for (const d of durations) {
    if (!d) continue;
    unregisterLingeringEffects(state, d);
    unregisterFloatingEvents(state, "", d);
  }
}

// ---------------------------------------------------------------------------
// Helpers: uniqueness / consoles
// ---------------------------------------------------------------------------

/**
 * For each unique card name with 2+ active copies, return the older copies
 * (everything except the most-recently-activated one).
 * Mirrors get-old-uniques.
 */
function getOldUniques(state: GameState, side: string): Card[] {
  const active = allActiveInstalled(state, side).filter((c) => isUnique(c));
  const byTitle = new Map<string, Card[]>();
  for (const c of active) {
    const title = getTitle(c) ?? "";
    const arr = byTitle.get(title) ?? [];
    arr.push(c);
    byTitle.set(title, arr);
  }
  const out: Card[] = [];
  for (const cards of byTitle.values()) {
    if (cards.length > 1) {
      const sorted = cards
        .slice()
        .sort(
          (a, b) =>
            (a.timestamp?.getTime() ?? 0) - (b.timestamp?.getTime() ?? 0),
        );
      // Everything except the most recent
      out.push(...sorted.slice(0, -1));
    }
  }
  return out;
}

/**
 * 10.3.d — If 2+ uniques with the same name are active, trash the older ones.
 * If 2+ consoles are installed for a player, trash all but the most recent.
 * Mirrors check-unique-and-consoles.
 */
function checkUniqueAndConsoles(state: GameState, eid: EID): void {
  const corpUniques = getOldUniques(state, "corp");
  const runnerUniques = getOldUniques(state, "runner");

  const hardware: Card[] = state.runner?.rig?.hardware ?? [];
  const allConsoles: Card[] = hardware.filter((c) => consoleCard(c));
  const extraConsoles: Card[] =
    allConsoles.length > 1
      ? allConsoles
          .slice()
          .sort(
            (a, b) =>
              (a.timestamp?.getTime() ?? 0) - (b.timestamp?.getTime() ?? 0),
          )
          .slice(0, -1)
      : [];

  // Distinct by cid
  const seen = new Set<string>();
  const cardsToTrash: Card[] = [];
  for (const c of [...corpUniques, ...runnerUniques, ...extraConsoles]) {
    if (c.cid && seen.has(c.cid)) continue;
    if (c.cid) seen.add(c.cid);
    cardsToTrash.push(c);
  }

  if (cardsToTrash.length === 0) return;

  trashCards(state, null, makeEID(state, eid), cardsToTrash, {
    gameTrash: true,
    unpreventable: true,
  });

  for (const c of cardsToTrash) {
    systemSay(state, toKeyword(getSide(c) ?? ""), `${cardStr(state, c)} is trashed.`);
  }
}

// ---------------------------------------------------------------------------
// Helpers: enforce-conditions
// ---------------------------------------------------------------------------

/**
 * Resolve each card's :enforce-conditions ability if the card is not disabled.
 * Mirrors enforce-conditions-impl + enforce-conditions in engine.clj.
 */
function enforceConditions(state: GameState, eid: EID): void {
  const corpInstalled = allInstalled(state, "corp");
  const corpIdentity: Card | null = state.corp?.identity ?? null;
  const runnerActive = allActiveInstalled(state, "runner");

  const candidates: Card[] = [
    ...corpInstalled,
    ...(corpIdentity ? [corpIdentity] : []),
    ...runnerActive,
  ];

  for (const card of candidates) {
    const def = cardDef(card);
    const ability = def["enforce-conditions"];
    if (!ability) continue;
    if (isDisabledReg(state, card)) continue;
    try {
      const sideKw = toKeyword(getSide(card) ?? "");
      const abWithEid = { ...ability, eid: makeEID(state, eid) };
      resolveAbility(state, sideKw, abWithEid, card, null);
    } catch {
      // tolerate per-card failure
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers: MU / restriction checks
// ---------------------------------------------------------------------------

/**
 * 10.3.e — restrictions on card abilities or game rules, including MU.
 * If runner is over MU, log a notice and surface a prompt for the runner to
 * trash installed programs (mirrors the prompt in check-restrictions).
 * Mirrors check-restrictions.
 */
function checkRestrictions(state: GameState, eid: EID): void {
  updateMu(state);
  const memory = state.runner?.memory ?? { available: 0, used: 0 };
  const available = (memory.available ?? 0) - (memory.used ?? 0);
  if (available < 0) {
    const installedPrograms = allInstalled(state, "runner").filter((c) =>
      isProgram(c),
    );
    const ability: Ability = {
      prompt: `Insufficient MU. Trash ${-available} MU of installed programs.`,
      choices: {
        max: installedPrograms.length,
        card: (c: Card | null) => installed(c) && isProgram(c),
      },
      async: true,
      effect: (
        s: GameState,
        sd: string,
        e: EID,
        _c: Card | null,
        targets: Card[],
      ) => {
        const picked: Card[] = targets ?? [];
        if (picked.length > 0) {
          trashCards(s, sd, makeEID(s, e), picked, {
            gameTrash: true,
            unpreventable: true,
          });
          updateMu(s);
        }
      },
    };
    resolveAbility(
      state,
      "runner",
      { ...ability, eid: makeEID(state, eid) },
      null,
      null,
    );
  }

  enforceConditions(state, eid);
}

// ---------------------------------------------------------------------------
// checkpoint: full implementation
// ---------------------------------------------------------------------------

/**
 * 10.3. Checkpoints: a process wherein objects that have entered an illegal
 * state are corrected, expired effects are removed, and other important
 * conditions are checked.
 * Mirrors: checkpoint in engine.clj
 *
 * Sequence (per CR 10.3.x):
 *   a. mark pending abilities for queued events
 *   b. expire durations and unregister floating/lingering effects
 *   c. check win-by-agenda
 *   d. uniqueness and console check
 *   e. restrictions (MU, enforce-conditions)
 *   h. clear empty remotes
 *   10.3.2 reaction window: trigger pending abilities
 */
export function checkpoint(
  state: GameState,
  _side: string | null,
  eid: EID,
  args?: { duration?: string; durations?: string[] },
): void {
  // Card-state convergence loop (not a numbered rule step, but required so
  // that subsequent checks see a stable view).
  for (let i = 0; i < 10; i++) {
    const changed: boolean[] = [
      updateAllIce(state, "corp"),
      updateAllIcebreakers(state, "runner"),
      updateAllCardLabels(state),
      updateAllAdvancementRequirements(state),
      updateAllAgendaPoints(state),
      updateLink(state),
      updateMu(state),
      updateHandSize(state, "corp"),
      updateHandSize(state, "runner"),
      updateAllSubtypes(state),
      updateTagStatus(state),
    ];
    if (!changed.some(Boolean)) break;
  }

  // (a) mark pending abilities for already-queued events
  const { handlers, contextMaps } = markPendingAbilities(state, eid, args);

  // (b) expire durations
  const durations: string[] = [];
  if (args?.duration) durations.push(args.duration);
  if (args?.durations) durations.push(...args.durations);
  unregisterExpiredDurations(state, eid, durations, contextMaps);

  // Refresh disabled-card registry
  updateDisabledCards(state);

  // (c) win by agenda check (records winner internally)
  checkWinByAgenda(state);

  // (d) uniqueness and console check
  checkUniqueAndConsoles(state, eid);

  // (e) restrictions (MU + enforce-conditions on installed cards)
  checkRestrictions(state, eid);

  // (h) clear empty remotes
  clearEmptyRemotes(state);

  // 10.3.2 — reaction window: trigger pending abilities, then complete.
  if (handlers && handlers.length > 0) {
    triggerPendingAbilities(state, eid, handlers, args);
    return;
  }

  effectCompleted(state, "", eid);
}
