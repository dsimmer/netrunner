// CLI for appending a ledger row. Designed to be called by verification agents
// (and by humans in pilot mode) without hand-writing JSON.
//
// Usage:
//   npx tsx src/ts/verification/append.ts \
//     --source src/clj/game/core/card_defs.clj \
//     --state verified \
//     --session session-2026-05-28-pilot \
//     [--notes "free text"] \
//     [--missing-fn name1,name2] \
//     [--missing-title "Card Title 1,Card Title 2"] \
//     [--extra-fn name1,name2] \
//     [--any-count 0] \
//     [--ts-nocheck-count 0] \
//     [--stub-marker "src/ts/foo.ts:// Stub helpers"]* \
//     [--fix kind:path:function:start-end]* \
//     [--source-defns N --source-defmethods N --source-defcards N --source-defmacros N --source-defmultis N] \
//     [--ts-exported-functions N --ts-exported-consts N --ts-exported-classes N --ts-exported-titles N] \
//     [--tsc-clean true|false] [--vitest-passed true|false]
//
// Reads the row's current ts_paths, ts_test_paths, source_kind, source_loc
// from the latest existing ledger row (collapsed). Refuses to append if no
// prior row exists (run resume.ts first).

import {
  appendRow,
  collapseLedger,
  readLedger,
} from "./ledger";
import { REPO_ROOT } from "./paths";
import {
  SCHEMA_VERSION,
  emptyChecks,
  emptyFindings,
  emptySourceUnits,
  emptyTsUnits,
  type FixKind,
  type LedgerRow,
  type LedgerState,
} from "./types";

interface ParsedArgs {
  source: string | null;
  state: LedgerState | null;
  session: string | null;
  notesPath: string | null;
  missingFns: string[];
  missingTitles: string[];
  extraFns: string[];
  behavioralGaps: string[];
  anyCount: number | null;
  tsNocheckCount: number | null;
  stubMarkers: string[];
  fixes: Array<{ kind: FixKind; ts_path: string; function_or_title: string; ranges: Array<{ start: number; end: number }> }>;
  sourceDefns: number | null;
  sourceDefmethods: number | null;
  sourceDefcards: number | null;
  sourceDefmacros: number | null;
  sourceDefmultis: number | null;
  tsExportedFunctions: number | null;
  tsExportedConsts: number | null;
  tsExportedClasses: number | null;
  tsExportedTitles: number | null;
  tscClean: boolean | null;
  vitestPassed: boolean | null;
}

function emptyArgs(): ParsedArgs {
  return {
    source: null,
    state: null,
    session: null,
    notesPath: null,
    missingFns: [],
    missingTitles: [],
    extraFns: [],
    behavioralGaps: [],
    anyCount: null,
    tsNocheckCount: null,
    stubMarkers: [],
    fixes: [],
    sourceDefns: null,
    sourceDefmethods: null,
    sourceDefcards: null,
    sourceDefmacros: null,
    sourceDefmultis: null,
    tsExportedFunctions: null,
    tsExportedConsts: null,
    tsExportedClasses: null,
    tsExportedTitles: null,
    tscClean: null,
    vitestPassed: null,
  };
}

function takeNext(argv: string[], i: number): { value: string; nextIndex: number } {
  const next = argv[i + 1];
  if (next === undefined) {
    throw new Error(`Missing value after ${argv[i]}`);
  }
  return { value: next, nextIndex: i + 1 };
}

function parseCsv(s: string): string[] {
  return s.split(",").map((x) => x.trim()).filter((x) => x.length > 0);
}

function parseFixSpec(s: string): {
  kind: FixKind;
  ts_path: string;
  function_or_title: string;
  ranges: Array<{ start: number; end: number }>;
} {
  // Format: kind:path:function:start-end
  const [kind, tsPath, fn, range] = s.split(":");
  if (kind === undefined || tsPath === undefined || fn === undefined || range === undefined) {
    throw new Error(`Bad --fix spec: ${s}`);
  }
  const [a, b] = range.split("-");
  if (a === undefined || b === undefined) throw new Error(`Bad range in --fix: ${s}`);
  return {
    kind: kind as FixKind,
    ts_path: tsPath,
    function_or_title: fn,
    ranges: [{ start: Number.parseInt(a, 10), end: Number.parseInt(b, 10) }],
  };
}

function parseArgs(argv: string[]): ParsedArgs {
  const out = emptyArgs();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--source") { const r = takeNext(argv, i); out.source = r.value; i = r.nextIndex; }
    else if (a === "--state") { const r = takeNext(argv, i); out.state = r.value as LedgerState; i = r.nextIndex; }
    else if (a === "--session") { const r = takeNext(argv, i); out.session = r.value; i = r.nextIndex; }
    else if (a === "--notes") { const r = takeNext(argv, i); out.notesPath = r.value; i = r.nextIndex; }
    else if (a === "--missing-fn") { const r = takeNext(argv, i); out.missingFns.push(...parseCsv(r.value)); i = r.nextIndex; }
    else if (a === "--missing-title") { const r = takeNext(argv, i); out.missingTitles.push(...parseCsv(r.value)); i = r.nextIndex; }
    else if (a === "--extra-fn") { const r = takeNext(argv, i); out.extraFns.push(...parseCsv(r.value)); i = r.nextIndex; }
    else if (a === "--behavioral-gap") { const r = takeNext(argv, i); out.behavioralGaps.push(r.value); i = r.nextIndex; }
    else if (a === "--any-count") { const r = takeNext(argv, i); out.anyCount = Number.parseInt(r.value, 10); i = r.nextIndex; }
    else if (a === "--ts-nocheck-count") { const r = takeNext(argv, i); out.tsNocheckCount = Number.parseInt(r.value, 10); i = r.nextIndex; }
    else if (a === "--stub-marker") { const r = takeNext(argv, i); out.stubMarkers.push(r.value); i = r.nextIndex; }
    else if (a === "--fix") { const r = takeNext(argv, i); out.fixes.push(parseFixSpec(r.value)); i = r.nextIndex; }
    else if (a === "--source-defns") { const r = takeNext(argv, i); out.sourceDefns = Number.parseInt(r.value, 10); i = r.nextIndex; }
    else if (a === "--source-defmethods") { const r = takeNext(argv, i); out.sourceDefmethods = Number.parseInt(r.value, 10); i = r.nextIndex; }
    else if (a === "--source-defcards") { const r = takeNext(argv, i); out.sourceDefcards = Number.parseInt(r.value, 10); i = r.nextIndex; }
    else if (a === "--source-defmacros") { const r = takeNext(argv, i); out.sourceDefmacros = Number.parseInt(r.value, 10); i = r.nextIndex; }
    else if (a === "--source-defmultis") { const r = takeNext(argv, i); out.sourceDefmultis = Number.parseInt(r.value, 10); i = r.nextIndex; }
    else if (a === "--ts-exported-functions") { const r = takeNext(argv, i); out.tsExportedFunctions = Number.parseInt(r.value, 10); i = r.nextIndex; }
    else if (a === "--ts-exported-consts") { const r = takeNext(argv, i); out.tsExportedConsts = Number.parseInt(r.value, 10); i = r.nextIndex; }
    else if (a === "--ts-exported-classes") { const r = takeNext(argv, i); out.tsExportedClasses = Number.parseInt(r.value, 10); i = r.nextIndex; }
    else if (a === "--ts-exported-titles") { const r = takeNext(argv, i); out.tsExportedTitles = Number.parseInt(r.value, 10); i = r.nextIndex; }
    else if (a === "--tsc-clean") { const r = takeNext(argv, i); out.tscClean = r.value === "true"; i = r.nextIndex; }
    else if (a === "--vitest-passed") { const r = takeNext(argv, i); out.vitestPassed = r.value === "true"; i = r.nextIndex; }
    else throw new Error(`Unknown arg: ${a}`);
  }
  return out;
}

export function buildRowFromArgs(args: ParsedArgs, prior: LedgerRow, now: Date = new Date()): LedgerRow {
  if (args.state === null) throw new Error("Missing --state");
  const nowIso = now.toISOString();
  const sourceUnits = emptySourceUnits();
  if (args.sourceDefns !== null) sourceUnits.defns = args.sourceDefns;
  if (args.sourceDefmethods !== null) sourceUnits.defmethods = args.sourceDefmethods;
  if (args.sourceDefcards !== null) sourceUnits.defcards = args.sourceDefcards;
  if (args.sourceDefmacros !== null) sourceUnits.defmacros = args.sourceDefmacros;
  if (args.sourceDefmultis !== null) sourceUnits.defmultis = args.sourceDefmultis;

  const tsUnits = emptyTsUnits();
  if (args.tsExportedFunctions !== null) tsUnits.exported_functions = args.tsExportedFunctions;
  if (args.tsExportedConsts !== null) tsUnits.exported_consts = args.tsExportedConsts;
  if (args.tsExportedClasses !== null) tsUnits.exported_classes = args.tsExportedClasses;
  if (args.tsExportedTitles !== null) tsUnits.exported_titles = args.tsExportedTitles;

  const findings = emptyFindings();
  findings.missing_functions = args.missingFns;
  findings.missing_titles = args.missingTitles;
  findings.extra_functions = args.extraFns;
  findings.behavioral_gaps = args.behavioralGaps;
  findings.any_count = args.anyCount ?? 0;
  findings.ts_nocheck_count = args.tsNocheckCount ?? 0;
  findings.stub_markers = args.stubMarkers;
  findings.notes_path = args.notesPath;

  const checks = emptyChecks();
  checks.tsc_clean = args.tscClean;
  checks.vitest_passed = args.vitestPassed;

  return {
    source_path: prior.source_path,
    source_kind: prior.source_kind,
    ts_paths: prior.ts_paths,
    ts_test_paths: prior.ts_test_paths,
    source_loc: prior.source_loc,
    source_units: sourceUnits,
    ts_units: tsUnits,
    state: args.state,
    claimed_by: args.session,
    claimed_at: prior.claimed_at,
    verified_at: args.state === "verified" ? nowIso : prior.verified_at,
    verifier_commit: prior.verifier_commit,
    findings,
    fixes_applied: args.fixes,
    checks,
    agent_session: args.session,
    schema_version: SCHEMA_VERSION,
    ts_event: nowIso,
  };
}

function isMain(): boolean {
  const argv1 = process.argv[1];
  return typeof argv1 === "string" && (argv1.endsWith("/append.ts") || argv1.endsWith("\\append.ts"));
}

if (isMain()) {
  const args = parseArgs(process.argv.slice(2));
  if (args.source === null) throw new Error("Missing --source");
  const ledger = readLedger();
  const collapsed = collapseLedger(ledger);
  const prior = collapsed.get(args.source);
  if (prior === undefined) {
    throw new Error(
      `No prior ledger row for ${args.source}. Run \`npx tsx src/ts/verification/resume.ts\` first to seed.`,
    );
  }
  const row = buildRowFromArgs(args, prior);
  appendRow(row, REPO_ROOT);
  process.stdout.write(
    `appended row: ${row.source_path} -> ${row.state} (session=${row.agent_session ?? "?"})\n`,
  );
}
