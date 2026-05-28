// Card-to-string formatting.
// Mirrors: src/clj/game/core/to-string.clj

import type { GameState } from "./state";
import type { Card, Zone } from "./card";
import { getTitle, corp, ice, rezzed, installed, cardIndex } from "./card";
import { getCard } from "./finding";
import { isCentral } from "./servers";


// ---------------------------------------------------------------------------
// zone -> name helpers (mirrors zone->name in servers.clj)
// ---------------------------------------------------------------------------

/** Mirrors remote->name in servers.clj */
function remoteToName(zone: Zone): string | null {
  const kw = Array.isArray(zone) ? zone[zone.length - 1] : zone;
  const s = String(kw);
  if (s.startsWith("remote")) {
    const num = s.replace("remote", "");
    return `Server ${num}`;
  }
  return null;
}

/** Mirrors central->name in servers.clj */
function centralToName(zone: Zone): string | null {
  const kw = Array.isArray(zone) ? zone[zone.length - 1] : zone;
  switch (kw) {
    case "hand":
    case "hq":
      return "HQ";
    case "deck":
    case "rd":
      return "R&D";
    case "discard":
    case "archives":
      return "Archives";
    default:
      return null;
  }
}

/** Mirrors zone->name in servers.clj */
function zoneToName(zone: Zone): string | null {
  return centralToName(zone) ?? remoteToName(zone);
}

/** Mirrors is-root? in servers.clj */
function isRoot(zone: Zone): boolean {
  const second = zone[1];
  const last = zone[zone.length - 1];
  if (!second || last !== "content") return false;
  // Check if second element is a central server
  return isCentral(second);
}

// ---------------------------------------------------------------------------
// Card string formatting
// ---------------------------------------------------------------------------

interface CardStrOpts {
  visible?: boolean;
  maybeVisible?: boolean;
  noIcon?: boolean;
}

/**
 * Format a card for display in messages/logs.
 * Mirrors `card-str` in to-string.clj.
 */
export function cardStr(
  state: GameState,
  card: Card | null,
  opts?: CardStrOpts,
): string {
  if (!card) return "";

  const { visible, maybeVisible } = opts ?? {};
  const { zone, host, facedown } = card;

  if (corp(card)) {
    const installedIce = ice(card) && installed(card);
    let title: string;
    if (rezzed(card) || card.seen || visible) {
      title = getTitle(card) ?? "";
    } else if (maybeVisible) {
      title = `facedown ${getTitle(card) ?? ""}`;
    } else {
      title = installedIce ? "ice" : "a card";
    }

    // Hosted cards do not need "in server 1" messages, host has them
    if (!host) {
      let prefix: string;
      const safeZone = zone ?? [];
      if (installedIce) {
        prefix = " protecting ";
      } else if (isRoot(safeZone)) {
        prefix = " in the root of ";
      } else {
        prefix = " in ";
      }

      const zoneName = zoneToName(safeZone.length >= 2 ? safeZone.slice(1) : safeZone);
      title += prefix + (zoneName ?? "");

      if (installedIce) {
        const idx = cardIndex(state, card);
        if (idx !== undefined) {
          title += ` at position ${idx}`;
        }
      }
    }

    if (host) {
      title += ` hosted on ${cardStr(state, getCard(state, host))}`;
    }
    return title;
  } else {
    // Runner card
    const result = facedown || visible ? "a facedown card" : (getTitle(card) ?? "");
    if (host) {
      return `${result} hosted on ${cardStr(state, getCard(state, host))}`;
    }
    return result;
  }
}
