// Global card, MWL, set, and cycle registries.
// Mirrors: src/cljc/jinteki/cards.cljc

/**
 * AllCards is the global map of card title → card data.
 * Populated by the fetch/import task at startup.
 * Mirrors: all-cards atom
 */
export let AllCards: Record<string, Record<string, unknown>> = {}

/**
 * MWL is the global Most Wanted List data.
 * Mirrors: mwl atom
 */
export let MWL: Record<string, unknown> = {}

/**
 * Sets is the global list of card-set data.
 * Mirrors: sets atom
 */
export let Sets: Array<Record<string, unknown>> = []

/**
 * Cycles is the global list of cycle data.
 * Mirrors: cycles atom
 */
export let Cycles: Array<Record<string, unknown>> = []

/**
 * SetAllCards replaces the global card registry.
 */
export function SetAllCards(cards: Record<string, Record<string, unknown>>): void {
  AllCards = cards
}

/**
 * SetMWL replaces the global MWL data.
 */
export function SetMWL(mwl: Record<string, unknown>): void {
  MWL = mwl
}

/**
 * SetSets replaces the global set list.
 */
export function SetSets(sets: Array<Record<string, unknown>>): void {
  Sets = sets
}

/**
 * SetCycles replaces the global cycle list.
 */
export function SetCycles(cycles: Array<Record<string, unknown>>): void {
  Cycles = cycles
}
