# src/clj/game/core/card_defs.clj — verified

Session: `session-2026-05-28-bootstrap`
TS counterpart: `src/ts/game/core/card_defs.ts` (25 LOC)
Source LOC: 14

## Units

| Unit | Source | TS |
| --- | ---: | ---: |
| defmulti | 1 (`defcard-impl`) | n/a — replaced by `Map<string, CardDef>` |
| defmethod | 1 (`:default`) | n/a — Map `.get(title) ?? {}` covers the default branch |
| defn | 1 (`card-def`) | 1 (`cardDef`) |

## Semantic compare

- `(defmulti defcard-impl (fn [title] title))` + `(defmethod defcard-impl :default [_] nil)` →
  `cardDefRegistry = new Map<string, CardDef>()` in `src/ts/game/core/types.ts:218`, with
  `cardDefRegistry.get(title) ?? {}` providing the default-arm semantics.
- `(card-def {:keys [printed-title title] :as card})` → `export function cardDef(card: Card): CardDef`
  in `src/ts/game/core/card_defs.ts:15`. Branches preserved: title → printedTitle → throw.
- Throw payload differs in shape (clj `ex-info` map with `:msg`/`:card`; ts `Error` with
  `JSON.stringify(card)`). Behavior preserved: blows up loudly on a card with neither title nor
  printedTitle. Acceptable port.

## Stubs / `any` / forbidden directives

- 0 `: any` / `<any>` / `as any`
- 0 `@ts-nocheck` / `@ts-ignore`
- 0 stub markers
- 0 TODO/FIXME

## Tests

- No `test/ts/game/core/card_defs.test.ts`. Coverage is indirect via every other test that
  resolves card definitions through `cardDefRegistry`. Adding a dedicated unit test would be
  cheap if we ever need it.

## Verdict

Verified. No fixes applied — the port was already complete and correct.
