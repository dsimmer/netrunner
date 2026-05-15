// Game commands: slash-command parsing and execution.
// Mirrors: src/clj/game/core/commands.clj

import { randomUUID } from "crypto";
import type { GameState, Prompt } from "./state.js";
import { CORP_SIDE, RUNNER_SIDE } from "./state.js";
import type { Card, Zone } from "./card.js";
import {
  isCorp, isRunner, isAgenda, isICE, isRezzed, inHand, isInstalled,
  hasSubtype, getTitle,
} from "./card.js";
import type { EID } from "./eid.js";
import { makeEID, effectCompleted } from "./eid.js";
import type { Ability, AbilityFn, ReqFn, ValueFn } from "./types.js";
import { resolveAbility, triggerEvent } from "./engine.js";
import { allInstalled, serverToZone } from "./board.js";
import { getCard } from "./finding.js";
import { systemMsg, systemSay } from "./say.js";
import { toast } from "./toasts.js";
import { update } from "./update.js";
import { registerLingeringEffect } from "./effects.js";
import { chargeCard } from "./charge.js";
import { damage } from "./damage.js";
import { draw } from "./drawing.js";
import { runnerInstall, corpInstall } from "./installing.js";
import { rez, derez } from "./rezzing.js";
import { move, trash, swapICE, swapInstalled } from "./moving.js";
import { endRun, getCurrentEncounter, jackOut } from "./runs.js";
import { score } from "./actions.js";
import { host } from "./hosting.js";
import { disableIdentity, disableCard, enableCard } from "./identities.js";
import { cardInit, deactivate, makeCard } from "./initializing.js";
import { setProp } from "./props.js";
import { isScored } from "./flags.js";
import { canBeAdvanced } from "./card.js";
import { psiGame } from "./psi.js";
import { initTrace } from "./trace.js";
import { sabotageAbility } from "./sabotage.js";
import { identifyMark, setMark } from "./mark.js";
import { isCentral, unknownToKW } from "./servers.js";
import { buildCard } from "./set_up.js";
import { clearWin } from "./winning.js";
import { removeFromPromptQueue } from "./prompt_state.js";
import { showPrompt } from "./prompts.js";
import { change } from "./change_vals.js";
import {
  sameSide, sameCard, quantify, enumerateStr, serverCard, stringToNum, safeSplit,
} from "../utils.js";
import { otherSide, strToInt } from "../../jinteki/utils.js";
import { req, effect, msg, wait_for, continue_ability } from "../macros.js";
import { cardStr } from "./to_string.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Constrain value to [minValue, maxValue]. Mirrors `constrain-value`. */
function constrainValue(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Sets advancement counters on a card and triggers the advancement-placed event.
 * Mirrors `set-adv-counter`.
 */
function setAdvCounter(state: GameState, side: string, target: Card, value: number): void {
  setProp(state, side, target, "advance-counter", value);
  systemMsg(state, side, `sets advancement counters to ${value} on ${cardStr(state, target)}`);
  triggerEvent(state, side, "advancement-placed", { card: target });
}

// ---------------------------------------------------------------------------
// Lobby command multimethod
// ---------------------------------------------------------------------------

/**
 * Multimethod dispatch for lobby-level commands.
 * Mirrors `lobby-command`.
 */
export function lobbyCommand(cmd: Record<string, unknown>): void {
  const command = cmd.command;
  const gameid = cmd.gameid;
  switch (command) {
    case "swap-sides":
      // Handled by lobby layer
      break;
    default:
      // no-op for unhandled lobby commands
      break;
  }
}

// ---------------------------------------------------------------------------
// Command implementations
// ---------------------------------------------------------------------------

/**
 * `/adv-counter <value>` — Set advancement counters on a card.
 * Mirrors `command-adv-counter`.
 */
export function commandAdvCounter(state: GameState, side: string, value: number): void {
  const clamped = constrainValue(value, 0, 1000);
  resolveAbility(
    state, side,
    {
      effect: effect(
        (state: GameState, _side: string, _eid: EID, target: Card, _targets: unknown[]): void => {
          setAdvCounter(state, _side, target, clamped);
        }
      ),
      choices: { card: (t: Card) => sameSide(t.side, side) },
    },
    makeCard({ title: "/adv-counter command", side }),
    [],
  );
}

/**
 * `/save-replay` — Enable replay saving.
 * Mirrors `command-save-replay`.
 */
export function commandSaveReplay(state: GameState, _side: string): void {
  state.options.saveReplay = true;
}

/**
 * `/bug` — Generate a bug report link.
 * Mirrors `command-bug-report`.
 */
export function commandBugReport(state: GameState, side: string): void {
  state.bugReported = (state.bugReported ?? -1) + 1;
  const gameid = state.gameId;
  const bugNum = state.bugReported;
  const title = "[EDITME] Please give a short description of your bug here";
  const body = `Link to bug replay: https://jinteki.net/bug-report/${gameid}?b=${bugNum}\n\nDescription:\n\n[EDITME] Please describe the steps to reproduce your bug and the resulting effect here.`;
  const encodedTitle = title.replace(/ /g, "%20");
  const encodedBody = body.replace(/ /g, "%20").replace(/\n/g, "%0A");
  const url = `https://github.com/mtgred/netrunner/issues/new?title=${encodedTitle}&body=${encodedBody}`;

  // Log the bug report message
  systemMsg(state, side, `[!bug] Thanks for helping us make the game better! The replay was saved. Please report a bug following this link to GitHub: ${url}`);
}

/**
 * Smart counter: infer counter type from card properties.
 * Mirrors `command-counter-smart`.
 */
function commandCounterSmart(state: GameState, side: string, args: string[]): void {
  resolveAbility(
    state, side,
    {
      choices: { card: (t: Card) => sameSide(t.side, side) },
      effect: req(
        (s: GameState, sid: string, _eid: EID, target: Card, _targets: unknown[]): void => {
          const existing = (target.counter as Record<string, number>) ?? {};
          const firstArg = args[0];
          const n = stringToNum(firstArg);
          const value = constrainValue(n !== null ? n : 0, 0, 1000);

          const existingKeys = Object.keys(existing);
          let counterType: string | null = null;

          if (existingKeys.length === 1) {
            counterType = existingKeys[0];
          } else if (canBeAdvanced(s, target)) {
            counterType = "advance-counter";
          } else if (isAgenda(target) && isScored(s, sid, target)) {
            counterType = "agenda";
          } else if (isRunner(target) && hasSubtype(target, "Virus")) {
            counterType = "virus";
          }

          const advance = counterType === "advance-counter";

          if (value >= 0) {
            if (advance) {
              setAdvCounter(s, sid, target, value);
            } else if (!counterType) {
              toast(s, sid,
                "Could not infer what counter type you mean. Please specify one manually, by typing " +
                "'/counter TYPE " + value + "', where TYPE is advance, agenda, credit, power, bad publicity, or virus.",
                "error", { timeOut: 0, closeButton: true });
            } else {
              update(s, sid, (card: Card) => {
                if (!card.counter) card.counter = {};
                (card.counter as Record<string, number>)[counterType!] = value;
                return card;
              }, target);
              systemMsg(s, sid, `sets ${counterType} counters to ${value} on ${cardStr(s, target)}`);
            }
          }
        }
      ),
    },
    makeCard({ title: "/counter command", side }),
    [],
  );
}

/**
 * `/enable-api-access` — Enable API access for the game.
 * Mirrors `command-enable-api-access`.
 */
export function commandEnableApiAccess(state: GameState, _side: string): void {
  state.options.apiAccess = true;
}

/**
 * `/facedown` — Install a runner card facedown.
 * Mirrors `command-facedown`.
 */
export function commandFacedown(state: GameState, side: string): void {
  resolveAbility(
    state, side,
    {
      prompt: "Choose a card to install facedown",
      waiting: "true",
      choices: { card: (c: Card) => isRunner(c) && inHand(c) },
      async: true,
      effect: effect(
        (state: GameState, _side: string, eid: EID, target: Card, _targets: unknown[]): void => {
          runnerInstall(state, _side, eid, target, { facedown: true });
        }
      ),
    },
    makeCard({ title: "/facedown command", side }),
    [],
  );
}

/**
 * `/counter [type] value` — Set counters on a card.
 * Mirrors `command-counter`.
 */
export function commandCounter(state: GameState, side: string, args: string[]): void {
  if (args.length === 0) {
    commandCounterSmart(state, side, ["1"]);
    return;
  }

  if (args.length === 1) {
    commandCounterSmart(state, side, args);
    return;
  }

  // Two+ args: type + value
  const typeStr = args[0].toLowerCase();
  const value = constrainValue(
    stringToNum(args[1]) !== null ? stringToNum(args[1])! : 1,
    0, 1000
  );

  const oneLetter = typeStr.length >= 1 ? typeStr.substring(0, 1) : "";
  const twoLetter = typeStr.length >= 2 ? typeStr.substring(0, 2) : oneLetter;

  let counterType: string;
  if (oneLetter === "v") counterType = "virus";
  else if (oneLetter === "b") counterType = "bad-publicity";
  else if (oneLetter === "p") counterType = "power";
  else if (oneLetter === "c") counterType = "credit";
  else if (twoLetter === "ag") counterType = "agenda";
  else counterType = "advance-counter";

  const advance = counterType === "advance-counter";

  if (advance) {
    commandAdvCounter(state, side, value);
  } else {
    resolveAbility(
      state, side,
      {
        effect: effect(
          (state: GameState, _side: string, _eid: EID, target: Card, _targets: unknown[]): void => {
            update(state, _side, (card: Card) => {
              if (!card.counter) card.counter = {};
              (card.counter as Record<string, number>)[counterType] = value;
              return card;
            }, target);
            systemMsg(state, _side, `sets ${counterType} counters to ${value} on ${cardStr(state, target)}`);
          }
        ),
        choices: { card: (t: Card) => sameSide(t.side, side) },
      },
      makeCard({ title: "/counter command", side }),
      [],
    );
  }
}

/**
 * Rez all ICE cards one at a time, waiting for each.
 * Mirrors `rez-all`.
 */
function rezAll(state: GameState, side: string, eid: EID, cards: Card[]): void {
  if (cards.length === 0) {
    effectCompleted(state, side, eid);
    return;
  }
  const [c, ...rest] = cards;
  wait_for(
    state,
    [
      () => rezAll(state, side, eid, rest),
    ],
    [rez, state, side, c, { ignoreCost: "all-costs", force: true, silent: rest.length > 0 }],
    { eid },
  );
}

/**
 * Optional prompt to turn all agendas faceup.
 * Mirrors `rez-all-turn-agendas-faceup`.
 */
function rezAllTurnAgendasFaceup(cards: Card[]): Ability | null {
  const agendas = cards.filter(c => isAgenda(c) && !c.seen);
  if (agendas.length === 0) return null;

  return {
    optional: {
      prompt: "Turn all agendas faceup?",
      yesAbility: {
        effect: req(
          (state: GameState, side: string, _eid: EID, _card: Card, _targets: unknown[]): void => {
            for (const c of agendas) {
              update(state, side, (card: Card) => { card.seen = true; return card; }, c);
            }
          }
        ),
        msg: msg("turns all agendas faceup"),
      },
    },
  };
}

/**
 * `/rez-all` — Rez all ice and optionally turn agendas faceup.
 * Mirrors `command-rezall`.
 */
export function commandRezAll(state: GameState, side: string): void {
  resolveAbility(
    state, side,
    {
      optional: {
        prompt: "Rez all cards and turn cards in archives faceup?",
        waiting: "true",
        yesAbility: {
          async: true,
          effect: req(
            (state: GameState, side: string, eid: EID, _card: Card, _targets: unknown[]): void => {
              // Mark all discard pile agendas as seen
              state.corp.discard = state.corp.discard.map(c => ({ ...c, seen: true }));

              const installed = allInstalled(state, side);
              const toRez = installed.filter(c => !isRezzed(c));

              wait_for(
                state,
                [
                  () => continue_ability(
                    state, side,
                    rezAllTurnAgendasFaceup(allInstalled(state, side)) ?? {},
                    null, [],
                  ),
                ],
                [rezAll, state, side, eid, toRez],
                { eid },
              );
            }
          ),
        },
      },
    },
    makeCard({ title: "/rez-all command", side }),
    [],
  );
}

/**
 * `/roll <sides>` — Roll a die.
 * Mirrors `command-roll`.
 */
export function commandRoll(state: GameState, side: string, value: number): void {
  const clamped = constrainValue(value, 1, 1000);
  const result = 1 + Math.floor(Math.random() * clamped);
  systemMsg(state, side, `rolls a ${clamped} sided die and rolls a ${result}`);
}

/**
 * `/set-mark <server>` — Set the central server mark for the turn.
 * Mirrors `command-set-mark`.
 */
export function commandSetMark(state: GameState, side: string, server: string): void {
  if (side !== RUNNER_SIDE) return;
  const serverKW = unknownToKW(server);
  if (!isCentral(serverKW)) return;
  systemMsg(state, side, `sets ${server} as the mark for this turn`);
  setMark(state, serverKW);
}

/**
 * `/undo-paid-ability` — Reset game state to start of last paid ability.
 * Mirrors `command-undo-paid-ability`.
 */
export function commandUndoPaidAbility(state: GameState, side: string): void {
  const lastPawState = state.paidAbilityState;
  if (!lastPawState) return;

  const currentLog = state.log;
  const currentHistory = state.history;
  const previousClickStates = state.clickStates;
  const turnState = state.turnState;

  const newState = {
    ...lastPawState,
    log: currentLog,
    clickStates: previousClickStates,
    turnState,
    history: currentHistory,
  };

  // Reset state
  Object.assign(state, newState);

  const sideName = side === CORP_SIDE ? "Corp" : "Runner";
  systemSay(state, side, `[!] ${sideName} uses the undo-paid-ability command`);

  for (const s of [RUNNER_SIDE, CORP_SIDE]) {
    toast(state, s, "Game reset to start of last paid ability");
  }
}

/**
 * `/undo-click` — Reset game state to start of current click.
 * Mirrors `command-undo-click`.
 */
export function commandUndoClick(state: GameState, side: string): void {
  if (!state.clickStates || state.clickStates.length === 0) return;
  if (state.activePlayer !== side) return;

  const clicks = state.clickStates as any[];
  const lastClickState = clicks[clicks.length - 1];
  const previousClickStates = clicks.slice(0, -1);
  const currentLog = state.log;
  const currentHistory = state.history;
  const turnState = state.turnState;

  const newState = {
    ...lastClickState,
    log: currentLog,
    clickStates: previousClickStates,
    turnState,
    history: currentHistory,
    run: null,
  };

  Object.assign(state, newState);

  const sideName = side === CORP_SIDE ? "Corp" : "Runner";
  systemSay(state, side, `[!] ${sideName} uses the undo-click command`);

  for (const s of [RUNNER_SIDE, CORP_SIDE]) {
    toast(state, s, "Game reset to start of click");
  }
}

/**
 * `/undo-turn` — Reset game state to end-of-turn (requires both players).
 * Mirrors `command-undo-turn`.
 */
export function commandUndoTurn(state: GameState, side: string): void {
  const turnState = state.turnState;
  if (!turnState) return;

  // Mark this side as agreeing
  if (side === CORP_SIDE) {
    (state.corp as any).undoTurn = true;
  } else {
    (state.runner as any).undoTurn = true;
  }

  // Check if both agree
  const corpAgreed = (state.corp as any).undoTurn;
  const runnerAgreed = (state.runner as any).undoTurn;

  if (corpAgreed && runnerAgreed) {
    const currentLog = state.log;
    const currentHistory = state.history;

    const originalTurnState = {
      ...turnState,
      log: currentLog,
      history: currentHistory,
      turnState,
    };

    Object.assign(state, originalTurnState);

    // Clear turn-started flags
    delete (state.corp as any).turnStarted;
    delete (state.runner as any).turnStarted;

    for (const s of [RUNNER_SIDE, CORP_SIDE]) {
      toast(state, s, "Game reset to start of turn");
    }
  }
}

/**
 * `/unique` — Toggle uniqueness of a card.
 * Mirrors `command-unique`.
 */
export function commandUnique(state: GameState, side: string): void {
  resolveAbility(
    state, side,
    {
      effect: effect(
        (state: GameState, _side: string, _eid: EID, target: Card, _targets: unknown[]): void => {
          setProp(state, _side, target, "uniqueness", !target.uniqueness);
        }
      ),
      msg: msg(
        (s: GameState, _sid: string, _eid: EID, target: Card, _tgts: unknown[]): string => {
          const wasUnique = target.uniqueness;
          return `make ${cardStr(s, target)}${wasUnique ? " not" : ""} unique`;
        }
      ),
      choices: { card: (t: Card) => sameSide(t.side, side) },
    },
    makeCard({ title: "/unique command", side }),
    [],
  );
}

/**
 * `/close-prompt` — Close the current prompt.
 * Mirrors `command-close-prompt`.
 */
export function commandClosePrompt(state: GameState, side: string): void {
  const promptQueue = side === CORP_SIDE ? state.corpPrompt : state.runnerPrompt;
  if (promptQueue.length === 0) return;

  const prompt = promptQueue[0];
  removeFromPromptQueue(state, side, prompt);

  // Clear selected
  if (side === CORP_SIDE) {
    delete (state.corp as any).selected;
  } else {
    delete (state.runner as any).selected;
  }

  const eid = (prompt as any).eid;
  if (eid) {
    effectCompleted(state, side, eid);
  }
}

/**
 * `/install` — Install a card (optionally ignoring all costs).
 * Mirrors `command-install`.
 */
export function commandInstall(state: GameState, side: string, args?: { ignoreAllCost?: boolean }): void {
  const ignoreAllCost = args?.ignoreAllCost ?? false;
  const promptSuffix = ignoreAllCost ? " (ignoring all costs)" : "";

  if (side === CORP_SIDE) {
    resolveAbility(
      state, side,
      {
        prompt: `Choose a card to install${promptSuffix}`,
        waiting: "true",
        choices: { card: (c: Card) => isCorp(c) && !isInstalled(c) },
        async: true,
        effect: req(
          (state: GameState, side: string, eid: EID, target: Card, _targets: unknown[]): void => {
            corpInstall(state, side, eid, target, null, { ignoreAllCost });
          }
        ),
      },
      makeCard({ title: ignoreAllCost ? "/install-free command" : "/install command", side }),
      [],
    );
  } else {
    resolveAbility(
      state, side,
      {
        prompt: `Choose a card to install${promptSuffix}`,
        waiting: "true",
        choices: { card: (c: Card) => isRunner(c) && !isInstalled(c) },
        async: true,
        effect: req(
          (state: GameState, side: string, eid: EID, target: Card, _targets: unknown[]): void => {
            runnerInstall(state, side, eid, target, { ignoreAllCost });
          }
        ),
      },
      makeCard({ title: ignoreAllCost ? "/install-free command" : "/install command", side }),
      [],
    );
  }
}

/**
 * `/install-free` — Install a card ignoring all costs.
 * Mirrors `command-install-free`.
 */
export function commandInstallFree(state: GameState, side: string): void {
  commandInstall(state, side, { ignoreAllCost: true });
}

/**
 * `/install-ice` — Install a piece of ICE on a server at a chosen position.
 * Mirrors `command-install-ice`.
 */
export function commandInstallIce(state: GameState, side: string): void {
  if (side !== CORP_SIDE) return;

  resolveAbility(
    state, side,
    {
      prompt: "Choose a piece of ice to install",
      waiting: "true",
      choices: { card: (c: Card) => isICE(c) && inHand(c) },
      async: true,
      effect: effect(
        (state: GameState, _side: string, _eid: EID, target: Card, _targets: unknown[]): void => {
          const chosenIce = target;
          continue_ability(
            state, _side,
            {
              prompt: "Choose a server",
              choices: req(
                (s: GameState, sid: string, eid: EID, card: Card, targets: unknown[]): string[] => {
                  // Return available server names
                  const zones = ["hq", "rd", "archives", ...Object.keys(s.corp.servers.remote)];
                  return zones;
                }
              ),
              async: true,
              effect: effect(
                (state: GameState, _side: string, _eid: EID, target: Card, _targets: unknown[]): void => {
                  const chosenServer = typeof target === "string" ? target : (target as any)?.value;
                  const zone = serverToZone(state, chosenServer as string);
                  const serverZone = zone.length >= 2 ? zone[1] : "";
                  const iceCount = (state.corp.servers as any)[serverZone]?.ices?.length ?? 0;
                  const positions = Array.from({ length: iceCount + 1 }, (_, i) => String(iceCount - i));

                  continue_ability(
                    state, _side,
                    {
                      prompt: "Which position to install in? (0 is innermost)",
                      choices: positions,
                      async: true,
                      effect: effect(
                        (state: GameState, _side: string, _eid: EID, target: Card, _targets: unknown[]): void => {
                          const index = strToInt(String(target));
                          corpInstall(
                            state, _side, makeEID(state),
                            chosenIce, chosenServer as unknown as Card,
                            { noInstallCost: true, index },
                          );
                        }
                      ),
                    },
                    null, [],
                  );
                }
              ),
            },
            null, [],
          );
        }
      ),
    },
    makeCard({ title: "/install-ice command", side }),
    [],
  );
}

/**
 * `/peek <n>` — Show top N cards of the deck.
 * Mirrors `command-peek`.
 */
export function commandPeek(state: GameState, side: string, n: number): void {
  const deck = side === CORP_SIDE ? state.corp.deck : state.runner.deck;
  const topCards = deck.slice(0, n);
  const titles = topCards.map(c => getTitle(c));
  const isPlural = n > 1;

  showPrompt(
    state, side, null,
    `The top ${quantify(n, "card")} of your deck ${isPlural ? "are" : "is"} (top->bottom): ${enumerateStr(titles)}`,
    ["Done"],
    null,
  );
}

/**
 * `/score` — Score an agenda ignoring restrictions (Corp only).
 * Mirrors `command-score`.
 */
export function commandScore(state: GameState, side: string): void {
  if (side !== CORP_SIDE) return;

  resolveAbility(
    state, side,
    {
      prompt: "Choose an agenda to score",
      waiting: "true",
      choices: {
        req: req(
          (s: GameState, sid: string, _eid: EID, target: Card, _targets: unknown[]): boolean => {
            return isAgenda(target) && (isInstalled(target) || inHand(target));
          }
        ),
      },
      msg: msg(
        (s: GameState, _sid: string, _eid: EID, target: Card, _tgts: unknown[]): string =>
          `score ${cardStr(s, target, { visible: true })}, ignoring all restrictions`
      ),
      async: true,
      effect: effect(
        (state: GameState, _side: string, eid: EID, target: Card, _targets: unknown[]): void => {
          score(state, _side, eid, target, { noReq: true, ignoreTurn: true });
        }
      ),
    },
    makeCard({ title: "the '/score' command", side }),
    [],
  );
}

/**
 * `/summon <card name>` — Add a card to hand by name.
 * Mirrors `command-summon`.
 */
export function commandSummon(state: GameState, side: string, cardName: string): void {
  try {
    const sCard = serverCard(cardName, false);
    if (!sCard || !sameSide((sCard as any).side, side)) {
      toast(state, side, `${cardName} isn't a valid card`);
      return;
    }
    const card = buildCard(sCard as Record<string, unknown>);
    if (!card) {
      toast(state, side, `${cardName} isn't a valid card`);
      return;
    }

    const newCard = { ...card, zone: ["hand"] };
    const hand = side === CORP_SIDE ? state.corp.hand : state.runner.hand;
    hand.push(newCard);
  } catch {
    toast(state, side, `${cardName} isn't a real card`);
  }
}

/**
 * `/reload-id` — Reload the current identity.
 * Mirrors `command-reload-id`.
 */
export function commandReloadId(state: GameState, side: string): void {
  const identity = side === CORP_SIDE ? state.corp.identity : state.runner.identity;
  const cardName = identity?.title ?? "";

  try {
    const sCard = serverCard(cardName, false);
    if (!sCard || !sameSide((sCard as any).side, side)) {
      toast(state, side, `${cardName} isn't a valid card`);
      return;
    }
    const card = buildCard(sCard as Record<string, unknown>);
    if (!card) {
      toast(state, side, `${cardName} isn't a valid card`);
      return;
    }

    const newId = makeCard({ ...card, title: cardName, zone: ["identity"], type: "Identity" });
    disableIdentity(state, side);
    if (side === CORP_SIDE) {
      state.corp.identity = newId;
    } else {
      state.runner.identity = newId;
    }
    cardInit(state, side, newId, { resolveEffect: true, initData: true });
  } catch {
    toast(state, side, `${cardName} isn't a real card`);
  }
}

/**
 * `/replace-id <card name>` — Replace identity with a different card.
 * Mirrors `command-replace-id`.
 */
export function commandReplaceId(state: GameState, side: string, cardName: string): void {
  try {
    const sCard = serverCard(cardName, false);
    if (!sCard || !sameSide((sCard as any).side, side)) {
      toast(state, side, `${cardName} isn't a valid card`);
      return;
    }
    const card = buildCard(sCard as Record<string, unknown>);
    if (!card) {
      toast(state, side, `${cardName} isn't a valid card`);
      return;
    }

    const newId = makeCard({ ...card, title: cardName, zone: ["identity"], type: "Identity" });
    disableIdentity(state, side);
    if (side === CORP_SIDE) {
      state.corp.identity = newId;
    } else {
      state.runner.identity = newId;
    }
    cardInit(state, side, newId, { resolveEffect: true, initData: true });
  } catch {
    toast(state, side, `${cardName} isn't a real card`);
  }
}

/**
 * `/host` — Host one installed card on another.
 * Mirrors `command-host`.
 */
export function commandHost(state: GameState, side: string): void {
  const f = side === CORP_SIDE ? isCorp : isRunner;

  resolveAbility(
    state, side,
    {
      prompt: "Choose the card to be hosted",
      waiting: "true",
      choices: { card: (c: Card) => f(c) && isInstalled(c) },
      async: true,
      effect: effect(
        (state: GameState, _side: string, _eid: EID, target: Card, _targets: unknown[]): void => {
          const h1 = target;
          continue_ability(
            state, _side,
            {
              prompt: "Choose the card to host the first card",
              choices: { card: (c: Card) => f(c) && isInstalled(c) && !sameCard(c, h1) },
              effect: effect(
                (state: GameState, _side: string, _eid: EID, target: Card, _targets: unknown[]): void => {
                  host(state, _side, target, h1);
                }
              ),
            },
            null, [],
          );
        }
      ),
    },
    null,
    [],
  );
}

/**
 * `/derez` — Derez a card (Corp only).
 * Mirrors `command-derez`.
 */
export function commandDerez(state: GameState, side: string): void {
  if (side !== CORP_SIDE) return;

  resolveAbility(
    state, side,
    {
      prompt: "Choose a card to derez",
      waiting: "true",
      choices: { card: (c: Card) => isRezzed(c) },
      async: true,
      effect: effect(
        (state: GameState, _side: string, eid: EID, target: Card, _targets: unknown[]): void => {
          derez(state, _side, eid, target, { noEvent: true });
        }
      ),
    },
    null,
    [],
  );
}

/**
 * `/trash` — Trash a card (unpreventable).
 * Mirrors `command-trash`.
 */
export function commandTrash(state: GameState, side: string): void {
  const f = side === CORP_SIDE ? isCorp : isRunner;

  resolveAbility(
    state, side,
    {
      prompt: "Choose a card to trash",
      waiting: "true",
      choices: { card: (c: Card) => f(c) },
      async: true,
      effect: effect(
        (state: GameState, _side: string, eid: EID, target: Card, _targets: unknown[]): void => {
          trash(state, _side, eid, target, { unpreventable: true });
        }
      ),
    },
    null,
    [],
  );
}

/**
 * `/swap-sides` — Request to swap sides with opponent.
 * Mirrors `command-swap-sides`.
 */
export function commandSwapSides(state: GameState, side: string): void {
  // Clear the ignore flag for the requesting side
  const sideObj = side === CORP_SIDE ? state.corp : state.runner;
  if ((sideObj as any).commandInfo) {
    delete (sideObj as any).commandInfo.ignoreSwapSides;
  }

  const otherS = otherSide(side);
  if (!otherS) return;

  const otherObj = otherS === CORP_SIDE ? state.corp : state.runner;
  if ((otherObj as any).commandInfo?.ignoreSwapSides) {
    toast(state, side, "your opponent has indicated that they do not wish to swap sides");
    return;
  }

  resolveAbility(
    state, otherS,
    {
      prompt: "Your opponent wishes to swap sides",
      waiting: "true",
      choices: ["Accept", "Decline", "Don't ask me again"],
      effect: req(
        (state: GameState, _side: string, _eid: EID, target: Card, _targets: unknown[]): void => {
          const choice = typeof target === "string" ? target : String(target);
          if (choice === "Decline") {
            toast(state, otherS!, "your opponent does not wish to swap sides at this time");
          } else if (choice === "Don't ask me again") {
            toast(state, otherS!, "your opponent does not wish to swap sides");
            if (!sideObj.commandInfo) sideObj.commandInfo = {};
            (sideObj.commandInfo as any).ignoreSwapSides = true;
          } else if (choice === "Accept") {
            systemMsg(state, side, "accepts the request to swap sides. Players swap sides");
            lobbyCommand({ command: "swap-sides", gameid: state.gameId });
          }
        }
      ),
    },
    null,
    [],
  );
}

/**
 * `/choose-hq-access` — Corp chooses HQ access cards during a run.
 * Mirrors `command-choose-hq-accesses`.
 */
export function commandChooseHqAccesses(state: GameState, side: string): void {
  if (!state.run) return;

  systemMsg(state, CORP_SIDE, "will be choosing the cards accessed from HQ this run");
  registerLingeringEffect(
    state, side,
    makeCard({ title: "/choose-hq-access command", side }),
    "corp-choose-hq-access",
    "end-of-run",
    null,
    () => true,
  );
}

// ---------------------------------------------------------------------------
// Command log entry
// ---------------------------------------------------------------------------

interface CommandLogEntry {
  command: string;
  timestamp: Date;
}

// ---------------------------------------------------------------------------
// Parse and dispatch commands
// ---------------------------------------------------------------------------

/**
 * Parse a slash command string and execute it.
 * Mirrors `parse-command`.
 */
export function parseCommand(state: GameState, side: string, text: string): ((state: GameState, side: string) => void) | null {
  const parts = safeSplit(text, " ");
  const command = parts[0] ?? "";
  const args = parts.slice(1);

  const value = stringToNum(args[0]) ?? 1;

  // Check for #n format (card at position)
  const firstArg = args[0] ?? "";
  const hashMatch = firstArg.split("#");
  const num = hashMatch.length >= 2 ? (stringToNum(hashMatch[1]) ?? 0) - 1 : 0;

  // If first arg starts with #, use positional commands
  if (firstArg.startsWith("#")) {
    switch (command) {
      case "/deck": {
        return (s: GameState, sid: string) => {
          const hand = sid === CORP_SIDE ? s.corp.hand : s.runner.hand;
          const card = hand[num];
          if (card) move(s, sid, card, "deck", { front: true });
        };
      }
      case "/discard": {
        return (s: GameState, sid: string) => {
          const hand = sid === CORP_SIDE ? s.corp.hand : s.runner.hand;
          const card = hand[num];
          if (card) move(s, sid, card, "discard");
        };
      }
    }
    return null;
  }

  // Standard commands
  switch (command) {
    case "/adv-counter":
      return (s: GameState, sid: string) => commandAdvCounter(s, sid, value);

    case "/bp":
      return (s: GameState, sid: string) => {
        const clamped = constrainValue(value, -1000, 1000);
        if (sid === CORP_SIDE) {
          (s.corp.badPublicity as any).base = clamped;
        } else {
          (s.runner as any).badPublicity = clamped;
        }
      };

    case "/bug":
      return commandBugReport;

    case "/card-info":
      return (s: GameState, sid: string) => {
        resolveAbility(
          s, sid,
          {
            effect: effect(
              (state: GameState, _side: string, _eid: EID, target: Card, _targets: unknown[]): void => {
                systemMsg(state, _side, `shows card-info of ${cardStr(state, target)}: ${getCard(state, target)}`);
              }
            ),
            choices: { card: (t: Card) => sameSide(t.side, sid) },
          },
          makeCard({ title: "/card-info command", side }),
          [],
        );
      };

    case "/charge":
      return (s: GameState, sid: string) => {
        resolveAbility(
          s, sid,
          {
            prompt: "Choose an installed card",
            waiting: "true",
            async: true,
            effect: req(
              (state: GameState, side: string, eid: EID, target: Card, _targets: unknown[]): void => {
                chargeCard(state, side, eid, target);
              }
            ),
            choices: { card: (t: Card) => sameSide(t.side, sid) },
          },
          makeCard({ title: "/charge command", side }),
          [],
        );
      };

    case "/choose-hq-access":
      return commandChooseHqAccesses;

    case "/clear-win":
      return (s: GameState, _sid: string) => clearWin(s);

    case "/click":
      return (s: GameState, sid: string) => {
        const clamped = constrainValue(value, 0, 1000);
        if (sid === CORP_SIDE) {
          s.corp.click = clamped;
        } else {
          s.runner.click = clamped;
        }
      };

    case "/close-prompt":
      return commandClosePrompt;

    case "/counter":
      return (s: GameState, sid: string) => commandCounter(s, sid, args);

    case "/credit":
      return (s: GameState, sid: string) => {
        const clamped = constrainValue(value, 0, 1000);
        if (sid === CORP_SIDE) {
          s.corp.credit = clamped;
        } else {
          s.runner.credit = clamped;
        }
      };

    case "/deck":
      return (s: GameState, sid: string) => toast(s, sid, "/deck number takes the format #n");

    case "/derez":
      return commandDerez;

    case "/disable-card":
      return (s: GameState, sid: string) => {
        resolveAbility(
          s, sid,
          {
            prompt: "Choose a card to disable",
            waiting: "true",
            effect: req(
              (state: GameState, side: string, _eid: EID, target: Card, _targets: unknown[]): void => {
                disableCard(state, side, target);
              }
            ),
            choices: { card: (t: Card) => sameSide(t.side, sid) },
          },
          makeCard({ title: "/disable-card command", side }),
          [],
        );
      };

    case "/discard":
      return (s: GameState, sid: string) => toast(s, sid, "/discard number takes the format #n");

    case "/discard-random":
      return (s: GameState, sid: string) => {
        const hand = sid === CORP_SIDE ? s.corp.hand : s.runner.hand;
        if (hand.length === 0) return;
        const card = hand[Math.floor(Math.random() * hand.length)];
        move(s, sid, card, "discard");
      };

    case "/draw":
      return (s: GameState, sid: string) => {
        const clamped = constrainValue(value, 0, 1000);
        draw(s, sid, makeEID(s), clamped);
      };

    case "/enable-card":
      return (s: GameState, sid: string) => {
        resolveAbility(
          s, sid,
          {
            prompt: "Choose a card to enable",
            waiting: "true",
            effect: req(
              (state: GameState, side: string, _eid: EID, target: Card, _targets: unknown[]): void => {
                enableCard(state, side, target);
              }
            ),
            choices: { card: (t: Card) => sameSide(t.side, sid) },
          },
          makeCard({ title: "/enable-card command", side }),
          [],
        );
      };

    case "/end-run":
      return (s: GameState, sid: string) => {
        if (sid === CORP_SIDE && s.run) {
          endRun(s, sid, makeEID(s), null);
        }
      };

    case "/enable-api-access":
      return commandEnableApiAccess;

    case "/error":
      return (s: GameState, sid: string) => toast(s, sid, "error", "error");

    case "/facedown":
      return (s: GameState, sid: string) => {
        if (sid === RUNNER_SIDE) commandFacedown(s, sid);
      };

    case "/handsize": {
      return (s: GameState, sid: string) => {
        const clamped = constrainValue(value, -1000, 1000);
        const player = sid === CORP_SIDE ? s.corp : s.runner;
        const currentTotal = (player.handSize as any).total ?? 0;
        change(s, sid, { key: "hand-size", delta: clamped - currentTotal });
      };
    }

    case "/host":
      return commandHost;

    case "/install":
      return (s: GameState, sid: string) => commandInstall(s, sid);

    case "/install-ice":
      return commandInstallIce;

    case "/install-free":
      return commandInstallFree;

    case "/jack-out":
      return (s: GameState, sid: string) => {
        if (sid === RUNNER_SIDE && (s.run || getCurrentEncounter(s))) {
          jackOut(s, sid, makeEID(s));
        }
      };

    case "/link":
      return (s: GameState, sid: string) => {
        if (sid === RUNNER_SIDE) {
          const clamped = constrainValue(value, 0, 1000);
          s.runner.link = clamped;
        }
      };

    case "/mark":
      return (s: GameState, sid: string) => {
        if (sid === RUNNER_SIDE) identifyMark(s);
      };

    case "/memory":
      return (s: GameState, sid: string) => {
        if (sid === RUNNER_SIDE) {
          const clamped = constrainValue(value, -1000, 1000);
          s.runner.memory.used = clamped;
        }
      };

    case "/move-bottom":
      return (s: GameState, sid: string) => {
        resolveAbility(
          s, sid,
          {
            prompt: "Choose a card in hand to put on the bottom of your deck",
            waiting: "true",
            effect: effect(
              (state: GameState, _side: string, _eid: EID, target: Card, _targets: unknown[]): void => {
                move(state, _side, target, "deck");
              }
            ),
            choices: { card: (t: Card) => sameSide(t.side, sid) && inHand(t) },
          },
          makeCard({ title: "/move-bottom command", side }),
          [],
        );
      };

    case "/move-deck":
      return (s: GameState, sid: string) => {
        resolveAbility(
          s, sid,
          {
            prompt: "Choose a card to move to the top of your deck",
            waiting: "true",
            effect: req(
              (state: GameState, side: string, _eid: EID, target: Card, _targets: unknown[]): void => {
                const c = deactivate(state, side, target);
                move(state, side, c, "deck", { front: true });
              }
            ),
            choices: { card: (t: Card) => sameSide(t.side, sid) },
          },
          makeCard({ title: "/move-deck command", side }),
          [],
        );
      };

    case "/move-hand":
      return (s: GameState, sid: string) => {
        resolveAbility(
          s, sid,
          {
            prompt: "Choose a card to move to your hand",
            waiting: "true",
            effect: req(
              (state: GameState, side: string, _eid: EID, target: Card, _targets: unknown[]): void => {
                const c = deactivate(state, side, target);
                move(state, side, c, "hand");
              }
            ),
            choices: { card: (t: Card) => sameSide(t.side, sid) },
          },
          makeCard({ title: "/move-hand command", side }),
          [],
        );
      };

    case "/peek":
      return (s: GameState, sid: string) => commandPeek(s, sid, value);

    case "/psi":
      return (s: GameState, sid: string) => {
        if (sid === CORP_SIDE) {
          psiGame(
            s, sid,
            makeCard({ title: "/psi command", side: sid }),
            {
              equal: { msg: "resolve equal bets effect" },
              notEqual: { msg: "resolve unequal bets effect" },
            },
          );
        }
      };

    case "/reload-id":
      return commandReloadId;

    case "/replace-id":
      return (s: GameState, sid: string) => commandReplaceId(s, sid, args.join(" "));

    case "/rez":
      return (s: GameState, sid: string) => {
        if (sid === CORP_SIDE) {
          resolveAbility(
            s, sid,
            {
              choices: { card: (t: Card) => sameSide(t.side, sid) },
              async: true,
              effect: effect(
                (state: GameState, _side: string, eid: EID, target: Card, _targets: unknown[]): void => {
                  rez(state, _side, eid, target, { ignoreCost: "all-costs", force: true });
                }
              ),
            },
            makeCard({ title: "/rez command", side }),
            [],
          );
        }
      };

    case "/rez-all":
      return (s: GameState, sid: string) => {
        if (sid === CORP_SIDE) commandRezAll(s, sid);
      };

    case "/rez-free":
      return (s: GameState, sid: string) => {
        if (sid === CORP_SIDE) {
          resolveAbility(
            s, sid,
            {
              choices: { card: (t: Card) => sameSide(t.side, sid) },
              async: true,
              effect: effect(
                (state: GameState, _side: string, eid: EID, target: Card, _targets: unknown[]): void => {
                  disableCard(target);
                  rez(state, _side, eid, target, { ignoreCost: "all-costs", force: true });
                  enableCard(getCard(state, target)!);
                }
              ),
            },
            makeCard({ title: "/rez command", side }),
            [],
          );
        }
      };

    case "/rfg":
      return (s: GameState, sid: string) => {
        resolveAbility(
          s, sid,
          {
            prompt: "Choose a card",
            waiting: "true",
            effect: req(
              (state: GameState, side: string, _eid: EID, target: Card, _targets: unknown[]): void => {
                const c = deactivate(state, side, target);
                move(state, side, c, "rfg");
              }
            ),
            choices: { card: (t: Card) => sameSide(t.side, sid) },
          },
          makeCard({ title: "/rfg command", side }),
          [],
        );
      };

    case "/roll":
      return (s: GameState, sid: string) => commandRoll(s, sid, value);

    case "/sabotage":
      return (s: GameState, sid: string) => {
        if (sid === RUNNER_SIDE) {
          const clamped = constrainValue(value, 0, 1000);
          resolveAbility(s, sid, sabotageAbility(clamped), null, []);
        }
      };

    case "/save-replay":
      return commandSaveReplay;

    case "/set-mark":
      return (s: GameState, sid: string) => commandSetMark(s, sid, args[0] ?? "");

    case "/score":
      return commandScore;

    case "/show-hand":
      return (s: GameState, sid: string) => {
        const player = sid === CORP_SIDE ? s.corp : s.runner;
        const handTitles = [...player.hand].map(c => c.title ?? "").sort();
        const deckName = sid === CORP_SIDE ? "HQ" : "the grip";
        systemMsg(s, sid, `shows cards from ${deckName}: ${enumerateStr(handTitles)}`);
      };

    case "/summon":
      return (s: GameState, sid: string) => commandSummon(s, sid, args.join(" "));

    case "/swap-ice":
      return (s: GameState, sid: string) => {
        if (sid === CORP_SIDE) {
          resolveAbility(
            s, sid,
            {
              prompt: "Choose two installed ice to swap",
              waiting: "true",
              choices: {
                max: 2,
                all: true,
                card: (c: Card) => isInstalled(c) && isICE(c),
              },
              effect: effect(
                (state: GameState, _side: string, _eid: EID, _target: Card, targets: unknown[]): void => {
                  const t = targets as Card[];
                  if (t.length >= 2) swapICE(t[0], t[1]);
                }
              ),
            },
            makeCard({ title: "/swap-ice command", side }),
            [],
          );
        }
      };

    case "/swap-installed":
      return (s: GameState, sid: string) => {
        if (sid === CORP_SIDE) {
          resolveAbility(
            s, sid,
            {
              prompt: "Choose two installed non-ice to swap",
              waiting: "true",
              choices: {
                max: 2,
                all: true,
                card: (c: Card) => isInstalled(c) && isCorp(c) && !isICE(c),
              },
              effect: effect(
                (state: GameState, _side: string, _eid: EID, _target: Card, targets: unknown[]): void => {
                  const t = targets as Card[];
                  if (t.length >= 2) swapInstalled(t[0], t[1]);
                }
              ),
            },
            makeCard({ title: "/swap-installed command", side }),
            [],
          );
        }
      };

    case "/swap-sides":
      return commandSwapSides;

    case "/tag":
      return (s: GameState, sid: string) => {
        const clamped = constrainValue(value, 0, 1000);
        if (sid === RUNNER_SIDE) {
          (s.runner.tag as any).base = clamped;
        }
      };

    case "/take-core":
      return (s: GameState, sid: string) => {
        if (sid === RUNNER_SIDE) {
          const clamped = constrainValue(value, 0, 1000);
          damage(s, sid, makeEID(s), "brain", clamped, {
            card: makeCard({ title: "/damage command", side: sid }),
          });
        }
      };

    case "/take-meat":
      return (s: GameState, sid: string) => {
        if (sid === RUNNER_SIDE) {
          const clamped = constrainValue(value, 0, 1000);
          damage(s, sid, makeEID(s), "meat", clamped, {
            card: makeCard({ title: "/damage command", side: sid }),
          });
        }
      };

    case "/take-net":
      return (s: GameState, sid: string) => {
        if (sid === RUNNER_SIDE) {
          const clamped = constrainValue(value, 0, 1000);
          damage(s, sid, makeEID(s), "net", clamped, {
            card: makeCard({ title: "/damage command", side: sid }),
          });
        }
      };

    case "/trace":
      return (s: GameState, sid: string) => {
        if (sid === CORP_SIDE) {
          const clamped = constrainValue(value, -1000, 1000);
          initTrace(s, sid, makeCard({ title: "/trace command", side: sid }), {
            base: clamped,
            msg: "resolve successful trace effect",
          });
        }
      };

    case "/trash":
      return commandTrash;

    case "/undo-paid-ability":
      return commandUndoPaidAbility;

    case "/undo-click":
      return commandUndoClick;

    case "/undo-turn":
      return commandUndoTurn;

    case "/unique":
      return commandUnique;
  }

  return null;
}

/**
 * Execute a parsed command and log it.
 * Mirrors the command logging portion of `parse-command`.
 */
export function executeCommand(state: GameState, side: string, text: string): void {
  const parts = safeSplit(text, " ");
  const command = parts[0] ?? "";
  const fn = parseCommand(state, side, text);

  if (fn) {
    fn(state, side);

    // Log the command
    const entry: CommandLogEntry = {
      command,
      timestamp: new Date(),
    };
    if (!state.commandLog) {
      state.commandLog = [];
    }
    state.commandLog.push(entry);
  }
}
