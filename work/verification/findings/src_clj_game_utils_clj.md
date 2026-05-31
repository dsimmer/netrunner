# src/clj/game/utils.clj — verified

Session: `session-2026-05-28-batch-A`
TS counterpart: `src/ts/game/utils.ts` (~340 LOC)
Source LOC: 151

## Scope note

TS file is ~2× clj LOC because it also exports:
- A test-friendly global card registry (`setAllCards`, `getAllCards`).
- `decapitalize`, `ordinal`, `faceupArchivesTypes`, `handSize` (TS-only conveniences).
- Re-exports from `jinteki/utils` and `core/memory`, `core/tags` used by card files.

These TS-only additions are out of scope (verified by their owning files).

## Units

| Unit | Source | TS (corresponding) |
| --- | ---: | ---: |
| defn | 17 | 17 |
| def | 1 (`safe-split`) | 1 (`safeSplit`) |

### Source forms
1. `make-cid` → `makeCID` (+`makeCid` alias)
2. `make-timestamp` → `makeTimestamp`
3. `server-card` (1-/2-arity) → `serverCard(title, strict=true)`
4. `server-cards` → `serverCards`
5. `safe-zero?` → `safeZero`
6. `remove-once` → `removeOnce`
7. `to-keyword` → `toKeyword`
8. `distinct-by` → `distinctBy`
9. `string->num` → `stringToNum`
10. `safe-split` (def) → `safeSplit`
11. `dissoc-in` → `dissocIn`
12. `used-this-turn?` → `usedThisTurn`
13. `side-str` → `sideStr`
14. `same-side?` → `sameSide`
15. `same-card?` (1-/2-arity dispatch) → `sameCard` (overloaded)
16. `pluralize` (2-/3-/4-arity) → `pluralize` (overloaded)
17. `quantify` (2-/3-/4-arity) → `quantify` (single arity covers all via defaults)
18. `enumerate-str` (1-/2-arity) → `enumerateStr`
19. `enumerate-cards` (1-/2-/3-arity) → `enumerateCards`
20. `in-coll?` → `inColl`
21. `positions` → `positions`

## Semantic compare

- `make-cid` uses a v4 UUID — clj `(uuid/to-string (uuid/v4))`, TS `randomUUID()`.
- `server-card` — both treat `Corp Basic Action Card` / `Runner Basic Action Card`
  as `{}` fallback; both throw when strict and card missing.
- `safe-zero?` clj wraps `zero?` in `fnil` so nil → `(zero? 1)` = false. TS
  returns false for `null`/`undefined` and `n === 0` for everything else. The
  test fixture explicitly captures the case `safeZero("0") === false`.
- `same-card?` 1-arity in clj `(same-card? card1 card2)` dispatches to
  `(same-card? :cid card1 card2)`. TS uses a typed overload: if the first arg
  is a function, use it as the key extractor (the clj 2-arity); otherwise
  compare on `cid`.
- `pluralize` — clj 4-arity `(string single-suffix plural-suffix n)` becomes
  the 4-arg TS form; 3-arity `(string suffix n)` becomes
  `(s, n, suffix)` in TS — note the TS `n`-as-second-arg ordering — and 2-arity
  `(string n)` defaults `suffix="s"`. The test fixture exercises all three.
- `quantify` — TS single-signature `(n, word, suffixOrSingle="s", pluralSuffix?)`
  covers all three clj arities via the trailing-optional.
- `enumerate-str` — 2/3 vs >3 split mirrors the clj `<= 2` branch.
- `dissoc-in` — recursively prunes empty objects, identical to clj behavior.
  Test fixture: `dissocIn({a:{b:1}}, ["a","b"])` → `{}` (parent pruned).
- `safe-split` clj `(fnil str/split "")` — nil input substitutes empty string,
  which `str/split` then returns as `[""]`. **Fixed** — TS previously returned
  `[]` for nil; now returns `[""]` to match clj.

## Fixes applied

1. `src/ts/game/utils.ts:324-333` — `handSize` retyped from `any/any` to
   `(state: GameState, side: unknown)` with explicit side-key branches. Kind:
   `remove_any`.
2. `src/ts/game/utils.ts:336-348` — `safeSplit` retyped, removed `delim as any`
   cast (`String.prototype.split` accepts string|RegExp directly), and aligned
   nil-handling with clj behavior (`[""]` instead of `[]`). Kind: `remove_any`.

## Stubs / `any` / forbidden directives

- 0 `: any` / `<any>` / `as any` (down from 3 occurrences)
- 0 `@ts-nocheck` / `@ts-ignore` / `@ts-expect-error`
- 0 stub markers / TODO / FIXME

## Tests

- `test/ts/game/utils.test.ts`: 74 / 74 pass (unchanged).

## Verdict

Verified. Every clj form has a corresponding TS export. Tests pass.
