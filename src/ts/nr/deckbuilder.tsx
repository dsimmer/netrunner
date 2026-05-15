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

interface CardData {
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

interface DeckLine {
  qty: number;
  card: CardData | string;
  id?: string;
  art?: string;
}

interface ParsedDeckLine {
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

interface Deck {
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

const ALL_SIDES_FILTER = "Any Side";
const ALL_FACTIONS_FILTER = "Any Faction";
const ALL_FORMATS_FILTER = "Any Format";

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

function imageUrl(card: CardData): string | null {
  const options = useAppState.getState().options;
  const lang = (options.cardLanguage as string) ?? "en";
  const res = (options.cardResolution as string) ?? "default";
  const altArt = (options.altArts as Record<string, unknown>)?.[card.code ?? ""] as string | undefined;
  const art = altArt ?? "stock";
  const images = imageOrFace(card);
  const artUrls = getImagePath(images, lang, res, art);
  if (artUrls && artUrls.length > 0) return artUrls[0];
  return null;
}

// ---------------------------------------------------------------------------
// Faction helper (mirrors nr.cardbrowser/factions)
// ---------------------------------------------------------------------------

function factions(side: string): string[] {
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

function lookup(side: string, card: { title?: string; code?: string }): CardData | null {
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

function processCardsInDeck(deck: Deck): Deck {
  if (deck.parsed) return deck;
  const side = deck.identity?.side ?? (deck.side ?? "");
  const cards = lookupDeck(side, deck.cards as { qty: number; card: string }[]);
  return { ...deck, cards, parsed: true };
}

// ---------------------------------------------------------------------------
// Lookup identity helpers
// ---------------------------------------------------------------------------

function lookupIdentityByCode(side: string, code: string): CardData | null {
  const allCards = AllCards;
  return (Object.values(allCards) as CardData[]).find(c =>
    c.code === code && c.type === "Identity" && c.side === side
  ) ?? null;
}

function lookupIdentityByTitle(side: string, title: string): CardData | null {
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

function parseDeckString(side: string, deckString: string): {
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

function deckToStr(deck: Deck): string {
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

function sideIdentities(side: string, format: string): CardData[] {
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

function nameCopy(deck: Deck): string {
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

function deckName(deck: Deck, limit = 40): string {
  const name = deck.name ?? "";
  if (!name) return "";
  const trimmed = name.trim();
  const result = trimmed.substring(0, limit);
  if (limit < trimmed.length) return `${result}...`;
  return result;
}

function deckDate(deck: Deck): string {
  const date = deck.date;
  if (date) return formatDateTime(mdyFormatter, date);
  return "";
}

function noInfCost(identity: CardData, card: CardData): boolean {
  return (
    card.faction === identity.faction ||
    card.factioncost === 0 ||
    validator.idInfluenceLimit(identity) === INFINITY
  );
}

// ---------------------------------------------------------------------------
// Card influence HTML
// ---------------------------------------------------------------------------

function cardInfluenceHtml(
  format: string,
  card: CardData,
  qty: number,
  inFaction: boolean,
  allied: boolean,
): React.ReactElement {
  const influence = (card.factioncost ?? 0) * qty;
  const cardStatus = formatStatus(format, card);
  const banned = cardStatus.banned;
  const restricted = cardStatus.restricted;
  const rotated = cardStatus.rotated;
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

function deckInfluenceHtml(deck: Deck): React.ReactElement[] {
  return dotsHtml(influenceDot, validator.influenceMap(deck as validator.Deck));
}

// ---------------------------------------------------------------------------
// Card cost HTML
// ---------------------------------------------------------------------------

function cardCostHtml(
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
          <div className="cost-item">{renderMessage(`${card.memoryunits}[mu] `)}</div>
        )}
        {showCreditCost && card.cost != null && (
          <div className="cost-item">{renderMessage(`${card.cost}[credit]`)}</div>
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

function deckPointsSpan(deck: Deck): React.ReactElement {
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

function filterSide(side: string, decks: Deck[]): Deck[] {
  return decks.filter(d => d.side === side);
}

function filterFormat(format: string, decks: Deck[]): Deck[] {
  return decks.filter(d => (buildableFormatToSlug as Record<string, string>)[d.format ?? ""] === format);
}

function filterLocked(locked: boolean, decks: Deck[]): Deck[] {
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

function filterCards(
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

function cardCount(cards: DeckLine[]): number {
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

function influenceCount(deck: Deck): number {
  const infMap = validator.influenceMap(deck as validator.Deck);
  return Object.values(infMap).reduce((a, b) => a + b, 0);
}

function idInfluenceLimit(identity: CardData): number {
  const inf = identity.influencelimit;
  if (inf === null || inf === undefined || inf === "∞") return INFINITY;
  return typeof inf === "number" ? inf : INFINITY;
}

// ---------------------------------------------------------------------------
// Deck status display helpers
// ---------------------------------------------------------------------------

function deckStatusText(deck: Deck): React.ReactElement {
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

function CardLineElement({
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

// ---------------------------------------------------------------------------
// Deck view/edit components
// ---------------------------------------------------------------------------

function DeckView({ deck }: { deck: Deck }) {
  const processedDeck = useMemo(() => processCardsInDeck(deck), [deck]);
  const format = processedDeck.format ?? "standard";
  const identity = processedDeck.identity as CardData;
  const showCreditCost = identity.side === "Corp";
  const showMuCost = identity.side === "Runner";

  const identityImage = imageUrl(identity);

  return (
    <div className="deck-view">
      <div className="deck-header">
        <div className="deck-identity">
          {identityImage && <img src={identityImage} alt={identity.displayName ?? identity.title ?? ""} />}
          <span className="identity-name">{identity.displayName ?? identity.title}</span>
        </div>
      </div>
      <div className="deck-stats">
        <DeckStatusSpan deck={processedDeck as validator.Deck} />
        {" "}
        {deckStatusText(processedDeck)}
        {validator.formatPointLimit(format) && deckPointsSpan(processedDeck)}
      </div>
      <div className="deck-cards">
        {(processedDeck.cards as ParsedDeckLine[]).map((line, idx) => (
          <CardLineElement
            key={idx}
            deck={processedDeck}
            card={line.card}
            qty={line.qty}
            format={format}
            showCreditCost={showCreditCost}
            showMuCost={showMuCost}
            isEdit={false}
            cardImage={imageUrl(line.card)}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card selector for editing
// ---------------------------------------------------------------------------

function CardSelector({
  deck,
  side,
  format,
  identity,
  onCardSelect,
}: {
  deck: Deck;
  side: string;
  format: string;
  identity: CardData;
  onCardSelect: (card: CardData) => void;
}) {
  const [titleQuery, setTitleQuery] = useState("");
  const [sideFilter, setSideFilter] = useState(ALL_SIDES_FILTER);
  const [typeFilter, setTypeFilter] = useState("Any Type");
  const [factionFilter, setFactionFilter] = useState(ALL_FACTIONS_FILTER);
  const [formatFilter, setFormatFilter] = useState(ALL_FORMATS_FILTER);
  const [sortField, setSortField] = useState("Name");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    storeScrollTop(scrollRef.current);
    return () => {};
  }, []);

  const allCards = useMemo(() =>
    (Object.values(AllCards) as CardData[]).sort((a, b) => (a.title ?? "").localeCompare(b.title ?? "")),
    []
  );

  const filteredCards = useMemo(() =>
    filterCards(titleQuery, sideFilter, factionFilter, typeFilter, formatFilter, sortField, allCards, identity),
    [titleQuery, sideFilter, factionFilter, typeFilter, formatFilter, sortField, allCards, identity]
  );

  const cardTypes = useMemo(() => {
    const types = new Set(allCards.map(c => c.type).filter(Boolean));
    return ["Any Type", ...Array.from(types).sort()];
  }, [allCards]);

  const formatOptions = useMemo(() =>
    ["Any Format", ...Object.keys(slugToBuildableFormat)],
    []
  );

  const sideOptions = ["Any Side", "Corp", "Runner"];

  return (
    <div className="card-selector">
      <div className="card-filters">
        <input
          type="text"
          placeholder={tr(["card-browser_search", "Search..."])}
          value={titleQuery}
          onChange={e => setTitleQuery(e.target.value)}
          className="card-search"
        />
        <select value={sideFilter} onChange={e => setSideFilter(e.target.value)}>
          {sideOptions.map(opt => (
            <option key={opt} value={opt}>{trSide(opt)}</option>
          ))}
        </select>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          {cardTypes.map(type => (
            <option key={type} value={type}>{trType(type)}</option>
          ))}
        </select>
        <select value={factionFilter} onChange={e => setFactionFilter(e.target.value)}>
          <option value={ALL_FACTIONS_FILTER}>{ALL_FACTIONS_FILTER}</option>
          {factions(sideFilter).map(faction => (
            <option key={faction} value={faction}>{trFaction(faction)}</option>
          ))}
        </select>
        <select value={formatFilter} onChange={e => setFormatFilter(e.target.value)}>
          {formatOptions.map(fmt => (
            <option key={fmt} value={fmt}>{trFormat(fmt)}</option>
          ))}
        </select>
        <select value={sortField} onChange={e => setSortField(e.target.value)}>
          {["Name", "Influence", "Cost", "Faction", "Type", "Set number"].map(field => (
            <option key={field} value={field}>{field}</option>
          ))}
        </select>
      </div>
      <div className="card-list" ref={scrollRef} onScroll={() => {}}>
        {filteredCards.map((card, idx) => {
          const cardTitle = trData("title", card as Record<string, unknown>) as string;
          const cardImage = imageUrl(card);
          return (
            <div
              key={card.code ?? idx}
              className="card-item"
              onClick={() => onCardSelect(card)}
            >
              {cardImage && <img src={cardImage} alt={cardTitle} className="card-thumbnail" />}
              <span className="card-title">{cardTitle}</span>
              {cardCostHtml(identity.side === "Corp", identity.side === "Runner", true, card)}
              {noInfCost(identity, card) || cardInfluenceHtml(
                format ?? "standard", card, 1,
                card.faction === identity.faction, false
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Zoom modal component
// ---------------------------------------------------------------------------

function ZoomModal({ card, onClose }: { card: CardData; onClose: () => void }) {
  const [currentCard, setCurrentCard] = useState(card);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const cardImage = imageUrl(currentCard);
  const cardTitle = trData("title", currentCard as Record<string, unknown>) as string;
  const cardType = trType(currentCard.type ?? "") as string;
  const cardFaction = trFaction(currentCard.faction ?? "Neutral");

  return (
    <div className="zoom-overlay" onClick={onClose}>
      <div className="zoom-content" onClick={e => e.stopPropagation()}>
        <button className="zoom-close" onClick={onClose}>✕</button>
        {cardImage && (
          <img src={cardImage} alt={cardTitle} className="zoom-image" />
        )}
        <div className="zoom-info">
          <div className="zoom-title">{cardTitle}</div>
          <div className="zoom-type">{cardType}</div>
          <div className="zoom-faction">{cardFaction}</div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main DeckBuilder component
// ---------------------------------------------------------------------------

export function DeckBuilder(): React.ReactElement | null {
  const { decks, setDecks } = useAppState();
  const [editingDeck, setEditingDeck] = useState<Deck | null>(null);
  const [showNewDeck, setShowNewDeck] = useState(false);
  const [zoomCard, setZoomCard] = useState<CardData | null>(null);
  const [deckListSide, setDeckListSide] = useState("");
  const [deckListFormat, setDeckListFormat] = useState("");
  const [deckListLocked, setDeckListLocked] = useState(false);
  const [deckListSearch, setDeckListSearch] = useState("");
  const [deckListSort, setDeckListSort] = useState("");

  // Authentication check
  const auth = authenticated();

  if (!auth) {
    return <div>{tr(["deck-builder_must-login", "You must be logged in to use the deck builder."])}</div>;
  }

  // Fetch decks on mount
  useEffect(() => {
    (async () => {
      try {
        const response = await GET("/deck/");
        if (response.status === 200 && response.json) {
          const rawDecks = response.json as Deck[];
          const processedDecks = rawDecks.map(d => ({
            ...d,
            side: d.identity?.side ?? "",
          }));
          setDecks(processedDecks as unknown[]);
        }
      } catch (e) {
        console.error("Failed to fetch decks:", e);
      }
    })();
  }, [setDecks]);

  // WebSocket handlers for deck updates (mirrors event-msg-handler)
  useEffect(() => {
    const handlers: Record<string, (data: unknown) => void> = {
      "update-deck": (data) => {
        const updatedDeck = (data as { deck: Deck }).deck;
        const processed = processCardsInDeck({
          ...updatedDeck,
          side: updatedDeck.identity?.side ?? "",
        });
        setDecks((decks as Deck[]).map(d =>
          String(d._id) === String(processed._id) ? processed : d
        ) as unknown[]);
      },
      "remove-deck": (data) => {
        const deckId = (data as { id: string }).id;
        setDecks((decks as Deck[]).filter(d => String(d._id) !== String(deckId)) as unknown[]);
      },
    };

    Object.entries(handlers).forEach(([event, handler]) =>
      onWSEvent(event, handler)
    );

    return () => {
      // Note: onWSEvent doesn't provide unsubscribe; handlers persist
      // This is consistent with the ws.ts architecture where handlers are registered once
    };
  }, [setDecks]);

  // Handlers
  const handleDeleteDeck = useCallback(async (deck: Deck) => {
    if (!deck._id) return;
    const confirmed = window.confirm(
      tr(["deck-builder_confirm-delete", "Are you sure you want to delete this deck?"])
    );
    if (!confirmed) return;

    try {
      const response = await DELETE(`/deck/${deck._id}`);
      if (response.status === 200) {
        setDecks((decks as Deck[]).filter(d => String(d._id) !== String(deck._id)) as unknown[]);
        nonGameToast(
          tr(["deck-builder_deck-deleted", "Deck deleted"]),
          "success"
        );
      }
    } catch (e) {
      nonGameToast(
        tr(["deck-builder_delete-failed", "Failed to delete deck"]),
        "error"
      );
    }
  }, [setDecks]);

  const handleSaveDeck = useCallback(async (deck: Deck) => {
    try {
      const response = await PUT("/deck/", deck as unknown as Record<string, unknown>);
      if (response.status === 200) {
        const savedDeck = { ...deck, _id: (response.json as { _id?: string | number })?._id, parsed: true, side: deck.identity?.side ?? "" };
        const existing = (decks as Deck[]).findIndex(d => String(d._id) === String(savedDeck._id));
        if (existing >= 0) {
          const updated = [...(decks as Deck[]), savedDeck];
          updated[existing] = savedDeck;
          setDecks(updated as unknown[]);
        } else {
          setDecks([savedDeck, ...(decks as Deck[])] as unknown[]);
        }
        setEditingDeck(null);
        nonGameToast(
          tr(["deck-builder_deck-saved", "Deck saved"]),
          "success"
        );
      }
    } catch (e) {
      nonGameToast(
        tr(["deck-builder_save-failed", "Failed to save deck"]),
        "error"
      );
    }
  }, [setDecks]);

  const handleCreateDeck = useCallback(async (deck: Deck) => {
    try {
      const response = await POST("/deck/", deck as unknown as Record<string, unknown>);
      if (response.status === 200) {
        const newDeck = { ...deck, _id: (response.json as { _id?: string | number })?._id, parsed: true, side: deck.identity?.side ?? "" };
        setDecks([newDeck, ...(decks as Deck[])] as unknown[]);
        setShowNewDeck(false);
        nonGameToast(
          tr(["deck-builder_deck-created", "Deck created"]),
          "success"
        );
      }
    } catch (e) {
      nonGameToast(
        tr(["deck-builder_create-failed", "Failed to create deck"]),
        "error"
      );
    }
  }, [setDecks]);

  const handleDuplicateDeck = useCallback(async (deck: Deck) => {
    const newDeck: Deck = {
      ...deck,
      _id: undefined,
      name: nameCopy(deck),
      new: true,
    };
    setEditingDeck(newDeck);
  }, []);

  const handleZoomCard = useCallback((card: CardData) => {
    setZoomCard(card);
  }, [setZoomCard]);

  // Filtered and sorted deck list
  const filteredDecks = useMemo(() => {
    let result = decks as Deck[];
    if (deckListSide) result = filterSide(deckListSide, result);
    if (deckListFormat) result = filterFormat(deckListFormat, result);
    if (deckListLocked) result = filterLocked(true, result);
    if (deckListSearch) {
      const searchLower = deckListSearch.toLowerCase();
      result = result.filter(d =>
        (d.name ?? "").toLowerCase().includes(searchLower) ||
        (d.identity?.title ?? "").toLowerCase().includes(searchLower)
      );
    }
    return result;
  }, [decks, deckListSide, deckListFormat, deckListLocked, deckListSearch]);

  // Deck list item
  const renderDeckItem = (deck: Deck) => (
    <div key={String(deck._id)} className="deck-item">
      <div className="deck-item-info">
        <span className="deck-item-name">{deckName(deck)}</span>
        <span className="deck-item-date">{deckDate(deck)}</span>
      </div>
      <div className="deck-item-actions">
        <button
          className="btn btn-sm"
          onClick={() => setEditingDeck(deck)}
          disabled={!!deck.locked}
        >
          {tr(["deck-builder_edit", "Edit"])}
        </button>
        <button className="btn btn-sm" onClick={() => handleDuplicateDeck(deck)}>
          {tr(["deck-builder_duplicate", "Duplicate"])}
        </button>
        <button
          className="btn btn-sm btn-danger"
          onClick={() => handleDeleteDeck(deck)}
          disabled={!!deck.locked}
        >
          {tr(["deck-builder_delete", "Delete"])}
        </button>
      </div>
    </div>
  );

  // Editing a deck
  if (editingDeck) {
    return <DeckEditor
      deck={editingDeck}
      onSave={handleSaveDeck}
      onCancel={() => setEditingDeck(null)}
      onZoomCard={handleZoomCard}
    />;
  }

  // Creating a new deck
  if (showNewDeck) {
    return <NewDeckWizard onCreate={handleCreateDeck} onCancel={() => setShowNewDeck(false)} />;
  }

  // Deck list view
  return (
    <div className="deck-builder">
      <div className="deck-builder-header">
        <h2>{tr(["deck-builder_title", "Deck Builder"])}</h2>
        <button className="btn" onClick={() => setShowNewDeck(true)}>
          {tr(["deck-builder_new-deck", "New Deck"])}
        </button>
      </div>
      <div className="deck-list-filters">
        <input
          type="text"
          placeholder={tr(["deck-builder_search", "Search decks..."])}
          value={deckListSearch}
          onChange={e => setDeckListSearch(e.target.value)}
        />
        <select value={deckListSide} onChange={e => setDeckListSide(e.target.value)}>
          <option value="">{ALL_SIDES_FILTER}</option>
          <option value="Corp">Corp</option>
          <option value="Runner">Runner</option>
        </select>
        <select value={deckListFormat} onChange={e => setDeckListFormat(e.target.value)}>
          <option value="">{ALL_FORMATS_FILTER}</option>
          {(Object.entries(slugToBuildableFormat) as [string, string][]).map(([slug, name]) => (
            <option key={slug} value={slug}>{name}</option>
          ))}
        </select>
        <label>
          <input
            type="checkbox"
            checked={deckListLocked}
            onChange={e => setDeckListLocked(e.target.checked)}
          />
          {tr(["deck-builder_locked", "Locked"])}
        </label>
      </div>
      <div className="deck-list">
        {filteredDecks.length === 0 && (
          <p>{tr(["deck-builder_no-decks", "No decks found."])}</p>
        )}
        {filteredDecks.map(renderDeckItem)}
      </div>
      {zoomCard && (
        <ZoomModal
          card={zoomCard}
          onClose={() => setZoomCard(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// New deck wizard
// ---------------------------------------------------------------------------

function NewDeckWizard({ onCreate, onCancel }: {
  onCreate: (deck: Deck) => void;
  onCancel: () => void;
}) {
  const [side, setSide] = useState("");
  const [format, setFormat] = useState("standard");
  const [deckName, setDeckName] = useState("");
  const [deckString, setDeckString] = useState("");
  const [parsedDeck, setParsedDeck] = useState<{ cards: ParsedDeckLine[]; identity: CardData | null; title: string | null; notes: string | null } | null>(null);
  const [importMode, setImportMode] = useState(false);

  const handleSideSelect = (selectedSide: string) => {
    setSide(selectedSide);
  };

  const handleParseDeckString = () => {
    const result = parseDeckString(side, deckString);
    setParsedDeck(result);
    if (result.title) setDeckName(result.title);
  };

  const handleCreate = () => {
    if (!parsedDeck) return;
    const deck: Deck = {
      name: deckName || parsedDeck.identity?.displayName || parsedDeck.identity?.title || "New Deck",
      identity: parsedDeck.identity,
      cards: parsedDeck.cards as DeckLine[],
      format,
      notes: parsedDeck.notes,
      parsed: true,
      side,
      new: true,
    };
    onCreate(deck);
  };

  if (!side) {
    return (
      <div className="new-deck-wizard">
        <h2>{tr(["deck-builder_new-deck", "New Deck"])}</h2>
        <div className="side-selection">
          <button className="btn btn-large" onClick={() => handleSideSelect("Corp")}>
            {tr(["deck-builder_corp", "Corp"])}
          </button>
          <button className="btn btn-large" onClick={() => handleSideSelect("Runner")}>
            {tr(["deck-builder_runner", "Runner"])}
          </button>
        </div>
        <button className="btn" onClick={onCancel}>
          {tr(["deck-builder_cancel", "Cancel"])}
        </button>
      </div>
    );
  }

  return (
    <div className="new-deck-wizard">
      <h2>{tr(["deck-builder_new-deck", "New Deck"])}</h2>
      <div className="deck-name-input">
        <input
          type="text"
          placeholder={tr(["deck-builder_deck-name", "Deck name"])}
          value={deckName}
          onChange={e => setDeckName(e.target.value)}
        />
      </div>
      <div className="format-select">
        <select value={format} onChange={e => setFormat(e.target.value)}>
          {(Object.entries(slugToBuildableFormat) as [string, string][]).map(([slug, name]) => (
            <option key={slug} value={slug}>{name}</option>
          ))}
        </select>
      </div>
      <div className="deck-input">
        <textarea
          placeholder={tr(["deck-builder_deck-text", "Paste deck text here..."])}
          value={deckString}
          onChange={e => setDeckString(e.target.value)}
          rows={20}
        />
        <button className="btn" onClick={handleParseDeckString}>
          {tr(["deck-builder_parse", "Parse"])}
        </button>
      </div>
      {parsedDeck && (
        <div className="parsed-deck-preview">
          <h3>{tr(["deck-builder_preview", "Preview"])}</h3>
          <div className="preview-identity">
            {parsedDeck.identity?.displayName ?? parsedDeck.identity?.title ?? "Unknown Identity"}
          </div>
          <DeckStatusSpan deck={parsedDeck as unknown as validator.Deck} />
          <div className="preview-cards">
            {parsedDeck.cards.map((line, idx) => (
              <div key={idx} className="card-line">
                {line.qty} {trData("title", line.card as Record<string, unknown>) as string}
              </div>
            ))}
          </div>
          <button className="btn btn-success" onClick={handleCreate}>
            {tr(["deck-builder_create", "Create Deck"])}
          </button>
        </div>
      )}
      <button className="btn" onClick={onCancel}>
        {tr(["deck-builder_cancel", "Cancel"])}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Deck editor component
// ---------------------------------------------------------------------------

function DeckEditor({ deck, onSave, onCancel, onZoomCard }: {
  deck: Deck;
  onSave: (deck: Deck) => void;
  onCancel: () => void;
  onZoomCard: (card: CardData) => void;
}) {
  const [currentDeck, setCurrentDeck] = useState<Deck>(() => processCardsInDeck(deck));
  const [selectedCard, setSelectedCard] = useState<CardData | null>(null);
  const [editingCardLine, setEditingCardLine] = useState<number | null>(null);
  const [editQty, setEditQty] = useState(0);
  const [deckName, setDeckName] = useState(currentDeck.name ?? "");
  const [deckFormat, setDeckFormat] = useState(currentDeck.format ?? "standard");
  const [deckNotes, setDeckNotes] = useState(currentDeck.notes ?? "");
  const [identity, setIdentity] = useState<CardData>(currentDeck.identity ?? {});
  const scrollRef = useRef<HTMLDivElement>(null);

  const side = identity.side ?? currentDeck.side ?? "";
  const format = deckFormat ?? "standard";

  const identities = useMemo(() => sideIdentities(side, format), [side, format]);

  useEffect(() => {
    storeScrollTop(scrollRef.current);
  }, []);

  const handleCardSelect = useCallback((card: CardData) => {
    setCurrentDeck(prev => {
      const existingIndex = prev.cards.findIndex((line: DeckLine) =>
        (line.card as CardData).title === card.title
      );
      if (existingIndex >= 0) {
        const updatedCards = [...prev.cards];
        const existingLine = updatedCards[existingIndex] as DeckLine;
        const maxQty = (card["deck-limit"] ?? 3);
        updatedCards[existingIndex] = {
          ...(existingLine as DeckLine),
          qty: Math.min((existingLine as DeckLine).qty + 1, maxQty),
        };
        return { ...prev, cards: updatedCards, parsed: true };
      }
      return { ...prev, cards: [...prev.cards, { qty: 1, card }], parsed: true };
    });
  }, []);

  const handleRemoveCard = useCallback((index: number) => {
    setCurrentDeck(prev => {
      const updatedCards = [...prev.cards];
      updatedCards.splice(index, 1);
      return { ...prev, cards: updatedCards, parsed: true };
    });
  }, []);

  const handleCardQtyChange = useCallback((index: number, newQty: number) => {
    setCurrentDeck(prev => {
      const updatedCards = [...prev.cards];
      const line = updatedCards[index] as DeckLine;
      const maxQty = ((line.card as CardData)["deck-limit"] ?? 3);
      updatedCards[index] = { ...(line as DeckLine), qty: Math.max(0, Math.min(newQty, maxQty)) };
      return { ...prev, cards: updatedCards, parsed: true };
    });
  }, []);

  const handleSave = useCallback(() => {
    const updatedDeck: Deck = {
      ...currentDeck,
      name: deckName,
      format: deckFormat,
      notes: deckNotes,
      identity,
    };
    onSave(updatedDeck);
  }, [currentDeck, deckName, deckFormat, deckNotes, identity, onSave]);

  const handleIdentityChange = useCallback((newIdentity: CardData) => {
    setIdentity(newIdentity);
  }, []);

  const showCreditCost = side === "Corp";
  const showMuCost = side === "Runner";

  const totalCards = cardCount(currentDeck.cards);
  const minSize = validator.minDeckSize(identity);
  const infCount = influenceCount(currentDeck);
  const infLimit = idInfluenceLimit(identity);

  return (
    <div className="deck-editor">
      <div className="editor-header">
        <input
          type="text"
          className="deck-name-input"
          value={deckName}
          onChange={e => setDeckName(e.target.value)}
          placeholder={tr(["deck-builder_deck-name", "Deck name"])}
        />
        <select value={deckFormat} onChange={e => setDeckFormat(e.target.value)}>
          {(Object.entries(slugToBuildableFormat) as [string, string][]).map(([slug, name]) => (
            <option key={slug} value={slug}>{name}</option>
          ))}
        </select>
        <textarea
          className="deck-notes-input"
          value={deckNotes}
          onChange={e => setDeckNotes(e.target.value)}
          placeholder={tr(["deck-builder_notes", "Notes"])}
          rows={2}
        />
      </div>
      <div className="editor-identity">
        <select
          value={identity.code ?? ""}
          onChange={e => {
            const found = identities.find(id => id.code === e.target.value);
            if (found) handleIdentityChange(found);
          }}
        >
          {identities.map(id => (
            <option key={id.code} value={id.code}>{id.displayName ?? id.title}</option>
          ))}
        </select>
      </div>
      <div className="editor-stats">
        <DeckStatusSpan deck={currentDeck as validator.Deck} />
        {" "}
        <span>
          <span className={totalCards >= minSize ? "legal" : "invalid"}>
            {totalCards}/{minSize}
          </span>{" "}
          <span className={infCount <= infLimit ? "legal" : "invalid"}>
            {infCount}/{infLimit === INFINITY ? "∞" : infLimit}
          </span>
        </span>
        {validator.formatPointLimit(format) && deckPointsSpan(currentDeck)}
        {" "}
        {deckInfluenceHtml(currentDeck)}
      </div>
      <div className="editor-body">
        <div className="editor-deck-cards" ref={scrollRef}>
          {(currentDeck.cards as ParsedDeckLine[]).map((line, idx) => (
            <div key={idx} className="deck-card-line">
              {imageUrl(line.card) && (
                <img
                  src={imageUrl(line.card)}
                  alt={trData("title", line.card as Record<string, unknown>) as string}
                  className="card-thumbnail"
                  onClick={() => onZoomCard(line.card)}
                />
              )}
              <span className="card-title">
                {trData("title", line.card as Record<string, unknown>) as string}
              </span>
              {cardCostHtml(showCreditCost, showMuCost, true, line.card)}
              {cardInfluenceHtml(format, line.card, line.qty,
                line.card.faction === identity.faction, false)}
              <div className="qty-controls">
                <span className="qty-display">{line.qty}</span>
                <button className="btn btn-sm" onClick={() => handleCardQtyChange(idx, line.qty - 1)}>
                  -
                </button>
                <button className="btn btn-sm" onClick={() => handleCardQtyChange(idx, line.qty + 1)}>
                  +
                </button>
                <button
                  className="btn btn-sm btn-danger"
                  onClick={() => handleRemoveCard(idx)}
                >
                  {tr(["deck-builder_remove", "Remove"])}
                </button>
              </div>
            </div>
          ))}
        </div>
        <CardSelector
          deck={currentDeck}
          side={side}
          format={format}
          identity={identity}
          onCardSelect={handleCardSelect}
        />
      </div>
      <div className="editor-footer">
        <button className="btn btn-success" onClick={handleSave}>
          {tr(["deck-builder_save", "Save"])}
        </button>
        <button className="btn" onClick={onCancel}>
          {tr(["deck-builder_cancel", "Cancel"])}
        </button>
      </div>
      {selectedCard && (
        <ZoomModal
          card={selectedCard}
          onClose={() => setSelectedCard(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Exported helper (used by other components)
// ---------------------------------------------------------------------------

export { processCardsInDeck, parseDeckString, deckToStr, lookup, lookupIdentityByCode, lookupIdentityByTitle };
