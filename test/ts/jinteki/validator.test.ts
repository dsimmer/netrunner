// Tests for jinteki/validator.ts
// Mirrors: test/clj/game/cards/ deck-validity tests
import { describe, it, expect } from "vitest";
import {
  cardCount, minAgendaPoints, idInfluenceLimit, influenceCount,
  agendaPoints, validDeck, calculateDeckStatus, legalDeck, singletonDeck,
  type CardData, type DeckLine, type Deck,
} from "../../../src/ts/jinteki/validator";
import { INFINITY } from "../../../src/ts/jinteki/utils";

// ──────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────

function corpID(overrides: Partial<CardData> = {}): CardData {
  return {
    title: "Test Corp", type: "Identity", side: "Corp", faction: "Neutral",
    minimumdecksize: 45, influencelimit: 15, ...overrides,
  };
}

function runnerID(overrides: Partial<CardData> = {}): CardData {
  return {
    title: "Test Runner", type: "Identity", side: "Runner", faction: "Neutral",
    minimumdecksize: 45, influencelimit: 15, ...overrides,
  };
}

function asset(overrides: Partial<CardData> = {}): CardData {
  return { title: "Test Asset", type: "Asset", side: "Corp", faction: "Neutral", ...overrides };
}

function agenda(pts: number, overrides: Partial<CardData> = {}): CardData {
  return { title: "Test Agenda", type: "Agenda", side: "Corp", faction: "Neutral", agendapoints: pts, ...overrides };
}

function program(overrides: Partial<CardData> = {}): CardData {
  return { title: "Test Program", type: "Program", side: "Runner", faction: "Neutral", ...overrides };
}

function lines(card: CardData, qty: number): DeckLine {
  return { qty, card };
}

function nCards(card: CardData, n: number): DeckLine[] {
  return Array.from({ length: n }, (_, i) => ({
    qty: 1,
    card: { ...card, title: card.title + i },
  }));
}

// ──────────────────────────────────────────────────────────────────
// cardCount
// ──────────────────────────────────────────────────────────────────

describe("cardCount", () => {
  it("sums qty across lines", () => {
    expect(cardCount([
      { qty: 3, card: asset() },
      { qty: 2, card: asset({ title: "Other" }) },
    ])).toBe(5);
  });
  it("handles empty array", () => {
    expect(cardCount([])).toBe(0);
  });
});

// ──────────────────────────────────────────────────────────────────
// minAgendaPoints
// ──────────────────────────────────────────────────────────────────

describe("minAgendaPoints", () => {
  function deckOfSize(n: number): Deck {
    return { identity: corpID(), cards: nCards(asset(), n) };
  }
  it("45 cards → 20", () => expect(minAgendaPoints(deckOfSize(45))).toBe(20));
  it("49 cards → 20", () => expect(minAgendaPoints(deckOfSize(49))).toBe(20));
  it("50 cards → 22", () => expect(minAgendaPoints(deckOfSize(50))).toBe(22));
  it("54 cards → 22", () => expect(minAgendaPoints(deckOfSize(54))).toBe(22));
  it("55 cards → 24", () => expect(minAgendaPoints(deckOfSize(55))).toBe(24));
});

// ──────────────────────────────────────────────────────────────────
// idInfluenceLimit
// ──────────────────────────────────────────────────────────────────

describe("idInfluenceLimit", () => {
  it("returns numeric limit", () => {
    expect(idInfluenceLimit({ influencelimit: 17 })).toBe(17);
  });
  it("returns INFINITY for ∞", () => {
    expect(idInfluenceLimit({ influencelimit: "∞" })).toBe(INFINITY);
  });
  it("returns INFINITY for undefined", () => {
    expect(idInfluenceLimit({})).toBe(INFINITY);
  });
});

// ──────────────────────────────────────────────────────────────────
// influenceCount
// ──────────────────────────────────────────────────────────────────

describe("influenceCount", () => {
  it("in-faction cards cost 0 influence", () => {
    const deck: Deck = {
      identity: corpID({ faction: "NBN" }),
      cards: [{ qty: 3, card: asset({ faction: "NBN", factioncost: 2 }) }],
    };
    expect(influenceCount(deck)).toBe(0);
  });

  it("out-of-faction cards cost influence", () => {
    const deck: Deck = {
      identity: corpID({ faction: "NBN" }),
      cards: [{ qty: 2, card: asset({ faction: "Jinteki", factioncost: 3 }) }],
    };
    expect(influenceCount(deck)).toBe(6);
  });

  it("neutral cards cost 0 influence", () => {
    const deck: Deck = {
      identity: corpID({ faction: "NBN" }),
      cards: [{ qty: 3, card: asset({ faction: "Neutral", factioncost: 0 }) }],
    };
    expect(influenceCount(deck)).toBe(0);
  });
});

// ──────────────────────────────────────────────────────────────────
// agendaPoints
// ──────────────────────────────────────────────────────────────────

describe("agendaPoints", () => {
  it("counts agenda points correctly", () => {
    const deck: Deck = {
      identity: corpID(),
      cards: [
        { qty: 3, card: agenda(2) },
        { qty: 2, card: agenda(3, { title: "Big Agenda" }) },
        { qty: 1, card: asset() },
      ],
    };
    expect(agendaPoints(deck)).toBe(12);
  });
});

// ──────────────────────────────────────────────────────────────────
// validDeck
// ──────────────────────────────────────────────────────────────────

describe("validDeck", () => {
  it("rejects deck with no identity", () => {
    const deck: Deck = { identity: undefined, cards: [] };
    expect(validDeck(deck).legal).toBe(false);
  });

  it("rejects deck below minimum size", () => {
    const deck: Deck = { identity: corpID(), cards: [{ qty: 1, card: asset() }] };
    expect(validDeck(deck).legal).toBe(false);
  });

  it("accepts valid 45-card corp deck", () => {
    const id = corpID({ faction: "NBN" });
    // 7×3-pt agendas (21pts, within 20-21 range) + 38 assets
    const cards: DeckLine[] = [
      ...Array.from({ length: 7 }, (_, i) => ({
        qty: 1,
        card: agenda(3, { title: `Agenda${i}`, faction: "NBN" }),
      })),
      ...Array.from({ length: 38 }, (_, i) => ({
        qty: 1,
        card: asset({ title: `Asset${i}`, faction: "NBN" }),
      })),
    ];
    const deck: Deck = { identity: id, cards };
    const result = validDeck(deck);
    expect(result.legal).toBe(true);
  });

  it("rejects deck over influence", () => {
    const id = corpID({ faction: "NBN", influencelimit: 1 });
    const outOfFaction = asset({ faction: "Weyland Consortium", factioncost: 2 });
    const cards: DeckLine[] = [
      { qty: 3, card: outOfFaction },
      ...Array.from({ length: 35 }, (_, i) => ({
        qty: 1,
        card: asset({ title: `Asset${i}`, faction: "NBN" }),
      })),
      ...Array.from({ length: 7 }, (_, i) => ({
        qty: 1,
        card: agenda(3, { title: `Agenda${i}`, faction: "NBN" }),
      })),
    ];
    const deck: Deck = { identity: id, cards };
    expect(validDeck(deck).legal).toBe(false);
  });

  it("rejects wrong-side cards", () => {
    const id = corpID({ faction: "NBN" });
    // put runner-only program in corp deck
    const cards: DeckLine[] = [
      ...Array.from({ length: 44 }, (_, i) => ({
        qty: 1,
        card: asset({ title: `Asset${i}`, faction: "NBN" }),
      })),
      { qty: 1, card: program({ side: "Runner", faction: "Neutral" }) },
    ];
    const deck: Deck = { identity: id, cards };
    expect(validDeck(deck).legal).toBe(false);
  });

  it("runner deck skips agenda point check", () => {
    const id = runnerID({ faction: "Criminal" });
    const cards: DeckLine[] = Array.from({ length: 45 }, (_, i) => ({
      qty: 1,
      card: program({ title: `Program${i}`, faction: "Criminal", side: "Runner" }),
    }));
    const deck: Deck = { identity: id, cards };
    const result = validDeck(deck);
    expect(result.legal).toBe(true);
  });

  it("rejects too many copies of a card", () => {
    const id = corpID({ faction: "NBN" });
    const cards: DeckLine[] = [
      { qty: 5, card: asset({ "deck-limit": 3, faction: "NBN" }) },
      ...Array.from({ length: 33 }, (_, i) => ({
        qty: 1,
        card: asset({ title: `Other${i}`, faction: "NBN" }),
      })),
      ...Array.from({ length: 7 }, (_, i) => ({
        qty: 1,
        card: agenda(3, { title: `Agenda${i}`, faction: "NBN" }),
      })),
    ];
    const deck: Deck = { identity: id, cards };
    expect(validDeck(deck).legal).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────
// singletonDeck
// ──────────────────────────────────────────────────────────────────

describe("singletonDeck", () => {
  it("returns true when all cards have qty=1", () => {
    const deck: Deck = {
      identity: runnerID(),
      cards: [
        { qty: 1, card: program() },
        { qty: 1, card: program({ title: "Other" }) },
      ],
    };
    expect(singletonDeck(deck)).toBe(true);
  });

  it("returns false when any card has qty>1", () => {
    const deck: Deck = {
      identity: runnerID(),
      cards: [
        { qty: 2, card: program() },
      ],
    };
    expect(singletonDeck(deck)).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────
// calculateDeckStatus
// ──────────────────────────────────────────────────────────────────

describe("calculateDeckStatus", () => {
  it("returns status object with all formats", () => {
    const id = corpID({ faction: "NBN" });
    const cards: DeckLine[] = [
      ...Array.from({ length: 7 }, (_, i) => ({
        qty: 1,
        card: agenda(3, { title: `Agenda${i}`, faction: "NBN" }),
      })),
      ...Array.from({ length: 38 }, (_, i) => ({
        qty: 1,
        card: asset({ title: `Asset${i}`, faction: "NBN" }),
      })),
    ];
    const deck: Deck = { identity: id, cards };
    const status = calculateDeckStatus(deck);
    expect(status).toHaveProperty("casual");
    expect(status).toHaveProperty("standard");
    expect(status).toHaveProperty("startup");
    expect(status).toHaveProperty("eternal");
    expect(status.casual.legal).toBe(true);
  });
});
