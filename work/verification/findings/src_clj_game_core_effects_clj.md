# src/clj/game/core/effects.clj — verified

Session: `session-2026-05-28-batch-A`
TS counterpart: `src/ts/game/core/effects.ts` (~430 LOC after fixes)
Source LOC: 199

## Scope note

TS file is larger than the clj because it also adds:
- `TaggedEffectValue` type (was inferred from `getTaggedEffects` shape).
- `LingeringEffectSpec` interface (was implicit in clj keyword maps).
- Two `registerLingeringEffect` overloads (shorthand `(card, spec)` and legacy
  positional `(state, side, card, type, duration, req, value)`).
- `unregisterEffectByUuid` permissive alias for legacy 3-arg call sites.
- Re-exports of `effectCompleted`, `makeIcon`, `purge`.

Re-exports are verified by their owning files.

## Units

| Unit | Source | TS |
| --- | ---: | ---: |
| defn | 21 | 21 (16 exported + 4 private + 1 alias) |

### Defn-by-defn map
| clj | TS |
|---|---|
| `is-disabled-reg?` | `isDisabledReg` |
| `gather-effects` | `gatherEffects` (private) |
| `update-effect-card` | `updateEffectCard` |
| `effect-pred` | `effectPred` (private) |
| `get-effect-maps` (3 arities) | `getEffectMaps` (single 5-arg) |
| `get-effect-value` (3 arities) | `getEffectValue` (private 5-arg) |
| `get-effects` (3 arities) | `getEffects` (optional target / extraTargets) |
| `get-tagged-effect-value` (3 arities) | inlined into `getTaggedEffects` |
| `get-tagged-effects` (3 arities) | `getTaggedEffects` (single 5-arg) |
| `sum-effects` (3 arities) | `sumEffects` (single 5-arg) |
| `any-effects` (4 arities) | `anyEffects` (overloaded with arity dispatch) |
| `is-disabled?` | `isDisabled` |
| `all-disabled-cards` | `allDisabledCards` |
| `update-disabled-cards` | `updateDisabledCards` |
| `register-static-abilities` | `registerStaticAbilities` |
| `unregister-static-abilities` | `unregisterStaticAbilities` |
| `register-lingering-effect` | `registerLingeringEffect` (3 overloads) |
| `unregister-effect-by-uuid` | `unregisterEffectByUUID` (+ `unregisterEffectByUuid` permissive alias) |
| `update-lingering-effect-durations` | `updateLingeringEffectDurations` |
| `unregister-lingering-effects` | `unregisterLingeringEffects` |
| `unregister-effects-for-card` | `unregisterEffectsForCard` (2 overloads via optional pred) |

## Semantic compare

- `gather-effects` clj sorts by `(complement is-active-player)` so active
  player's effects come first; TS partitions into `[active, stable]` and
  returns `[...active, ...stable]`. Same order.
- `effect-pred` clj returns true if `:req` absent OR returns truthy. TS
  matches.
- `get-effect-maps` clj refreshes `:card` then filters; TS does the same with
  a single pass.
- `any-effects` clj 4-arity defaults `pred` to `true?`. **Fixed** — TS
  previously defaulted to `() => true` (always-true), which masked the
  semantic check. Now defaults to `(v) => v === true`.
- `register-lingering-effect` clj: `(assoc (select-keys ability [:type :req :value]) :duration (:duration ability true) :card card :lingering true :uuid (uuid/v1))`. TS does the equivalent: select type/req/value, default duration "true", attach uuid and card with lingering=true. Persists into `state.effects` and refreshes disabled-card registry.
- `unregister-lingering-effects` clj also calls `(update-disabled-cards state)` at the end. **Fixed** — TS previously skipped that refresh.
- `unregister-effects-for-card` clj 1-arity wraps as `(unregister-effects-for-card state nil card identity)` — same as TS 3-arg with default pred `() => true`.
- `register-static-abilities` clj returns the registered abilities; TS returns the same.

## Fixes applied

1. `src/ts/game/core/effects.ts:101-122` — `getEffects` parameter
   reassignment cleanup; removed `(e: any)` cast in `.map`. Kind: `remove_any`.
2. `src/ts/game/core/effects.ts:125-158` — `getTaggedEffects` typed return
   (`TaggedEffectValue[]`), removed all `any` casts, added `TaggedEffectValue`
   exported type. Kind: `remove_any`.
3. `src/ts/game/core/effects.ts:182-211` — `anyEffects` fixed default-pred bug
   (was `() => true`, now `(v) => v === true` matching clj `true?`); removed
   `Card` from pred union (callers use the proper function form). Kind:
   `other` + `remove_any`.
4. `src/ts/game/core/effects.ts:294-365` — `registerLingeringEffect` rewritten
   with a properly typed dispatch (no `...args: any[]`), preserving all three
   overloads used in the codebase (`(card, spec)`, `(state, side, card, spec)`,
   `(state, side, card, type, duration, req, value)`). Added `isCardLike`
   narrowing predicate. Kind: `remove_any`.
5. `src/ts/game/core/effects.ts:373-381` — `unregisterEffectByUUID` removed
   `(e: any)` cast. Kind: `remove_any`.
6. `src/ts/game/core/effects.ts:391-401` — `unregisterLingeringEffects` now
   calls `updateDisabledCards(state)` to match clj. Kind:
   `implement_function`.
7. `src/ts/game/core/effects.ts:418-437` — `unregisterEffectByUuid` retyped
   (no `state: any`) and made the 3-arg overload smarter (accepts a uuid
   string or an object with `.uuid`). Kind: `remove_any`.

## Stubs / `any` / forbidden directives

- 0 `: any` / `<any>` / `as any` (down from ~10 occurrences)
- 0 `@ts-nocheck` / `@ts-ignore` / `@ts-expect-error`
- 0 stub markers / TODO / FIXME

## Tests

- `test/ts/game/core/effects.test.ts`: 8 / 8 pass.
- Full suite: 1054 failures / 1519 tests — exact baseline match, no
  regression.

## Verdict

Verified. All 21 clj defns have faithful TS counterparts. Bug fix in
`unregisterLingeringEffects` (missing `update-disabled-cards`) and `anyEffects`
default pred restored true clj parity.
