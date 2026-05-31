// Verification ledger types. Documented in
// /home/dos/.claude-personal/plans/plan-the-verification-of-cryptic-kahan.md §1.2

export type SourceKind = "clj" | "cljc" | "cljs";

export type LedgerState =
  | "todo"
  | "claimed"
  | "in_review"
  | "verified"
  | "blocked"
  | "regression";

export type FixKind =
  | "implement_function"
  | "remove_any"
  | "add_test"
  | "delete_extra"
  | "wire_helper"
  | "narrow_type"
  | "other";

export interface SourceUnits {
  defns: number;
  defcards: number;
  defmethods: number;
  defmacros: number;
  defmultis: number;
}

export interface TsUnits {
  exported_functions: number;
  exported_consts: number;
  exported_classes: number;
  exported_titles: number;
}

export interface Findings {
  missing_titles: string[];
  missing_functions: string[];
  extra_functions: string[];
  any_count: number;
  ts_nocheck_count: number;
  stub_markers: string[];
  behavioral_gaps: string[];
  notes_path: string | null;
}

export interface FixApplied {
  ts_path: string;
  kind: FixKind;
  function_or_title: string;
  ranges: Array<{ start: number; end: number }>;
}

export interface Checks {
  tsc_clean: boolean | null;
  vitest_passed: boolean | null;
  vitest_failures: string[];
  tsc_diagnostics: string[];
}

export interface LedgerRow {
  source_path: string;
  source_kind: SourceKind;
  ts_paths: string[];
  ts_test_paths: string[];
  source_loc: number;
  source_units: SourceUnits;
  ts_units: TsUnits;
  state: LedgerState;
  claimed_by: string | null;
  claimed_at: string | null;
  verified_at: string | null;
  verifier_commit: string | null;
  findings: Findings;
  fixes_applied: FixApplied[];
  checks: Checks;
  agent_session: string | null;
  schema_version: number;
  ts_event: string;
}

export const SCHEMA_VERSION = 1;

export function emptyFindings(): Findings {
  return {
    missing_titles: [],
    missing_functions: [],
    extra_functions: [],
    any_count: 0,
    ts_nocheck_count: 0,
    stub_markers: [],
    behavioral_gaps: [],
    notes_path: null,
  };
}

export function emptySourceUnits(): SourceUnits {
  return {
    defns: 0,
    defcards: 0,
    defmethods: 0,
    defmacros: 0,
    defmultis: 0,
  };
}

export function emptyTsUnits(): TsUnits {
  return {
    exported_functions: 0,
    exported_consts: 0,
    exported_classes: 0,
    exported_titles: 0,
  };
}

export function emptyChecks(): Checks {
  return {
    tsc_clean: null,
    vitest_passed: null,
    vitest_failures: [],
    tsc_diagnostics: [],
  };
}
