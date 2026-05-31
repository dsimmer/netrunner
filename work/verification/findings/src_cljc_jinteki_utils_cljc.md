# src/cljc/jinteki/utils.cljc — verified

Session: `session-2026-05-30-batch-b`
TS counterpart: `src/ts/jinteki/utils.ts` (197 LOC)
TS test counterpart: `test/ts/jinteki/utils.test.ts` (17 passing, 1 pre-existing failure)
Source LOC: 334 (most of which is the `command-info` def — 213 of 334 LOC)

## Units

| Unit | Source | TS |
| --- | ---: | ---: |
| defn  | 14 | 14 exported |
| def   | 2 (`INFINITY`, `command-info`) | 2 (`INFINITY`, `commandInfo`) |

## Per-function map

| Clojure | TypeScript | Notes |
| --- | --- | --- |
| `INFINITY` (2147483647) | `INFINITY` (2147483647) | Identical. |
| `str->int` | `strToInt` | Uses `parseInt(s, 10)`. clj does `re-find #"^\d+"` then parseInt — equivalent for valid prefixes. |
| `side-from-str` | `sideFromStr` | TS returns lowercased string; clj returns keyword. Sides are strings in the TS port (see `CORP_SIDE`/`RUNNER_SIDE`), so this is an acceptable transcription. |
| `faction-label` | `factionLabel` | Identical: nil/empty → `"neutral"`, otherwise lowercase + replace `" "` → `"-"`. |
| `other-side` | `otherSide` | Returns `""` for unknown side instead of `null`. See "Behavioural gaps" below — pre-existing baseline failure of one test confirms this. |
| `count-bad-pub` | `countBadPub` | Reads `state.corp.badPublicity.{base, additional}`, fall-back to clj-style kebab-case key. Sum returned. |
| `has-bad-pub?` | `hasBadPub` | `countBadPub(state) > 0`. |
| `count-tags` | `countTags` | Reads `state.runner.tag.total ?? 0`. |
| `count-real-tags` | `countRealTags` | Reads `state.runner.tag.base ?? 0`. |
| `is-tagged?` | `isTagged` | OR of `is-tagged` flag (kebab + camel) and `countTags > 0`. |
| `slugify` | `slugify` | 2-arity → default param. Normalize NFD + strip non-ASCII + split on punctuation + lowercase + trim. |
| `superuser?` | `superuser` | `isadmin || ismoderator`. |
| `to?` | `tournamentOrganizer` | Renamed (`to?` is unhelpful in TS — `tournamentOrganizer` makes the predicate explicit). |
| `capitalize` | `capitalize` | First char upper + slice(1). |
| `decapitalize` | `decapitalize` | First char lower + slice(1). |
| `make-label` | `makeLabel` | `capitalize(label || (string? msg && msg) || "")`. |
| `add-cost-to-label` | `addCostToLabel` | Adds cost prefix when both non-blank. Reads both `cost-label` and `costLabel`. |
| `select-non-nil-keys` | `selectNonNilKeys` | Generic `<T>` version. Skips keys whose value is null/undefined. |
| `command-info` | `commandInfo` | 1:1 transcription of all 65 chat-command entries. |

## Fixes applied

1. Replaced 5 × `state: any` with a narrow `StateReadable` interface (corp.badPublicity + runner.tag shape only). jinteki/* must stay independent of `game/core/state.ts` because the .cljc namespace is shared between server and client.
2. Made `isTagged` tolerant of both `is-tagged` (kebab) and `isTagged` (camel) keys — engine writes the kebab form, but cljs-side render code occasionally normalises to camel. Aligns with `player_stats.tsx` reader.

## Stubs / forbidden directives

- 0 `: any` / `<any>` / `as any` (down from 5)
- 0 `@ts-nocheck` / `@ts-ignore`
- 0 stub markers
- 0 TODO/FIXME
- The substring "any" appears once in `commandInfo` help text ("any position in a server") — not a type.

## Tests

- `test/ts/jinteki/utils.test.ts`: 17/18 pass.
- 1 pre-existing failure: `otherSide("spectator")` expects `null`, currently `""`. This was in baseline and is preserved to keep tsc green (changing to `null` would cascade into `agendas_5.ts:744,753` where unverified card code passes the result directly into string-typed parameters).
- `npx tsc --noEmit` → 0 diagnostics.

## Behavioural gaps

- `otherSide` returns `""` instead of `null` for unknown side. clj returns `nil`. Will be fixed when `cards/agendas.clj` is verified (the only known caller that would propagate the change into strict-typed positions).

## Verdict

Verified.
