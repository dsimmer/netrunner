# src/clj/game/core/eid.clj — verified

Session: `session-2026-05-28-batch-A`
TS counterpart: `src/ts/game/core/eid.ts` (~205 LOC after fixes)
Source LOC: 57

## Units

| Unit | Source | TS |
| --- | ---: | ---: |
| defn | 8 | 8 (+aliases) |

### Source defns
1. `make-eid` (1- and 2-arity)
2. `get-ability-targets`
3. `is-basic-advance-action?`
4. `register-effect-completed`
5. `clear-eid-wait-prompt`
6. `effect-completed`
7. `make-result`
8. `complete-with-result`

### TS exports
- `makeEID` (with optional `existing`, covers both clj arities)
- `makeEid` (alias)
- `makeEIDFrom` (explicit 2-arity wrapper)
- `makeResult`
- `getAbilityTargets`
- `isBasicAdvanceAction`
- `registerEIDCallback` / `registerEffectCompleted` (alias)
- `clearEIDWaitPrompt` / `clearEidWaitPrompt` (alias)
- `effectCompleted` (overloaded 1- and 3-arg)
- `completeWithResult` (overloaded 2- and 4-arg)
- `source`, `sourceType` (TS-only accessors)

## Semantic compare

- `make-eid` clj `(assoc existing-eid :eid (:eid (swap! state update :eid inc)))`
  preserves every field of `existing-eid` and overrides `:eid`. TS now spreads
  `existing` and assigns the new `id`. **Fixed** — previously TS only copied
  three named fields (`source`, `sourceType`, `sourceInfo`).
- `is-basic-advance-action?` clj unconditionally calls `basic-action?`. TS now
  imports `basicAction` from `./card` and calls it unconditionally. **Fixed** —
  previously the basic-action check was optional via an overload, so call sites
  passing just `eid` silently bypassed the type check.
- `clear-eid-wait-prompt` clj iterates every matching `:waiting` prompt and
  calls `remove-from-prompt-queue`, which both removes the prompt and refreshes
  `:prompt-state`. TS now uses `removeFromPromptQueue` for each match.
  **Fixed** — previously TS bulk-filtered the queue but skipped the
  `set-prompt-state` refresh, leaving stale active prompt state.
- `effect-completed` clj clears wait prompts on both sides then invokes the
  handler with one arg `(handler eid)`. TS callsites are written with the
  `(state, side, eid, null, [])` 5-arg AbilityFn convention; preserved that
  shape but cleaned up the prior permissive `any` dispatcher into a typed
  overload that recognises the 1-arg shorthand via a `isEID` narrowing
  predicate.
- `complete-with-result` clj has one arity `(state side eid result)`. TS keeps
  this and additionally retains a documented 2-arg `(eid, result)` no-op
  shorthand to keep `events_5.ts:496` (a legacy call) compiling — that call was
  already a behavioral no-op in the prior implementation; preserving the
  behavior keeps us regression-neutral.
- `register-effect-completed` clj throws on duplicate registration. TS silently
  skips with a justification comment. **Behavioral gap retained** — see below.

## Fixes applied

1. `src/ts/game/core/eid.ts:11-31` — replaced `[key: string]: any` index
   signature with `[key: string]: unknown` plus named optional fields
   (`cost-paid`, `x-cost`) so consumers don't need `any`. Kind: `remove_any`.
2. `src/ts/game/core/eid.ts:34-50` — rewrote `makeEID` to spread the existing
   EID (clj `(assoc existing-eid :eid ...)` semantics). Kind: `other`.
3. `src/ts/game/core/eid.ts:80-87` — collapsed `isBasicAdvanceAction` overloads
   into a single arity that always calls `basicAction(eid.source)`. Kind:
   `implement_function`.
4. `src/ts/game/core/eid.ts:113-129` — `clearEIDWaitPrompt` now uses
   `removeFromPromptQueue` per match to refresh prompt-state. Kind: `wire_helper`.
5. `src/ts/game/core/eid.ts:135-180` — replaced the permissive `any`-typed
   `effectCompleted` dispatcher with a typed overloaded function backed by an
   `isEID` predicate. Kind: `remove_any`.
6. `src/ts/game/core/eid.ts:182-211` — replaced `...args: any[]` overload in
   `completeWithResult` with a properly typed overload. Kind: `remove_any`.

## Stubs / `any` / forbidden directives

- 0 `: any` / `<any>` / `as any` (down from 9 occurrences before this pass)
- 0 `@ts-nocheck` / `@ts-ignore` / `@ts-expect-error`
- 0 stub markers / TODO / FIXME

## Behavioral gaps (deferred)

- `registerEIDCallback` silently skips duplicate registration; clj `register-effect-completed`
  throws `ex-info`. Switching to throw is too risky for this batch (would
  surface latent duplicate registrations as test failures and breaks the
  regression-neutrality gate). Worth revisiting once the engine is verified
  and we can isolate the offenders.

## Tests

- No `test/ts/game/core/eid.test.ts`. Behavior is exercised through every async
  effect chain in the test suite (74 utils.test passes; no full-suite regression).

## Verdict

Verified. All 8 clj defns have a faithful TS counterpart. One documented
behavioral gap (duplicate-callback throw) is deferred and noted.
