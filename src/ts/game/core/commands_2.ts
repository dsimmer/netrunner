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

import { commandAdvCounter, commandBugReport, commandClosePrompt, commandCounter, commandEnableApiAccess, commandFacedown, commandInstall, commandInstallFree, commandInstallIce, commandPeek, commandReloadId, commandReplaceId, commandRezAll, commandRoll, commandSaveReplay, commandScore, commandSetMark, commandSummon, commandUndoClick, commandUndoPaidAbility, commandUndoTurn, commandUnique, constrainValue, lobbyCommand } from './commands_1';

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
