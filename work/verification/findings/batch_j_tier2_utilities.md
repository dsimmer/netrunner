# Batch J: tier-2 utilities (79-146 LOC) — verified (9 files)

Session: `session-2026-05-31-batch-j`

| Source | TS counterpart | TS `any` before/after | Notes |
| --- | --- | ---: | --- |
| `src/clj/game/core/player.clj` | `src/ts/game/core/player.ts` | 0/0 | Already clean |
| `src/clj/game/core/change_vals.clj` | `src/ts/game/core/change_vals.ts` | 3/0 | Replaced `(_s: any, targetSide: any)` predicate signature with typed; replaced `(state.corp as any)` numeric-attribute cast |
| `src/clj/game/core/winning.clj` | `src/ts/game/core/winning.ts` | 5/0 | Replaced `(state as any)[clearWinKey]` with typed `GameState & Record<string, unknown>` cast |
| `src/clj/game/core/sabotage.clj` | `src/ts/game/core/sabotage.ts` | 11/0 | Tightened `(c: any)` predicates to `Card`; typed `state.breach` as inline shape with `known-cids`; typed stats accumulator |
| `src/clj/game/core/agendas.clj` | `src/ts/game/core/agendas.ts` | 14/0 | Rewrote nested-zone navigator without `any` (uses typed Corp/Runner accessors); typed `cardDef(c) as { "advancement-requirement"?: AbilityFn }`; tightened `currentPoints`/`currentAdvancementRequirement` mutations |
| `src/clj/game/core/damage.clj` | `src/ts/game/core/damage.ts` | 13/0 | Refactored `damage` overload dispatcher; added legacy (eid, type, n) and (side, eid, type, n) overloads; widened `DamageOpts` for `unboostable` + `state`/`side` carriers |
| `src/clj/game/core/hosting.clj` | `src/ts/game/core/hosting.ts` | 15/0 | Replaced `(update as any)` mutator with direct typed `update()` calls; typed `cdef.hostedLost`/`leavePlay`/`hostedGained` accessors; typed `getHost`/`getHosts`/`unhost` exports |
| `src/clj/game/core/choose_one.clj` | `src/ts/game/core/choose_one.ts` | 17/0 | Typed all `Card | null, targets: unknown[]` callbacks; typed `count`/`req`/`prompt` as `AbilityFn`; typed `payable`/`resolveChoices` helpers; `Prompt` mutation via cast |
| `src/clj/game/core/shuffling.clj` | `src/ts/game/core/shuffling.ts` | 13/0 | Narrowed `s: GameState | string` to `GameState` after string check; typed `state.breach`/`state.run`/`state.stats`/`player[zone]` accesses |

## Out of scope (deferred to dedicated sessions)

These 5 batch-J candidates have too many cascading consequences from any-removal to safely fix this session:

- `state.clj` (79 LOC) — already deferred from batch I; `GameStats[key: string]: any` + `prevent?: any` escape hatches; clean-up cascades into ~6 card files.
- `gaining.clj` (141 LOC) — `gain`/`lose`/`gainCredits`/`loseCredits`/`gainClicks`/`loseClicks` overload dispatchers; ~90 card-side callers pass legacy malformed shapes. Permissive `...args: any[]` impl signatures restored to keep tsc clean.
- `drawing.clj` (146 LOC) — similar overload patterns to gaining; need their own session.
- `events.clj` (119 LOC) — needs analysis.
- `process_actions.clj` (121 LOC) — 40 `any`s, the bulk in `commandParser`'s command-dispatch table; needs typed Command interface.
- `macros.clj` (144 LOC) — 64 `any`s in macro infrastructure (`AnyFn`, generator wrappers). The codebase pattern explicitly uses `AnyFn` here with eslint-disable; needs careful surgery.

## Fixes applied to keep tsc clean

- Added permissive overloads on `damage` for legacy (eid, type, n[, opts]) and (side, eid, type, n) call shapes.
- Added `host(card, target, opts?)` 3-arg overload for `effect()` lambda callers.
- Widened `DamageOpts` with `unboostable`, `state`, `side` carriers used by some card-side payloads.

## Tests

- `npx tsc --noEmit` → 0 diagnostics.
- Vitest baseline unchanged.

## Verdict

9 files verified. 5 deferred.
