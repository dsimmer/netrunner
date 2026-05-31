// Orchestrator: resume a verification campaign.
//
// What this does (see plan §1.4):
//   1. Clean stale locks (>4h old per claimed_at timestamp).
//   2. Read ledger.jsonl, collapse to last row per source_path.
//   3. Walk src/clj, src/cljc, src/cljs; seed `todo` rows for any source file
//      with no ledger entry.
//   4. Reset `claimed` rows whose lock file disappeared back to `todo`.
//   5. Regenerate work/verification/STATUS.md.
//   6. Print a short report (and the top N todos) to stdout.
//
// Run: `npx tsx src/ts/verification/resume.ts [--report] [--limit N]`

import { existsSync, readdirSync, statSync, unlinkSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  REPO_ROOT,
  VERIFICATION_DIR,
  findSourceFiles,
  mapSourceToTsPaths,
  mapSourceToTsTests,
  flattenPath,
} from "./paths";
import { countLines } from "./enumerate";
import { readFileSync } from "node:fs";
import {
  appendRow,
  collapseLedger,
  isStaleLockTimestamp,
  newTodoRow,
  priorityKey,
  readLedger,
  sortByPriority,
} from "./ledger";
import { renderStatusMarkdown } from "./status";
import type { LedgerRow } from "./types";

const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;

function locksDir(repoRoot: string): string {
  return join(repoRoot, VERIFICATION_DIR, "locks");
}

function statusPath(repoRoot: string): string {
  return join(repoRoot, VERIFICATION_DIR, "STATUS.md");
}

function listLockFiles(repoRoot: string): string[] {
  const dir = locksDir(repoRoot);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith(".lock"));
}

function lockMtimeMs(repoRoot: string, fileName: string): number {
  const abs = join(locksDir(repoRoot), fileName);
  return statSync(abs).mtimeMs;
}

interface ResumeOptions {
  repoRoot?: string;
  now?: Date;
  write?: boolean;
  ttlMs?: number;
}

export interface ResumeReport {
  totalSourceFiles: number;
  totalLedgerRows: number;
  seededTodoRows: number;
  resetClaimedRows: number;
  removedStaleLocks: number;
  perState: Record<string, number>;
  nextBatch: LedgerRow[];
}

function fileLoc(repoRoot: string, rel: string): number {
  const abs = join(repoRoot, rel);
  if (!existsSync(abs)) return 0;
  return countLines(readFileSync(abs, "utf8"));
}

export function runResume(opts: ResumeOptions = {}): ResumeReport {
  const repoRoot = opts.repoRoot ?? REPO_ROOT;
  const now = opts.now ?? new Date();
  const write = opts.write ?? true;
  const ttlMs = opts.ttlMs ?? FOUR_HOURS_MS;

  // Ensure directory tree exists when write mode is on.
  if (write) {
    mkdirSync(join(repoRoot, VERIFICATION_DIR, "findings"), { recursive: true });
    mkdirSync(join(repoRoot, VERIFICATION_DIR, "locks"), { recursive: true });
    mkdirSync(join(repoRoot, VERIFICATION_DIR, "baselines"), { recursive: true });
  }

  // 1. Clean stale locks (by mtime, not by ledger lookup).
  let removedStaleLocks = 0;
  if (write) {
    const nowMs = now.getTime();
    for (const name of listLockFiles(repoRoot)) {
      const mtime = lockMtimeMs(repoRoot, name);
      if (nowMs - mtime > ttlMs) {
        unlinkSync(join(locksDir(repoRoot), name));
        removedStaleLocks++;
      }
    }
  }

  // 2. Read ledger and collapse.
  const allRows = readLedger(repoRoot);
  const collapsed = collapseLedger(allRows);

  // 3. Find source files; seed todo rows for any missing from the ledger.
  const sources = findSourceFiles(repoRoot);
  let seededTodoRows = 0;
  for (const { source_path, source_kind } of sources) {
    if (collapsed.has(source_path)) continue;
    const tsPaths = mapSourceToTsPaths(source_path, repoRoot);
    const tsTests = mapSourceToTsTests(source_path, repoRoot);
    const loc = fileLoc(repoRoot, source_path);
    const row = newTodoRow(source_path, source_kind, tsPaths, tsTests, loc, now.toISOString());
    if (write) appendRow(row, repoRoot);
    collapsed.set(source_path, row);
    seededTodoRows++;
  }

  // 4. Reset claimed rows whose lock disappeared.
  let resetClaimedRows = 0;
  if (write) {
    const liveLocks = new Set(listLockFiles(repoRoot));
    for (const row of collapsed.values()) {
      if (row.state !== "claimed") continue;
      const lockName = `${flattenPath(row.source_path)}.lock`;
      const lockOk =
        liveLocks.has(lockName) &&
        !isStaleLockTimestamp(row.claimed_at, now.getTime(), ttlMs);
      if (!lockOk) {
        const reverted: LedgerRow = {
          ...row,
          state: "todo",
          claimed_by: null,
          claimed_at: null,
          ts_event: now.toISOString(),
        };
        appendRow(reverted, repoRoot);
        collapsed.set(row.source_path, reverted);
        resetClaimedRows++;
      }
    }
  }

  // 5. Regenerate STATUS.md.
  if (write) {
    const md = renderStatusMarkdown(collapsed, now);
    const dest = statusPath(repoRoot);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, md, "utf8");
  }

  // 6. Report.
  const perState: Record<string, number> = {
    todo: 0,
    claimed: 0,
    in_review: 0,
    verified: 0,
    blocked: 0,
    regression: 0,
  };
  for (const r of collapsed.values()) perState[r.state]++;

  const todos = [...collapsed.values()].filter((r) => r.state === "todo" || r.state === "regression" || r.state === "blocked");
  const nextBatch = sortByPriority(todos).slice(0, 25);

  return {
    totalSourceFiles: sources.length,
    totalLedgerRows: collapsed.size,
    seededTodoRows,
    resetClaimedRows,
    removedStaleLocks,
    perState,
    nextBatch,
  };
}

function formatReport(report: ResumeReport, limit: number): string {
  const lines: string[] = [];
  lines.push(`Source files discovered: ${report.totalSourceFiles}`);
  lines.push(`Ledger rows (collapsed): ${report.totalLedgerRows}`);
  lines.push(`Seeded new todo rows:    ${report.seededTodoRows}`);
  lines.push(`Reset stale-claim rows:  ${report.resetClaimedRows}`);
  lines.push(`Removed stale locks:     ${report.removedStaleLocks}`);
  lines.push("");
  lines.push("State breakdown:");
  for (const [k, v] of Object.entries(report.perState)) {
    lines.push(`  ${k.padEnd(12)} ${v}`);
  }
  lines.push("");
  lines.push(`Next batch (top ${limit} by priority):`);
  for (const row of report.nextBatch.slice(0, limit)) {
    const key = priorityKey(row);
    const tier = key[0];
    lines.push(
      `  [tier=${tier} state=${row.state} loc=${row.source_loc}] ${row.source_path}  (ts_paths=${row.ts_paths.length}, tests=${row.ts_test_paths.length})`,
    );
  }
  return lines.join("\n");
}

function parseArgs(argv: string[]): { report: boolean; limit: number; noWrite: boolean } {
  let report = false;
  let limit = 25;
  let noWrite = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--report") report = true;
    else if (a === "--no-write") noWrite = true;
    else if (a === "--limit") {
      const next = argv[i + 1];
      if (next !== undefined) {
        const n = Number.parseInt(next, 10);
        if (!Number.isNaN(n)) limit = n;
        i++;
      }
    }
  }
  return { report, limit, noWrite };
}

function isMain(): boolean {
  // tsx sets process.argv[1] to the entrypoint
  const argv1 = process.argv[1];
  if (typeof argv1 !== "string") return false;
  return argv1.endsWith("/resume.ts") || argv1.endsWith("\\resume.ts");
}

if (isMain()) {
  const args = parseArgs(process.argv.slice(2));
  const report = runResume({ write: !args.noWrite });
  if (args.report || args.noWrite) {
    process.stdout.write(formatReport(report, args.limit) + "\n");
  } else {
    process.stdout.write(`STATUS.md regenerated. ${report.totalLedgerRows} rows tracked.\n`);
    process.stdout.write(formatReport(report, args.limit) + "\n");
  }
}
