// Mirrors: src/cljc/jinteki/prizes.cljc
// The CLJ file defines a compile-time macro `load-card-backs` that reads
// data/card-backs.edn at build time and merges it with a base map.
// In TS, this becomes a runtime merge: loaded data is overridden by baseCardBacks
// (same semantics as `(merge data base-card-backs)`).

export type CardBacks = Record<string, string>;

// Mirrors: load-card-backs macro
// baseCardBacks take precedence over loadedData (matches CLJ merge order).
export function loadCardBacks(
  baseCardBacks: CardBacks,
  loadedData: CardBacks = {},
): CardBacks {
  return { ...loadedData, ...baseCardBacks };
}
