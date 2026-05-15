// Card back definitions (standard FFG, NSG, and prize unlockables).
// Mirrors: src/cljc/jinteki/card_backs.cljc

/**
 * Describes a single card-back art option.
 */
export interface CardBack {
  name: string;
  description: string;
  file: string; // filename stem under /img/card-backs/<side>/
  side: string; // "Corp", "Runner", or "" for both
  prize: boolean; // only visible when unlocked
  group?: string; // grouping for prize card backs (e.g. "Season 1", "Season 2")
}

/**
 * Contains the standard card backs shipped with the game.
 * Mirrors: base-card-backs
 */
export const BaseCardBacks: Record<string, CardBack> = {
  "ffg-card-back": {
    name: "FFG Card Backs",
    description:
      "The standard FFG card backs that were with the game for most of its life.",
    file: "ffg",
  },
  "nsg-card-back": {
    name: "NSG Card Backs",
    description: "The current Null Signal Games card backs.",
    file: "nsg",
  },
  // fallback aliases
  ffg: { file: "ffg" },
  nsg: { file: "nsg" },
};

/**
 * The merged map of base + prize card backs.
 * Populated at startup by merging BaseCardBacks with loaded prize data.
 */
export let CardBacks: Record<string, CardBack> = { ...BaseCardBacks };

/**
 * Returns the subset of CardBacks that are prize card backs.
 * Mirrors: just-prizes
 */
export function justPrizes(): Record<string, CardBack> {
  const out: Record<string, CardBack> = {};
  for (const [key, value] of Object.entries(CardBacks)) {
    if (value.prize) {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Returns the card backs available to side, filtered to
 * only those unlocked (by key) in the unlocked set. Sorted by name.
 * Mirrors: card-backs-for-side
 */
export function cardBacksForSide(
  side: string,
  unlocked: Set<string>,
): Record<string, CardBack> {
  // Exclude fallback aliases (mirrors: dissoc card-backs :nsg :ffg)
  const FALLBACK_ALIASES = new Set(["nsg", "ffg"]);
  const out: Record<string, CardBack> = {};
  for (const [key, value] of Object.entries(CardBacks)) {
    if (FALLBACK_ALIASES.has(key)) continue;
    // Filter by prize status (prize card backs must be unlocked)
    if (value.prize && !unlocked.has(key)) continue;
    // Filter by side (empty string / undefined matches both sides)
    if (value.side && value.side !== side) continue;
    out[key] = value;
  }
  // Sort by [name, key] tuple — mirrors sorted-map-by in CLJC
  const sorted = Object.entries(out).sort(([k1, v1], [k2, v2]) => {
    const nameCmp = (v1.name ?? "").localeCompare(v2.name ?? "");
    return nameCmp !== 0 ? nameCmp : k1.localeCompare(k2);
  });
  const sortedOut: Record<string, CardBack> = {};
  for (const [key, value] of sorted) {
    sortedOut[key] = value;
  }
  return sortedOut;
}
