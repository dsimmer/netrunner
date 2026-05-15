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
export function constrainValue(value: number, min: number, max: number): number {
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
