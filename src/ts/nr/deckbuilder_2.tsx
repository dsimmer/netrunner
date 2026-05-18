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
import { onWSEvent, wsSend } from "./ws";

import { ALL_FACTIONS_FILTER, ALL_FORMATS_FILTER, ALL_SIDES_FILTER, CardLineElement, cardCostHtml, cardCount, cardInfluenceHtml, deckDate, deckInfluenceHtml, deckName, deckPointsSpan, deckStatusText, deckToStr, factions, filterCards, filterFormat, filterLocked, filterSide, idInfluenceLimit, imageUrl, influenceCount, lookup, lookupIdentityByCode, lookupIdentityByTitle, nameCopy, noInfCost, parseDeckString, processCardsInDeck, sideIdentities } from './deckbuilder_1';
import type { CardData, Deck, DeckLine, ParsedDeckLine } from './deckbuilder_1';

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

  const cardTypes = useMemo<string[]>(() => {
    const types = new Set<string>(
      allCards.map(c => c.type).filter((t): t is string => !!t),
    );
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

// ---------------------------------------------------------------------------
// NRDB import modal (mirrors import-deck-modal + send-import in deckbuilder.cljs)
// ---------------------------------------------------------------------------

function ImportDeckModal({ onClose }: { onClose: () => void }): React.ReactElement {
  const [input, setInput] = useState("");

  function sendImport() {
    if (!input.trim()) return;
    // Mirrors (ws/ws-send! [:decks/import {:input msg}])
    wsSend("decks/import", { input });
    onClose();
  }

  return (
    <div className="modal fade" style={{ display: "block" }}>
      <div className="modal-dialog">
        {trElement("h3", [
          "deck-builder_import-title",
          "Enter a Public NRDB Deck ID or URL",
        ])}
        <p>
          <input
            className="url"
            type="text"
            id="nrdb-input"
            data-i18n-key="deck-builder_import-placeholder"
            placeholder={tr(["deck-builder_import-placeholder", "NRDB ID"])}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => {
              if (e.charCode === 13) sendImport();
            }}
          />
        </p>
        <p className="float-right">
          <button
            disabled={!input.trim()}
            className={!input.trim() ? "disabled" : ""}
            onClick={sendImport}
          >
            {trSpan(["deck-builder_import", "Import"])}
          </button>
          <button onClick={onClose}>
            {trSpan(["deck-builder_cancel", "Cancel"])}
          </button>
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Multi-deck delete confirmation modal (mirrors delete-confirm-modal)
// ---------------------------------------------------------------------------

function DeleteConfirmModal({
  deckCount,
  onConfirm,
  onClose,
}: {
  deckCount: number;
  onConfirm: () => void;
  onClose: () => void;
}): React.ReactElement {
  return (
    <div className="modal fade" style={{ display: "block" }}>
      <div className="modal-dialog">
        <h3>
          {tr(
            ["deck-builder_confirm-delete-multiple", "Delete {{cnt}} decks?"],
            { cnt: String(deckCount) },
          )}
        </h3>
        <p>{tr(["deck-builder_cannot-be-undone", "This cannot be undone."])}</p>
        <p className="float-right">
          <button
            className="delete"
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {tr(["deck-builder_delete", "Delete"])}
          </button>
          <button onClick={onClose}>
            {tr(["deck-builder_cancel", "Cancel"])}
          </button>
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bulk deck deletion helpers (mirrors execute-bulk-deck-deletion +
// format-deletion-feedback in deckbuilder.cljs)
// ---------------------------------------------------------------------------

interface BulkDeleteResult {
  successful: string[];
  failed: Array<{ id: string; reason: string; message: string }>;
}

async function executeBulkDeckDeletion(
  deckIds: string[],
): Promise<BulkDeleteResult> {
  try {
    const response = await POST(
      "/data/decks-bulk-delete",
      { "deck-ids": deckIds },
      "json",
    );
    if (response.status === 200) {
      const results = (response.json as Array<{
        id: string;
        status: string;
        error?: string;
      }>) ?? [];
      return {
        successful: results
          .filter((r) => r.status === "deleted")
          .map((r) => r.id),
        failed: results
          .filter((r) => r.status !== "deleted")
          .map((r) => ({
            id: r.id,
            reason: r.status === "unauthorized" ? "unauthorized" : "unknown",
            message: r.error ?? "",
          })),
      };
    }
    return {
      successful: [],
      failed: deckIds.map((id) => ({
        id,
        reason: "http-error",
        message: `HTTP ${response.status}`,
      })),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      successful: [],
      failed: deckIds.map((id) => ({
        id,
        reason: "client-error",
        message: `Error: ${msg}`,
      })),
    };
  }
}

function formatDeletionFeedback(
  successCount: number,
  failedCount: number,
): { message: string; type: "success" | "error" | "warning" } {
  if (failedCount === 0) {
    return {
      message: tr(
        ["deck-builder_deleted-decks-success", "Deleted {{cnt}} decks"],
        { cnt: String(successCount) },
      ),
      type: "success",
    };
  }
  return {
    message: tr(
      [
        "deck-builder_deletion-success-and-or-failure",
        "{{success}} deleted, {{failed}} failed",
      ],
      { success: String(successCount), failed: String(failedCount) },
    ),
    type: successCount === 0 ? "error" : "warning",
  };
}

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
  // Mirrors :cleanup-mode and :selected-decks in deckbuilder.cljs
  const [cleanupMode, setCleanupMode] = useState(false);
  const [selectedDecks, setSelectedDecks] = useState<Set<string>>(new Set());
  const [showImportModal, setShowImportModal] = useState(false);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Authentication check
  const user = useAppState((s) => s.user);
  if (!user) {
    return <div>{tr(["deck-builder_must-login", "You must be logged in to use the deck builder."])}</div>;
  }

  // Fetch decks on mount
  useEffect(() => {
    (async () => {
      try {
        const response = await GET("/data/decks");
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
      // Mirrors decks/import-success and decks/import-failure broadcasts
      "decks/import-success": () => {
        nonGameToast(
          tr(["deck-builder_import-success", "Imported"]),
          "success",
        );
        // refresh deck list
        GET("/data/decks").then((r) => {
          if (r.status === 200 && Array.isArray(r.json)) {
            const refreshed = (r.json as Deck[]).map((d) => ({
              ...d,
              side: d.identity?.side ?? "",
            }));
            setDecks(refreshed as unknown[]);
          }
        });
      },
      "decks/import-failure": (data) => {
        const msg =
          typeof data === "string"
            ? data
            : tr([
                "deck-builder_import-failed",
                "Failed to import deck.",
              ]);
        nonGameToast(msg, "error");
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

  // Mirrors delete-selected-decks! in deckbuilder.cljs
  const runBulkDelete = useCallback(async () => {
    if (selectedDecks.size === 0) return;
    setDeleting(true);
    // Mirrors (set! (.-onbeforeunload js/window) ...) warning during deletion
    const prevBeforeUnload = window.onbeforeunload;
    window.onbeforeunload = () =>
      tr([
        "deck-builder_deletion-in-progress",
        "Deck deletion in progress. Please wait.",
      ]);

    try {
      const ids = Array.from(selectedDecks);
      const result = await executeBulkDeckDeletion(ids);
      const successSet = new Set(result.successful.map(String));
      if (successSet.size > 0) {
        setDecks(
          (decks as Deck[]).filter(
            (d) => !successSet.has(String(d._id)),
          ) as unknown[],
        );
      }
      const feedback = formatDeletionFeedback(
        result.successful.length,
        result.failed.length,
      );
      nonGameToast(feedback.message, feedback.type);
    } finally {
      window.onbeforeunload = prevBeforeUnload;
      setDeleting(false);
      setSelectedDecks(new Set());
      setCleanupMode(false);
    }
  }, [selectedDecks, decks, setDecks]);

  // Mirrors clear-deck-stats: DELETE /profile/stats/deck/:id
  const clearDeckStats = useCallback(
    async (deck: Deck) => {
      if (!deck._id) return;
      authenticated(async () => {
        const response = await DELETE(
          `/profile/stats/deck/${deck._id}`,
        );
        if (response.status === 200) {
          const cleared = { ...deck, stats: undefined };
          setDecks(
            (decks as Deck[]).map((d) =>
              String(d._id) === String(deck._id) ? cleared : d,
            ) as unknown[],
          );
          nonGameToast(
            tr([
              "deck-builder_deck-stats-cleared",
              "Deck stats cleared",
            ]),
            "success",
          );
        } else {
          nonGameToast(
            tr([
              "deck-builder_clear-stats-failed",
              "Failed to clear deck stats",
            ]),
            "error",
          );
        }
      });
    },
    [decks, setDecks],
  );

  // Toggle a deck in the selected-for-deletion set
  const toggleSelected = useCallback((id: string) => {
    setSelectedDecks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Handlers
  const handleDeleteDeck = useCallback(async (deck: Deck) => {
    if (!deck._id) return;
    const confirmed = window.confirm(
      tr(["deck-builder_confirm-delete", "Are you sure you want to delete this deck?"])
    );
    if (!confirmed) return;

    try {
      const response = await DELETE(`/data/decks/${deck._id}`);
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
      const response = await PUT("/data/decks", deck as unknown as Record<string, unknown>, "json");
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
      const response = await POST("/data/decks", deck as unknown as Record<string, unknown>, "json");
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
  const renderDeckItem = (deck: Deck) => {
    const id = String(deck._id);
    return (
      <div key={id} className="deck-item">
        {cleanupMode && (
          <input
            type="checkbox"
            checked={selectedDecks.has(id)}
            onChange={() => toggleSelected(id)}
            disabled={!!deck.locked || deleting}
          />
        )}
        <div className="deck-item-info">
          <span className="deck-item-name">{deckName(deck)}</span>
          <span className="deck-item-date">{deckDate(deck)}</span>
        </div>
        <div className="deck-item-actions">
          <button
            className="btn btn-sm"
            onClick={() => setEditingDeck(deck)}
            disabled={!!deck.locked || cleanupMode}
          >
            {tr(["deck-builder_edit", "Edit"])}
          </button>
          <button
            className="btn btn-sm"
            onClick={() => handleDuplicateDeck(deck)}
            disabled={cleanupMode}
          >
            {tr(["deck-builder_duplicate", "Duplicate"])}
          </button>
          {deck.stats != null && (
            <button
              className="btn btn-sm"
              onClick={() => clearDeckStats(deck)}
              disabled={cleanupMode}
            >
              {tr(["deck-builder_clear-stats", "Clear Stats"])}
            </button>
          )}
          <button
            className="btn btn-sm btn-danger"
            onClick={() => handleDeleteDeck(deck)}
            disabled={!!deck.locked || cleanupMode}
          >
            {tr(["deck-builder_delete", "Delete"])}
          </button>
        </div>
      </div>
    );
  };

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
        <button
          className="btn"
          onClick={() => setShowNewDeck(true)}
          disabled={cleanupMode}
        >
          {tr(["deck-builder_new-deck", "New Deck"])}
        </button>
        <button
          className="btn"
          onClick={() => setShowImportModal(true)}
          disabled={cleanupMode}
        >
          {tr(["deck-builder_import-nrdb", "Import from NRDB"])}
        </button>
        {!cleanupMode ? (
          <button
            className="btn"
            onClick={() => setCleanupMode(true)}
          >
            {tr(["deck-builder_cleanup", "Cleanup"])}
          </button>
        ) : (
          <>
            <button
              className="btn btn-danger"
              disabled={selectedDecks.size === 0 || deleting}
              onClick={() => setShowBulkDeleteConfirm(true)}
            >
              {tr(
                ["deck-builder_delete-selected", "Delete Selected ({{cnt}})"],
                { cnt: String(selectedDecks.size) },
              )}
            </button>
            <button
              className="btn"
              onClick={() => {
                setCleanupMode(false);
                setSelectedDecks(new Set());
              }}
              disabled={deleting}
            >
              {tr(["deck-builder_cancel", "Cancel"])}
            </button>
          </>
        )}
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
      {showImportModal && (
        <ImportDeckModal onClose={() => setShowImportModal(false)} />
      )}
      {showBulkDeleteConfirm && (
        <DeleteConfirmModal
          deckCount={selectedDecks.size}
          onConfirm={runBulkDelete}
          onClose={() => setShowBulkDeleteConfirm(false)}
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
      notes: parsedDeck.notes ?? undefined,
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
