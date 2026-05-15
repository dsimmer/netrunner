// Card browser page: search, filter, and view card images/text.
// Mirrors: src/cljs/nr/cardbrowser.cljs
import React, { useEffect, useRef, useState, useCallback } from "react";
import { useAppState } from "./appstate";
import { GET, POST } from "./ajax";
import { AllCards, SetAllCards, SetMWL, SetSets, MWL as MWLAtom, Sets as SetsAtom, Cycles as CyclesAtom } from "../jinteki/cards";
import { slugify, strToInt } from "../jinteki/utils";
import { load, save } from "./local_storage";
import { tr, trData, cleanInput, trFaction, trFormat, trSet, trSide, trType } from "./translations";
import {
  bannedSpan, deckPointsCardSpan, factionIcon, buildableFormatToSlug,
  getImagePath, imageOrFace, nonGameToast, renderSafeHtml, restrictedSpan,
  rotatedSpan, setScrollTop, storeScrollTop, trNonGameToast, influenceDots,
  slugToBuildableFormat,
} from "./utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CardImage {
  [lang: string]: {
    [res: string]: {
      [art: string]: string[];
    };
  };
}

interface CardFormatStatus {
  legal?: boolean;
  banned?: boolean;
  restricted?: boolean;
  rotated?: boolean;
  points?: number;
}

interface CardFormat {
  [format: string]: CardFormatStatus;
}

interface CardFace {
  title: string;
  text: string;
  images?: CardImage;
}

export interface CardData {
  code: string;
  title: string;
  type: string;
  faction: string;
  side: string;
  setname?: string;
  set_code?: string;
  cycle_code?: string;
  number?: number;
  text?: string;
  keywords?: string;
  subtypes?: string[];
  subtype?: string;
  cost?: number | string;
  trash?: number | string;
  strength?: number | string;
  advancementcost?: number | string;
  agendapoints?: number;
  minimumdecksize?: number;
  influencelimit?: string;
  factioncost?: number;
  uniqueness?: boolean;
  implementation?: string;
  memoryunits?: number;
  images?: CardImage;
  faces?: Record<string, CardFace>;
  flips?: unknown;
  named_faces?: Record<string, string>;
  previous_versions?: string[];
  future_version?: string;
  format?: CardFormat;
  localized?: Record<string, unknown>;
  art?: string;
  art_index?: number;
  rotated?: boolean;
  [key: string]: unknown;
}

interface AltInfo {
  version: string;
  name: string;
  description?: string;
  "artist-blurb"?: string;
  "artist-link"?: string;
  "artist-about"?: string;
}

interface SetData {
  code: string;
  id: string;
  name: string;
  cycle_code?: string;
  bigbox?: boolean;
  size?: number;
  position?: number;
}

interface CycleData {
  name: string;
  code: string;
  position?: number;
  size?: number;
}

interface MWLData {
  [format: string]: {
    cards?: Record<string, unknown>;
    [key: string]: unknown;
  };
}

interface CardsChannelData {
  cards: CardData[];
}

interface CardBrowserState {
  searchQuery: string;
  sortField: string;
  formatFilter: string;
  setFilter: string;
  typeFilter: string;
  sideFilter: string;
  factionFilter: string;
  page: number;
  decorateCard: boolean;
  selectedCard: CardData | null;
}

// ---------------------------------------------------------------------------
// Card channel – signals when cards are loaded
// ---------------------------------------------------------------------------

const cardsChannel: { resolve?: (data: CardsChannelData) => void; promise: Promise<CardsChannelData> } = {
  promise: new Promise((resolve) => { cardsChannel.resolve = resolve; }),
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCardKeyToString(format: { cards?: Record<string, unknown>; [key: string]: unknown }) {
  return {
    ...format,
    cards: format.cards
      ? Object.fromEntries(Object.entries(format.cards).map(([k, v]) => [k, v]))
      : undefined,
  };
}

/**
 * Initialise card data from the server.
 * Mirrors the go block at the top of cardbrowser.cljs.
 */
export async function loadCards(): Promise<void> {
  const versionResp = await GET("/data/cards/version");
  const serverVersion = (versionResp.json as { version?: string })?.version;
  const lang = (useAppState.getState().options.cardLanguage as string) ?? "en";
  const localCardsRaw = load("cards", {});
  const localCards = (localCardsRaw && typeof localCardsRaw === "object" && !Array.isArray(localCardsRaw))
    ? localCardsRaw as { version?: string; lang?: string; cards?: CardData[] }
    : {};

  const needUpdate =
    !localCards ||
    !localCards.cards ||
    serverVersion !== localCards.version ||
    lang !== localCards.lang;

  let latestCards: CardData[];
  if (needUpdate) {
    const cardsResp = await GET("/data/cards");
    latestCards = cardsResp.json as CardData[];
  } else {
    latestCards = localCards.cards ?? [];
  }

  let localizedData: CardData[] | undefined;
  if (lang !== "en") {
    const locResp = await GET(`/data/cards/lang/${lang}`);
    localizedData = locResp.json as CardData[];
  }

  let cards = [...latestCards]
    .sort((a, b) => a.code.localeCompare(b.code));
  cards = insertStarterIds(cards);
  cards = mergeLocalizedData(localizedData, cards);

  const setsResp = await GET("/data/sets");
  const sets: SetData[] = setsResp.json as SetData[];

  const cyclesResp = await GET("/data/cycles");
  const cycles: CycleData[] = cyclesResp.json as CycleData[];

  const mwlsResp = await GET("/data/mwl");
  const mwls: Array<{ format: string; date_start: string; [key: string]: unknown }> = mwlsResp.json as Array<{ format: string; date_start: string; [key: string]: unknown }>;

  const latestMWL: MWLData = Object.fromEntries(
    Object.values(
      mwls.reduce((acc: Record<string, Array<{ format: string; date_start: string; [key: string]: unknown }>>, e) => {
        const fmt = e.format;
        if (!acc[fmt]) acc[fmt] = [];
        acc[fmt].push(e);
        return acc;
      }, {})
    )
      .sort((a, b) => a[0].date_start.localeCompare(b[0].date_start))
      .map((group) => {
        const last = group[group.length - 1];
        return [last.format, formatCardKeyToString(last)];
      })
  );

  const altInfoResp = await GET("/data/cards/altarts");
  const altInfo: AltInfo[] = ((altInfoResp.json as Array<Record<string, unknown>>)?.map(
    (e) => ({
      version: e.version as string,
      name: e.name as string,
      description: e.description as string,
      "artist-blurb": e["artist-blurb"] as string,
      "artist-link": e["artist-link"] as string,
      "artist-about": e["artist-about"] as string,
    })
  )) ?? [];

  // Update global atoms
  SetMWL(latestMWL);
  SetSets(sets as unknown as Array<Record<string, unknown>>);
  // SetCycles(cycles); // not strictly needed here but mirrors the CLJS

  // Update appstate
  const state = useAppState.getState();
  const currentAllCardsAndFlips = ((state as unknown as Record<string, unknown>)["all-cards-and-flips"] ?? {}) as Record<string, unknown>;
  (useAppState as unknown as { setState: (updater: (s: typeof state) => Partial<typeof state>) => void }).setState((s) => ({
    ...s,
    sets,
    cycles,
    "cards-loaded": true,
    "all-cards-and-flips": {
      ...currentAllCardsAndFlips,
      ...generateFlipCards(cards),
    },
    "previous-cards": generatePreviousCards(cards),
    "alt-info": altInfo,
  }));

  if (needUpdate) {
    save("cards", { cards, version: serverVersion, lang });
  }

  // Sort cards by code, create title-indexed map
  const sortedCards = [...cards].sort((a, b) => a.code.localeCompare(b.code));
  const cardsMap: Record<string, CardData> = Object.fromEntries(sortedCards.map((c) => [c.title, c]));
  SetAllCards(cardsMap);

  // Resolve channel so subscribers know cards are loaded
  cardsChannel.resolve?.({ cards });
}

// ---------------------------------------------------------------------------
// merge-localized-data
// ---------------------------------------------------------------------------

function mergeLocalizedData(localizedData: CardData[] | undefined, cards: CardData[]): CardData[] {
  if (!localizedData || localizedData.length === 0) return cards;
  const localizedMap: Record<string, CardData> = {};
  for (const ld of localizedData) {
    localizedMap[ld.code] = ld;
  }
  return cards.map((card) => {
    const ld = localizedMap[card.code];
    if (ld) {
      const { code, ...rest } = ld;
      return { ...card, localized: rest };
    }
    return card;
  });
}

// ---------------------------------------------------------------------------
// insert-starter-info / insert-starter-ids
// ---------------------------------------------------------------------------

function insertStarterInfo(card: CardData): CardData {
  return {
    ...card,
    influencelimit: "∞",
    format: {
      ...card.format,
      standard: { ...card.format?.standard, banned: true },
      startup: { ...card.format?.startup, banned: true },
      throwback: { ...card.format?.throwback, banned: true },
      core: { ...card.format?.core, banned: true },
      eternal: { ...card.format?.eternal, banned: true },
    },
  };
}

function insertStarterIds(cards: CardData[]): CardData[] {
  return cards.map((card) => {
    if (card.title === "The Catalyst: Convention Breaker" || card.title === "The Syndicate: Profit over Principle") {
      return insertStarterInfo(card);
    }
    return card;
  });
}

// ---------------------------------------------------------------------------
// Flip card expansion
// ---------------------------------------------------------------------------

function expandFace(card: CardData, names: Record<string, string>, acc: CardData[], faceKey: string): CardData[] {
  const faces = card.faces as Record<string, CardFace> | undefined;
  if (!faces) return acc;
  const flip = faces[faceKey];
  const updated = {
    ...card,
    title: names[faceKey] ?? flip.title,
    text: flip.text,
    images: flip.images,
  };
  // Remove face-related keys
  delete (updated as Record<string, unknown>).faces;
  delete (updated as Record<string, unknown>).flips;
  delete (updated as Record<string, unknown>).named_faces;
  return [...acc, updated];
}

function expandOneFlip(acc: CardData[], card: CardData): CardData[] {
  const faces = card.faces as Record<string, CardFace> | undefined;
  if (!faces) return acc;
  const namedFaces = (card.named_faces as Record<string, string>) ?? {};
  return Object.keys(faces).reduce((result, faceKey) =>
    expandFace(card, namedFaces, result, faceKey), acc);
}

function generateFlipCards(cards: CardData[]): Record<string, CardData> {
  const flips = cards.filter((c) => c.faces && Object.keys(c.faces).length > 0);
  const modified = flips.reduce(expandOneFlip, [] as CardData[]);
  const sorted = [...modified].sort((a, b) => a.code.localeCompare(b.code));
  return Object.fromEntries(sorted.map((c) => [c.title, c]));
}

// ---------------------------------------------------------------------------
// keys-in / update-nested-images
// ---------------------------------------------------------------------------

function keysIn(m: Record<string, unknown>): string[][] {
  if (typeof m !== "object" || m === null || Array.isArray(m)) return [];
  const result: string[][] = [];
  for (const [k, v] of Object.entries(m)) {
    const sub = keysIn(v as Record<string, unknown>);
    const nested = sub.filter((s) => s.length > 0).map((s) => [k, ...s]);
    if (nested.length > 0) {
      result.push(...nested);
    } else {
      result.push([k]);
    }
  }
  return result;
}

function getNestedValue(obj: Record<string, unknown>, keys: string[]): unknown {
  let current: unknown = obj;
  for (const key of keys) {
    if (typeof current === "object" && current !== null && !Array.isArray(current)) {
      current = (current as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }
  return current;
}

function updateNestedImages(code: string, images: Record<string, unknown>, acc: Record<string, unknown>, nestedKey: string[]): Record<string, unknown> {
  if (code === nestedKey[nestedKey.length - 1]) {
    const value = getNestedValue(images, nestedKey);
    const newKey = [...nestedKey.slice(0, -1), "stock"];
    // Set nested value using the new key path
    let current: Record<string, unknown> = acc;
    for (let i = 0; i < newKey.length - 1; i++) {
      if (!(newKey[i] in current)) current[newKey[i]] = {};
      current = current[newKey[i]] as Record<string, unknown>;
    }
    current[newKey[newKey.length - 1]] = value;
    return acc;
  }
  return acc;
}

function updatePreviousImagePaths(prev: CardData): CardImage {
  const code = prev.code;
  const images = prev.images as Record<string, unknown>;
  const nestedKeys = keysIn(images ?? {});
  const result: Record<string, unknown> = {};
  return nestedKeys.reduce((acc, nestedKey) =>
    updateNestedImages(code, images, acc, nestedKey), result) as unknown as CardImage;
}

// ---------------------------------------------------------------------------
// Previous card expansion
// ---------------------------------------------------------------------------

function expandOne(acc: CardData[], prevCode: string, card: CardData): CardData[] {
  const sets = SetsAtom as Array<{ code?: string; id?: string; name?: string; cycle_code?: string }>;
  const number = strToInt(prevCode.substring(2));
  const setCode = card.set_code ?? "";
  const prevSet = sets.find((s) => s.code === setCode);
  if (!prevSet) return acc;

  const prev: CardData = {
    ...card,
    code: prevCode,
    rotated: true,
    cycle_code: prevSet.cycle_code,
    setname: prevSet.name,
    set_code: prevSet.id,
    number,
    future_version: card.code,
  };
  delete (prev as Record<string, unknown>).previous_versions;
  prev.images = updatePreviousImagePaths(prev);
  return [...acc, prev];
}

function expandPrevious(acc: CardData[], card: CardData): CardData[] {
  const prevVersions = card.previous_versions as string[] | undefined;
  if (!prevVersions) return acc;
  return prevVersions.reduce((result, prevCode) => expandOne(result, prevCode, card), acc);
}

function generatePreviousCards(cards: CardData[]): CardData[] {
  const withPrev = cards.filter((c) => c.previous_versions);
  return withPrev.reduce((acc, c) => expandPrevious(acc, c), [] as CardData[]);
}

// ---------------------------------------------------------------------------
// show-alt-art?
// ---------------------------------------------------------------------------

function showAltArt(allowAllUsers = false): boolean {
  const state = useAppState.getState();
  const showAltArtOpt = state.options.showAltArt ?? true;
  const special = (state.user as { special?: boolean })?.special ?? false;
  return showAltArtOpt && (allowAllUsers || special);
}

// ---------------------------------------------------------------------------
// image-url
// ---------------------------------------------------------------------------

function imageUrl(card: CardData, allowAllUsers = false): string | null {
  const state = useAppState.getState();
  const lang = state.options.cardLanguage as string ?? "en";
  const res = state.options.cardResolution as string ?? "default";
  const art = showAltArt(allowAllUsers)
    ? ((state.options as { altArts?: Record<string, unknown> }).altArts?.[card.code] ?? "stock")
    : "stock";
  const artStr = Array.isArray(art) ? (art[0] as string) : (art as string);
  const artIndex = Array.isArray(art) ? (art[1] as number) : 0;
  const images = imageOrFace(card) as Record<string, unknown>;
  const artUrls = getImagePath(images, lang, res, artStr);
  if (!artUrls || artUrls.length === 0) return null;
  const safeIndex = Math.min(artIndex, artUrls.length - 1);
  return artUrls[safeIndex];
}

// ---------------------------------------------------------------------------
// base-image-url
// ---------------------------------------------------------------------------

function baseImageUrl(card: CardData): string | null {
  const state = useAppState.getState();
  const lang = state.options.cardLanguage as string ?? "en";
  const res = state.options.cardResolution as string ?? "default";
  const art = typeof card.art === "string" ? card.art : "stock";
  const artIndex = card.art_index ?? 0;
  const images = card.images as Record<string, unknown>;
  const paths = getImagePath(images, lang, res, art);
  if (!paths || paths.length === 0) return null;
  return paths[artIndex] ?? null;
}

// ---------------------------------------------------------------------------
// alt-art-name (from account.cljs, used by cardbrowser)
// ---------------------------------------------------------------------------

function altArtName(version: string): string {
  const state = useAppState.getState();
  const altInfos = (state as unknown as Record<string, unknown>)["alt-info"] as AltInfo[] | undefined;
  if (!altInfos) return "Official";
  const alt = altInfos.find((a) => a.version === version);
  return alt?.name ?? "Official";
}

// ---------------------------------------------------------------------------
// alt-version-from-string
// ---------------------------------------------------------------------------

function altVersionFromString(setName: string): string | null {
  const state = useAppState.getState();
  const altInfos = (state as unknown as Record<string, unknown>)["alt-info"] as AltInfo[] | undefined;
  if (!altInfos) return null;
  const alt = altInfos.find((a) => a.name === setName);
  return alt ? alt.version : null;
}

// ---------------------------------------------------------------------------
// card-arts-for-key
// ---------------------------------------------------------------------------

function cardArtsForKey(card: CardData, key: string): CardData[] {
  const state = useAppState.getState();
  const lang = state.options.cardLanguage as string ?? "en";
  const res = state.options.cardResolution as string ?? "default";
  const images = card.images as Record<string, Record<string, Record<string, string[]>>> | undefined;
  let arts: string[] | undefined;
  if (images) {
    const langBlock = images[lang] ?? images.en;
    if (langBlock) {
      const resBlock = langBlock[res] ?? langBlock.default;
      if (resBlock) {
        arts = resBlock[key];
      }
    }
  }
  if (!arts || arts.length === 0) {
    return [{ ...card, art: "", art_index: 0 }];
  }
  return arts.map((_, idx) => ({ ...card, art: key, art_index: idx }));
}

// ---------------------------------------------------------------------------
// expand-alts / insert-alt-arts
// ---------------------------------------------------------------------------

function expandAlts(onlyVersion: string | null, acc: CardData[], card: CardData): CardData[] {
  const state = useAppState.getState();
  const lang = state.options.cardLanguage as string ?? "en";
  const res = state.options.cardResolution as string ?? "default";
  const altInfos = (state as unknown as Record<string, unknown>)["alt-info"] as AltInfo[] | undefined;
  const altVersionsSet = altInfos
    ? new Set(altInfos.map((a) => a.version).filter((v) => v !== "prev"))
    : new Set<string>();
  const altVersions: string[] = Array.from(altVersionsSet);
  const images = card.images as Record<string, Record<string, Record<string, string[]>>> | undefined;
  const langBlock = images?.[lang];
  const mergedImages: Record<string, string[]> = {
    ...(langBlock?.default ?? {}),
    ...(langBlock?.[res] ?? {}),
  };
  const filteredImages = Object.fromEntries(
    Object.entries(mergedImages ?? {}).filter(([k]) => altVersions.includes(k))
  );

  const altOnly = onlyVersion ? altVersionFromString(onlyVersion) : null;
  let filteredKeys: string[] | null;
  if (altOnly === "prev") {
    filteredKeys = null;
  } else if (altOnly) {
    filteredKeys = [altOnly];
  } else {
    filteredKeys = Object.keys(filteredImages);
  }

  if (!filteredKeys || filteredKeys.length === 0 || !showAltArt(true)) {
    return [...acc, card];
  }

  const expanded: CardData[] = [];
  const allKeys = [...filteredKeys, ""];
  for (const fk of allKeys) {
    const arts = cardArtsForKey(card, fk);
    const processed = arts.map((c) => {
      if (c.art !== "") {
        const copy = { ...c };
        delete (copy as Record<string, unknown>).previous_versions;
        return copy;
      }
      return c;
    });
    expanded.push(...processed);
  }
  return [...expanded, ...acc];
}

function insertAltArts(onlyVersion: string | null, cards: CardData[]): CardData[] {
  return [...cards].reverse().reduce((acc, card) => expandAlts(onlyVersion, acc, card), [] as CardData[]);
}

// ---------------------------------------------------------------------------
// expand-flips / insert-flip-arts
// ---------------------------------------------------------------------------

function expandFlips(acc: CardData[], card: CardData): CardData[] {
  const faces = card.faces as Record<string, CardFace> | undefined;
  if (!faces || Object.keys(faces).length === 0) {
    return [...acc, card];
  }
  const namedFaces = (card.named_faces as Record<string, string>) ?? {};
  const expanded = Object.keys(faces).map((faceKey) => {
    const c = { ...card };
    (c as Record<string, unknown>).images = (faces[faceKey] as any).images;
    (c as Record<string, unknown>).title = namedFaces[faceKey] ?? (faces[faceKey] as any).title;
    delete (c as Record<string, unknown>).faces;
    delete (c as Record<string, unknown>).named_faces;
    return c;
  });
  return [...expanded, ...acc];
}

function insertFlipArts(cards: CardData[]): CardData[] {
  return [...cards].reverse().reduce((acc, card) => expandFlips(acc, card), [] as CardData[]);
}

// ---------------------------------------------------------------------------
// post-response
// ---------------------------------------------------------------------------

function postResponse(response: { status: number; json: unknown }): void {
  if (response.status === 200) {
    const newAlts = ((response.json as { altarts?: Record<string, unknown> })?.altarts ?? {}) as Record<string, unknown>;
    const state = useAppState.getState();
    (useAppState as unknown as { setState: (updater: (s: typeof state) => Partial<typeof state>) => void }).setState((s) => ({
      ...s,
      options: {
        ...s.options,
        altArts: newAlts,
      },
    }));
    trNonGameToast(["card-browser_update-success", "Updated Art"], "success", null);
  } else {
    trNonGameToast(["card-browser_update-failure", "Failed to Update Art"], "error", null);
  }
}

// ---------------------------------------------------------------------------
// Alt art selection helpers
// ---------------------------------------------------------------------------

function futureSelectedAltArt(card: CardData): boolean {
  const state = useAppState.getState();
  const selectedAlts = ((state.options as { altArts?: Record<string, unknown> })?.altArts) ?? {};
  const futureCode = card.future_version as string | undefined;
  if (!futureCode) return false;
  const selectedArt = selectedAlts[futureCode];
  return card.code === selectedArt;
}

function previousSelectedAltArt(card: CardData): boolean {
  const state = useAppState.getState();
  const selectedAlts = ((state.options as { altArts?: Record<string, unknown> })?.altArts) ?? {};
  const selectedArt = selectedAlts[card.code];
  return selectedArt === undefined || selectedArt === null;
}

function cardImageProperties(card: CardData): [string | null, number] {
  const baseCardArt = card.art ?? "";
  const cardArt = baseCardArt === "" ? "stock" : baseCardArt;
  return [cardArt, card.art_index ?? 0];
}

function desiredCardImageProperties(code: string): [string, number] {
  const state = useAppState.getState();
  const selectedAlts = ((state.options as { altArts?: Record<string, unknown> })?.altArts) ?? {};
  const selectedAlt = selectedAlts[code] ?? ["stock", 0];
  if (Array.isArray(selectedAlt)) {
    return [selectedAlt[0] as string, selectedAlt[1] as number];
  }
  return [selectedAlt as string, 0];
}

function selectedAltArt(card: CardData): boolean {
  if (card.future_version) return futureSelectedAltArt(card);
  if (card.previous_versions) return previousSelectedAltArt(card);
  const curr = cardImageProperties(card);
  const desired = desiredCardImageProperties(card.code);
  return curr[0] === desired[0] && curr[1] === desired[1];
}

// ---------------------------------------------------------------------------
// select-alt-art
// ---------------------------------------------------------------------------

function selectAltArt(card: CardData): void {
  const isOldCard = !!card.future_version;
  const art = card.art;
  const codeKw = (card.future_version ?? card.code) as string;
  const state = useAppState.getState();
  const alts = ((state.options as { altArts?: Record<string, unknown> })?.altArts) ?? {};
  const altIndex = card.art_index ?? 0;

  let newAlts: Record<string, unknown>;
  if (typeof art === "string") {
    newAlts = { ...alts, [codeKw]: [art, altIndex] };
  } else if (isOldCard) {
    newAlts = { ...alts, [codeKw]: card.code };
  } else {
    const { [codeKw]: _, ...rest } = alts;
    newAlts = rest;
  }

  (useAppState as unknown as { setState: (updater: (s: typeof state) => Partial<typeof state>) => void }).setState((s) => ({
    ...s,
    options: { ...s.options, altArts: newAlts },
  }));

  // Post options to server (mirrors nr.account/post-options)
  const params = { ...state.options };
  POST("/profile", JSON.stringify({ options: params }), "json").then(postResponse);
}

// ---------------------------------------------------------------------------
// text-class-for-status
// ---------------------------------------------------------------------------

function textClassForStatus(status: CardFormatStatus): string {
  if (status.legal) return "legal";
  if (status.rotated) return "casual";
  if (status.banned) return "invalid";
  return "";
}

// ---------------------------------------------------------------------------
// card-as-text
// ---------------------------------------------------------------------------

function cardAsText(card: CardData, showExtraInfo: boolean): React.ReactElement {
  const title = trData("title", card) as string;
  const icon = factionIcon(card.faction, title);
  const uniq = card.uniqueness ? "\u25C6 " : "";
  const keywords = trData("keywords", card) as string | undefined;
  const subtypes = keywords
    ?? (card.subtypes && card.subtypes.length > 0 ? card.subtypes.map((s) => trData("subtypes", { subtypes: [s] }) as string).join(" - ") : undefined)
    ?? (trData("subtype", card) as string | undefined);
  const impl = card.implementation && card.implementation !== "full" ? card.implementation : undefined;

  return (
    <div>
      <h4>
        {uniq}{title} {icon}
        {card.factioncost != null && card.faction && (
          <span
            className={`influence ${slugify(card.faction)}`}
            title={tr(["card-browser_influence", "Influence"], { influence: String(card.factioncost) })}
          >
            {influenceDots(card.factioncost)}
          </span>
        )}
      </h4>
      {card.memoryunits != null && (
        card.memoryunits < 3
          ? <div className={`anr-icon mu${card.memoryunits}`} />
          : <div className="heading">
              {tr(["card-browser_memory", "Memory"], { memory: String(card.memoryunits) })}{" "}
              <span className="anr-icon mu" />
            </div>
      )}
      {card.cost != null && (
        <div className="heading">{tr(["card-browser_cost", "Cost"], { cost: String(card.cost) })}</div>
      )}
      {card.trash != null && (
        <div className="heading">{tr(["card-browser_trash-cost", "Trash cost"], { "trash-cost": String(card.trash) })}</div>
      )}
      {card.strength != null && (
        <div className="heading">{tr(["card-browser_strength", "Strength"], { strength: String(card.strength) })}</div>
      )}
      {card.advancementcost != null && (
        <div className="heading">{tr(["card-browser_advancement", "Advancement requirement"], { requirement: String(card.advancementcost) })}</div>
      )}
      {card.agendapoints != null && (
        <div className="heading">{tr(["card-browser_agenda-points", "Agenda points"], { points: String(card.agendapoints) })}</div>
      )}
      {card.minimumdecksize != null && (
        <div className="heading">{tr(["card-browser_min-deck-size", "Minimum deck size"], { "min-deck-size": String(card.minimumdecksize) })}</div>
      )}
      {card.influencelimit != null && (
        <div className="heading">{tr(["card-browser_inf-limit", "Influence limit"], { "inf-limit": card.influencelimit })}</div>
      )}
      {impl && (
        <div className="heading">{tr(["card-browser_implementation-note", "Implementation note"], { impl })}</div>
      )}
      <div className="text card-body">
        <p>
          <span className="type">{trType(card.type)}</span>
          {subtypes ? `: ${subtypes}` : ""}
        </p>
        <pre>
          {renderSafeHtml(trData("text", (AllCards as Record<string, CardData>)[card.title] ?? card))}
        </pre>
        {showExtraInfo && (
          <>
            <div className="formats">
              {Object.entries(slugToBuildableFormat).map(([k, name]) => {
                const statusRaw = (card.format as Record<string, unknown>)?.[k] ?? "unknown";
                const status = (typeof statusRaw === "object" && statusRaw !== null)
                  ? statusRaw as CardFormatStatus
                  : { legal: statusRaw === "legal" };
                const c = textClassForStatus(status);
                return (
                  <div key={k} className={`format-item ${c}`}>
                    {trFormat(name as string)}
                    {status.banned ? bannedSpan() : null}
                    {status.restricted ? restrictedSpan() : null}
                    {status.rotated ? restrictedSpan() : null}
                    {status.points != null ? deckPointsCardSpan(status.points) : null}
                  </div>
                );
              })}
            </div>
            <div className="pack">
              {card.setname && card.number != null && (
                <span>
                  {trSet(card.setname)} {card.number}
                  {card.art ? ` [${altArtName(card.art)}]` : ""}
                </span>
              )}
            </div>
            {showAltArt() && (
              selectedAltArt(card) ? (
                <div className="selected-alt">{tr(["card-browser_selected-art", "Selected Alt Art"])}</div>
              ) : (card.art || card.previous_versions || card.future_version) ? (
                <button className="alt-art-selector" onClick={() => selectAltArt(card)}>
                  {tr(["card-browser_select-art", "Select Art"])}
                </button>
              ) : null
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// types / factions
// ---------------------------------------------------------------------------

function types(side: string): string[] {
  const runnerTypes = ["Identity", "Program", "Hardware", "Resource", "Event"];
  const corpTypes = ["Agenda", "Asset", "ICE", "Operation", "Upgrade"];
  if (side === "All") return [...runnerTypes, ...corpTypes];
  if (side === "Runner") return [...runnerTypes];
  if (side === "Corp") return ["Identity", ...corpTypes];
  return [...runnerTypes, ...corpTypes];
}

function factions(side: string): string[] {
  const runnerFactions = ["Anarch", "Criminal", "Shaper", "Adam", "Apex", "Sunny Lebeau"];
  const corpFactions = ["Jinteki", "Haas-Bioroid", "NBN", "Weyland Consortium", "Neutral"];
  if (side === "All") return [...runnerFactions, ...corpFactions];
  if (side === "Any Side") return [...runnerFactions, ...corpFactions];
  if (side === "Runner") return [...runnerFactions, "Neutral"];
  if (side === "Corp") return corpFactions;
  return [...runnerFactions, ...corpFactions];
}

// ---------------------------------------------------------------------------
// Filter helpers
// ---------------------------------------------------------------------------

function filterAltArtCards(cards: CardData[]): CardData[] {
  const state = useAppState.getState();
  const lang = state.options.cardLanguage as string ?? "en";
  const res = state.options.cardResolution as string ?? "default";
  return cards.filter((card) => {
    const images = card.images as Record<string, unknown> | undefined;
    const stockRemoved = Object.fromEntries(
      Object.entries((images?.[lang] as Record<string, unknown>)?.[res] ?? {}).filter(([k]) => k !== "stock")
    );
    return (
      Object.keys(stockRemoved).length > 0 ||
      !!card.future_version ||
      !!card.previous_versions
    );
  });
}

function filterAltArtSet(setName: string, cards: CardData[]): CardData[] | null {
  const altKey = altVersionFromString(setName);
  if (!altKey) return null;
  if (altKey === "prev") {
    return cards.filter((c) => !!c.future_version || !!c.previous_versions);
  }
  const state = useAppState.getState();
  const lang = state.options.cardLanguage as string ?? "en";
  const res = state.options.cardResolution as string ?? "default";
  return cards.filter((c) => {
    const images = c.images as Record<string, unknown> | undefined;
    return !!(images?.[lang] as Record<string, unknown>)?.[res]?.[altKey];
  });
}

function filterCards(cards: CardData[], filterValue: string, field: keyof CardData): CardData[] {
  if (filterValue === "All") return cards;
  return cards.filter((c) => String(c[field]) === filterValue);
}

function filterFormat(fmt: string, cards: CardData[]): CardData[] {
  if (fmt === "All") return cards;
  const fmtSlug = buildableFormatToSlug[fmt];
  if (!fmtSlug) return cards;
  return cards.filter((c) => {
    const status = c.format?.[fmtSlug];
    return typeof status === "object" ? !!status.legal : false;
  });
}

function filterTitle(query: string, cards: CardData[]): CardData[] {
  if (!query || query.length === 0) return cards;
  const lcQuery = query.toLowerCase();
  return cards.filter((c) =>
    c.title?.toLowerCase().includes(lcQuery) ||
    (trData("title", c) as string)?.toLowerCase().includes(lcQuery) ||
    (c.normalizedtitle as string)?.includes(lcQuery)
  );
}

function sortField(fieldname: string): (c: CardData) => string | number | (string | number)[] {
  switch (fieldname) {
    case "Name":
      return (c) => c.title;
    case "Influence":
      return (c) => [c.factioncost ?? 0, c.side, c.faction, c.title];
    case "Cost":
      return (c) => [c.cost ?? 0, c.title];
    case "Faction":
      return (c) => [c.side, c.faction, c.title];
    case "Type":
      return (c) => [c.side, c.type, c.faction, c.title];
    case "Set number":
      return (c) => c.number ?? 0;
    default:
      return (c) => c.title;
  }
}

function selectedSetName(state: CardBrowserState): string {
  return state.setFilter.replace(" Cycle", "");
}

// ---------------------------------------------------------------------------
// handle-scroll
// ---------------------------------------------------------------------------

function handleScroll(el: HTMLDivElement, setPage: (fn: (p: number) => number) => void): void {
  const height = el.scrollHeight - el.clientHeight;
  if (el.scrollTop > height - 600) {
    setPage((p) => (p ?? 0) + 1);
  }
}

// ---------------------------------------------------------------------------
// Card View component
// ---------------------------------------------------------------------------

function CardView({
  card,
  state,
  setState,
}: {
  card: CardData;
  state: CardBrowserState;
  setState: React.Dispatch<React.SetStateAction<CardBrowserState>>;
}): React.ReactElement {
  const [showText, setShowText] = useState(false);

  const url = baseImageUrl(card);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setState((prev) => ({
      ...prev,
      selectedCard: prev.selectedCard === card ? null : card,
    }));
  }, [card, setState]);

  let cardClass = "card-preview blue-shade";
  if (state.decorateCard) {
    if (state.selectedCard === card) {
      cardClass += " selected";
    } else if (showAltArt() && selectedAltArt(card)) {
      cardClass += " selected-alt";
    }
  }

  return (
    <div className={cardClass} onClick={handleClick}>
      {(state.selectedCard === card || showText) ? (
        cardAsText(card, true)
      ) : url ? (
        <img
          src={url}
          alt={trData("title", card) as string}
          onError={() => setShowText(true)}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card list view
// ---------------------------------------------------------------------------

function CardListView({
  state,
  scrollTop,
  setScrollTopVal,
  setPage,
  setState,
}: {
  state: CardBrowserState;
  scrollTop: number;
  setScrollTopVal: (n: number) => void;
  setPage: (fn: (p: number) => number) => void;
  setState: React.Dispatch<React.SetStateAction<CardBrowserState>>;
}): React.ReactElement {
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (listRef.current) setScrollTop(listRef.current, scrollTop);
  }, []);

  useEffect(() => {
    return () => {
      if (listRef.current) storeScrollTop(listRef.current, setScrollTopVal);
    };
  }, []);

  const selected = selectedSetName(state);
  const selectedCycle = slugify(selected);
  const allCardsList = Object.values(AllCards as Record<string, CardData>).sort((a, b) => a.code.localeCompare(b.code));
  const prevCards = (useAppState.getState() as unknown as Record<string, unknown>)["previous-cards"] as CardData[] ?? [];
  const combinedCards = [...allCardsList, ...prevCards];

  let altFilter: string | null = null;
  let cards: CardData[];

  if (selected === "All") {
    cards = combinedCards;
  } else if (selected === "Alt Art") {
    cards = filterAltArtCards(combinedCards);
  } else if (state.setFilter.endsWith(" Cycle")) {
    cards = combinedCards.filter((c) => c.cycle_code === selectedCycle);
  } else {
    const setNames = SetsAtom as unknown as SetData[];
    const isKnownSet = setNames.some((s) => s.name === selected);
    if (!isKnownSet) {
      const result = filterAltArtSet(selected, combinedCards);
      altFilter = selected;
      cards = result ?? [];
    } else {
      cards = combinedCards.filter((c) => c.setname === selected);
    }
  }

  // Apply filters
  cards = filterCards(cards, state.sideFilter, "side");
  cards = filterCards(cards, state.factionFilter, "faction");
  cards = filterCards(cards, state.typeFilter, "type");
  cards = filterFormat(state.formatFilter, cards);
  cards = filterTitle(state.searchQuery, cards);
  cards = insertFlipArts(cards);
  cards = insertAltArts(altFilter, cards);
  cards.sort((a, b) => {
    const sf = sortField(state.sortField);
    const va = sf(a);
    const vb = sf(b);
    if (Array.isArray(va) && Array.isArray(vb)) {
      for (let i = 0; i < Math.max(va.length, vb.length); i++) {
        const ca = String(va[i] ?? "");
        const cb = String(vb[i] ?? "");
        if (ca < cb) return -1;
        if (ca > cb) return 1;
      }
      return 0;
    }
    return String(va).localeCompare(String(vb));
  });

  const visible = cards.slice(0, (state.page) * 28);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const height = el.scrollHeight - el.clientHeight;
    if (el.scrollTop > height - 600) {
      setPage((p) => (p ?? 0) + 1);
    }
  }, [setPage]);

  return (
    <div className="card-list" ref={listRef} onScroll={handleScroll}>
      {visible.map((card) => (
        <CardView
          key={`${baseImageUrl(card) ?? ""}-${card.code}-${card.art ?? "stock"}-${card.art_index ?? 0}`}
          card={card}
          state={state}
          setState={setState}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// handle-search
// ---------------------------------------------------------------------------

function handleSearch(e: React.ChangeEvent<HTMLInputElement>, setState: React.Dispatch<React.SetStateAction<CardBrowserState>>) {
  setState((prev) => ({
    ...prev,
    setFilter: "All",
    typeFilter: "All",
    factionFilter: "All",
    sortField: "Faction",
    searchQuery: e.target.value,
  }));
}

// ---------------------------------------------------------------------------
// query-builder
// ---------------------------------------------------------------------------

function QueryBuilder({
  state,
  setState,
}: {
  state: CardBrowserState;
  setState: React.Dispatch<React.SetStateAction<CardBrowserState>>;
}): React.ReactElement {
  return (
    <div className="search-box">
      <span className="e search-icon" dangerouslySetInnerHTML={{ __html: "&#xe822;" }} />
      {state.searchQuery && (
        <span
          className="e search-clear"
          dangerouslySetInnerHTML={{ __html: "&#xe819;" }}
          onClick={() => setState((prev) => ({ ...prev, searchQuery: "" }))}
        />
      )}
      <input
        className="search"
        type="text"
        placeholder={tr(["card-browser-form_search-hint", "Search cards"])}
        value={state.searchQuery}
        onChange={(e) => handleSearch(e, setState)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// sort-by-builder
// ---------------------------------------------------------------------------

function SortByBuilder({
  state,
  setState,
}: {
  state: CardBrowserState;
  setState: React.Dispatch<React.SetStateAction<CardBrowserState>>;
}): React.ReactElement {
  return (
    <div>
      <h4>{tr(["card-browser-form_sort", "Sort by"])}</h4>
      <select
        value={state.sortField}
        onChange={(e) => setState((prev) => ({ ...prev, sortField: e.target.value }))}
      >
        {["Faction", "Name", "Type", "Influence", "Cost", "Set number"].map((field) => (
          <option key={field} value={field}>
            {tr(["card-browser-form_sort-by", field], { by: cleanInput(field) })}
          </option>
        ))}
      </select>
    </div>
  );
}

// ---------------------------------------------------------------------------
// dropdown-builder
// ---------------------------------------------------------------------------

function DropdownBuilder({
  state,
  setState,
}: {
  state: CardBrowserState;
  setState: React.Dispatch<React.SetStateAction<CardBrowserState>>;
}): React.ReactElement {
  const sets = SetsAtom as Array<{ code: string; id: string; name: string; cycle_code?: string; bigbox?: boolean; size?: number; position?: number }>;
  const cycles = CyclesAtom as Array<{ name: string; code: string; position?: number; size?: number }>;

  const cyclesListAll = cycles.map((c) => ({
    ...c,
    name: `${c.name} Cycle`,
    cycle_position: c.position ?? 0,
    position: 0,
    indent: false,
  }));
  const cyclesList = cyclesListAll.filter((c) => c.size !== 1);
  const setsList = sets.map((s) => {
    if (!s.bigbox && s.id !== s.cycle_code) {
      return { ...s, indent: true };
    }
    return { ...s, indent: false };
  });
  const setNames = [...cyclesList, ...setsList].sort((a, b) => {
    const pa = (a as unknown as { cycle_position?: number }).cycle_position ?? 0;
    const pb = (b as unknown as { cycle_position?: number }).cycle_position ?? 0;
    if (pa !== pb) return pa - pb;
    return ((a as unknown as { position?: number }).position ?? 0) - ((b as unknown as { position?: number }).position ?? 0);
  });

  const altInfos = (useAppState.getState() as unknown as Record<string, unknown>)["alt-info"] as Array<{ version: string; name: string; position?: number; description?: string }> | undefined;
  const altArtSets = altInfos
    ? [...altInfos].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)).map((a) => ({ ...a, indent: true }))
    : [];
  if (showAltArt(true)) {
    altArtSets.unshift({ name: "Alt Art" as string, version: "" as string, indent: true });
  }

  const setsToDisplay = showAltArt(true) ? [...setNames, ...altArtSets] : setNames;
  const formats = Object.keys(slugToBuildableFormat);

  return (
    <div>
      <div>
        <h4>{tr(["card-browser-form_format", "Format"])}</h4>
        <select
          value={state.formatFilter}
          onChange={(e) => setState((prev) => ({ ...prev, formatFilter: e.target.value }))}
        >
          {["All", ...formats].map((opt) => (
            <option key={opt} value={opt}>{trFormat(opt)}</option>
          ))}
        </select>
      </div>

      <div>
        <h4>{tr(["card-browser_set", "Set"])}</h4>
        <select
          value={state.setFilter}
          onChange={(e) => setState((prev) => ({ ...prev, setFilter: e.target.value }))}
        >
          {[{ name: "All", indent: false }, ...setsToDisplay].map(({ name, indent }) => (
            <option key={name} value={name}>
              {indent ? `• ${trSet(name as string)}` : trSet(name as string)}
            </option>
          ))}
        </select>
      </div>

      <div>
        <h4>{tr(["card-browser-form_side", "Side"])}</h4>
        <select
          value={state.sideFilter}
          onChange={(e) => setState((prev) => ({ ...prev, sideFilter: e.target.value }))}
        >
          {["All", "Corp", "Runner"].map((opt) => (
            <option key={opt} value={opt}>{trSide(opt)}</option>
          ))}
        </select>
      </div>

      <div>
        <h4>{tr(["card-browser-form_faction", "Faction"])}</h4>
        <select
          value={state.factionFilter}
          onChange={(e) => setState((prev) => ({ ...prev, factionFilter: e.target.value }))}
        >
          {["All", ...factions(state.sideFilter)].map((opt) => (
            <option key={opt} value={opt}>{trFaction(opt)}</option>
          ))}
        </select>
      </div>

      <div>
        <h4>{tr(["card-browser-form_type", "Type"])}</h4>
        <select
          value={state.typeFilter}
          onChange={(e) => setState((prev) => ({ ...prev, typeFilter: e.target.value }))}
        >
          {["All", ...types(state.sideFilter)].map((opt) => (
            <option key={opt} value={opt}>{trType(opt)}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// clear-filters
// ---------------------------------------------------------------------------

function ClearFilters({
  setState,
}: {
  setState: React.Dispatch<React.SetStateAction<CardBrowserState>>;
}): React.ReactElement {
  return (
    <p>
      <button
        key="clear-filters"
        onClick={() =>
          setState({
            searchQuery: "",
            sortField: "Faction",
            formatFilter: "All",
            setFilter: "All",
            typeFilter: "All",
            sideFilter: "All",
            factionFilter: "All",
            page: 1,
            decorateCard: true,
            selectedCard: null,
          })
        }
      >
        {tr(["card-browser_clear", "Clear"])}
      </button>
    </p>
  );
}

// ---------------------------------------------------------------------------
// art-info
// ---------------------------------------------------------------------------

function ArtInfo({
  state,
}: {
  state: CardBrowserState;
}): React.ReactElement | null {
  if (!state.selectedCard || !state.selectedCard.art) return null;

  const art = state.selectedCard.art;
  const altInfos = (useAppState.getState() as unknown as Record<string, unknown>)["alt-info"] as AltInfo[] | undefined;
  const info = altInfos?.find((a) => a.version === art);
  if (!info) return null;

  const blurb = info["artist-blurb"];
  const about = info["artist-about"];
  const link = info["artist-link"];

  if (!blurb) return null;

  return (
    <div className="panel green-shade artist-blurb">
      <h4>{tr(["card-browser_artist-info", "Artist Info"])}</h4>
      <div>{blurb}</div>
      {about && about !== blurb && <div>{about}</div>}
      {link && (
        <a href={link}>{tr(["card-browser_more-info", "More Info"])}</a>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card Browser (main component)
// ---------------------------------------------------------------------------

export default function CardBrowserPage(): React.ReactElement {
  const [state, setState] = useState<CardBrowserState>({
    searchQuery: "",
    sortField: "Faction",
    formatFilter: "All",
    setFilter: "All",
    typeFilter: "All",
    sideFilter: "All",
    factionFilter: "All",
    page: 1,
    decorateCard: true,
    selectedCard: null,
  });

  const [scrollTop, setScrollTopVal] = useState(0);

  return (
    <div id="cardbrowser" className="cardbrowser">
      <div className="cardbrowser-bg" />
      <div className="card-info">
        <div className="blue-shade panel filters">
          <QueryBuilder state={state} setState={setState} />
          <SortByBuilder state={state} setState={setState} />
          <DropdownBuilder state={state} setState={setState} />
          <ClearFilters setState={setState} />
        </div>
        <ArtInfo state={state} />
      </div>
      <CardListView
        state={state}
        scrollTop={scrollTop}
        setScrollTopVal={setScrollTopVal}
        setPage={(fn) => setState((prev) => ({ ...prev, page: fn(prev.page) }))}
        setState={setState}
      />
    </div>
  );
}
