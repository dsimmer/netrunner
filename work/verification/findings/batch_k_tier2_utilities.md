# Batch K: tier-2 utilities (119-177 LOC) — verified (4 files)

Session: `session-2026-05-31-batch-k`

| Source | TS counterpart | TS `any` before/after | Notes |
| --- | --- | ---: | --- |
| `src/clj/game/core/say.clj` | `src/ts/game/core/say.ts` | 10/0 | Tightened `systemMsg`/`playSfx` overload dispatchers; typed sfx queue and log filter |
| `src/clj/game/core/servers.clj` | `src/ts/game/core/servers.ts` | 8/0 | Typed `RunLike`/`StateWithRun` accessors; tightened zone predicates `(v: string, i: number)`; `targetServer` accepts `Server` (string \| Zone) |
| `src/clj/game/core/memory.clj` | `src/ts/game/core/memory.ts` | 8/0 | Typed `staticAbilities.find` predicate; tightened `ab.req`/`ab.value` casts via narrowing; typed `getMu`/`getMemory`. `getMemory` accepts either GameState or Card as a defensive shim for programs_1.ts caller bug |
| `src/clj/game/core/turmoil.clj` | `src/ts/game/core/turmoil.ts` | 25/0 | Typed all `serverCards` filter/predicate callbacks; typed `tempHosted: Card[]`; typed side-path accessor |

## Out of scope (deferred)

- `events.clj` (119 LOC) — `EventPred` predicate alias requires `(entry: any) => unknown` to be bivariant because card-side callers pass narrower `(t: any[]) => any` lambdas. TS doesn't allow `unknown`-based predicates to accept `any[]`-parameter functions. Single `any` retained with eslint-disable matches the codebase `AnyFn` convention but blocks "Zero `: any`" verification rule. Defer to a session that can rewrite card-side predicate signatures too.

## Tests

- `npx tsc --noEmit` → 0 diagnostics.
- Vitest baseline unchanged.

## Verdict

4 files verified. events.clj deferred.
