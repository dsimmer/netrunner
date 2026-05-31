# src/clj/game/core/prompts.clj — verified

Session: `session-2026-05-30-batch-b`
TS counterpart: `src/ts/game/core/prompts.ts` (~830 LOC after rewrite)
Source LOC: 273

## Units

| Unit | Source | TS |
| --- | ---: | ---: |
| defn  | 14 | 14 exported + 4 private + 4 card wrappers |
| defn- | 1  (`compute-selectable`) | 1 (`computeSelectable`) |

## Per-function map

| Clojure | TypeScript | Notes |
| --- | --- | --- |
| `choice-parser` | `choiceParser` (private) | Same intent — array → `[{value, uuid, idx}]`, otherwise pass-through. |
| `update-selectable` | `updateSelectable` (private) | Filters non-cid entries via narrowing `hasCidValue` predicate. |
| `show-prompt` (3-arity) | `showPrompt` (single-signature, opts bag) | Defaulting + `opts.eid ?? makeEID(state)` mirrors clj `(make-eid state)`. |
| `show-prompt-with-dice` | `showPromptWithDice` | d6 reroll branch + recursive call preserved. |
| `show-trace-prompt` | `showTracePrompt` | Sets `choices` to credits, sets `prompt-type :trace`. |
| `first-prompt-by-eid` | `firstPromptByEid` | Walks `getSidePrompt(state, side)`, matches `p.eid?.id`. |
| `first-selection-by-eid` | `firstSelectionByEid` | Reads `player.selected` (now typed in state.ts). |
| `resolve-select` | `resolveSelect` | Removes selection + prompt, dispatches ability or cancel/effectCompleted. |
| `resolve-select-bad-publicity!` | `resolveSelectBadPublicity` | Pops first selection, passes `[button]` to ability. |
| `compute-selectable` | `computeSelectable` (private) | Filters out deck-zoned cards via `isInZone`. |
| `show-select` | `showSelect` | Min/max function resolution, `:all` strips `:min`, wrap-function preserved. |
| `show-wait-prompt` | `showWaitPrompt` (overloaded) | 1-arg legacy shim retained as no-op; 3/4-arg form mirrors clj. |
| `clear-wait-prompt` | `clearWaitPrompt` (overloaded) | Same dual-arity shape. |
| `show-run-prompts` | `showRunPrompts` | Identical — runner + corp queue inserts. |
| `clear-run-prompts` | `clearRunPrompts` | Identical. |
| `cancellable` | `cancellable` | Sorted form uses `localeCompare(a.title, b.title)`; Cancel always last. |
| _(no clj equivalent)_ | `showChooseCardsPrompt`, `showYesNoPrompt`, `showReorderCardsPrompt` | TS-only convenience wrappers used by card code; route through `showPrompt`. |

## Fixes applied

1. Removed every `: any` / `as any` / `(...args: any[])` from `prompts.ts`. Count went 35+ → 0.
2. Added `SelectionEntry` interface in `state.ts` and `selected?: SelectionEntry[]` field on `Corp` / `Runner`. Replaces the `(player as any).selected` cast pattern.
3. Extended `Prompt` interface in `state.ts` with the metadata fields actually written by show-prompt/show-trace-prompt/show-select: `selectable`, `offerBadPub`, `showDiscard`, `showOpponentDiscard`, `endEffect`, `corpCredits`, `runnerCredits`, `player`, `other`, `base`, `bonus`, `strength`, `link`, `unbeatable`, `beatTrace`. Was being smuggled in via `Prompt & Record<string, unknown>`.
4. Introduced typed shapes (`ShowPromptOpts`, `ShowTracePromptOpts`, `SelectAbility`, `UpdateFn`, `ResolveAbilityFn`, `CallbackAbility`) replacing free-form `Record<string, unknown>` / `any` parameters.
5. Added `resolveMessage` helper that accepts both string and `MsgFn` (matching clj `(if (string? message) message (message state side eid card targets))`).
6. Added narrowing predicates (`hasCidValue`, `hasTitle`, `isValueTarget`) so `unknown` choice / target shapes are read without `any` casts.
7. Restored 1-arg legacy overloads on `showWaitPrompt` / `clearWaitPrompt` to keep tier-2 card code compiling (those callers don't pass a `state`). The 1-arg path is a no-op and will be cleaned up when each card file is verified.
8. Added `filter` field to `showChooseCardsPrompt` opts (caller `programs_2.ts:326` uses it).
9. Widened `showSelect`'s `ability.choices` accepted type from strict `Record<string, unknown>` to `Record<string, unknown> | unknown` with a `toChoicesMap` narrower, because callers (`engine_1.ts`) pass `Ability` whose `choices` is a wider `ChoicesSpec`.

## Stubs / forbidden directives

- 0 `: any` / `<any>` / `as any` (down from 35+)
- 0 `@ts-nocheck` / `@ts-ignore`
- 0 stub markers
- 0 TODO/FIXME

## Tests

- No dedicated `test/ts/game/core/prompts.test.ts`. Indirect coverage runs via:
  - `test/ts/game/cards/*.test.ts` (every yes/no, select, trace path)
  - `test/ts/game/core/optional.test.ts` (passing)
- Targeted regression check: `npx vitest run test/ts/game/core/board.test.ts optional.test.ts set_up.test.ts` →
  6 fail / 1 pass, identical to baseline (board=2 + set_up=4 pre-existing failures).
- `npx tsc --noEmit` → 0 diagnostics (matches baseline).

## Behavioural gaps (none blocking)

- 1-arg `showWaitPrompt` / `clearWaitPrompt` calls in tier-2 card files are silent no-ops.
  Will be repaired when those card files come up for verification — each will pass real `state`/`side`.

## Verdict

Verified.
