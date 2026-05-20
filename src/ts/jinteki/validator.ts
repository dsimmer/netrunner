// Deck validation logic.
// Mirrors: src/cljc/jinteki/validator.cljc

import { INFINITY, factionLabel } from "./utils";
import { MWL } from "./cards";
import type { Card } from '../types';


// ──────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────

export interface CardData {
  title?: string;
  type?: string;
  side?: string;
  faction?: string;
  setname?: string;
  subtypes?: string[];
  keywords?: string;
  factioncost?: number;
  agendapoints?: number;
  "deck-limit"?: number;
  minimumdecksize?: number;
  influencelimit?: number | "∞";
  quantity?: number;  // System Gateway box quantity
  format?: Record<string, Record<string, unknown>>;
  [key: string]: unknown;
}

export interface DeckLine {
  qty: number;
  card: CardData;
}

export interface Deck {
  identity?: CardData;
  cards: DeckLine[];
  format?: string;
  status?: DeckStatus;
}

export interface ValidityResult {
  legal: boolean;
  reason?: string;
}

export interface DeckStatus {
  format?: string;
  casual: ValidityResult;
  standard: ValidityResult;
  startup: ValidityResult;
  throwback: ValidityResult;
  "system-gateway": ValidityResult;
  core: ValidityResult;
  eternal: ValidityResult;
}

// ──────────────────────────────────────────────────────────────────
// Card helpers
// ──────────────────────────────────────────────────────────────────

function hasSubtype(card: CardData, subtype: string): boolean {
  if (card.keywords) {
    return card.keywords.toLowerCase().split(" - ").some(k => k.trim().toLowerCase() === subtype.toLowerCase());
  }
  if (Array.isArray(card.subtypes)) {
    return card.subtypes.some(s => s.toLowerCase() === subtype.toLowerCase());
  }
  return false;
}

// ──────────────────────────────────────────────────────────────────
// Card count
// ──────────────────────────────────────────────────────────────────

export function cardCount(cards: DeckLine[]): number {
  return cards.reduce((sum, line) => sum + line.qty, 0);
}

// ──────────────────────────────────────────────────────────────────
// Alliance helpers
// ──────────────────────────────────────────────────────────────────

function defaultAllianceIsFree(cards: DeckLine[], line: DeckLine): boolean {
  const sameFactionNonAlliance = cards.filter(c =>
    c.card.faction === line.card.faction && !hasSubtype(c.card, "Alliance")
  );
  return cardCount(sameFactionNonAlliance) >= 6;
}

function allianceIsFree(cards: DeckLine[], line: DeckLine): boolean {
  const title = line.card.title;
  const defaultAllianceCards = [
    "Heritage Committee", "Product Recall", "Jeeves Model Bioroids",
    "Raman Rai", "Salem's Hospitality", "Executive Search Firm",
    "Consulting Visit", "Ibrahim Salem",
  ];
  if (defaultAllianceCards.includes(title ?? "")) {
    return defaultAllianceIsFree(cards, line);
  }
  if (title === "Mumba Temple") {
    return cardCount(cards.filter(c => c.card.type === "ICE")) <= 15;
  }
  if (title === "Museum of History") {
    return cardCount(cards) >= 50;
  }
  if (title === "PAD Factory") {
    return cardCount(cards.filter(c => c.card.title === "PAD Campaign")) === 3;
  }
  if (title === "Mumbad Virtual Tour") {
    return cardCount(cards.filter(c => c.card.type === "Asset")) >= 7;
  }
  return false;
}

// ──────────────────────────────────────────────────────────────────
// Deck size + agenda points
// ──────────────────────────────────────────────────────────────────

export function minDeckSize(identity: CardData): number {
  return (identity.minimumdecksize as number | undefined) ?? 0;
}

export function minAgendaPoints(deck: Deck): number {
  const size = Math.max(cardCount(deck.cards), minDeckSize(deck.identity ?? {}));
  return 2 + 2 * Math.floor(size / 5);
}

export function draftId(identity: CardData): boolean {
  return identity.setname === "Draft";
}

export function idInfluenceLimit(identity: CardData): number {
  const inf = identity.influencelimit;
  if (inf === null || inf === undefined || inf === "∞") return INFINITY;
  return inf as number;
}

export function singletonId(identity: CardData): boolean {
  return identity.title === "Nova Initiumia: Catalyst & Impetus" ||
    identity.title === "Ampère: Cybernetics For Anyone";
}

function singletonLegal(identity: CardData, line: DeckLine): boolean {
  if (singletonId(identity)) return line.qty === 1;
  return true;
}

function legalNumCopies(identity: CardData, line: DeckLine): boolean {
  return singletonLegal(identity, line) &&
    (draftId(identity) || line.qty <= ((line.card["deck-limit"] as number | undefined) ?? 3));
}

function isProfProg(deck: Deck, card: CardData): boolean {
  return deck.identity?.title === "The Professor: Keeper of Knowledge" && card.type === "Program";
}

// ──────────────────────────────────────────────────────────────────
// Influence
// ──────────────────────────────────────────────────────────────────

function lineBaseCost(identityFaction: string, line: DeckLine): number {
  if (line.card.faction === identityFaction) return 0;
  return line.qty * ((line.card.factioncost as number | undefined) ?? 0);
}

function lineInfluenceCost(deck: Deck, line: DeckLine): number {
  const identityFaction = deck.identity?.faction ?? "";
  const baseCost = lineBaseCost(identityFaction, line);
  if (baseCost === 0) return 0;
  if (isProfProg(deck, line.card)) {
    return baseCost - ((line.card.factioncost as number | undefined) ?? 0);
  }
  if (allianceIsFree(deck.cards, line)) return 0;
  return baseCost;
}

export function influenceMap(deck: Deck): Record<string, number> {
  const map: Record<string, number> = {};
  for (const line of deck.cards) {
    const cost = lineInfluenceCost(deck, line);
    const faction = factionLabel(line.card);
    map[faction] = (map[faction] ?? 0) + cost;
  }
  return map;
}

export function influenceCount(deck: Deck): number {
  return Object.values(influenceMap(deck)).reduce((a, b) => a + b, 0);
}

export function agendaPoints(deck: Deck): number {
  return deck.cards.reduce((acc, line) => {
    const pts = line.card.agendapoints;
    if (pts != null) return acc + pts * line.qty;
    return acc;
  }, 0);
}

// ──────────────────────────────────────────────────────────────────
// Singleton agenda checks
// ──────────────────────────────────────────────────────────────────

function invalidSingletonAgendas(identity: CardData, cards: DeckLine[]): CardData[] | null {
  if (!singletonId(identity)) return null;
  const agendas = cards.map(c => c.card).filter(c => c.type === "Agenda" && c.faction !== "Neutral");
  const factions = [...new Set(agendas.map(c => c.faction))];
  const offending: CardData[] = [];
  for (const faction of factions) {
    const group = agendas.filter(c => c.faction === faction);
    if (group.length > 2) offending.push(...group);
  }
  return offending.length > 0 ? offending : null;
}

// Mirrors: singleton-agenda-valid?
export function singletonAgendaValid(card: CardData, identity: CardData, cards: DeckLine[]): boolean {
  if (!singletonId(identity)) return true;
  const invalid = invalidSingletonAgendas(identity, cards);
  if (!invalid) return true;
  return !invalid.some(c => c.title === card.title);
}

// ──────────────────────────────────────────────────────────────────
// allowed? check
// ──────────────────────────────────────────────────────────────────

function allowed(card: CardData, identity: CardData): boolean {
  return card.type !== "Identity" &&
    card.side === identity.side &&
    (card.type !== "Agenda" ||
      card.faction === "Neutral" ||
      card.faction === identity.faction ||
      draftId(identity) ||
      singletonId(identity)) &&
    !(identity.title === "Custom Biotics: Engineered for Success" && card.faction === "Jinteki");
}

// ──────────────────────────────────────────────────────────────────
// valid-deck?
// ──────────────────────────────────────────────────────────────────

export function validDeck(deck: Deck): ValidityResult {
  const identity = deck.identity;
  const hasIdentity = !!identity;
  const count = cardCount(deck.cards);
  const minSize = minDeckSize(identity ?? {});
  const hasEnoughCards = count >= minSize;
  const infUsed = influenceCount(deck);
  const infLimit = idInfluenceLimit(identity ?? {});
  const withinInfLimit = infUsed <= infLimit;
  const allAllowed = deck.cards.every(line => allowed(line.card, identity ?? {}));
  const allLegalCopies = deck.cards.every(line => legalNumCopies(identity ?? {}, line));
  const minPoints = minAgendaPoints(deck);
  const points = agendaPoints(deck);
  const validPoints = identity?.side === "Runner" ||
    (points >= minPoints && points <= minPoints + 1);
  const invalidAgendas = invalidSingletonAgendas(identity ?? {}, deck.cards);

  const legal = hasIdentity && hasEnoughCards && withinInfLimit && allAllowed &&
    allLegalCopies && validPoints && !invalidAgendas;

  const id = identity as CardData | undefined;
  let reason: string | undefined;
  if (!hasIdentity) reason = `Invalid identity: ${id?.title}`;
  else if (!hasEnoughCards) reason = `Not enough cards in the deck: ${count}, Min: ${minSize}`;
  else if (!withinInfLimit) reason = `Spent too much influence: ${infUsed}`;
  else if (!allAllowed) {
    const bad = deck.cards.find(line => !allowed(line.card, id!));
    reason = `Cards aren't legal for chosen identity: ${bad?.card.title}`;
  } else if (!allLegalCopies) {
    const bad = deck.cards.find(line => !legalNumCopies(id!, line));
    reason = `Too many copies of a card: ${bad?.card.title}`;
  } else if (invalidAgendas) {
    reason = `Too many agendas from the same factions: ${(invalidAgendas as CardData[]).map(c => c.title).join(", ")}`;
  } else if (!validPoints) {
    reason = `Incorrect amount of agenda points: ${points}, Between: ${minPoints} and ${minPoints + 1}`;
  }

  return { legal, reason };
}

// ──────────────────────────────────────────────────────────────────
// Format / MWL legality
// ──────────────────────────────────────────────────────────────────

function combineIdAndCards(deck: Deck): DeckLine[] {
  return [{ qty: 1, card: deck.identity ?? {} }, ...deck.cards];
}

// Mirrors: legal?
export function legal(fmt: string, status: string, card: CardData): boolean;
export function legal(status: string, card: CardData): boolean;
export function legal(fmtOrStatus: string, statusOrCard: string | CardData, card?: CardData): boolean {
  if (card !== undefined) {
    const fmt = fmtOrStatus;
    const status = statusOrCard as string;
    const fmtData = card.format?.[fmt] as Record<string, unknown> | undefined;
    return !!(fmtData && status in fmtData);
  }
  return legal("standard", fmtOrStatus, statusOrCard as CardData);
}

// Mirrors: legal-line?
export function legalLine(fmt: string, status: string, line: DeckLine): boolean;
export function legalLine(status: string, line: DeckLine): boolean;
export function legalLine(fmtOrStatus: string, statusOrLine: string | DeckLine, line?: DeckLine): boolean {
  if (line !== undefined) {
    return legal(fmtOrStatus, statusOrLine as string, line.card);
  }
  return legalLine("standard", fmtOrStatus, statusOrLine as DeckLine);
}

// Mirrors: filter-cards-by-legal-status (3-arity)
export function filterCardsByLegalStatus(fmt: string, status: string, cards: DeckLine[]): DeckLine[];
// Mirrors: filter-cards-by-legal-status (2-arity, takes deck)
export function filterCardsByLegalStatus(deck: Deck, status: string): DeckLine[];
export function filterCardsByLegalStatus(
  fmtOrDeck: string | Deck,
  status: string,
  cards?: DeckLine[],
): DeckLine[] {
  if (typeof fmtOrDeck === "string") {
    return (cards ?? []).filter(line => legalLine(fmtOrDeck, status, line));
  }
  const deck = fmtOrDeck;
  const fmt = deck.format ?? "standard";
  return combineIdAndCards(deck).filter(line => legalLine(fmt, status, line));
}

// Mirrors: format-point-limit
export function formatPointLimit(fmt: string): number | null {
  const entry = (MWL as Record<string, Record<string, unknown>>)[fmt];
  const limit = entry?.["point-limit"];
  return typeof limit === "number" ? limit : null;
}

// Mirrors: deck-point-count (3-arity: fmt + pre-filtered cards)
export function deckPointCount(fmt: string, cards: DeckLine[]): number {
  return cards.reduce((sum, line) => {
    const fmtData = line.card.format?.[fmt] as Record<string, unknown> | undefined;
    return sum + ((fmtData?.points as number) ?? 0);
  }, 0);
}

function mwlLegal(fmt: string, cards: DeckLine[]): ValidityResult {
  const allowedFn = (line: DeckLine): boolean => {
    const fmtData = line.card.format?.[fmt] as Record<string, unknown> | undefined;
    if (!fmtData) return false;
    return "legal" in fmtData || "banned" in fmtData;
  };
  const allAllowed = cards.every(allowedFn);
  const restricted = filterCardsByLegalStatus(fmt, "restricted", cards);
  const banned = filterCardsByLegalStatus(fmt, "banned", cards);
  const pointLimit = formatPointLimit(fmt);
  const pointCards = filterCardsByLegalStatus(fmt, "points", cards);
  const pointTotal = pointLimit !== null ? deckPointCount(fmt, pointCards) : null;
  const underPointLimit = pointTotal !== null ? pointTotal <= pointLimit! : true;

  const legal = allAllowed && restricted.length <= 1 && banned.length === 0 && underPointLimit;

  let reason: string | undefined;
  if (!allAllowed) {
    const bad = cards.find(line => !allowedFn(line));
    reason = `Illegal card: ${bad?.card.title}`;
  } else if (restricted.length > 1) {
    reason = `Too many restricted cards: ${restricted[0]?.card.title}`;
  } else if (banned.length > 0) {
    reason = `Includes a banned card: ${banned[0]?.card.title}`;
  } else if (!underPointLimit) {
    reason = `Exceeds point limit: ${pointTotal}, Limit: ${pointLimit}`;
  }

  return { legal, reason };
}

function rejectSystemGatewayNeutralIds(fmt: string, deck: Deck): ValidityResult | null {
  const id = deck.identity?.title;
  if (fmt !== "system-gateway" &&
    (id === "The Catalyst: Convention Breaker" || id === "The Syndicate: Profit over Principle")) {
    return { legal: false, reason: `Illegal identity: ${id}` };
  }
  return null;
}

function startupAgendaRestriction(fmt: string, deck: Deck): ValidityResult {
  if (fmt !== "startup") return { legal: true };
  const bigAgendas = deck.cards.filter(line =>
    line.card.type === "Agenda" && ((line.card.agendapoints as number | undefined) ?? 0) >= 3
  );
  const ct = bigAgendas.reduce((sum, line) => sum + line.qty, 0);
  if (ct > 3) {
    return { legal: false, reason: "Too many agendas worth 3 or more points (startup restriction)" };
  }
  return { legal: true };
}

function buildFormatLegality(valid: ValidityResult, fmt: string, deck: Deck): ValidityResult {
  const mwl = mwlLegal(fmt, combineIdAndCards(deck));
  const startupCheck = startupAgendaRestriction(fmt, deck);
  return rejectSystemGatewayNeutralIds(fmt, deck) ?? {
    legal: valid.legal && mwl.legal && startupCheck.legal,
    reason: valid.reason ?? mwl.reason ?? startupCheck.reason,
  };
}

function cardsOverOneSG(cards: DeckLine[]): DeckLine[] {
  return cards.filter(line => line.qty > ((line.card.quantity as number | undefined) ?? 3));
}

function buildSystemGatewayLegality(valid: ValidityResult, deck: Deck): ValidityResult {
  const mwl = mwlLegal("system-gateway", combineIdAndCards(deck));
  const overLimit = cardsOverOneSG(deck.cards)[0];
  return {
    legal: !overLimit && valid.legal && mwl.legal,
    reason: overLimit
      ? `Only one copy of System Gateway permitted - check: ${overLimit.card.title}`
      : (valid.reason ?? mwl.reason),
  };
}

// ──────────────────────────────────────────────────────────────────
// Main exports
// ──────────────────────────────────────────────────────────────────

export function calculateDeckStatus(deck: Deck): DeckStatus {
  const valid = validDeck(deck);
  return {
    format: deck.format,
    casual: valid,
    standard: buildFormatLegality(valid, "standard", deck),
    startup: buildFormatLegality(valid, "startup", deck),
    throwback: buildFormatLegality(valid, "throwback", deck),
    "system-gateway": buildSystemGatewayLegality(valid, deck),
    core: buildFormatLegality(valid, "core", deck),
    eternal: buildFormatLegality(valid, "eternal", deck),
  };
}

export function trustedDeckStatus(deck: Deck): DeckStatus {
  return deck.status ?? calculateDeckStatus(deck);
}

export function singletonDeckStatus(deck: Deck): { singleton: boolean } {
  const dups = deck.cards.filter(line => line.qty !== 1);
  return { singleton: dups.length === 0 };
}

export function singletonDeck(deck: Deck): boolean {
  return deck.status
    ? !!(deck.status as unknown as Record<string, unknown>)["singleton"]
    : singletonDeckStatus(deck).singleton;
}

export function legalDeck(deck: Deck, fmt?: string): boolean {
  const f = fmt ?? deck.format ?? "standard";
  if (deck.status) {
    const s = deck.status[f as keyof DeckStatus] as ValidityResult | undefined;
    if (s) return s.legal;
  }
  return trustedDeckStatus({ ...deck, format: f })[f as keyof DeckStatus]
    ? (trustedDeckStatus({ ...deck, format: f })[f as keyof DeckStatus] as ValidityResult).legal
    : false;
}
