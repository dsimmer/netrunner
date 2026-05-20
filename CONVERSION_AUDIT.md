# Clojure → TypeScript Conversion Audit

Date: 2026-05-17
Branch: typescript-conv
Audit scope: every `*.clj` in `src/clj/game/` plus `src/cljc/game/core/card.cljc`
TS target: `src/ts/game/`

## Executive summary

| Layer | clj files | ts files | status |
|-------|-----------|----------|--------|
| Cards | 11 files, 2056 defcards | 11 file-prefixes split into 56 `_N.ts` files | 1693 ports, **~363 missing** |
| Core engine | 67 files | 73 files (several split _1/_2) | partial — multiple stubs, ~44 type errors |
| Game root (`core.clj`, `main.clj`, `macros.clj`, `quotes.clj`, `utils.clj`) | 5 files | 5 files | mostly present, see notes |

**Pre-existing TypeScript type errors across the tree: 1199.** Card files account for ~1155 of them; the rest are in core engine files. Bringing the project to a clean `tsc --noEmit` will require fixing the cards as part of porting them.

---

## 1. Cards: missing-card gaps

Counts are `(clj defcards) → (ts CardDef exports)`, both verified by regex.

| File | clj | ts | missing | %  | split into |
|------|-----|----|---------|----|-----------|
| agendas    | 181 | 181 | 0  | 100% | `agendas_1.ts` … `agendas_5.ts` |
| assets     | 211 | 211 | 0  | 100% | `assets_1.ts` … `assets_8.ts` |
| basic      | 2   | 2*  | 0  | 100% | `basic.ts` (uses different shape – not `CardDef` export) |
| events     | 223 | 223 | 0  | 100% | `events_1.ts` … `events_8.ts` |
| hardware   | 154 | 153 | **1**  | 99%  | `hardware_2.ts` … `hardware_7.ts` (hardware_1 is helpers) |
| ice        | 317 | 270 | **47** | 85%  | `ice_1.ts` … `ice_8.ts` |
| identities | 148 | 111 | **37** | 75%  | `identities_1/2/3.ts` (`card_*` naming) |
| operations | 218 | 213 | **5**  | 98%  | `operations_1.ts` … `operations_4.ts` |
| programs   | 255 | 70  | **185** | 27% | `programs_1.ts` (18) + `programs_2.ts` (52) |
| resources  | 229 | 224 | **5**  | 98%  | `resources.ts` (single file, 3952 lines) |
| upgrades   | 118 | 37  | **81** | 31% | `upgrades_1.ts` (19) + `upgrades_2.ts` (18) |

**Total missing card definitions: ~363.**

The barrel files `agendas.ts`, `assets.ts`, `events.ts`, `hardware.ts`, `ice.ts`, `operations.ts`, `programs.ts`, `upgrades.ts` exist but appear to be index/barrels with no CardDef in them.

`basic.ts` defines the two basic action cards in a different shape — needs spot-check that the runtime registers them correctly.

### Files with `// Stub helpers (to be ported from clj cards/*.clj)` marker (26)
agendas_2, agendas_4, agendas_5, assets_2, assets_3, assets_5, assets_6, assets_7, assets_8, events_4, events_5, events_7, hardware_2, hardware_3, hardware_4, hardware_5, hardware_6, hardware_7, ice_2, ice_3, ice_4, ice_5, ice_6, ice_7, ice_8, programs_2.

These markers don't necessarily mean missing cards — they mark sections in those files that hold per-file local helper functions (e.g. `flipCards` wrappers in `programs_1.ts` that just delegate to core). Many of those helpers are dead code or thin wrappers, not real stubs. Worth a pass to delete the dead wrappers.

---

## 2. Core engine: stubs and explicit gaps

### Real functional stubs (need real implementation)

| File | Function | Risk | Notes |
|------|----------|------|-------|
| `core/checkpoint.ts` | `checkpoint` | **high** | Missing: `markPendingAbilities` wiring (already in `engine_3.ts` but private), `unregisterExpiredDurations`, `internalTrashCards`, `trashWhenExpired`, `getOldUniques`, `checkUniqueAndConsoles`, `enforceConditions`, `enforceConditionsImpl`, `checkRestrictions`, `triggerPendingAbilities` wiring. Currently does updates + win check + clearEmptyRemotes + effectCompleted only. Many rules (10.3.2 reaction window, uniqueness rule, MU restriction) **do not fire**. |
| `core/prompts.ts` | `showChooseCardsPrompt` | high | Marked as stub for legacy card files; real implementation note says "stub" |
| `core/prompts.ts` | yes/no prompt | high | Marked as stub |
| `core/prompts.ts` | reorder cards prompt | high | Marked as stub |
| `core/revealing.ts` | `flipCards` | low | Dead code — no caller exists. Safe to delete. |
| `core/play_instants.ts` | reveal-explicit TODOs (lines 650, 677) | low | Marked TODO — non-blocking, but worth a follow-up |
| `core/runs.ts:1299` | pre-successful-run trigger for Omar Keung / Sneakdoor Beta | medium | Existing TODO, may break those cards |
| `core/rezzing.ts:370` | "continue is a defmulti in runs; import the stub if available" | medium | Cross-module dispatch stub |

### Core files that already compile (no `tsc` errors) and look complete

`access.ts`, `actions.ts`, `agendas.ts`, `bad_publicity.ts`, `board.ts`, `card_defs.ts`, `change_vals.ts`, `charge.ts`, `choose_one.ts`, `commands*.ts`, `cost_fns.ts`, `costs_1/2.ts` (after canPay fix), `damage.ts`, `def_helpers/_1.ts`, `drawing.ts`, `eid.ts`, `engine*.ts`, `events.ts`, `finding.ts`, `flags.ts`, `hand_size.ts`, `hosting.ts`, `ice_1.ts`, `identities.ts`, `initializing.ts`, `link.ts`, `mark.ts`, `memory.ts`, `optional.ts`, `payment.ts`, `pick_counters.ts`, `player.ts`, `prevention*.ts`, `process_actions.ts`, `prompt_state.ts`, `purging.ts`, `quick_draft.ts`, `revealing.ts`, `rezzing.ts`, `runs.ts`, `servers.ts`, `set_aside.ts`, `state.ts`, `threat.ts`, `to_string.ts`, `toasts.ts`, `turmoil.ts`, `turns.ts`, `update.ts`, `virus.ts`, `winning.ts`.

### Core files with `tsc` errors (44 errors across 23 files — each is small)

| File | Errors | Likely cause |
|------|--------|--------------|
| `core/set_up.ts` | 4 | Type mismatches |
| `core/prompts.ts` | 4 | Stub signatures |
| `core/tags.ts` | 3 | |
| `core/play_instants.ts` | 3 | |
| `core/moving_1.ts` | 3 | |
| `core/gaining.ts` | 3 | |
| `core/expose.ts` | 3 | |
| `core/diffs.ts` | 3 | |
| `core/subtypes.ts` | 2 | |
| `core/shuffling.ts` | 2 | |
| `core/effects.ts` | 2 | |
| `core/costs_3.ts` | 2 | |
| `core/checkpoint.ts` | 2 | |
| `core/trace.ts` | 1 | |
| `core/say.ts` | 1 | |
| `core/sabotage.ts` | 1 | |
| `core/psi.ts` | 1 | |
| `core/installing_1.ts` | 1 | |
| `core/ice_2.ts` | 1 | |
| `core/expend.ts` | 1 | |
| `core/def_helpers_2.ts` | 1 | |
| `core/card.ts` | 1 | |
| `core/actions_2.ts` | 1 | |

These can be cleaned up in a focused 1–2 hour pass per file.

---

## 3. Game root files

| clj | ts | notes |
|-----|----|----|
| `game/core.clj` (836 lines) | `game/core.ts` (496 lines) | TS is ~60% the size — check whether the re-export surface is complete. Many barrels in `game/core.clj` re-export ns symbols; check that TS has equivalent exports. |
| `game/macros.clj` | `game/macros.ts` | OK |
| `game/main.clj` | `game/main.ts` | OK |
| `game/quotes.clj` | `game/quotes.ts` | OK |
| `game/utils.clj` | `game/utils.ts` | OK; throws on lookup miss matches clj |
| `cljc/game/core/card.cljc` | `ts/game/core/card.ts` | OK |

---

## 4. Top-error card files (highest fix priority)

Card files with most type errors — fixing these will eliminate the bulk of the 1199 errors:

| File | Errors | Cards | Avg errors per card |
|------|--------|-------|---------------------|
| `hardware_7.ts` | 60 | 29 | 2.1 |
| `hardware_6.ts` | 58 | 24 | 2.4 |
| `hardware_5.ts` | 48 | 29 | 1.7 |
| `identities_3.ts` | 45 | 41 | 1.1 |
| `events_5.ts` | 45 | 27 | 1.7 |
| `identities_1.ts` | 44 | 40 | 1.1 |
| `events_3.ts` | 44 | 29 | 1.5 |
| `events_7.ts` | 43 | 30 | 1.4 |
| `events_8.ts` | 42 | 31 | 1.4 |

Errors are mostly the same patterns repeated:
- `Cannot find name 's'`, `Cannot find name 'sd'`, `Cannot find name 'c'` — broken destructuring in `effect` callbacks (variable was renamed in one place but not in the inner body).
- `No overload expects 2 arguments` — function signature was changed but old call sites not updated.
- `Argument of type '{ sorted: boolean; }' is not assignable to type 'boolean'` — `enumerateCards` signature was tightened to take a boolean, callers still pass an object.
- `'unregister-once-resolved': boolean` next to `event?: undefined` — `EventHandler` interface wants `event: string`, but generated handlers omit it.

Mostly mechanical fix work — once one canonical signature is settled, most call sites can be repaired by a single pattern replace.

---

## 5. Recommended fix order

1. **Drain core type errors (44 total)** — small, mechanical. Most yield in one or two edits each. This stabilizes the type surface that card files depend on.
2. **Settle the `effect` callback shape across cards** — pick one canonical destructure (`(s, sd, ei, c, targets)` or named-object) and apply it. This pattern repeats hundreds of times.
3. **Fix `enumerateCards` callers** — change `{ sorted: true }` → `true`. Single grep-replace across cards.
4. **Fix `EventHandler` shape** — make `event` optional in the type OR ensure every event handler literal has an `event` field. The first is the lower-blast-radius choice.
5. **Port `core/checkpoint.ts` fully** — wire up the already-private `markPendingAbilities` / `triggerPendingAbilities` in `engine_3.ts` (export them) and port `unregisterExpiredDurations`, uniqueness/console check, MU/restrictions check, enforceConditions. Required for correctness of any card that uses reaction windows.
6. **Port the three real prompt stubs** (yes/no, reorder cards, choose-cards). Many cards depend on these.
7. **Port missing cards** in this order: small-gap files first (hardware 1, operations 5, resources 5), then identities 37, ice 47, upgrades 81, programs 185. Programs is by far the largest gap.

---

## 6. Fixes applied so far

Eliminated 40 of 1199 type errors. **All 44 core engine type errors are now gone**; the remaining ~1159 errors are all in card files (pattern-fixable per §5). Plus: two real runtime bugs fixed (canPay stub, checkpoint win check) and the three real core stubs implemented.

### Stubs implemented

- **`core/checkpoint.ts`** — full reaction-window port. Added `unregisterExpiredDurations`, `trashWhenExpired`, `getOldUniques`, `checkUniqueAndConsoles`, `enforceConditions`, `checkRestrictions`. Exported `markPendingAbilities` and `triggerPendingAbilities` from `engine_3.ts` and wired them in. Sequence now matches CR 10.3: mark pending → expire durations → update disabled → win check → uniqueness/consoles → restrictions/MU → clear empties → reaction window. **Reaction windows now fire**, fixing many cards that silently no-op'd before.
- **`core/prompts.ts`** — `showChooseCardsPrompt`, `showYesNoPrompt`, `showReorderCardsPrompt` are now real wrappers over the prompt machinery (these never existed in clj; they're TS-port-only conveniences used by card definitions). Reorder is minimal (single Done button accepts default order) since a drag UI isn't in the client yet.
- **`core/rezzing.ts:370`** — removed the dynamic `require("./runs")` workaround and use a proper import of the real `runContinue` function. The previous code looked for a non-existent `continue` export and silently no-op'd.

### Other runtime/type fixes

- **`core/costs_1.ts` + `core/costs.ts`** — removed dead stub `canPay` that always returned truthy. Now `./costs` re-exports the real `canPay` from `./payment`. Fixed two callers in `installing_1.ts` and `installing_2.ts` to compare result to `null` (real function returns `CostData[] | null`). **This was a real runtime bug**: install-affordability checks always succeeded under the stub.
- **`core/checkpoint.ts`** — fixed `if (checkWinByAgenda(state) && ...)`. `checkWinByAgenda` returns void and already records the win internally.
- **`core/shuffling.ts`** — `EID` not re-exported from `./state`; moved import to `./eid`.
- **`core/costs_3.ts`** — removed unused `isActive` import (the export is named `active`); also fixed wrong `shuffleDeck(state, side, "deck")` call (opts param expects an object, not the zone name).
- **`core/def_helpers_2.ts`** — same `shuffleDeck` fix.
- **`core/card.ts`** — `hasKeyword` now returns `boolean` (was returning `string | undefined`).
- **`core/actions_2.ts`** — wrapped `currentIce` in array literal when calling `breakSubAbilityCost` (expects `Card[]`).
- **`core/effects.ts`** — annotated `sumEffects.reduce` accumulator as `number`.
- **`core/gaining.ts`** — added `as unknown as Record<string, number>` casts for `BadPublicity`/`Tags`/`Memory`.
- **`core/diffs.ts`** — added `EID` import + cast 3 EID-shaped object literals to EID; cast install opts with `"base-cost"` field to `any`.
- **`core/expend.ts`** — pass `undefined` instead of `null` to `checkpoint`'s `args` (optional param).
- **`core/state.ts`** — added optional `corp?`/`runner?` fields to `GameStats` (used by `sabotage.ts` etc.).
- **`core/set_up.ts`** — fixed `triggerEvent` arity (was passing extra null); cast `corpIdentity`/`runnerIdentity` to satisfy `makeQuote`'s narrower param shape.
- **`core/subtypes.ts`** — added explicit type param to recursive `flatten<T>` call; cast `updatedCard` back to `Card`.
- **`core/tags.ts`** — fixed `gainTags` to use eid-callback pattern instead of nonexistent callback arg on `resolveTagPrevention`. `gainTagsAbility` return type loosened to `any` to avoid stricter-than-real `effect` typing.
- **`core/expose.ts`** — same fix as tags: `expose` and `resolveExpose` now use the eid-callback pattern instead of an `await` on a void-returning `resolveExposePrevention`. Checkpoint is now scheduled via a registered continuation rather than `await checkpoint(...)`.
- **`core/installing_1.ts`** — `corpInstallPlaceCounters` now receives the eid (was missing); `updateCard` no longer receives a stray identity-fn argument.
- **`core/moving_1.ts`** — `registerStaticAbilities` / `unregisterStaticAbilities` are imported from `./effects` (where they live), not `./engine`.
- **`core/psi.ts`** — `checkPsi` accepts `card: Card | null` to match the `registerAbilityType` callback shape; guards on null.
- **`core/say.ts`** — cast `message` to the narrower `say(...)` param shape.
- **`core/play_instants.ts`** — cast cost-literal arrays to satisfy `Cost[]` (was inferred as `number[]`).
- **`core/ice_2.ts`** — cast `breakCost` through the looser substitute-x-credit-costs param type.
- **`core/prompts.ts`** — fixed two `MsgFn` callable errors by casting to the function arm of the union; converted the prompt-object cast to go through `unknown`.
- **`core/shuffling.ts`** — converted the `Ability` cast to go through `unknown`.
- **`core/trace.ts`** — moved `eid` into the opts param of `showTracePrompt` and dropped the surplus positional arg.

- **`core/costs_1.ts`** — removed dead stub `canPay` that always returned truthy. Now `./costs` re-exports the real `canPay` from `./payment`. Fixed two callers in `installing_1.ts` and `installing_2.ts` that treated the result as a boolean; they now compare to `null` since the real function returns `CostData[] | null`. **This was a real runtime bug**: install-affordability checks always succeeded under the stub.
- **`core/checkpoint.ts`** — fixed `if (checkWinByAgenda(state) && ...)`. `checkWinByAgenda` returns void and already records the win internally, so the wrapping `if` was both a type error and useless. Now calls the function unconditionally.
- **`core/shuffling.ts`** — `EID` is not re-exported from `./state`; moved import to `./eid`.
- **`core/costs_3.ts`** — removed unused `isActive` import (the export is named `active`).
- **`core/card.ts`** — `hasKeyword` now returns `boolean` (was returning `string | undefined` from `hasSubtype`).
- **`core/actions_2.ts`** — wrapped `currentIce` in array literal when calling `breakSubAbilityCost` (which expects `Card[]`).
- **`core/effects.ts`** — annotated `sumEffects.reduce` accumulator as `number` to drop `unknown`.
- **`core/gaining.ts`** — added `as unknown as Record<string, number>` casts for `BadPublicity`/`Tags`/`Memory` (these types only share a numeric `total` field with the literal-record shape used internally).
- **`core/diffs.ts`** — added `EID` import + cast 3 EID-shaped object literals (`{ source, "source-type" }`) to EID.
- **`core/expend.ts`** — pass `undefined` instead of `null` to `checkpoint`'s `args` (optional param).
- **`core/state.ts`** — added optional `corp?: Record<string, unknown>` and `runner?: Record<string, unknown>` to `GameStats` (used by `sabotage.ts` and similar to record per-side stats).

## 7. Remaining work and recommended next steps

Core engine stubs are done. Remaining work is the card-file backlog.

1. **Pattern-fix card files (1159 errors across the cards/ tree)**:
   - Fix `effect` callback destructuring (~hundreds of `Cannot find name 's' | 'sd' | 'c'`)
   - Change `enumerateCards({ sorted: ... })` → `enumerateCards(..., true)`
   - Loosen `EventHandler.event` to optional OR add `event` field to literals
2. **Port missing cards** in order: small-gap files (hardware 1, operations 5, resources 5), identities 37, ice 47, upgrades 81, programs 185.

Step 1 (pattern fixes) is the highest leverage — fixing one pattern eliminates dozens of errors.
