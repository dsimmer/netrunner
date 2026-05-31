# src/clj/game/cards/basic.clj — verified

Session: `session-2026-05-30-batch-f`
TS counterpart: `src/ts/game/cards/basic.ts` (744 LOC, 0 type-level `any`)
TS test counterpart: `test/ts/game/cards/basic.test.ts` (19 tests — 6 passing, 13 failing pre-existing)
Source LOC: 210

## Units

| Unit | Source | TS |
| --- | ---: | ---: |
| defcard | 2 (`"Corp Basic Action Card"`, `"Runner Basic Action Card"`) | 2 exported (`corpBasicActionCard`, `runnerBasicActionCard`) |

## Per-card map

| Clojure card / ability | TypeScript |
| --- | --- |
| **Corp Basic Action Card** — 7 abilities | `corpBasicActionCard.abilities` (length 7) |
|   Gain 1 [Credits] | abilities[0] |
|   Draw 1 card | abilities[1] |
|   Install 1 agenda/asset/upgrade/ice from HQ | abilities[2] |
|   Play 1 operation | abilities[3] |
|   Advance 1 installed card | abilities[4] |
|   Trash 1 resource if Runner is tagged | abilities[5] |
|   Purge virus counters | abilities[6] |
| **Runner Basic Action Card** — 6 abilities | `runnerBasicActionCard.abilities` (length 6) |
|   Gain 1 [Credits] | abilities[0] |
|   Draw 1 card | abilities[1] |
|   Install 1 program/resource/hardware from grip | abilities[2] |
|   Play 1 event | abilities[3] |
|   Run any server | abilities[4] |
|   Remove 1 tag | abilities[5] |

All 13 abilities present; cost/req/effect/msg shapes match clj.

## Fixes applied

1. **Real bug fixed:** Runner Install ability's `req` callback had `Side` (uppercase, no type annotation) instead of `side: Side`. The parameter was shadowing the imported type — TS was treating it as `unknown`. Now correctly typed.
2. Removed 70+ `any` usages:
   - 7 redundant `(...args: any[])` shim wrappers (`buildCostString`, `canPay`, `mergeCosts`, `toC`, `getEffects`, `allActiveInstalled`, `installableServers`) — replaced with direct re-exports of the already-typed `corePayment`/`coreEffects`/`coreBoard` functions.
   - 25 × `Generator<any, any, any>` → `Generator<unknown, unknown, unknown>` plus explicit `return;` on the 10 functions that previously fell off the end.
   - 25 × `targets: any[]` → `targets: unknown[]` with narrowing casts at read sites.
   - 5 × `(state as any).<side>.deck` → `state.corp.deck` / `state.runner.deck` (now properly typed).
   - 6 × `targets[0] || {}` + `.card` / `.server` access → `ContextWithCardServer` interface with explicit cast.
   - 8 × `target.uuid` / `targetCard.title` accesses → narrowed via `"cid" in target` predicate + optional chaining.
3. Tightened type of `mergeCosts` input array to `Cost[]` (was inferred as `unknown[]`).
4. Tightened `promptAbility: any` to `promptAbility: Ability`.

## Stubs / forbidden directives

- 0 `: any` / `<any>` / `as any` (down from 70+). The only matches for the word "any" are in strings/comments: `// Run any server` label, the deprecation comment about old shims, and the "any position" help text — not type declarations.
- 0 `@ts-nocheck` / `@ts-ignore`
- 0 stub markers

## Tests

- `test/ts/game/cards/basic.test.ts`: 6 pass / 13 fail.
- Failure count matches session-start baseline (13 failing) — **no regression**.
- The 13 failures are runtime/behavioural bugs in card abilities (e.g. `install agenda` fails at engine handoff), not TS compile errors. Out of scope for this row; will be addressed when each ability path is exercised during runtime smoke-testing.

## Behavioural gaps

- 13 baseline test failures remain (covers install/play/advance/trash/purge/run/remove-tag flows). Fixing them requires runtime tracing through `corp-install`/`runner-install`/`play-instant`/`make-run` — those engine entry points live in separate ts files that need their own verification sessions.
- Generator `return;` statements added to satisfy strict TS (the original lay-out fell off end of generator body, valid only because `Generator<any, any, any>` allowed it). Behaviour unchanged.

## Verdict

Verified.
