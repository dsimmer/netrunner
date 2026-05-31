# Batch G: small tier-2 utilities — verified (7 files)

Session: `session-2026-05-30-batch-g`

All 7 files in this batch were already well-ported with minimal `any` usage. Verification
required minor type tightening only (2 `any` removals in `finding.ts`).

| Source | TS counterpart | LOC | Units | `any` before/after | Notes |
| --- | --- | ---: | --- | ---: | --- |
| `src/cljc/jinteki/prizes.cljc` | `src/ts/jinteki/prizes.ts` | 13 | 1 defmacro → `loadCardBacks` function | 0/0 | Macro reified as runtime merge; clean port |
| `src/cljc/jinteki/cards.cljc` | `src/ts/jinteki/cards.ts` | 14 | 4 `defonce` atoms → 4 mutable globals + 4 setters | 0/0 | Clean port |
| `src/clj/game/core/prompt_state.clj` | `src/ts/game/core/prompt_state.ts` | 21 | 3 defns → 3 exports | 0/0 | `setPromptState`, `removeFromPromptQueue`, `addToPromptQueue` all present and typed |
| `src/clj/game/core/virus.clj` | `src/ts/game/core/virus.ts` | 26 | 4 defns → 4 exports + 2 convenience helpers | 0/0 | Hivemind expansion logic preserved |
| `src/clj/game/core/finding.clj` | `src/ts/game/core/finding.ts` | 30 | 4 defns → 4 exports + extras (`getCard`, `getAllCards`, `findCid`) | 2/0 | Fixed `(c: any)` predicates → `(c: Card)`. Some inlined zone walkers moved here from `card.cljc` (already cross-referenced in card.cljc finding) |
| `src/clj/game/core/threat.clj` | `src/ts/game/core/threat.ts` | 31 | 3 defns → `threatLevel`, `getThreatLevel`, `threat` | 0/0 | 2-arg and 3-arg `threat(threshold, accept, reject?)` overload preserved via optional param |
| `src/clj/game/core/to_string.clj` | `src/ts/game/core/to_string.ts` | 31 | 1 defn (`card-str`) | 0/0 | Includes locally-inlined `zoneToName`/`isRoot` helpers (clj uses them from `servers.clj`); clean |

## Fixes applied

- `finding.ts:94,161` — `(c: any) => c.cid === cid` and `(c: any) => c.title === title` → `(c: Card)`.

## Tests

- No dedicated `test/ts/jinteki/prizes.test.ts`, `cards.test.ts`, `prompt_state.test.ts`, `virus.test.ts`, `finding.test.ts`, `threat.test.ts`, `to_string.test.ts`. Indirect coverage through every card/scenario test that resolves cards (`findCID`), shows prompts (`setPromptState`), or formats card strings (`cardStr`).
- `npx tsc --noEmit` → 0 diagnostics after edits.

## Behavioural gaps

None.

## Verdict

7 files verified.
