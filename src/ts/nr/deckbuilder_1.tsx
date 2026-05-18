// Deck builder: create, edit, delete, and manage decks.
// Mirrors: src/cljs/nr/deckbuilder.cljs
import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useAppState } from "./appstate";
import { GET, POST, PUT, DELETE } from "./ajax";
import { authenticated } from "./auth";
import { AllCards } from "../jinteki/cards";
import { INFINITY, strToInt, factionLabel } from "../jinteki/utils";
import * as validator from "../jinteki/validator";
import { DeckStatusSpan } from "./deck_status";
import {
  tr, trSpan, trElement, trFaction, trFormat, trSide, trType, trData,
} from "./translations";
import {
  allianceDots, bannedSpan, condButton, buildableFormatToSlug,
  formatDateTime, dotsHtml, influenceDot, influenceDots,
  nonGameToast, restrictedSpan, rotatedSpan, setScrollTop,
  slugToBuildableFormat, storeScrollTop, renderMessage, safeDivide,
  deckPointsCardSpan, mdyFormatter,
} from "./utils";
import { onWSEvent } from "./ws";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CardData {
  title?: string;
  type?: string;
  side?: string;
  faction?: string;
  setname?: string;
  code?: string;
  normalizedtitle?: string;
  factioncost?: number;
  cost?: number;
  memoryunits?: number;
  agendapoints?: number;
  "deck-limit"?: number;
  minimumdecksize?: number;
  influencelimit?: number | "∞";
  images?: Record<string, unknown>;
  localized?: Record<string, unknown>;
  id?: string;
  art?: string;
  rotated?: boolean;
  format?: Record<string, Record<string, unknown>>;
  displayName?: string;
  [key: string]: unknown;
}

export interface DeckLine {
  qty: number;
  card: CardData | string;
  id?: string;
  art?: string;
}

export interface ParsedDeckLine {
  qty: number;
  card: CardData;
}

interface DeckIdentity {
  title?: string;
  side?: string;
  code?: string;
  setname?: string;
  faction?: string;
  displayName?: string;
  [key: string]: unknown;
}

export interface Deck {
  _id?: string | number;
  name?: string;
  identity: DeckIdentity | CardData | null;
  cards: DeckLine[];
  format?: string;
  notes?: string;
  date?: string;
  new?: boolean;
  stats?: unknown;
  locked?: boolean;
  parsed?: boolean;
  side?: string;
}

interface DeckMeta {
  identity?: string;
  "identity-code"?: string;
  title?: string;
  notes?: string;
}

interface DeckStringResult {
  cards: { qty: number; card: string; id?: string; art?: string }[];
  meta: DeckMeta;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const ALL_SIDES_FILTER = "Any Side";
export const ALL_FACTIONS_FILTER = "Any Faction";
export const ALL_FORMATS_FILTER = "Any Format";

// ---------------------------------------------------------------------------
// Image URL helper (mirrors nr.cardbrowser/image-url)
// ---------------------------------------------------------------------------

function getImagePath(
  images: Record<string, unknown> | undefined,
  lang: string,
  res: string,
  art: string,
  depth = 0,
): string[] | null {
  if (depth >= 4) return null;
  const langBlock = images?.[lang] as Record<string, unknown> | undefined;
  const resBlock = langBlock?.[res] as Record<string, unknown> | undefined;
  const artUrls = resBlock?.[art] as string[] | string | undefined;
  if (artUrls) {
    return Array.isArray(artUrls) ? artUrls : [artUrls];
  }
  return (
    (res !== "default" ? getImagePath(images, lang, "default", art, depth + 1) : null) ??
    (lang !== "en" ? getImagePath(images, "en", res, art, depth + 1) : null) ??
    (art !== "stock" ? getImagePath(images, lang, res, "stock", depth + 1) : null) ??
    (depth === 0 ? ["img/missing.png"] : null)
  );
}

function imageOrFace(card: CardData): Record<string, unknown> | undefined {
  if (card.images) return card.images;
  if (card.face) {
    const faceKey = String(card.face);
    const faces = card.faces as Record<string, unknown> | undefined;
    if (faces) return (faces[faceKey] as Record<string, unknown>)?.images as Record<string, unknown> | undefined;
  }
  const front = (card.faces as Record<string, unknown>)?.front as Record<string, unknown> | undefined;
  return front?.images as Record<string, unknown> | undefined;
}

export function imageUrl(card: CardData): string | undefined {
  const options = useAppState.getState().options;
  const lang = (options.cardLanguage as string) ?? "en";
  const res = (options.cardResolution as string) ?? "default";
  const altArt = (options.altArts as Record<string, unknown>)?.[card.code ?? ""] as string | undefined;
  const art = altArt ?? "stock";
  const images = imageOrFace(card);
  const artUrls = getImagePath(images, lang, res, art);
  if (artUrls && artUrls.length > 0) return artUrls[0];
  return undefined;
}

// ---------------------------------------------------------------------------
// Faction helper (mirrors nr.cardbrowser/factions)
// ---------------------------------------------------------------------------

export function factions(side: string): string[] {
  const runnerFactions = ["Anarch", "Criminal", "Shaper", "Adam", "Apex", "Sunny Lebeau"];
  const corpFactions = ["Jinteki", "Haas-Bioroid", "NBN", "Weyland Consortium", "Neutral"];
  if (side === "All" || side === "Any Side" || !side) {
    return [...runnerFactions, ...corpFactions];
  }
  if (side === "Runner") {
    return [...runnerFactions, "Neutral"];
  }
  if (side === "Corp") {
    return corpFactions;
  }
  return [...runnerFactions, ...corpFactions];
}

// ---------------------------------------------------------------------------
// Filter / lookup helpers
// ---------------------------------------------------------------------------

function filterTitle(query: string, cards: CardData[]): CardData[] {
  if (!query) return cards;
  const lcQuery = query.toLowerCase();
  return cards.filter(c => {
    const title = (c.title ?? "").toLowerCase();
    const trTitle = (trData("title", c as Record<string, unknown>) as string | undefined) ?? "";
    const normalized = (c.normalizedtitle ?? "").toLowerCase();
    return title.includes(lcQuery) || trTitle.toLowerCase().includes(lcQuery) || normalized.includes(lcQuery);
  });
}

function filterExactTitle(query: string, cards: CardData[]): CardData[] {
  return cards.filter(c => {
    const title = (c.title ?? "").toLowerCase();
    const normalized = c.normalizedtitle ?? "";
    return title === query || normalized === query;
  });
}

function identicalCards(cards: CardData[]): boolean {
  const name = cards[0]?.title;
  return cards.every(c => c.title === name);
}

function takeBestCard(cards: CardData[]): CardData {
  const nonRotated = cards.filter(c => !c.rotated);
  return nonRotated.length > 0 ? nonRotated[0] : cards[0];
}

// ---------------------------------------------------------------------------
// Card lookup (mirrors nr.deckbuilder/lookup)
// ---------------------------------------------------------------------------

export function lookup(side: string, card: { title?: string; code?: string }): CardData | null {
  const id = card.code;
  const allCards = AllCards;
  const sideCards = Object.values(allCards)
    .filter((c: CardData) => c.side === side) as CardData[];

  if (id) {
    const firstId = sideCards.find(c => id === c.code);
    if (firstId) return firstId;
  }

  const q = (card.title ?? "").toLowerCase();
  const exactMatches = filterExactTitle(q, sideCards);
  if (exactMatches.length > 0) {
    return takeBestCard(exactMatches);
  }

  let matches: CardData[] = sideCards;
  for (let i = 2; i <= q.length; i++) {
    const subquery = q.substring(0, i);
    matches = filterTitle(subquery, sideCards);
    if (matches.length === 0) return { title: card.title ?? "", code: card.code ?? "" } as CardData;
    if (matches.length === 1 || identicalCards(matches)) {
      return takeBestCard(matches);
    }
  }
  return { title: card.title ?? "", code: card.code ?? "" } as CardData;
}

// ---------------------------------------------------------------------------
// Parse helpers (mirrors nr.deckbuilder parse functions)
// ---------------------------------------------------------------------------

function formatStatus(format: string, card: CardData): Record<string, unknown> {
  const fmtData = card.format?.[format] as Record<string, unknown> | undefined;
  return fmtData ?? { legal: true };
}

function buildIdentityName(title: string, setname?: string): string {
  return setname ? `${title} (${setname})` : title;
}

function parseIdentity({ side, title, setname }: { side?: string; title?: string; setname?: string }): CardData {
  if (!title) return { title: "Missing Identity", displayName: "Missing Identity" };
  const card = lookup(side ?? "", { title });
  const displayTitle = trData("title", (card ?? {}) as Record<string, unknown>) as string;
  return {
    ...(card ?? {}),
    displayName: buildIdentityName(displayTitle, setname),
  };
}

function addParamsToCard(card: CardData, id?: string, art?: string): CardData {
  const result = { ...card };
  if (id) result.id = id;
  if (art) result.art = art;
  return result;
}

function cleanParam(param: string[]): [string, string] | null {
  if (param && param.length === 2) {
    const [k, v] = param.map(s => s.trim());
    if (["id", "art"].includes(k)) {
      return [k, v];
    }
  }
  return null;
}

function paramReducer(acc: Record<string, unknown>, param: [string, string] | null): Record<string, unknown> {
  if (param) {
    return { ...acc, [param[0]]: param[1] };
  }
  return acc;
}

function addParams(result: Record<string, unknown>, paramsStr?: string): Record<string, unknown> {
  if (!paramsStr) return result;
  const paramGroups = paramsStr.split(",");
  const paramsAll = paramGroups.map(g => g.split(":"));
  const paramsClean = paramsAll.map(g => cleanParam(g)).filter(Boolean) as [string, string][];
  return paramsClean.reduce((acc, p) => paramReducer(acc, p), result);
}

function parseLine(line: string): { qty: number; card: string; id?: string; art?: string } | null {
  const clean = line.trim();
  // Pattern: "qty card-name" or "qty card-name[params]"
  const match = clean.match(/^(\d+)\s+([^\[]+?)(?:\s*\[(.+?)\])?$/);
  if (!match) return null;
  const qtyStr = match[1];
  const cardName = match[2].trim();
  const cardParams = match[3];
  if (isNaN(strToInt(qtyStr))) return null;
  const result: Record<string, unknown> = { qty: strToInt(qtyStr), card: cardName };
  return addParams(result, cardParams) as { qty: number; card: string; id?: string; art?: string };
}

function parseMetaLine(line: string): [string, string] | null {
  const trimmed = line.trim();
  const match = trimmed.match(/^;;\s*(identity|identity-code|title|notes)\s*:\s*(.+)$/);
  if (match) {
    return [match[1].trim(), match[2].trim()];
  }
  return null;
}

function lineReducer(acc: DeckStringResult, line: string): DeckStringResult {
  const card = parseLine(line);
  if (card) {
    return { ...acc, cards: [...acc.cards, card] };
  }
  const meta = parseMetaLine(line);
  if (meta) {
    return { ...acc, meta: { ...acc.meta, [meta[0]]: meta[1] } };
  }
  return acc;
}

function deckStringToList(deckString: string): DeckStringResult {
  const lines = deckString.split("\n");
  return lines.reduce(lineReducer, { cards: [], meta: {} });
}

function collateDeck(cardList: { qty: number; card: string }[]): { qty: number; card: string }[] {
  const map: Record<string, { qty: number; card: string }> = {};
  for (const line of cardList) {
    const title = line.card;
    const currQty = map[title]?.qty ?? 0;
    map[title] = { qty: line.qty + currQty, card: title };
  }
  return Object.values(map);
}

function lookupDeck(side: string, cardList: { qty: number; card: string }[]): ParsedDeckLine[] {
  const collated = collateDeck(cardList);
  return collated
    .map(item => ({
      qty: item.qty,
      card: lookup(side, { title: item.card }) ?? {},
    }))
    .filter(item => item.card.type !== "Identity");
}

export function processCardsInDeck(deck: Deck): Deck {
  if (deck.parsed) return deck;
  const side = deck.identity?.side ?? (deck.side ?? "");
  const cards = lookupDeck(side, deck.cards as { qty: number; card: string }[]);
  return { ...deck, cards, parsed: true };
}

// ---------------------------------------------------------------------------
// Lookup identity helpers
// ---------------------------------------------------------------------------

export function lookupIdentityByCode(side: string, code: string): CardData | null {
  const allCards = AllCards;
  return (Object.values(allCards) as CardData[]).find(c =>
    c.code === code && c.type === "Identity" && c.side === side
  ) ?? null;
}

export function lookupIdentityByTitle(side: string, title: string): CardData | null {
  const idents = (Object.values(AllCards) as CardData[]).filter(c =>
    c.side === side && c.type === "Identity"
  );
  const q = title.toLowerCase();
  const exact = filterExactTitle(q, idents);
  if (exact.length > 0) return takeBestCard(exact);

  let matches: CardData[] = idents;
  for (let i = 2; i <= title.length; i++) {
    const subquery = q.substring(0, Math.min(i, q.length));
    matches = filterTitle(subquery, idents);
    if (matches.length === 0) return null;
    if (matches.length === 1 || identicalCards(matches)) {
      return takeBestCard(matches);
    }
  }
  return null;
}

export function parseDeckString(side: string, deckString: string): {
  cards: ParsedDeckLine[];
  identity: CardData | null;
  title: string | null;
  notes: string | null;
} {
  const { cards, meta } = deckStringToList(deckString);
  const parsedCards = lookupDeck(side, cards);
  const foundIdentity = (meta["identity-code"] ? lookupIdentityByCode(side, meta["identity-code"]) : null)
    ?? (meta.identity ? lookupIdentityByTitle(side, meta.identity) : null);
  return {
    cards: parsedCards,
    identity: foundIdentity,
    title: meta.title ?? null,
    notes: meta.notes ?? null,
  };
}

// ---------------------------------------------------------------------------
// Deck string conversion helpers
// ---------------------------------------------------------------------------

function insertParams(card: { id?: string; art?: string }): string {
  const id = card.id;
  const art = card.art;
  if (id || art) {
    let s = " [";
    if (id) s += `id: ${id}`;
    if (art && id) s += ", ";
    if (art) s += `art: ${art}`;
    s += "]";
    return s;
  }
  return "";
}

export function deckToStr(deck: Deck): string {
  return (deck.cards ?? [])
    .map(line => {
      const card = line.card as CardData;
      return `${line.qty} ${card.title ?? ""}${insertParams(line as unknown as { id?: string; art?: string })}`;
    })
    .join("\n");
}

// ---------------------------------------------------------------------------
// Side identities helper
// ---------------------------------------------------------------------------

function legalInFormat(card: CardData, format: string): boolean {
  if (format === "casual") return true;
  const fmtData = card.format?.[format] as Record<string, unknown> | undefined;
  return !!(fmtData && "legal" in fmtData);
}

export function sideIdentities(side: string, format: string): CardData[] {
  const allCards = AllCards;
  const cards = (Object.values(allCards) as CardData[]).filter(c =>
    c.side === side && c.type === "Identity" && legalInFormat(c, format)
  );
  const allTitles = cards.map(c => c.title ?? "");
  return cards.map(c => addDeckName(allTitles, c));
}

function addDeckName(allTitles: string[], card: CardData): CardData {
  const cardTitle = card.title ?? "";
  const indexes = allTitles.reduce<number[]>((acc, t, i) => t === cardTitle ? [...acc, i] : acc, []);
  const dups = indexes.length > 1;
  const displayTitle = trData("title", card as Record<string, unknown>) as string;
  const setname = card.setname as string | undefined;
  return {
    ...card,
    displayName: dups ? `${displayTitle} (${setname})` : displayTitle,
  };
}

// ---------------------------------------------------------------------------
// Deck name copy helper
// ---------------------------------------------------------------------------

export function nameCopy(deck: Deck): string {
  const deckName = deck.name ?? "New Deck";
  const suffix = tr(["deck-builder_deck-copy-suffix", "copy"]);
  const pattern = new RegExp(`(.*)\\-${suffix}(\\d*)$`);
  const match = deckName.match(pattern);
  if (match) {
    const basename = match[1];
    const num = match[2];
    const nextNum = !num ? 1 : strToInt(num) + 1;
    return `${basename}-${suffix}${nextNum}`;
  }
  return `${deckName}-${suffix}`;
}

// ---------------------------------------------------------------------------
// Deck entry helpers
// ---------------------------------------------------------------------------

export function deckName(deck: Deck, limit = 40): string {
  const name = deck.name ?? "";
  if (!name) return "";
  const trimmed = name.trim();
  const result = trimmed.substring(0, limit);
  if (limit < trimmed.length) return `${result}...`;
  return result;
}

export function deckDate(deck: Deck): string {
  const date = deck.date;
  if (date) return formatDateTime(mdyFormatter, date);
  return "";
}

export function noInfCost(identity: CardData, card: CardData): boolean {
  return (
    card.faction === identity.faction ||
    card.factioncost === 0 ||
    validator.idInfluenceLimit(identity) === INFINITY
  );
}

// ---------------------------------------------------------------------------
// Card influence HTML
// ---------------------------------------------------------------------------

export function cardInfluenceHtml(
  format: string,
  card: CardData,
  qty: number,
  inFaction: boolean,
  allied: boolean,
): React.ReactElement {
  const influence = (card.factioncost ?? 0) * qty;
  const cardStatus = formatStatus(format, card);
  const banned = !!cardStatus.banned;
  const restricted = !!cardStatus.restricted;
  const rotated = !!cardStatus.rotated;
  const points = cardStatus.points as number | undefined;

  return (
    <span>
      {" "}
      {(!banned && !inFaction) && (
        <span key="influence" className={`influence ${factionLabel(card as { faction?: string })}`}>
          {allied
            ? allianceDots(influence)
            : influenceDots(influence)}
        </span>
      )}
      {banned
        ? bannedSpan()
        : (
          <span key="restricted">
            {restricted && restrictedSpan()}
            {rotated && rotatedSpan()}
            {points != null && deckPointsCardSpan(points)}
          </span>
        )}
    </span>
  );
}

export function deckInfluenceHtml(deck: Deck): React.ReactElement[] {
  return dotsHtml(influenceDot, validator.influenceMap(deck as validator.Deck));
}

// ---------------------------------------------------------------------------
// Card cost HTML
// ---------------------------------------------------------------------------

export function cardCostHtml(
  showCreditCost: boolean,
  showMuCost: boolean,
  isEdit: boolean,
  card: CardData,
): React.ReactElement | null {
  if (!showCreditCost && !showMuCost) return null;
  return (
    <div className="card-cost-wrapper">
      <span className={`card-cost${isEdit ? " edit" : ""}`}>
        {showMuCost && card.memoryunits != null && (
          <div className="cost-item">{renderMessage(`${card.memoryunits}[mu] `) as React.ReactNode}</div>
        )}
        {showCreditCost && card.cost != null && (
          <div className="cost-item">{renderMessage(`${card.cost}[credit]`) as React.ReactNode}</div>
        )}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Deck points
// ---------------------------------------------------------------------------

function buildDeckPointsTooltip(deck: Deck): React.ReactElement {
  const fmt = deck.format ?? "standard";
  const pointedCards = validator.filterCardsByLegalStatus(deck as validator.Deck, "points")
    .map(line => ({
      title: ((line.card as CardData).title ?? ""),
      points: ((line.card as CardData).format?.[fmt] as Record<string, unknown>)?.points as number | undefined,
    }));

  return (
    <div className="status-tooltip blue-shade">
      {pointedCards.sort((a, b) => a.title.localeCompare(b.title)).map((c) => (
        <div key={c.title}>
          <span className="tick fake-link">{c.title}: {c.points} </span>
          {deckPointsCardSpan()}
        </div>
      ))}
    </div>
  );
}

export function deckPointsSpan(deck: Deck): React.ReactElement {
  const deckPoints = validator.deckPointCount(deck.format ?? "standard",
    validator.filterCardsByLegalStatus(deck.format ?? "standard", "points", deck.cards as validator.DeckLine[])
  );
  const pointLimit = validator.formatPointLimit(deck.format ?? "standard");

  return (
    <span className="deck-status shift-tooltip">
      <span>{trSpan(["deck-builder_deck-points", "Deck points"])}: </span>
      <span className={deckPoints > (pointLimit ?? Infinity) ? "invalid" : "legal"}>
        {deckPoints}
      </span>
      <span>/{pointLimit ?? "?"}</span>
      {buildDeckPointsTooltip(deck)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Deck list helpers
// ---------------------------------------------------------------------------

export function filterSide(side: string, decks: Deck[]): Deck[] {
  return decks.filter(d => d.side === side);
}

export function filterFormat(format: string, decks: Deck[]): Deck[] {
  return decks.filter(d => (buildableFormatToSlug as Record<string, string>)[d.format ?? ""] === format);
}

export function filterLocked(locked: boolean, decks: Deck[]): Deck[] {
  return decks.filter(d => d.locked === locked);
}

// ---------------------------------------------------------------------------
// Card filter helpers
// ---------------------------------------------------------------------------

function filterSideCards(side: string, cards: CardData[]): CardData[] {
  if (!side || side === ALL_SIDES_FILTER) return cards;
  return cards.filter(c => c.side === side);
}

function filterType(type: string, cards: CardData[]): CardData[] {
  if (!type || type === "Any Type") return cards;
  return cards.filter(c => c.type === type);
}

function filterFaction(faction: string, cards: CardData[]): CardData[] {
  if (!faction || faction === ALL_FACTIONS_FILTER) return cards;
  return cards.filter(c => c.faction === faction);
}

function filterFormatCards(format: string, cards: CardData[]): CardData[] {
  if (!format || format === ALL_FORMATS_FILTER) return cards;
  const slug = (buildableFormatToSlug as Record<string, string>)[format];
  if (!slug) return cards;
  return cards.filter(c => {
    const fmtData = c.format?.[slug] as Record<string, unknown> | undefined;
    return !!(fmtData && "legal" in fmtData);
  });
}

function sortCards(cards: CardData[], sortField: string): CardData[] {
  const sortKey = sortField === "Name" ? "title" :
    sortField === "Influence" ? "factioncost" :
      sortField === "Cost" ? "cost" :
        sortField === "Faction" ? "faction" :
          sortField === "Type" ? "type" :
            sortField === "Set number" ? "code" : "title";

  return [...cards].sort((a: CardData, b: CardData) => {
    const aVal = a[sortKey as keyof CardData] ?? "";
    const bVal = b[sortKey as keyof CardData] ?? "";
    if (typeof aVal === "number" && typeof bVal === "number") return aVal - bVal;
    return String(aVal).localeCompare(String(bVal));
  });
}

export function filterCards(
  titleQuery: string,
  side: string,
  faction: string,
  type: string,
  format: string,
  sortField: string,
  cards: CardData[],
  identity: CardData,
): CardData[] {
  let filtered = cards;
  filtered = filterSideCards(side, filtered);
  filtered = filterType(type, filtered);
  filtered = filterFaction(faction, filtered);
  filtered = filterFormatCards(format, filtered);
  filtered = filterTitle(titleQuery, filtered);
  filtered = filtered.filter(c => c.type !== "Identity" && !c.rotated);

  // For singleton decks (Nova Initiumia, Ampere), only show cards with qty=1
  if (identity.title === "Nova Initiumia: Catalyst & Impetus" ||
      identity.title === "Ampere: Cybernetics For Anyone") {
    filtered = filtered.filter(c => (c["deck-limit"] ?? 3) >= 1);
  }

  return sortCards(filtered, sortField);
}

// ---------------------------------------------------------------------------
// Deck validation helpers
// ---------------------------------------------------------------------------

export function cardCount(cards: DeckLine[]): number {
  return cards.reduce((sum, line) => sum + line.qty, 0);
}

function agendaPoints(deck: Deck): number {
  return deck.cards.reduce((acc, line) => {
    const card = line.card as CardData;
    const pts = card.agendapoints;
    if (pts != null) return acc + pts * line.qty;
    return acc;
  }, 0);
}

function minAgendaPoints(deck: Deck): number {
  const size = Math.max(cardCount(deck.cards), validator.minDeckSize(deck.identity ?? {}));
  return 2 + 2 * Math.floor(size / 5);
}

export function influenceCount(deck: Deck): number {
  const infMap = validator.influenceMap(deck as validator.Deck);
  return Object.values(infMap).reduce((a, b) => a + b, 0);
}

export function idInfluenceLimit(identity: CardData): number {
  const inf = identity.influencelimit;
  if (inf === null || inf === undefined || inf === "∞") return INFINITY;
  return typeof inf === "number" ? inf : INFINITY;
}

// ---------------------------------------------------------------------------
// Deck status display helpers
// ---------------------------------------------------------------------------

export function deckStatusText(deck: Deck): React.ReactElement {
  const totalCards = cardCount(deck.cards);
  const minSize = validator.minDeckSize(deck.identity ?? {});
  const infCount = influenceCount(deck);
  const infLimit = idInfluenceLimit(deck.identity ?? {});

  const cardCountStr = totalCards < minSize ?
    `${totalCards}/${minSize}` :
    `${totalCards}`;
  const infCountStr = infCount > infLimit ?
    `${infCount}/${infLimit}` :
    `${infCount}/${infLimit === INFINITY ? "∞" : infLimit}`;

  const cardsOk = totalCards >= minSize;
  const infOk = infCount <= infLimit;

  return (
    <>
      <span className={cardsOk ? "legal" : "invalid"}>{cardCountStr}</span>
      {" "}
      <span className={infOk ? "legal" : "invalid"}>{infCountStr}</span>
      {" "}
      {trSpan(["deck-builder_cards-and-influence", "cards/influence"])}
    </>
  );
}

// ---------------------------------------------------------------------------
// Card line display helpers
// ---------------------------------------------------------------------------

export function CardLineElement({
  deck,
  card,
  qty,
  format,
  showCreditCost,
  showMuCost,
  isEdit,
  onCardClick,
  cardImage,
}: {
  deck: Deck;
  card: CardData;
  qty: number;
  format: string;
  showCreditCost: boolean;
  showMuCost: boolean;
  isEdit: boolean;
  onCardClick?: () => void;
  cardImage?: string;
}): React.ReactElement {
  const inFaction = card.faction === (deck.identity as CardData)?.faction;
  const allied = false; // Would require allianceIsFree check
  const cardTitle = trData("title", card as Record<string, unknown>) as string;
  const cardType = trType(card.type ?? "") as string;

  return (
    <div className="card-line" onClick={onCardClick}>
      {cardImage && (
        <img
          src={cardImage}
          alt={cardTitle}
          className="card-thumbnail"
        />
      )}
      <span className="card-title">
        {qty} {cardTitle}
      </span>
      {cardCostHtml(showCreditCost, showMuCost, isEdit, card)}
      {cardInfluenceHtml(format, card, qty, inFaction, allied)}
    </div>
  );
}
