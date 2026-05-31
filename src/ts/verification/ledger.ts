import { readFileSync, existsSync, appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { REPO_ROOT, VERIFICATION_DIR } from "./paths";
import {
  SCHEMA_VERSION,
  emptyChecks,
  emptyFindings,
  emptySourceUnits,
  emptyTsUnits,
  type LedgerRow,
  type LedgerState,
  type SourceKind,
} from "./types";

export function ledgerPath(repoRoot: string = REPO_ROOT): string {
  return join(repoRoot, VERIFICATION_DIR, "ledger.jsonl");
}

export function readLedger(repoRoot: string = REPO_ROOT): LedgerRow[] {
  const path = ledgerPath(repoRoot);
  if (!existsSync(path)) return [];
  const text = readFileSync(path, "utf8");
  const out: LedgerRow[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    try {
      out.push(JSON.parse(trimmed) as LedgerRow);
    } catch {
      // Skip malformed lines rather than aborting; ledger is append-only and tolerant.
    }
  }
  return out;
}

export function collapseLedger(rows: LedgerRow[]): Map<string, LedgerRow> {
  // Last writer wins, keyed by source_path. ts_event is the tiebreaker for rows
  // appended in unusual orders (e.g. recovered crashes).
  const map = new Map<string, LedgerRow>();
  for (const row of rows) {
    const cur = map.get(row.source_path);
    if (cur === undefined) {
      map.set(row.source_path, row);
      continue;
    }
    if (row.ts_event >= cur.ts_event) map.set(row.source_path, row);
  }
  return map;
}

export function appendRow(row: LedgerRow, repoRoot: string = REPO_ROOT): void {
  const path = ledgerPath(repoRoot);
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, JSON.stringify(row) + "\n", "utf8");
}

export function newTodoRow(
  sourcePath: string,
  sourceKind: SourceKind,
  tsPaths: string[],
  tsTestPaths: string[],
  sourceLoc: number,
  now: string = new Date().toISOString(),
): LedgerRow {
  return {
    source_path: sourcePath,
    source_kind: sourceKind,
    ts_paths: tsPaths,
    ts_test_paths: tsTestPaths,
    source_loc: sourceLoc,
    source_units: emptySourceUnits(),
    ts_units: emptyTsUnits(),
    state: "todo",
    claimed_by: null,
    claimed_at: null,
    verified_at: null,
    verifier_commit: null,
    findings: emptyFindings(),
    fixes_applied: [],
    checks: emptyChecks(),
    agent_session: null,
    schema_version: SCHEMA_VERSION,
    ts_event: now,
  };
}

export function isStaleLockTimestamp(
  claimedAt: string | null,
  nowMs: number,
  ttlMs: number,
): boolean {
  if (claimedAt === null) return false;
  const t = Date.parse(claimedAt);
  if (Number.isNaN(t)) return true;
  return nowMs - t > ttlMs;
}

const STATE_PRIORITY: Record<LedgerState, number> = {
  regression: 0,
  blocked: 1,
  todo: 2,
  claimed: 3,
  in_review: 4,
  verified: 5,
};

const TIER_FOUNDATIONS = new Set<string>([
  "src/cljc/jinteki/utils.cljc",
  "src/clj/game/utils.clj",
  "src/clj/game/core/eid.clj",
  "src/clj/game/core/effects.clj",
  "src/clj/game/core/engine.clj",
  "src/clj/game/core/checkpoint.clj",
  "src/clj/game/core/prompts.clj",
  "src/clj/game/core/def_helpers.clj",
  "src/clj/game/core/card_defs.clj",
  "src/cljc/game/core/card.cljc",
]);

const CARD_FILE_SIZE_ORDER: string[] = [
  "src/clj/game/cards/basic.clj",
  "src/clj/game/cards/upgrades.clj",
  "src/clj/game/cards/agendas.clj",
  "src/clj/game/cards/hardware.clj",
  "src/clj/game/cards/identities.clj",
  "src/clj/game/cards/operations.clj",
  "src/clj/game/cards/programs.clj",
  "src/clj/game/cards/assets.clj",
  "src/clj/game/cards/resources.clj",
  "src/clj/game/cards/events.clj",
  "src/clj/game/cards/ice.clj",
];

export function priorityTier(sourcePath: string): number {
  if (TIER_FOUNDATIONS.has(sourcePath)) return 0;
  if (sourcePath === "src/ts/game/cards/_helpers.ts") return 1;
  if (CARD_FILE_SIZE_ORDER.includes(sourcePath)) {
    // Tier 2 with sub-ordering preserved via the array index
    return 2;
  }
  if (sourcePath.startsWith("src/clj/web/")) return 3;
  if (sourcePath.startsWith("src/clj/tasks/")) return 3;
  if (sourcePath.startsWith("src/cljs/")) return 4;
  // Other clj/cljc files (core utilities, etc.) sit between foundations and cards
  return 2;
}

export function priorityKey(row: LedgerRow): [number, number, number, string] {
  const tier = priorityTier(row.source_path);
  const stateRank = STATE_PRIORITY[row.state];
  const subOrder = CARD_FILE_SIZE_ORDER.indexOf(row.source_path);
  const loc = row.source_loc;
  // Card files sort by their hand-picked size order; everything else by raw LOC ascending.
  const sortKey = subOrder >= 0 ? subOrder : loc;
  return [tier, stateRank, sortKey, row.source_path];
}

export function sortByPriority(rows: LedgerRow[]): LedgerRow[] {
  return [...rows].sort((a, b) => {
    const ka = priorityKey(a);
    const kb = priorityKey(b);
    for (let i = 0; i < 4; i++) {
      const av = ka[i];
      const bv = kb[i];
      if (av === bv) continue;
      if (typeof av === "number" && typeof bv === "number") return av - bv;
      return String(av).localeCompare(String(bv));
    }
    return 0;
  });
}
