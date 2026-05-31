# Batch H: small tier-2 utilities (33-50 LOC) — verified (8 files)

Session: `session-2026-05-30-batch-h`

All 8 files in this batch were already cleanly ported with 0 type-level `any`. Verification
required no fixes — only confirmation of function presence and signature match.

| Source | TS counterpart | LOC | Units | TS exports |
| --- | --- | ---: | --- | --- |
| `src/clj/game/core/expend.clj` | `src/ts/game/core/expend.ts` | 33 | 2 defns | `expendable`, `expend` |
| `src/clj/game/core/toasts.clj` | `src/ts/game/core/toasts.ts` | 33 | 3 defns | `toast`, `ackToast`, `showErrorToast` |
| `src/clj/game/core/link.clj` | `src/ts/game/core/link.ts` | 35 | 3 public defns + 1 private (`sum-link-effects`) | `getLink`, `updateLink`, `linkPlus` (private inlined) |
| `src/clj/game/quotes.clj` | `src/ts/game/quotes.ts` | 35 | 2 public defns + 2 private | `loadQuotes`, `makeQuote` |
| `src/clj/game/core/update.clj` | `src/ts/game/core/update.ts` | 36 | 2 defns (`update!`, `update-hosted!`) | `update`, `updateCard` (alias), `updateIn` (TS-only helper) |
| `src/cljc/jinteki/card_backs.cljc` | `src/ts/jinteki/card_backs.ts` | 37 | 2 defns + `base-card-backs` def | `justPrizes`, `cardBacksForSide`, `BaseCardBacks`, `CardBacks` |
| `src/clj/game/core/charge.clj` | `src/ts/game/core/charge.ts` | 38 | 3 defns | `canCharge`, `chargeCard`, `chargeAbility` |
| `src/clj/game/core/mark.clj` | `src/ts/game/core/mark.ts` | 39 | 3 defns + 2 defs | `setMark`, `isMark`, `identifyMark`, `identifyMarkAbility`, `markChangedEvent` |

## Fixes applied

None. All 8 files compiled tsc-clean with 0 type-level `any` before this session began.
The matches grep returned for "any" were comment-only ("if any segment is missing", "Check if any installed card").

## Tests

- Targeted tests exist for `quotes.clj` (`test/ts/game/quotes.test.ts`), `charge.clj` (`test/ts/game/core/charge.test.ts`), and `mark.clj` (`test/ts/game/core/mark.test.ts`); the rest have no dedicated test file.
- `npx tsc --noEmit` → 0 diagnostics.
- Vitest unchanged from baseline.

## Behavioural gaps

None.

## Verdict

8 files verified.
