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

import { altArtName, altVersionFromString, baseImageUrl, insertAltArts, insertFlipArts, selectAltArt, selectedAltArt, showAltArt } from './cardbrowser_1';
import type { AltInfo, CardBrowserState, CardData, CardFormatStatus, SetData } from './cardbrowser_1';

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
          {renderSafeHtml(String(trData("text", (AllCards as Record<string, CardData>)[card.title] ?? card) ?? "")) as React.ReactNode}
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
    const langLevel = images?.[lang] as Record<string, Record<string, unknown>> | undefined;
    return !!langLevel?.[res]?.[altKey];
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

export function sortField(fieldname: string): (c: CardData) => string | number | (string | number)[] {
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
