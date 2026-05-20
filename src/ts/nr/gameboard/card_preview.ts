// Card hover/zoom preview utilities.
// Mirrors: src/cljs/nr/gameboard/card_preview.cljs

import { useAppState } from "../appstate";
import type { Card } from '../../types';


// ---------------------------------------------------------------------------
// Zoom channel (mirrors CLJS `zoom-channel`, a core.async chan)
// In TS we use a callback-based approach instead of core.async.
// ---------------------------------------------------------------------------

let _zoomCallback: ((value: unknown) => void) | null = null;

export function setZoomChannelCallback(callback: (value: unknown) => void): void {
  _zoomCallback = callback;
}

export function zoomChannelPut(value: unknown): void {
  _zoomCallback?.(value);
}

// ---------------------------------------------------------------------------
// DOM helpers (mirrors CLJS `safe-get-attribute`, `get-card-data-title`)
// ---------------------------------------------------------------------------

function safeGetAttribute(target: HTMLElement, attribute: string): string | null {
  if (target && typeof target.getAttribute === "function") {
    return target.getAttribute(attribute);
  }
  return null;
}

/**
 * Extract the data-card-title from the event target or its first child.
 * Mirrors CLJS `get-card-data-title`.
 */
export function getCardDataTitle(e: React.MouseEvent): string | null {
  const target = e.target as HTMLElement;
  let title = safeGetAttribute(target, "data-card-title");
  if (!title && target.tagName === "BUTTON") {
    const firstChild = target.firstChild as HTMLElement | null;
    if (firstChild) {
      title = safeGetAttribute(firstChild, "data-card-title");
    }
  }
  return title || null;
}

// ---------------------------------------------------------------------------
// Card data helpers (mirrors CLJS `put-game-card-in-channel`)
// ---------------------------------------------------------------------------

/**
 * Look up a card in all-cards-and-flips and merge with game card data,
 * then put the result on the zoom channel.
 * Mirrors CLJS `put-game-card-in-channel`.
 */
export function putGameCardInChannel(card: { title?: string; "printed-title"?: string } & Record<string, unknown>): void {
  const appState = useAppState.getState() as unknown as Record<string, unknown>;
  const allCards = appState["all-cards-and-flips"] as Record<string, Record<string, unknown>> | undefined;
  const cardKey = card.title ?? card["printed-title"];
  if (cardKey && allCards) {
    const serverCard = allCards[cardKey];
    if (serverCard) {
      zoomChannelPut({ ...serverCard, ...card });
      return;
    }
  }
  zoomChannelPut(card);
}

// ---------------------------------------------------------------------------
// Mouse event handlers (mirrors CLJS `card-preview-mouse-over/out`,
//   `card-highlight-mouse-over/out`)
// ---------------------------------------------------------------------------

/**
 * Mouse-over handler for card preview. Looks up the card title from the
 * event target and sends it on the zoom channel.
 * Mirrors CLJS `card-preview-mouse-over`.
 */
export function cardPreviewMouseOver(e: React.MouseEvent): void {
  e.preventDefault();
  const title = getCardDataTitle(e);
  if (title) {
    const appState = useAppState.getState() as unknown as Record<string, unknown>;
    const allCards = appState["all-cards-and-flips"] as Record<string, Record<string, unknown>> | undefined;
    const card = allCards?.[title];
    if (card) {
      zoomChannelPut(card);
    }
  }
}

/**
 * Mouse-out handler for card preview. Clears the zoom channel.
 * Mirrors CLJS `card-preview-mouse-out`.
 */
export function cardPreviewMouseOut(e: React.MouseEvent): void {
  e.preventDefault();
  const title = getCardDataTitle(e);
  if (title) {
    zoomChannelPut(false);
  }
}

/**
 * Mouse-over handler for card highlight preview. Sends the card cid on the
 * zoom channel.
 * Mirrors CLJS `card-highlight-mouse-over`.
 */
export function cardHighlightMouseOver(e: React.MouseEvent, value: { cid?: string } & Record<string, unknown>): void {
  e.preventDefault();
  if (value.cid) {
    zoomChannelPut({ cid: value.cid });
  }
}

/**
 * Mouse-out handler for card highlight preview. Clears the zoom channel.
 * Mirrors CLJS `card-highlight-mouse-out`.
 */
export function cardHighlightMouseOut(e: React.MouseEvent, value: { cid?: string } & Record<string, unknown>): void {
  e.preventDefault();
  if (value.cid) {
    zoomChannelPut(false);
  }
}
