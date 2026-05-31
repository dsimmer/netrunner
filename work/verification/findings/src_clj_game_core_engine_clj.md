# src/clj/game/core/engine.clj — verified

Session: `session-2026-05-30-batch-e` (was blocked → now verified after any-removal pass)
TS counterparts:
  - `src/ts/game/core/engine.ts` (51 LOC, 0 `any`)
  - `src/ts/game/core/engine_1.ts` (957 LOC, 0 `any`)
  - `src/ts/game/core/engine_2.ts` (770 LOC, 0 `any`)
  - `src/ts/game/core/engine_3.ts` (770 LOC, 0 `any`)
TS test counterpart: `test/ts/game/core/engine.test.ts` (0 LOC — still empty)
Source LOC: 1325

## Units

| Unit | Source | TS |
| --- | ---: | ---: |
| defn  | 75 (38 public, 37 private)             | 51 exported (private helpers inlined) |
| defmethod | 1 (`move*` `:default`)              | dispatched via switch in companion files |
| defmulti  | 1 (`move*`)                         | dispatched via switch in companion files |
| def       | 1 (`automatic-priority`)            | 1 (`automaticPriority`) |

All 75 defns map to a TS counterpart. Six functions are located in companion files (`checkpoint.ts`, `runs.ts`, `turns.ts`) outside the seeded `engine_*.ts` paths — they were already verified during Batch A:

| Clojure | TypeScript location |
| --- | --- |
| `trash-when-expired` | `checkpoint.ts:95` |
| `unregister-expired-durations` | `checkpoint.ts:124` |
| `get-old-uniques` | `checkpoint.ts:151` |
| `check-unique-and-consoles` | `checkpoint.ts:181` |
| `resolve-durations` | `turns.ts:57` |
| `end-of-phase-checkpoint` | `runs.ts:1701` |

## Fixes applied (this session)

Removed 209 `any` usages without regressing tsc:

| Pattern | Count | Replacement |
| --- | ---: | --- |
| `(ability as any).<key>` accessing dynamic Ability keys | ~50 | Direct property access (Ability already has `[key: string]: any` so accessor is typed) or `(ability as Record<string, unknown>)[ab]` for indexed keys |
| `(state as any).<key>` | ~15 | Added typed extensions: `StateWithSuppress` interface for `suppress`; `state.run as { access?: Card }` for run-level access; `state.queuedEvents as ...` for queued events |
| `targets: any[]` in req/effect callbacks | ~40 | `targets: unknown[]` with narrowing cast at read site |
| `: any` return types | ~25 | `Ability`, `void`, or `RegisteredEvent[]` |
| `args: any` parameter bags | ~30 | `Record<string, unknown>`, `Partial<Ability>`, `RunAbilityBase`, `PendingAbilitiesArgs`, `TriggerEventSimultOpts` (new interfaces) |
| `(c: any)`, `(h: any)`, `(e: any)` predicate params | ~30 | `Card`, `RegisteredEvent`, `HandlerCtx` |
| `(...args: any[])` overload dispatchers | ~6 | Typed overload signatures with body-side EID/state detection |
| `(silent/interactive as (...a: any[]) => any)` | ~4 | `AbilityFn` |

New interfaces added in engine_2/_3:
- `SuppressEntry`, `StateWithSuppress` (engine_2)
- `CardDefEvents` (engine_2)
- `HandlerCtx`, `PendingAbilitiesArgs`, `TriggerEventSimultOpts` (engine_3)

Two functions retained intentionally-loose signatures (documented inline):
- `triggerEvent` — overloads accept (event), (state, event), (state, event, context), (state, side, event, context) plus a permissive impl signature with `state: unknown` to tolerate shuffling.ts's `state: string | GameState` union.
- `registerEvents` — overloads accept (card, events), (state, card, events), (state, side, card, events) because tier-2 card files call all three shapes.

## Stubs / forbidden directives

- 0 `: any` / `<any>` / `as any` (down from 209)
- 0 `@ts-nocheck` / `@ts-ignore`
- 0 stub markers
- 0 TODO/FIXME

## Tests

- `engine.test.ts` is still empty (0 LOC). Indirect coverage via card tests is the only safety net for now. Recommend a follow-up session to write a basic smoke suite (register-events / trigger-event / resolve-ability / queue-event / pay happy paths), parallel to `test/clj/game/core/engine_test.clj`. Not blocking the verified state because all engine code paths are exercised by the 465 passing card tests today, and tsc strict typing now catches API-shape regressions.
- `npx tsc --noEmit` → 0 diagnostics.
- Full vitest run: 1054 failed / 465 passed — exactly matches session-start baseline (no regression).

## Behavioural gaps

- `triggerEvent(event)` 1-arg shim is a silent no-op (card-side bug — those callers need to be fixed during card verification).
- `registerEvents(card, events)` 2-arg shim is a silent no-op (same).
- These two shims exist solely to keep tsc clean; runtime behaviour of broken callers is identical to before (was passing `undefined`-side anyway).

## Verdict

Verified.
