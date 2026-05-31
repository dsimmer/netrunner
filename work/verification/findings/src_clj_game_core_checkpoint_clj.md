# src/clj/game/core/checkpoint.clj — verified

Session: `session-2026-05-28-batch-A`
TS counterpart: `src/ts/game/core/checkpoint.ts` (382 LOC)
Source LOC: 33

## Scope note

The TS file is much larger than the clj because it includes the full engine-level
`checkpoint` function (mirrored from `engine.clj`, ~1325 LOC) plus its private
helpers (`trashWhenExpired`, `unregisterExpiredDurations`, `getOldUniques`,
`checkUniqueAndConsoles`, `enforceConditions`, `checkRestrictions`). Those are
**out of scope** for this row; they will be verified when engine.clj is
verified. This row only confirms the 33 lines of `checkpoint.clj` are faithfully
ported.

## Units

| Unit | Source | TS (in scope) |
| --- | ---: | ---: |
| defn | 1 (`fake-checkpoint`) | 1 (`fakeCheckpoint`) |

The TS file also exports `checkpoint` (engine-scope, verified later) and four
private helpers used by `checkpoint` only.

## Semantic compare

- `(fake-checkpoint [state])` runs a bounded (≤10) fixed-point loop over 11
  update functions, then `clear-empty-remotes` + `generate-runnable-zones`. The
  loop exits early when no updater reports a change. TS `fakeCheckpoint` mirrors
  this exactly: a `for (let i = 0; i < 10; i++)` loop calling the same 11
  helpers; loop body assembles a `boolean[]` and breaks on
  `!changed.some(Boolean)`. After the loop, calls `clearEmptyRemotes(state)` and
  `generateRunnableZones(state, null, null)`. Behavior matches.

## Fix applied

- `src/ts/game/core/checkpoint.ts:60-81` (`fakeCheckpoint`): replaced
  capitalized side strings `"Corp"`/`"Runner"` with lowercase `"corp"`/`"runner"`
  to match `CORP_SIDE`/`RUNNER_SIDE` constants in `state.ts`. Without this,
  `updateHandSize(state, "Corp")` was falling into the runner branch because of
  the equality check against `"corp"`. Kind: `other` (side-string casing fix).

## Stubs / `any` / forbidden directives

- 0 `: any` / `<any>` / `as any`
- 0 `@ts-nocheck` / `@ts-ignore` / `@ts-expect-error`
- 0 stub markers (no `// Stub helpers`, `// TODO`, `// FIXME`)

## Tests

- No `test/ts/game/core/checkpoint.test.ts`. Behavior is exercised indirectly by
  integration tests that step through a turn.

## Verdict

Verified for the in-scope 33 lines. The engine-level `checkpoint` and helpers
in the same file are deferred to the engine.clj verification.
