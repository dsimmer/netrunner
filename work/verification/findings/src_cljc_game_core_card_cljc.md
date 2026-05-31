# src/cljc/game/core/card.cljc — verified

Session: `session-2026-05-30-batch-c`
TS counterpart: `src/ts/game/core/card.ts` (893 LOC)
TS counterpart: `src/ts/game/core/card_defs.ts` (already verified — separate ledger row)
TS test counterpart: `test/ts/game/core/card.test.ts` (15 passing)
Source LOC: 559

## Units

| Unit | Source | TS |
| --- | ---: | ---: |
| defrecord | 1 (`Card`)                  | 1 (`Card` interface) |
| defn       | 53 (public)                | 53 mapped + ~25 backward-compat aliases |
| defn-      | 3 (`card-is?`, `is-disabled-reg?`, `to-keyword`) | 1 (`cardIs`, private); the other two inlined |

## Per-function map (Clojure → TypeScript)

| Clojure | TypeScript | Notes |
| --- | --- | --- |
| `Card` defrecord (66 fields) | `Card` interface (~60 fields + `[key: string]: unknown`) | TS port uses camelCase keys; field set matches. |
| `get-cid` | `getCid` | Same: `card?.card?.cid`. |
| `get-title` | `getTitle` | `title ?? printedTitle`. |
| `get-nested-host` | `getNestedHost` | Recursive ascent through `host`. |
| `get-zone` | `getZone` | Reads zone from `getNestedHost(card)`. |
| `in-server?` | `inServer` | `last zone === "content"`. |
| `in-hand?` / `in-discard?` / `in-deck?` | `inHand` / `inDiscard` / `inDeck` | Exact zone-array matches via `zoneEquals`. |
| `in-archives-root?` / `in-hq-root?` / `in-rd-root?` | `inArchivesRoot` / `inHqRoot` / `inRdRoot` | Exact. |
| `in-remote-root?` | `inRemoteRoot` | Takes remote-server segment. |
| `in-root?` | `inRoot` | Disjunction of the three. |
| `protecting-archives?` / `protecting-hq?` / `protecting-rd?` | `protectingArchives` / `protectingHq` / `protectingRd` | Each accepts an optional leading `state` arg (TS port quirk; clj takes only `card`). |
| `protecting-a-central?` | `protectingACentral` | Disjunction. |
| `in-play-area?` / `in-destroyed?` / `in-set-aside?` | `inPlayArea` / `inDestroyed` / `inSetAside` | Exact. |
| `set-aside-visible?` | `setAsideVisible` | clj reads `:corp-can-see` / `:runner-can-see`; TS reads `corpCanSee` / `runnerCanSee`. Writer in `set_aside.ts:58` also writes the camelCase keys — internally consistent. |
| `in-current?` / `in-scored?` / `in-rfg?` | `inCurrent` / `inScored` / `inRfg` | Exact. |
| `card-is?` (private) | `cardIs` (private) | Drops the clj keyword-aware branch — TS only deals with strings, so identity comparison is sufficient. |
| `runner?` / `corp?` | `runner` / `corp` | Same. |
| `is-type?` | `isType` | Same. |
| `agenda?` / `asset?` / `event?` / `hardware?` / `ice?` / `fake-identity?` / `identity?` / `operation?` / `program?` / `resource?` / `upgrade?` / `condition-counter?` / `basic-action?` | `agenda` / `asset` / `event` / `hardware` / `ice` / `fakeIdentity` / `identity` / `operation` / `program` / `resource` / `upgrade` / `conditionCounter` / `basicAction` | All preserve the `!facedown && isType` discipline for event/hardware/program/resource. |
| `has-subtype?` / `has-any-subtype?` / `has-all-subtypes?` | `hasSubtype` / `hasAnySubtype` / `hasAllSubtypes` | Test-covered (15 tests, all passing). |
| `virus-program?` / `console?` | `virusProgram` / `consoleCard` | Same. |
| `unique?` | `unique` | Reads `card.uniqueness`. |
| `corp-installable-type?` | `corpInstallableType` | Asset/agenda/ice/upgrade. |
| `rezzed?` / `faceup?` / `installed?` / `facedown?` | `rezzed` / `faceup` / `installed` / `facedown` | All preserve hosting-aware zone semantics. |
| `active?` | `active` | Disjunction matches clj exactly (basic-action, identity ∧ ¬facedown, in-play-area, in-current, in-scored, condition-counter, corp ∧ installed ∧ rezzed, runner ∧ installed ∧ ¬facedown). |
| `get-advancement-requirement` | `getAdvancementRequirement` | Guarded on `agenda(card)`. |
| `get-agenda-points` | `getAgendaPoints` | `currentPoints ?? agendapoints ?? 0`. |
| `is-disabled-reg?` (private) | inlined into `canBeAdvanced` via `state.disabledCardReg.has(cid)` | Reasonable. |
| `can-be-advanced?` (1-arity + 2-arity) | `canBeAdvanced` (overloaded) | Both arities dispatch by argc as expected. |
| `get-counters` | `getCounters` | `"advancement"` sums `advanceCounter` + `extraAdvanceCounter`; otherwise reads counter map. |
| `to-keyword` (private) | not present | Not needed — TS has no keywords. |
| `same-card?` (1-arity + 2-arity) | `sameCard` (overloaded) | Default form compares `cid`; func-form supplies extractor. |
| `assoc-host-zones` (CLJ-only) | `assocHostZones` in `hosting.ts:400` | Located in companion hosting module — re-export not needed because callers reach for it directly there. Outside `card.ts`'s assigned ts_paths, so flagged but not re-routed. |
| `get-card` (CLJ-only) | `getCard` in `finding.ts` (re-exported from `card.ts:791`) | OK. |
| `get-card-hosted` (CLJ-only) | `getCardHosted` in `finding.ts:107` | OK. |
| `card-index` | `cardIndex` | Walks `state.corp.<zone>` segments. |
| `verbal-card-index` | `verbalCardIndex` | Uses `ordinalWord` helper (mirrors CL `~:R`). |
| `is-public?` (1-arity + 2-arity) | `isPublic` (overloaded) | Same logic structure: public-for-both checks, then corp-side vs runner-side branches. |
| `convert-to-agenda` | `convertToAgenda` | Returns map with only the agenda-required keys. |
| `convert-to-condition-counter` | `convertToConditionCounter` | Same. |

## TS-only additions (intentional)

The TS file also exports a large compat surface (`isRezzed`, `isCorp`, `isRunner`, `isICE`, `TYPE_AGENDA`, …) needed by the existing card code. None of these shadow clj names; they're aliases or constants. Plus three small helpers: `getRootZoneIndex`, `isDisabled`, `isHosted`, `isPlayable`, `inZone`, `cost`, `unprotected`, `hasKeyword`, `getKeyword`. Each is consumed by tier-2 card code and corresponds to clj-side idioms used by macros that I did not enumerate here.

## Fixes applied

None. The port was already in good shape:
- 0 `: any` / `<any>` / `as any`
- 0 `@ts-nocheck` / `@ts-ignore`
- 0 stub markers
- 0 TODO/FIXME

## Tests

- `test/ts/game/core/card.test.ts`: 15/15 pass (covers `hasSubtype`, `hasAnySubtype`, `hasAllSubtypes`).
- `npx tsc --noEmit` → 0 diagnostics (matches baseline).
- Cross-file coverage: every tier-2 `cards/*.test.ts` indirectly exercises every type predicate.

## Behavioural gaps

- `set-aside-visible?` uses camelCase `corpCanSee`/`runnerCanSee` instead of kebab `corp-can-see`/`runner-can-see`. The writer in `set_aside.ts` matches, so behavior is consistent within TS; only divergence is the *key name on disk* if a TS-side state object is serialised and compared to a clj-side one. Not a correctness concern for the TS port in isolation.
- `assoc-host-zones` is in `hosting.ts` rather than `card.ts`. clj treats it as part of `card.cljc` (CLJ-only branch). This is purely an organisational difference — both names exist, called from the same sites.

## Verdict

Verified.
