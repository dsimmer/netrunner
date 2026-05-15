// Utility functions for working with servers and zones
// Mirrors: src/clj/game/core/servers.clj

import { getZone, type Card, type Zone } from "./card";
import { stringToNum } from "../utils";

// ---------------------------------------------------------------------------
// Server identification
// ---------------------------------------------------------------------------

/**
 * Returns the server keyword corresponding to the target of a run.
 * Mirrors `target-server`.
 */
export function targetServer(run: { server?: Zone | null }): string | undefined {
  return run?.server?.[0];
}

/**
 * Converts a remote server number to its display name.
 * Mirrors `remote-num->name`.
 */
export function remoteNumToName(num: number | string): string {
  return `Server ${num}`;
}

// ---------------------------------------------------------------------------
// Zone -> name conversions
// ---------------------------------------------------------------------------

/**
 * Converts a remote zone to a string like "Server 1".
 * Mirrors `remote->name`.
 */
export function remoteToName(zone: unknown): string | null {
  const kw = Array.isArray(zone) ? zone[zone.length - 1] : zone;
  const s = String(kw);
  if (s.startsWith(":remote")) {
    const parts = s.split(":remote");
    const num = parts[parts.length - 1];
    return remoteNumToName(num);
  }
  if (s.startsWith("remote")) {
    const num = s.replace("remote", "");
    return remoteNumToName(num);
  }
  return null;
}

/**
 * Converts a central zone keyword (or zone vector ending in one) to its
 * display string. Mirrors `central->name`.
 */
export function centralToName(zone: unknown): string | null {
  const kw = Array.isArray(zone) ? zone[zone.length - 1] : zone;
  const s = String(kw).replace(/^:/, "").toLowerCase();
  switch (s) {
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

/**
 * Converts a zone to a human-readable string.
 * Mirrors `zone->name`.
 */
export function zoneToName(zone: unknown): string | null {
  return centralToName(zone) ?? remoteToName(zone);
}

/**
 * Gets a string representation for the given zone, with side-aware naming.
 * Mirrors `name-zone`.
 */
export function nameZone(side: string, zone: unknown): string {
  const s = String(side).toLowerCase().replace(/^:/, "");
  const normalizedSide = s === "corp" ? "Corp" : s === "runner" ? "Runner" : side;
  const z = Array.isArray(zone) ? [...zone] : [zone];
  const normalized = z.map((k) => String(k).replace(/^:/, "").toLowerCase());

  if (normalized.length === 1 && normalized[0] === "hand") {
    return normalizedSide === "Runner" ? "the Grip" : "HQ";
  }
  if (normalized.length === 1 && normalized[0] === "discard") {
    return normalizedSide === "Runner" ? "the Heap" : "Archives";
  }
  if (normalized.length === 1 && normalized[0] === "deck") {
    return normalizedSide === "Runner" ? "the Stack" : "R&D";
  }
  if (normalized.length === 1 && normalized[0] === "set-aside") {
    return "set-aside cards";
  }
  if (normalized[0] === "rig") {
    return "Rig";
  }
  if (normalized.length >= 2 && normalized[0] === "servers" && normalized[1] === "hq") {
    return "the root of HQ";
  }
  if (normalized.length >= 2 && normalized[0] === "servers" && normalized[1] === "rd") {
    return "the root of R&D";
  }
  if (normalized.length >= 2 && normalized[0] === "servers" && normalized[1] === "archives") {
    return "the root of Archives";
  }
  // Fall back to zone->name on the second element
  return zoneToName(normalized[1]) ?? String(normalized[1]);
}

// ---------------------------------------------------------------------------
// Zone sorting
// ---------------------------------------------------------------------------

/**
 * Sort key for zones so that central servers appear in a fixed order.
 * Mirrors `zone->sort-key`.
 */
export function zoneSortKey(zone: unknown): number {
  const kw = Array.isArray(zone) ? (zone as any[])[(zone as any[]).length - 1] : zone;
  const s = String(kw).replace(/^:/, "").toLowerCase();
  if (s === "archives" || s === "discard") return -3;
  if (s === "rd" || s === "deck") return -2;
  if (s === "hq" || s === "hand") return -1;
  // Remote servers: extract number from e.g. "remote1", ":remote1"
  const split = String(kw).split(":remote");
  const numPart = split[split.length - 1];
  const num = stringToNum(numPart);
  return num !== null ? num : 0;
}

/**
 * Sorts zone keywords and maps them to human-readable names.
 * Mirrors `zones->sorted-names`.
 */
export function zonesToSortedNames(zones: unknown[]): string[] {
  return [...zones]
    .sort((a, b) => zoneSortKey(a) - zoneSortKey(b))
    .map((z) => zoneToName(z) ?? String(z));
}

// ---------------------------------------------------------------------------
// Zone predicates
// ---------------------------------------------------------------------------

/**
 * Returns true if the zone is for a remote server.
 * Mirrors `is-remote?`.
 */
export function isRemote(zone: unknown): boolean {
  return remoteToName(zone) !== null;
}

/**
 * Returns true if the zone is for a central server.
 * Mirrors `is-central?`.
 */
export function isCentral(zone: unknown): boolean {
  return !isRemote(zone);
}

/**
 * Returns true if the zone is the root (content) of a central server.
 * Mirrors `is-root?`.
 */
export function isRoot(zone: Zone): boolean {
  const second = zone[1];
  return isCentral(second) && zone[zone.length - 1] === "content";
}

// ---------------------------------------------------------------------------
// Zone conversions
// ---------------------------------------------------------------------------

/**
 * Converts a central server keyword like :discard into a corresponding zone
 * vector. Mirrors `central->zone`.
 */
export function centralToZone(zone: unknown): Zone | null {
  const kw = Array.isArray(zone) ? zone[zone.length - 1] : zone;
  const s = String(kw).replace(/^:/, "").toLowerCase();
  switch (s) {
    case "discard":
    case "archives":
      return ["servers", "archives"];
    case "hand":
    case "hq":
      return ["servers", "hq"];
    case "deck":
    case "rd":
      return ["servers", "rd"];
    default:
      return null;
  }
}

/**
 * Converts a runner's card type to a vector zone, e.g. 'Program' -> ['rig', 'program'].
 * Mirrors `type->rig-zone`.
 */
export function typeToRigZone(type: string): Zone {
  return ["rig", type.toLowerCase()];
}

/**
 * Returns the server type for the given zone.
 * Mirrors `get-server-type`.
 */
export function getServerType(zone: unknown): string | null {
  const kw = Array.isArray(zone) ? zone[zone.length - 1] : zone;
  const s = String(kw).replace(/^:/, "").toLowerCase();
  if (s === "hq" || s === "rd" || s === "archives") {
    return s;
  }
  return "remote";
}

// ---------------------------------------------------------------------------
// Same-server checks
// ---------------------------------------------------------------------------

/**
 * True if the two cards are IN or PROTECTING the same server.
 * Mirrors `same-server?`.
 */
export function sameServer(card1: Card | null, card2: Card | null): boolean {
  if (!card1 || !card2) return false;
  const zone1 = getZone(card1);
  const zone2 = getZone(card2);
  return zone1[1] === zone2[1];
}

/**
 * True if an ice is protecting the server that the card is in or protecting.
 * Mirrors `protecting-same-server?`.
 */
export function protectingSameServer(card: Card | null, ice: Card | null): boolean {
  if (!card || !ice) return false;
  const zone1 = getZone(card);
  const zone2 = getZone(ice);
  const converted = centralToZone(zone1);
  const effectiveZone = converted ?? zone1;
  return effectiveZone[1] === zone2[1] && zone2[zone2.length - 1] === "ices";
}

/**
 * True if the two cards are installed IN the same server, or hosted on cards
 * IN the same server.
 * Mirrors `in-same-server?`.
 */
export function inSameServer(card1: Card | null, card2: Card | null): boolean {
  if (!card1 || !card2) return false;
  const zone1 = getZone(card1);
  const zone2 = getZone(card2);
  return (
    zone1.length === zone2.length &&
    zone1.every((v, i) => v === zone2[i]) &&
    zone1[zone1.length - 1] === "content"
  );
}

/**
 * True if the upgrade is in the root of the server that the target is in.
 * Mirrors `from-same-server?`.
 */
export function fromSameServer(upgrade: Card | null, target: Card | null): boolean {
  if (!upgrade || !target || !upgrade.cid || !target.cid) return false;
  const targetZone = getZone(target as Card);
  const expectedZone = centralToZone(targetZone);
  if (!expectedZone) return false;
  const upgradeZone = getZone(upgrade);
  // butlast of upgrade zone should equal expectedZone
  const upgradeZoneWithoutLast = upgradeZone.slice(0, -1);
  return (
    upgradeZoneWithoutLast.length === expectedZone.length &&
    upgradeZoneWithoutLast.every((v, i) => v === expectedZone[i])
  );
}

// ---------------------------------------------------------------------------
// Unknown -> keyword
// ---------------------------------------------------------------------------

/**
 * Given a string ('Archives'), a keyword corresponding to a server (:archives)
 * or a zone (['servers', 'archives']), return the keyword string.
 * NOTE: returns keyword string even if server does not exist.
 * Mirrors `unknown->kw`.
 */
export function unknownToKw(nameOrKwOrZone: unknown): string {
  if (typeof nameOrKwOrZone === "string" || typeof nameOrKwOrZone === "number") {
    const val = String(nameOrKwOrZone);
    // Already a keyword-like string (e.g. ":archives" or "archives")
    if (val.startsWith(":")) {
      return val;
    }
    switch (val) {
      case "HQ":
        return ":hq";
      case "R&D":
        return ":rd";
      case "Archives":
        return ":archives";
      default: {
        // Assume "Server N" format
        const parts = val.split(" ");
        const last = parts[parts.length - 1];
        return `:remote${last}`;
      }
    }
  }

  // Array / zone
  if (Array.isArray(nameOrKwOrZone) && nameOrKwOrZone.length > 0) {
    const second = nameOrKwOrZone[1];
    return typeof second === "string" || typeof second === "number"
      ? String(second)
      : String(second);
  }

  return String(nameOrKwOrZone);
}
