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
import type { Ability, Cost, NumberFn } from "./types.ts";
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
} from "./card";
import { getCardDef } from "./types.ts";
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
  handlerDispatch,
  labelDispatch,
  payableDispatch,
  value,
  valueDispatch,
  waitFor,
} from "./costs_1";

// ===========================================================================
// Reveal-and-randomly-trash-from-hand
// ===========================================================================

valueDispatch.set("reveal-and-randomly-trash-from-hand", (c) => c.amount);
labelDispatch.set(
  "reveal-and-randomly-trash-from-hand",
  (c) => `trash ${quantify(value(c), "card")} randomly from your hand`,
);
payableDispatch.set("reveal-and-randomly-trash-from-hand", (c, state, side) => {
  return (((state as any)[side]?.hand ?? []) as Card[]).length - value(c) >= 0;
});
handlerDispatch.set(
  "reveal-and-randomly-trash-from-hand",
  (c, state, side, eid) => {
    const hand = ((state as any)[side]?.hand ?? []) as Card[];
    const shuffled = [...hand].sort(() => Math.random() - 0.5);
    const toTrash = shuffled
      .slice(0, value(c))
      .map((cd: any) => ({ ...cd, seen: true }));
    const handName = side === "corp" ? "HQ" : "the grip";
    waitFor(
      state,
      eid,
      (innerEid) => reveal(state, side, innerEid, toTrash),
      () => {
        waitFor(
          state,
          eid,
          (innerEid) =>
            trashCards(state, side, innerEid, toTrash, {
              unpreventable: true,
              cause: "ability-cost",
            }),
          (asyncResult) => {
            const trashed = (asyncResult as Card[]) ?? [];
            completeWithResult(state, side, eid, {
              "paid/msg": `reveals and trashes ${quantify(trashed.length, "card")} (${enumerateCards(toTrash, "sorted")}) from ${handName}`,
              "paid/type": "reveal-and-randomly-trash-from-hand",
              "paid/value": trashed.length,
              "paid/targets": trashed,
            });
          },
        );
      },
    );
  },
);

// ===========================================================================
// Trash-entire-hand
// ===========================================================================

valueDispatch.set("trash-entire-hand", () => 1);
labelDispatch.set("trash-entire-hand", () => "trash all cards in your hand");
payableDispatch.set("trash-entire-hand", () => true);
handlerDispatch.set("trash-entire-hand", (_c, state, side, eid) => {
  const cards = ((state as any)[side]?.hand ?? []) as Card[];
  waitFor(
    state,
    eid,
    (innerEid) =>
      trashCards(state, side, innerEid, cards, {
        unpreventable: true,
        "suppress-checkpoint": true,
        cause: "ability-cost",
      }),
    (asyncResult) => {
      const trashed = (asyncResult as Card[]) ?? [];
      const detail =
        side === "runner" && trashed.length > 0
          ? ` (${enumerateCards(trashed, "sorted")})`
          : "";
      completeWithResult(state, side, eid, {
        "paid/msg": `trashes all (${trashed.length}) cards in ${side === "runner" ? "[their] grip" : "HQ"}${detail}`,
        "paid/type": "trash-entire-hand",
        "paid/value": trashed.length,
        "paid/targets": trashed,
      });
    },
  );
});

// ===========================================================================
// Trash-{type}-from-hand factory
// ===========================================================================

function registerTrashTypeFromHand(
  type: string,
  description: string,
  pred: (c: Card) => boolean,
  detailFn: (targets: Card[]) => string,
): void {
  valueDispatch.set(type, (c) => c.amount);
  labelDispatch.set(
    type,
    (c) => `trash ${quantify(value(c), description)} in the grip`,
  );
  payableDispatch.set(type, (c, state) => {
    return (
      ((state.runner?.hand ?? []) as Card[]).filter(pred).length -
        value(c) >=
      0
    );
  });
  handlerDispatch.set(type, (c, state, side, eid) => {
    continue_ability(
      state,
      side,
      {
        prompt: `Choose ${quantify(value(c), description)} to trash`,
        async: true,
        choices: {
          all: true,
          max: value(c),
          card: (x: Card) => pred(x) && inHand(x),
        } as any,
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
                "suppress-checkpoint": true,
                cause: "ability-cost",
              }),
            (asyncResult) => {
              const trashed = (asyncResult as Card[]) ?? [];
              completeWithResult(s, sd, ei, {
                "paid/msg": `trashes ${quantify(trashed.length, description)}${detailFn(targets)}`,
                "paid/type": type,
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
}

registerTrashTypeFromHand(
  "trash-hardware-from-hand",
  "piece",
  (c) => isHardware(c),
  (targets) =>
    ` of hardware (${enumerateCards(targets, "sorted")}) from [their] grip`,
);
labelDispatch.set(
  "trash-hardware-from-hand",
  (c) => `trash ${quantify(value(c), "piece")} of hardware in the grip`,
);
registerTrashTypeFromHand(
  "trash-program-from-hand",
  "program",
  (c) => isProgram(c),
  (targets) => ` (${enumerateCards(targets, "sorted")}) from the grip`,
);
registerTrashTypeFromHand(
  "trash-resource-from-hand",
  "resource",
  (c) => isResource(c),
  (targets) => ` (${enumerateCards(targets, "sorted")}) from the grip`,
);

// ===========================================================================
// Damage costs (net, meat, brain)
// ===========================================================================

function registerDamage(
  type: string,
  damageKw: string,
  displayName: string,
): void {
  valueDispatch.set(type, (c) => c.amount);
  labelDispatch.set(type, (c) => `suffer ${value(c)} ${displayName}`);
  payableDispatch.set(type, (c, state) => {
    return value(c) <= ((state.runner?.hand ?? []) as Card[]).length;
  });
  handlerDispatch.set(type, (c, state, side, eid, card) => {
    waitFor(
      state,
      eid,
      (innerEid) =>
        damage(state, side, innerEid, damageKw, value(c), {
          unpreventable: true,
          card,
          "suppress-checkpoint": true,
        }),
      (asyncResult) => {
        const arr = (asyncResult as Card[]) ?? [];
        completeWithResult(state, side, eid, {
          "paid/msg": `suffers ${arr.length} ${displayName}`,
          "paid/type": type,
          "paid/value": arr.length,
          "paid/targets": arr,
        });
      },
    );
  });
}

registerDamage("net", "net", "net damage");
registerDamage("meat", "meat", "meat damage");
registerDamage("brain", "brain", "core damage");

// ===========================================================================
// Shuffle-installed-to-stack
// ===========================================================================

valueDispatch.set("shuffle-installed-to-stack", (c) => c.amount);
labelDispatch.set(
  "shuffle-installed-to-stack",
  (c) => `shuffle ${quantify(value(c), "installed card")} into your deck`,
);
payableDispatch.set("shuffle-installed-to-stack", (c, state, side) => {
  return allInstalled(state, side).length - value(c) >= 0;
});
handlerDispatch.set("shuffle-installed-to-stack", (c, state, side, eid) => {
  continue_ability(
    state,
    "runner",
    {
      prompt: `Choose ${quantify(value(c), "installed card")} to shuffle into ${side === "corp" ? "R&D" : "the stack"}`,
      choices: {
        max: value(c),
        all: true,
        card: (x: Card) =>
          isInstalled(x) && (side === "corp" ? isCorp(x) : isRunner(x)),
      } as any,
      async: true,
      effect: ((
        s: GameState,
        sd: string,
        ei: EID,
        _ca: Card | null,
        targets: Card[],
      ) => {
        const moved = targets
          .map((t: any) => move(s, sd, t, "deck", { shuffled: true }))
          .filter((x): x is Card => !!x);
        shuffleDeck(s, sd);
        completeWithResult(s, sd, ei, {
          "paid/msg": `shuffles ${quantify(moved.length, "card")} (${enumerateCards(moved, "sorted")}) into ${side === "corp" ? "R&D" : "the stack"}`,
          "paid/type": "shuffle-installed-to-stack",
          "paid/value": moved.length,
          "paid/targets": moved,
        });
      }) as any,
    } as any,
    null,
    [],
  );
});

// ===========================================================================
// Add-installed-to-bottom-of-deck
// ===========================================================================

valueDispatch.set("add-installed-to-bottom-of-deck", (c) => c.amount);
labelDispatch.set(
  "add-installed-to-bottom-of-deck",
  (c) =>
    `add ${quantify(value(c), "installed card")} to the bottom of your deck`,
);
payableDispatch.set("add-installed-to-bottom-of-deck", (c, state, side) => {
  return allInstalled(state, side).length - value(c) >= 0;
});
handlerDispatch.set(
  "add-installed-to-bottom-of-deck",
  (c, state, side, eid) => {
    const deckName = side === "corp" ? "R&D" : "the stack";
    continue_ability(
      state,
      side,
      {
        prompt: `Choose ${quantify(value(c), "installed card")} to move to the bottom of ${deckName}`,
        choices: {
          max: value(c),
          all: true,
          card: (x: Card) =>
            isInstalled(x) && (side === "corp" ? isCorp(x) : isRunner(x)),
        } as any,
        async: true,
        effect: ((
          s: GameState,
          sd: string,
          ei: EID,
          _ca: Card | null,
          targets: Card[],
        ) => {
          const moved = targets
            .map((t: any) => move(s, sd, t, "deck"))
            .filter((x): x is Card => !!x);
          completeWithResult(s, sd, ei, {
            "paid/msg": `adds ${quantify(moved.length, "installed card")} to the bottom of ${deckName} (${enumerateStr(targets.map((t: any) => cardStr(s, t)))})`,
            "paid/type": "add-installed-to-bottom-of-deck",
            "paid/value": moved.length,
            "paid/targets": moved,
          });
        }) as any,
      } as any,
      null,
      [],
    );
  },
);

// ===========================================================================
// Turn-hosted-matryoshka-facedown
// ===========================================================================

valueDispatch.set("turn-hosted-matryoshka-facedown", (c) => c.amount);
labelDispatch.set(
  "turn-hosted-matryoshka-facedown",
  (c) => `turn ${quantify(value(c), "hosted cop", "y")} of Matryoshka facedown`,
);
payableDispatch.set(
  "turn-hosted-matryoshka-facedown",
  (c, state, _side, _eid, card) => {
    const hosted = ((getCard(state, card) as any)?.hosted ?? []) as Card[];
    return (
      value(c) <=
      hosted.filter((x: any) => !isFacedown(x) && x.title === "Matryoshka").length
    );
  },
);
handlerDispatch.set(
  "turn-hosted-matryoshka-facedown",
  (c, state, side, eid, card) => {
    const pred = (x: Card) => !isFacedown(x) && x.title === "Matryoshka";
    const hosted = ((getCard(state, card) as any)?.hosted ?? []) as Card[];
    const selected = hosted.filter(pred).slice(0, value(c));
    for (const cc of selected) flipFacedown(state, side, cc);
    completeWithResult(state, side, eid, {
      "paid/msg": `turns ${quantify(value(c), "hosted cop", "y")} of Matryoshka facedown`,
      "paid/type": "turn-hosted-matryoshka-facedown",
      "paid/value": value(c),
      "paid/targets": selected,
    });
  },
);

// ===========================================================================
// Add-random-from-hand-to-bottom-of-deck
// ===========================================================================

valueDispatch.set("add-random-from-hand-to-bottom-of-deck", (c) => c.amount);
labelDispatch.set(
  "add-random-from-hand-to-bottom-of-deck",
  (c) => `add ${quantify(value(c), "random card")} to the bottom of your deck`,
);
payableDispatch.set(
  "add-random-from-hand-to-bottom-of-deck",
  (c, state, side) => {
    return value(c) <= (((state as any)[side]?.hand ?? []) as Card[]).length;
  },
);
handlerDispatch.set(
  "add-random-from-hand-to-bottom-of-deck",
  (c, state, side, eid) => {
    const deck = side === "corp" ? "R&D" : "the stack";
    const hand = ((state as any)[side]?.hand ?? []) as Card[];
    const chosen = [...hand].sort(() => Math.random() - 0.5).slice(0, value(c));
    for (const cc of chosen) move(state, side, cc, "deck");
    completeWithResult(state, side, eid, {
      "paid/msg": `adds ${quantify(value(c), "random card")} to the bottom of ${deck}`,
      "paid/type": "add-random-from-hand-to-bottom-of-deck",
      "paid/value": value(c),
      "paid/targets": chosen,
    });
  },
);

// ===========================================================================
// Hosted-to-hq
// ===========================================================================

valueDispatch.set("hosted-to-hq", (c) => c.amount);
labelDispatch.set(
  "hosted-to-hq",
  (c) => `add ${quantify(value(c), "hosted card")} to HQ`,
);
payableDispatch.set("hosted-to-hq", (c, state, _side, _eid, card) => {
  const hosted = ((getCard(state, card) as any)?.hosted ?? []) as Card[];
  return hosted.filter((x: any) => isCorp(x)).length - value(c) >= 0;
});
handlerDispatch.set("hosted-to-hq", (c, state, side, eid, card) => {
  continue_ability(
    state,
    side,
    {
      prompt: `Choose ${quantify(value(c), "card")} hosted on ${card?.title} to add to HQ`,
      choices: {
        max: value(c),
        all: true,
        req: ((
          _s: GameState,
          _sd: string,
          _e: EID,
          _ca: Card | null,
          targets: any[],
        ) => {
          const t = targets[0] as Card;
          return isCorp(t) && sameCard((t as any).host, card as any);
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
        const moved = targets
          .map((t: any) => move(s, "corp", t, "hand"))
          .filter((x): x is Card => !!x);
        completeWithResult(s, sd, ei, {
          "paid/msg": `adds ${quantify(moved.length, "hosted card")} to HQ (${enumerateCards(moved, "sorted")})`,
          "paid/type": "hosted-to-hq",
          "paid/value": moved.length,
          "paid/targets": moved,
        });
      }) as any,
    } as any,
    card,
    [],
  );
});

// ===========================================================================
// Any-agenda-counter
// ===========================================================================

valueDispatch.set("any-agenda-counter", (c) => c.amount);
labelDispatch.set("any-agenda-counter", () => "any agenda counter");
payableDispatch.set("any-agenda-counter", (c, state) => {
  const total = ((state.corp?.scored ?? []) as Card[])
    .map((x: any) => getCounter(x, "agenda"))
    .reduce((a: any, b: any) => a + b, 0);
  return total - value(c) >= 0;
});
handlerDispatch.set("any-agenda-counter", (c, state, side, eid) => {
  continue_ability(
    state,
    side,
    {
      prompt: "Choose an agenda with a counter",
      choices: {
        card: (x: Card) =>
          isAgenda(x) &&
          isScored(state, side, x) &&
          getCounter(x, "agenda") > 0,
      } as any,
      async: true,
      effect: ((
        s: GameState,
        sd: string,
        ei: EID,
        _ca: Card | null,
        targets: Card[],
      ) => {
        const tgt = targets[0];
        waitFor(
          s,
          ei,
          (innerEid) =>
            addCounter(s, sd, innerEid, tgt, "agenda", -value(c), {
              "suppress-checkpoint": true,
            }),
          () => {
            queueEvent(s, ":agenda-counter-spent", { value: value(c) } as any);
            completeWithResult(s, sd, ei, {
              "paid/msg": `spends ${quantify(value(c), "hosted agenda counter")} from on ${tgt.title}`,
              "paid/type": "any-agenda-counter",
              "paid/value": value(c),
              "paid/targets": [tgt],
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
// Any-virus-counter
// ===========================================================================

valueDispatch.set("any-virus-counter", (c) => c.amount);
labelDispatch.set(
  "any-virus-counter",
  (c) => `any ${quantify(value(c), "virus counter")}`,
);
payableDispatch.set("any-virus-counter", (c, state) => {
  return numberOfVirusCounters(state) - value(c) >= 0;
});
handlerDispatch.set("any-virus-counter", (c, state, side, eid, card) => {
  waitFor(
    state,
    eid,
    (innerEid) =>
      resolveAbility(
        state,
        side,
        { ...pickVirusCountersToSpend(value(c)), eid: innerEid } as any,
        card,
        [],
      ),
    (asyncResult) => {
      completeWithResult(state, side, eid, {
        "paid/msg": `spends ${(asyncResult as any)?.msg ?? ""}`,
        "paid/type": "any-virus-counter",
        "paid/value": (asyncResult as any)?.number,
        "paid/targets": (asyncResult as any)?.targets,
      });
    },
  );
});

// ===========================================================================
// Advancement counter (on source card)
// ===========================================================================

valueDispatch.set("advancement", (c) => c.amount);
labelDispatch.set("advancement", (c) =>
  value(c) > 1
    ? quantify(value(c), "hosted advancement counter")
    : "hosted advancement counter",
);
payableDispatch.set("advancement", (c, _state, _side, _eid, card) => {
  return getCounter(card, "advancement") - value(c) >= 0;
});
handlerDispatch.set("advancement", (c, state, side, eid, card) => {
  waitFor(
    state,
    eid,
    (innerEid) =>
      addProp(state, side, innerEid, card, "advance-counter", -value(c), {
        placed: true,
        "suppress-checkpoint": true,
      }),
    () => {
      completeWithResult(state, side, eid, {
        "paid/msg": `spends ${quantify(value(c), "hosted advancement counter")} from on ${card?.title}`,
        "paid/type": "advancement",
        "paid/value": value(c),
      });
    },
  );
});

// ===========================================================================
// Agenda counter
// ===========================================================================

valueDispatch.set("agenda", (c) => c.amount);
labelDispatch.set("agenda", (c) =>
  value(c) > 1
    ? quantify(value(c), "hosted agenda counter")
    : "hosted agenda counter",
);
payableDispatch.set("agenda", (c, _state, _side, _eid, card) => {
  return getCounter(card, "agenda") - value(c) >= 0;
});
handlerDispatch.set("agenda", (c, state, side, eid, card) => {
  waitFor(
    state,
    eid,
    (innerEid) =>
      addCounter(state, side, innerEid, card, "agenda", -value(c), {
        "suppress-checkpoint": true,
      }),
    () => {
      queueEvent(state, ":agenda-counter-spent", { value: value(c) } as any);
      completeWithResult(state, side, eid, {
        "paid/msg": `spends ${quantify(value(c), "hosted agenda counter")} from on ${card?.title}`,
        "paid/type": "agenda",
        "paid/value": value(c),
      });
    },
  );
});

// ===========================================================================
// Power counter
// ===========================================================================

valueDispatch.set("power", (c) => c.amount);
labelDispatch.set("power", (c) =>
  value(c) > 1
    ? quantify(value(c), "hosted power counter")
    : "hosted power counter",
);
payableDispatch.set("power", (c, _state, _side, _eid, card) => {
  return getCounter(card, "power") - value(c) >= 0;
});
handlerDispatch.set("power", (c, state, side, eid, card) => {
  waitFor(
    state,
    eid,
    (innerEid) =>
      addCounter(state, side, innerEid, card, "power", -value(c), {
        "suppress-checkpoint": true,
      }),
    () => {
      completeWithResult(state, side, eid, {
        "paid/msg": `spends ${quantify(value(c), "hosted power counter")} from on ${card?.title}`,
        "paid/type": "power",
        "paid/value": value(c),
      });
    },
  );
});

// ===========================================================================
// X-power counter
// ===========================================================================

valueDispatch.set("x-power", () => 0);
labelDispatch.set("x-power", () => "X hosted power counters");
payableDispatch.set("x-power", (_c, _state, _side, _eid, card) => {
  return getCounter(card, "power") > 0;
});
handlerDispatch.set("x-power", (_c, state, side, eid, card) => {
  continue_ability(
    state,
    side,
    {
      async: true,
      prompt: "How many hosted power counters do you want to spend?",
      choices: {
        number: ((_s: GameState, _sd: string, _e: EID, ca: Card | null) =>
          getCounter(ca, "power")) as any,
      } as any,
      effect: ((
        s: GameState,
        sd: string,
        ei: EID,
        ca: Card | null,
        targets: any[],
      ) => {
        const cost = targets[0] as number;
        waitFor(
          s,
          ei,
          (innerEid) =>
            addCounter(s, sd, innerEid, ca, "power", -cost, {
              "suppress-checkpoint": true,
            }),
          () => {
            completeWithResult(s, sd, ei, {
              "paid/msg": `spends ${quantify(cost, "hosted power counter")} from on ${ca?.title}`,
              "paid/type": "x-power",
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
// Virus counter
// ===========================================================================

valueDispatch.set("virus", (c) => c.amount);
labelDispatch.set("virus", (c) =>
  value(c) > 1
    ? quantify(value(c), "hosted virus counter")
    : "hosted virus counter",
);
payableDispatch.set("virus", (c, state, _side, _eid, card) => {
  const hivemind = allActiveInstalled(state, "runner")
    .filter((x: any) => x.title === "Hivemind")
    .reduce((sum: any, x: any) => sum + getCounter(x, "virus"), 0);
  return getCounter(card, "virus") + hivemind - value(c) >= 0;
});
handlerDispatch.set("virus", (c, state, side, eid, card) => {
  const hivemindTotal = allActiveInstalled(state, "runner")
    .filter((x: any) => x.title === "Hivemind")
    .reduce((sum: any, x: any) => sum + getCounter(x, "virus"), 0);
  if (hivemindTotal > 0) {
    waitFor(
      state,
      eid,
      (innerEid) =>
        resolveAbility(
          state,
          side,
          { ...pickVirusCountersToSpend(card, value(c)), eid: innerEid } as any,
          card,
          [],
        ),
      (asyncResult) => {
        completeWithResult(state, side, eid, {
          "paid/msg": `spends ${(asyncResult as any)?.msg ?? ""}`,
          "paid/type": "virus",
          "paid/value": (asyncResult as any)?.number,
          "paid/targets": (asyncResult as any)?.targets,
        });
      },
    );
  } else {
    const title = card?.title;
    waitFor(
      state,
      eid,
      (innerEid) =>
        addCounter(state, side, innerEid, card, "virus", -value(c), {
          "suppress-checkpoint": true,
        }),
      () => {
        completeWithResult(state, side, eid, {
          "paid/msg": `spends ${quantify(value(c), "hosted virus counter")} from on ${title}`,
          "paid/type": "virus",
          "paid/value": value(c),
        });
      },
    );
  }
});

// ===========================================================================
// Host-bad-pub
// ===========================================================================

valueDispatch.set("host-bad-pub", (c) => c.amount);
labelDispatch.set("host-bad-pub", (c) => `host ${value(c)} bad publicity`);
payableDispatch.set("host-bad-pub", (c, state) => {
  return (state.corp?.badPublicity.base ?? 0) - value(c) >= 0;
});
handlerDispatch.set("host-bad-pub", (c, state, side, eid, card) => {
  waitFor(
    state,
    eid,
    (innerEid) => loseBadPublicity(state, side, innerEid, value(c), null),
    () => {
      waitFor(
        state,
        eid,
        (innerEid) =>
          addCounter(state, side, innerEid, card, "bad-publicity", value(c), {
            "suppress-checkpoint": true,
          }),
        () => {
          completeWithResult(state, side, eid, {
            "paid/msg": `hosts ${value(c)} bad publicity on ${card?.title}`,
            "paid/type": "host-bad-pub",
            "paid/value": value(c),
          });
        },
      );
    },
  );
});

// Suppress unused-variable warnings for items wired into closures only.
void makeEID;
