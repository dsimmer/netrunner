// Cost definitions and dispatch.
// Mirrors: src/clj/game/core/costs.clj
//
// Each cost type registers four (sometimes five) functions:
//   - value:        numeric weight of the cost
//   - stealthValue: stealth-credit value (only meaningful for credit-style costs)
//   - label:        cost-string used in the UI
//   - payable:      predicate for whether the cost can be paid right now
//   - handler:      effect that actually pays the cost; signals completion via the eid

import type { GameState } from "./state";
import type { Card } from "./card";
import type { EID } from "./eid";
import type { Ability, Cost, NumberFn } from "./types";
import {
  badPublicityAvailable,
  gainBadPublicity,
  loseBadPublicity,
} from "./bad_publicity";
import {
  allActive,
  allActiveInstalled,
  allInstalled,
  allInstalledRunnerType,
} from "./board";
import {
  hasSubtype,
  getCounter,
  getZone,
  inHand,
  isAgenda,
  isCorp,
  isFacedown,
  isHardware,
  isICE,
  isInstalled,
  isProgram,
  isResource,
  isRezzed,
  isRunner,
  active as isActive,
} from "./card";
import { getCardDef } from "./types";
import { damage } from "./damage";
import {
  completeWithResult,
  makeEID,
  makeEIDFrom,
  registerEIDCallback,
} from "./eid";
import { resolveAbility, queueEvent } from "./engine";
import { anyEffects, isDisabledReg } from "./effects";
import { isScored } from "./flags";
import { deduct, lose } from "./gaining";
import {
  discardFromHand,
  flipFacedown,
  forfeit,
  mill,
  move,
  trash,
  trashCards,
} from "./moving";
import {
  pickCreditProvidingCards,
  pickCreditReducers,
  pickVirusCountersToSpend,
} from "./pick_counters";
import { addCounter, addProp } from "./props";
import { reveal, revealAndQueueEvent } from "./revealing";
import { derez } from "./rezzing";
import { shuffleDeck } from "./shuffling";
import { gainTags, loseTags } from "./tags";
import { cardStr } from "./to_string";
import { numberOfVirusCounters } from "./virus";
import { getCard } from "./finding";
import { continue_ability } from "../macros";
import { enumerateCards, enumerateStr, quantify, sameCard } from "../utils";

import {
  handler,
  handlerDispatch,
  label,
  labelDispatch,
  payableDispatch,
  value,
  valueDispatch,
  waitFor,
} from "./costs_1";

// ===========================================================================
// Gain-tag
// ===========================================================================

valueDispatch.set("gain-tag", (c) => c.amount);
labelDispatch.set("gain-tag", (c) => `take ${quantify(value(c), "tag")}`);
payableDispatch.set("gain-tag", () => true);
handlerDispatch.set("gain-tag", (c, state, side, eid) => {
  waitFor(
    state,
    eid,
    (innerEid) =>
      gainTags(state, side, innerEid, value(c), {
        "suppress-checkpoint": true,
      }),
    () => {
      completeWithResult(state, side, eid, {
        "paid/msg": `takes ${quantify(value(c), "tag")}`,
        "paid/type": "gain-tag",
        "paid/value": value(c),
      });
    },
  );
});

// ===========================================================================
// Tag (remove)
// ===========================================================================

valueDispatch.set("tag", (c) => c.amount);
labelDispatch.set("tag", (c) => `remove ${quantify(value(c), "tag")}`);
payableDispatch.set("tag", (c, state) => {
  return (state.runner?.tag?.base ?? 0) - value(c) >= 0;
});
handlerDispatch.set("tag", (c, state, side, eid) => {
  waitFor(
    state,
    eid,
    (innerEid) =>
      loseTags(state, side, innerEid, value(c), {
        "suppress-checkpoint": true,
      }),
    () => {
      completeWithResult(state, side, eid, {
        "paid/msg": `removes ${quantify(value(c), "tag")}`,
        "paid/type": "tag",
        "paid/value": value(c),
      });
    },
  );
});

// ===========================================================================
// X-Tags
// ===========================================================================

valueDispatch.set("x-tags", () => 0);
labelDispatch.set("x-tags", () => "remove X tags");
payableDispatch.set("x-tags", () => true);
handlerDispatch.set("x-tags", (_c, state, side, eid, card) => {
  const tagBase = state.runner?.tag?.base ?? 0;
  if (tagBase <= 0) {
    completeWithResult(state, side, eid, {
      "paid/msg": "removes 0 tags",
      "paid/type": "x-tags",
      "paid/value": 0,
    });
    return;
  }
  continue_ability(
    state,
    side,
    {
      async: true,
      prompt: "How many tags do you want to remove?",
      choices: {
        number: ((s: GameState) => (s as any).runner?.tag?.base ?? 0) as any,
      } as any,
      effect: ((
        s: GameState,
        sd: string,
        ei: EID,
        _ca: Card | null,
        targets: any[],
      ) => {
        const cost = targets[0] as number;
        if (cost === 0) {
          completeWithResult(s, sd, ei, {
            "paid/msg": "removes 0 tags",
            "paid/type": "x-tags",
            "paid/value": 0,
          });
          return;
        }
        waitFor(
          s,
          ei,
          (innerEid) =>
            loseTags(s, sd, innerEid, cost, { "suppress-checkpoint": true }),
          () => {
            completeWithResult(s, sd, ei, {
              "paid/msg": `removes ${quantify(cost, "tag")}`,
              "paid/type": "x-tags",
              "paid/value": cost,
            });
          },
        );
      }) as any,
    } as any,
    card,
    [],
  );
});

// ===========================================================================
// Tag-or-bad-pub
// ===========================================================================

valueDispatch.set("tag-or-bad-pub", (c) => c.amount);
labelDispatch.set(
  "tag-or-bad-pub",
  (c) =>
    `remove ${quantify(value(c), "tag")} or take ${value(c)} bad publicity`,
);
payableDispatch.set("tag-or-bad-pub", () => true);
handlerDispatch.set("tag-or-bad-pub", (c, state, side, eid, card) => {
  const tagBase = state.runner?.tag?.base ?? 0;
  if (tagBase - value(c) < 0) {
    waitFor(
      state,
      eid,
      (innerEid) =>
        gainBadPublicity(state, side, innerEid, value(c), {
          "suppress-checkpoint": true,
        }),
      () => {
        completeWithResult(state, side, eid, {
          "paid/msg": `gains ${value(c)} bad publicity`,
          "paid/type": "tag-or-bad-pub",
          "paid/value": value(c),
        });
      },
    );
    return;
  }
  continue_ability(
    state,
    side,
    {
      prompt: "Choose one",
      choices: [
        `Remove ${quantify(value(c), "tag")}`,
        `Gain ${value(c)} bad publicity`,
      ],
      async: true,
      effect: ((
        s: GameState,
        sd: string,
        ei: EID,
        _ca: Card | null,
        targets: any[],
      ) => {
        const t = targets[0] as string;
        if (t === `Gain ${value(c)} bad publicity`) {
          waitFor(
            s,
            ei,
            (innerEid) =>
              gainBadPublicity(s, sd, innerEid, value(c), {
                "suppress-checkpoint": true,
              }),
            () => {
              completeWithResult(s, sd, ei, {
                "paid/msg": `gains ${value(c)} bad publicity`,
                "paid/type": "tag-or-bad-pub",
                "paid/value": value(c),
              });
            },
          );
        } else {
          waitFor(
            s,
            ei,
            (innerEid) =>
              loseTags(s, sd, innerEid, value(c), {
                "suppress-checkpoint": true,
              }),
            () => {
              completeWithResult(s, sd, ei, {
                "paid/msg": `removes ${quantify(value(c), "tag")}`,
                "paid/type": "tag-or-bad-pub",
                "paid/value": value(c),
              });
            },
          );
        }
      }) as any,
    } as any,
    card,
    [],
  );
});

// ===========================================================================
// Return-to-hand
// ===========================================================================

valueDispatch.set("return-to-hand", () => 1);
labelDispatch.set("return-to-hand", () => "return this card to your hand");
payableDispatch.set("return-to-hand", (_c, state, _side, _eid, card) =>
  isActive(getCard(state, card)),
);
handlerDispatch.set("return-to-hand", (_c, state, side, eid, card) => {
  if (!card) return;
  move(state, side, card, "hand");
  completeWithResult(state, side, eid, {
    "paid/msg": `returns ${card.title} to ${side === "corp" ? "HQ" : "[their] grip"}`,
    "paid/type": "return-to-hand",
    "paid/value": 1,
    "paid/targets": [card],
  });
});

// ===========================================================================
// Remove-from-game
// ===========================================================================

valueDispatch.set("remove-from-game", () => 1);
labelDispatch.set("remove-from-game", () => "remove this card from the game");
payableDispatch.set("remove-from-game", (_c, state, _side, _eid, card) =>
  isActive(getCard(state, card)),
);
handlerDispatch.set("remove-from-game", (_c, state, side, eid, card) => {
  if (!card) return;
  const moved = move(state, side, card, "rfg");
  completeWithResult(state, side, eid, {
    "paid/msg": `removes ${card.title} from the game`,
    "paid/type": "remove-from-game",
    "paid/value": 1,
    "paid/targets": [moved ?? card],
  });
});

// ===========================================================================
// Rfg-program
// ===========================================================================

valueDispatch.set("rfg-program", (c) => c.amount);
labelDispatch.set(
  "rfg-program",
  (c) => `remove ${quantify(value(c), "installed program")} from the game`,
);
payableDispatch.set("rfg-program", (c, state) => {
  return allInstalledRunnerType(state, "program").length - value(c) >= 0;
});
handlerDispatch.set("rfg-program", (c, state, side, eid, card) => {
  continue_ability(
    state,
    side,
    {
      prompt: `Choose ${quantify(value(c), "program")} to remove from the game`,
      choices: {
        all: true,
        max: value(c),
        card: (x: Card) => isInstalled(x) && isProgram(x) && !isFacedown(x),
      } as any,
      async: true,
      effect: ((
        s: GameState,
        sd: string,
        ei: EID,
        _ca: Card | null,
        targets: Card[],
      ) => {
        for (const t of targets) {
          const tagged: Card = {
            ...t,
            persistent: {
              ...((t as any).persistent ?? {}),
              "from-cid": card?.cid,
            },
          } as Card;
          move(s, sd, tagged, "rfg");
        }
        completeWithResult(s, sd, ei, {
          "paid/msg": `removes ${quantify(value(c), "installed program")} from the game (${enumerateStr(targets.map((t: any) => cardStr(s, t)))})`,
          "paid/type": "rfg-program",
          "paid/value": value(c),
          "paid/targets": targets,
        });
      }) as any,
    } as any,
    card,
    [],
  );
});

// ---------------------------------------------------------------------------
// Generic "trash N installed of type" cost factory
// ---------------------------------------------------------------------------

function registerTrashInstalled(
  type: string,
  description: string,
  countSelector: (state: GameState, side: string, card: Card | null) => Card[],
  cardPred: (
    state: GameState,
    side: string,
    card: Card | null,
  ) => (c: Card) => boolean,
): void {
  valueDispatch.set(type, (c) => c.amount);
  labelDispatch.set(type, (c) => `trash ${quantify(value(c), description)}`);
  payableDispatch.set(type, (c, state, side, _eid, card) => {
    return countSelector(state, side, card).length - value(c) >= 0;
  });
  handlerDispatch.set(type, (c, state, side, eid, card) => {
    continue_ability(
      state,
      side,
      {
        prompt: `Choose ${quantify(value(c), description)} to trash`,
        choices: {
          all: true,
          max: value(c),
          card: cardPred(state, side, card),
        } as any,
        async: true,
        effect: ((
          s: GameState,
          sd: string,
          ei: EID,
          _ca: Card | null,
          targets: Card[],
        ) => {
          waitFor(
            s,
            ei,
            (innerEid) =>
              trashCards(s, sd, innerEid, targets, {
                cause: "ability-cost",
                "suppress-checkpoint": true,
                unpreventable: true,
              }),
            (asyncResult) => {
              const trashed = (asyncResult as Card[]) ?? [];
              completeWithResult(s, sd, ei, {
                "paid/msg": `trashes ${quantify(trashed.length, description)} (${enumerateStr(targets.map((t: any) => cardStr(s, t)))})`,
                "paid/type": type,
                "paid/value": trashed.length,
                "paid/targets": targets,
              });
            },
          );
        }) as any,
      } as any,
      card,
      [],
    );
  });
}

// trash-other-installed (excludes self)
registerTrashInstalled(
  "trash-other-installed",
  "installed card",
  (state, side, card) =>
    allInstalled(state, side).filter((c: any) => !sameCard(card as any, c)),
  (_state, side, card) => (c) =>
    isInstalled(c) &&
    !sameCard(c, card as any) &&
    (side === "runner" ? isRunner(c) : isCorp(c)),
);

// trash-installed (allows self)
registerTrashInstalled(
  "trash-installed",
  "installed card",
  (state, side) => allInstalled(state, side),
  (_state, side) => (c) =>
    isInstalled(c) && (side === "runner" ? isRunner(c) : isCorp(c)),
);

// hardware (overrides label/handler to include "of hardware")
registerTrashInstalled(
  "hardware",
  "installed piece",
  (state) => allInstalledRunnerType(state, "hardware"),
  () => (c) => isInstalled(c) && isHardware(c) && !isFacedown(c),
);
labelDispatch.set(
  "hardware",
  (c) => `trash ${quantify(value(c), "installed piece")} of hardware`,
);
handlerDispatch.set("hardware", (c, state, side, eid, card) => {
  continue_ability(
    state,
    side,
    {
      prompt: `Choose ${quantify(value(c), "installed piece")} of hardware to trash`,
      choices: {
        all: true,
        max: value(c),
        card: (x: Card) => isInstalled(x) && isHardware(x) && !isFacedown(x),
      } as any,
      async: true,
      effect: ((
        s: GameState,
        sd: string,
        ei: EID,
        _ca: Card | null,
        targets: Card[],
      ) => {
        waitFor(
          s,
          ei,
          (innerEid) =>
            trashCards(s, sd, innerEid, targets, {
              cause: "ability-cost",
              "suppress-checkpoint": true,
              unpreventable: true,
            }),
          (asyncResult) => {
            const trashed = (asyncResult as Card[]) ?? [];
            completeWithResult(s, sd, ei, {
              "paid/msg": `trashes ${quantify(trashed.length, "installed piece")} of hardware (${enumerateStr(targets.map((t: any) => cardStr(s, t)))})`,
              "paid/type": "hardware",
              "paid/value": trashed.length,
              "paid/targets": targets,
            });
          },
        );
      }) as any,
    } as any,
    card,
    [],
  );
});

// program
registerTrashInstalled(
  "program",
  "installed program",
  (state) => allInstalledRunnerType(state, "program"),
  () => (c) => isInstalled(c) && isProgram(c) && !isFacedown(c),
);

// resource
registerTrashInstalled(
  "resource",
  "installed resource",
  (state) => allInstalledRunnerType(state, "resource"),
  () => (c) => isInstalled(c) && isResource(c) && !isFacedown(c),
);

// connection
registerTrashInstalled(
  "connection",
  "installed connection resource",
  (state) =>
    allActiveInstalled(state, "runner").filter((c: any) =>
      hasSubtype(c, "Connection"),
    ),
  () => (c) =>
    !!(isInstalled(c) &&
    isResource(c) &&
    hasSubtype(c, "Connection") &&
    !isFacedown(c)),
);

// ice
registerTrashInstalled(
  "ice",
  "installed rezzed ice",
  (state) =>
    allInstalled(state, "corp").filter(
      (c) => isInstalled(c) && isRezzed(c) && isICE(c),
    ),
  () => (c) => isInstalled(c) && isRezzed(c) && isICE(c),
);

// ===========================================================================
// Derez-other-harmonic
// ===========================================================================

valueDispatch.set("derez-other-harmonic", (c) => c.amount);
labelDispatch.set(
  "derez-other-harmonic",
  (c) => `derez ${value(c)} Harmonic ice`,
);
payableDispatch.set("derez-other-harmonic", (c, state, _side, _eid, card) => {
  return (
    allActiveInstalled(state, "corp").filter(
      (x) =>
        isRezzed(x) && hasSubtype(x, "Harmonic") && !sameCard(card as any, x),
    ).length -
      value(c) >=
    0
  );
});
handlerDispatch.set("derez-other-harmonic", (c, state, side, eid, card) => {
  continue_ability(
    state,
    side,
    {
      prompt: `Choose ${value(c)} Harmonic ice to derez`,
      choices: {
        all: true,
        max: value(c),
        card: (x: Card) =>
          isRezzed(x) && !sameCard(x, card as any) && hasSubtype(x, "Harmonic"),
      } as any,
      async: true,
      effect: ((
        s: GameState,
        sd: string,
        ei: EID,
        _ca: Card | null,
        targets: Card[],
      ) => {
        waitFor(
          s,
          ei,
          (innerEid) =>
            derez(s, sd, innerEid, targets, {
              suppressCheckpoint: true,
              noMsg: true,
            } as any),
          () => {
            completeWithResult(s, sd, ei, {
              "paid/msg": `derezzes ${targets.length} Harmonic ice (${enumerateStr(targets.map((t: any) => cardStr(s, t)))})`,
              "paid/type": "derez",
              "paid/value": targets.length,
              "paid/targets": targets,
            });
          },
        );
      }) as any,
    } as any,
    card,
    [],
  );
});

// ===========================================================================
// Bioroid-run-server
// ===========================================================================

valueDispatch.set("bioroid-run-server", (c) => c.amount);
labelDispatch.set(
  "bioroid-run-server",
  (c) => `trash ${quantify(value(c), "rezzed Bioroid")}`,
);
payableDispatch.set("bioroid-run-server", (c, state) => {
  const run = state.run;
  if (!run) return false;
  const runServer = run?.server?.[0];
  return (
    allInstalled(state, "corp").filter(
      (x) =>
        isInstalled(x) &&
        isRezzed(x) &&
        hasSubtype(x, "Bioroid") &&
        getZone(x)?.[1] === runServer,
    ).length -
      value(c) >=
    0
  );
});
handlerDispatch.set("bioroid-run-server", (c, state, side, eid, card) => {
  const runServer = state.run?.server?.[0];
  continue_ability(
    state,
    side,
    {
      prompt: `Choose ${quantify(value(c), " rezzed Bioroid", "")} to trash`,
      choices: {
        all: true,
        max: value(c),
        req: ((
          _s: GameState,
          _sd: string,
          _e: EID,
          _ca: Card | null,
          targets: any[],
        ) => {
          const t = targets[0] as Card;
          return (
            isInstalled(t) &&
            isRezzed(t) &&
            hasSubtype(t, "Bioroid") &&
            getZone(t)?.[1] === runServer
          );
        }) as any,
      } as any,
      async: true,
      effect: ((
        s: GameState,
        sd: string,
        ei: EID,
        _ca: Card | null,
        targets: Card[],
      ) => {
        waitFor(
          s,
          ei,
          (innerEid) =>
            trashCards(s, sd, innerEid, targets, {
              cause: "ability-cost",
              unpreventable: true,
            }),
          (asyncResult) => {
            const trashed = (asyncResult as Card[]) ?? [];
            completeWithResult(s, sd, ei, {
              "paid/msg": `trashes ${quantify(trashed.length, " rezzed Bioroid", "")} (${enumerateStr(targets.map((t: any) => cardStr(s, t)))})`,
              "paid/type": "bioroid-run-server",
              "paid/value": trashed.length,
              "paid/targets": targets,
            });
          },
        );
      }) as any,
    } as any,
    card,
    [],
  );
});

// ===========================================================================
// Trash-from-deck
// ===========================================================================

valueDispatch.set("trash-from-deck", (c) => c.amount);
labelDispatch.set(
  "trash-from-deck",
  (c) => `trash ${quantify(value(c), "card")} from the top of your deck`,
);
payableDispatch.set("trash-from-deck", (c, state, side) => {
  return (((state as any)[side]?.deck ?? []) as Card[]).length - value(c) >= 0;
});
handlerDispatch.set("trash-from-deck", (c, state, side, eid) => {
  waitFor(
    state,
    eid,
    (innerEid) =>
      mill(state, side, innerEid, side, value(c), {
        "suppress-checkpoint": true,
      } as any),
    (asyncResult) => {
      const trashed = (asyncResult as Card[]) ?? [];
      completeWithResult(state, side, eid, {
        "paid/msg": `trashes ${quantify(trashed.length, "card")} from the top of ${side === "corp" ? "R&D" : "the stack"}`,
        "paid/type": "trash-from-deck",
        "paid/value": trashed.length,
        "paid/targets": trashed,
      });
    },
  );
});

// ===========================================================================
// Trash-from-hand
// ===========================================================================

valueDispatch.set("trash-from-hand", (c) => c.amount);
labelDispatch.set(
  "trash-from-hand",
  (c) => `trash ${quantify(value(c), "card")} from your hand`,
);
payableDispatch.set("trash-from-hand", (c, state, side) => {
  return (((state as any)[side]?.hand ?? []) as Card[]).length - value(c) >= 0;
});
handlerDispatch.set("trash-from-hand", (c, state, side, eid) => {
  const selectFn = (x: Card) =>
    (side === "corp" ? isCorp(x) : isRunner(x)) && inHand(x);
  const handName = side === "corp" ? "HQ" : "the grip";
  continue_ability(
    state,
    side,
    {
      prompt: `Choose ${quantify(value(c), "card")} to trash`,
      choices: { all: true, max: value(c), card: selectFn } as any,
      async: true,
      effect: ((
        s: GameState,
        sd: string,
        ei: EID,
        _ca: Card | null,
        targets: Card[],
      ) => {
        waitFor(
          s,
          ei,
          (innerEid) =>
            trashCards(s, sd, innerEid, targets, {
              unpreventable: true,
              seen: false,
              cause: "ability-cost",
              "suppress-checkpoint": true,
            }),
          (asyncResult) => {
            const trashed = (asyncResult as Card[]) ?? [];
            const detail =
              sd === "runner" && trashed.length > 0
                ? ` (${enumerateStr(targets.map((t: any) => cardStr(s, t)))})`
                : "";
            completeWithResult(s, sd, ei, {
              "paid/msg": `trashes ${quantify(trashed.length, "card")}${detail} from ${handName}`,
              "paid/type": "trash-from-hand",
              "paid/value": trashed.length,
              "paid/targets": trashed,
            });
          },
        );
      }) as any,
    } as any,
    null,
    [],
  );
});

// ===========================================================================
// Randomly-trash-from-hand
// ===========================================================================

valueDispatch.set("randomly-trash-from-hand", (c) => c.amount);
labelDispatch.set(
  "randomly-trash-from-hand",
  (c) => `trash ${quantify(value(c), "card")} randomly from your hand`,
);
payableDispatch.set("randomly-trash-from-hand", (c, state, side) => {
  return (((state as any)[side]?.hand ?? []) as Card[]).length - value(c) >= 0;
});
handlerDispatch.set("randomly-trash-from-hand", (c, state, side, eid) => {
  waitFor(
    state,
    eid,
    (innerEid) =>
      discardFromHand(state, side, innerEid, side, value(c), {
        "suppress-checkpoint": true,
      } as any),
    (asyncResult) => {
      const trashed = (asyncResult as Card[]) ?? [];
      const detail =
        side === "runner" ? ` (${enumerateCards(trashed, "sorted")})` : "";
      completeWithResult(state, side, eid, {
        "paid/msg": `trashes ${quantify(trashed.length, "card")}${detail} randomly from ${side === "corp" ? "HQ" : "the grip"}`,
        "paid/type": "randomly-trash-from-hand",
        "paid/value": trashed.length,
        "paid/targets": trashed,
      });
    },
  );
});
