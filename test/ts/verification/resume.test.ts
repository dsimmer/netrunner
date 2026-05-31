import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  readFileSync,
  existsSync,
  utimesSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  collapseLedger,
  isStaleLockTimestamp,
  newTodoRow,
  priorityKey,
  priorityTier,
  sortByPriority,
} from "@/verification/ledger";
import {
  findSourceFiles,
  flattenPath,
  mapSourceToTsPaths,
  mapSourceToTsTests,
  relUnderSource,
} from "@/verification/paths";
import { countLines, enumerateSource, enumerateTsPaths } from "@/verification/enumerate";
import { renderStatusMarkdown } from "@/verification/status";
import { runResume } from "@/verification/resume";
import { SCHEMA_VERSION, emptyChecks, emptyFindings, emptySourceUnits, emptyTsUnits } from "@/verification/types";
import type { LedgerRow } from "@/verification/types";

function makeRow(overrides: Partial<LedgerRow>): LedgerRow {
  const base: LedgerRow = {
    source_path: "src/clj/game/core/eid.clj",
    source_kind: "clj",
    ts_paths: [],
    ts_test_paths: [],
    source_loc: 0,
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
    ts_event: "2026-05-28T00:00:00Z",
  };
  return { ...base, ...overrides };
}

describe("paths.relUnderSource", () => {
  it("strips src/clj/ and the extension", () => {
    expect(relUnderSource("src/clj/game/core/engine.clj")).toBe("game/core/engine");
  });
  it("strips src/cljc/", () => {
    expect(relUnderSource("src/cljc/jinteki/utils.cljc")).toBe("jinteki/utils");
  });
  it("strips src/cljs/", () => {
    expect(relUnderSource("src/cljs/nr/gameboard/board.cljs")).toBe("nr/gameboard/board");
  });
});

describe("paths.flattenPath", () => {
  it("replaces slashes and dots with underscores", () => {
    expect(flattenPath("src/clj/game/cards/programs.clj")).toBe(
      "src_clj_game_cards_programs_clj",
    );
  });
});

describe("ledger.priorityTier", () => {
  it("foundations are tier 0", () => {
    expect(priorityTier("src/clj/game/core/engine.clj")).toBe(0);
    expect(priorityTier("src/cljc/jinteki/utils.cljc")).toBe(0);
    expect(priorityTier("src/cljc/game/core/card.cljc")).toBe(0);
  });
  it("_helpers.ts is tier 1", () => {
    expect(priorityTier("src/ts/game/cards/_helpers.ts")).toBe(1);
  });
  it("card files are tier 2", () => {
    expect(priorityTier("src/clj/game/cards/programs.clj")).toBe(2);
    expect(priorityTier("src/clj/game/cards/basic.clj")).toBe(2);
  });
  it("web is tier 3", () => {
    expect(priorityTier("src/clj/web/lobby.clj")).toBe(3);
    expect(priorityTier("src/clj/tasks/db.clj")).toBe(3);
  });
  it("cljs is tier 4", () => {
    expect(priorityTier("src/cljs/nr/gameboard/board.cljs")).toBe(4);
  });
});

describe("ledger.sortByPriority", () => {
  it("orders foundations before cards before web before cljs", () => {
    const rows: LedgerRow[] = [
      makeRow({ source_path: "src/cljs/nr/main.cljs", source_loc: 100 }),
      makeRow({ source_path: "src/clj/game/cards/basic.clj", source_loc: 210 }),
      makeRow({ source_path: "src/clj/web/lobby.clj", source_loc: 900 }),
      makeRow({ source_path: "src/clj/game/core/engine.clj", source_loc: 1325 }),
    ];
    const sorted = sortByPriority(rows).map((r) => r.source_path);
    expect(sorted).toEqual([
      "src/clj/game/core/engine.clj",
      "src/clj/game/cards/basic.clj",
      "src/clj/web/lobby.clj",
      "src/cljs/nr/main.cljs",
    ]);
  });

  it("within card tier, uses hand-picked size order (basic before ice)", () => {
    const rows: LedgerRow[] = [
      makeRow({ source_path: "src/clj/game/cards/ice.clj", source_loc: 4888 }),
      makeRow({ source_path: "src/clj/game/cards/basic.clj", source_loc: 210 }),
      makeRow({ source_path: "src/clj/game/cards/agendas.clj", source_loc: 2678 }),
    ];
    const sorted = sortByPriority(rows).map((r) => r.source_path);
    expect(sorted[0]).toBe("src/clj/game/cards/basic.clj");
    expect(sorted[sorted.length - 1]).toBe("src/clj/game/cards/ice.clj");
  });

  it("regression beats todo in state ranking when same tier", () => {
    const rows: LedgerRow[] = [
      makeRow({ source_path: "src/clj/game/core/effects.clj", state: "todo", source_loc: 200 }),
      makeRow({ source_path: "src/clj/game/core/eid.clj", state: "regression", source_loc: 57 }),
    ];
    const sorted = sortByPriority(rows).map((r) => r.source_path);
    expect(sorted[0]).toBe("src/clj/game/core/eid.clj");
  });
});

describe("ledger.priorityKey", () => {
  it("returns a tuple whose first element is the tier", () => {
    const key = priorityKey(makeRow({ source_path: "src/clj/game/core/engine.clj" }));
    expect(key[0]).toBe(0);
  });
});

describe("ledger.collapseLedger", () => {
  it("keeps the latest row per source_path by ts_event", () => {
    const rows: LedgerRow[] = [
      makeRow({ source_path: "a", state: "todo", ts_event: "2026-05-01T00:00:00Z" }),
      makeRow({ source_path: "a", state: "verified", ts_event: "2026-05-02T00:00:00Z" }),
      makeRow({ source_path: "b", state: "todo", ts_event: "2026-05-03T00:00:00Z" }),
    ];
    const out = collapseLedger(rows);
    expect(out.size).toBe(2);
    const a = out.get("a");
    expect(a?.state).toBe("verified");
  });

  it("handles out-of-order ts_event correctly (later event wins)", () => {
    const rows: LedgerRow[] = [
      makeRow({ source_path: "a", state: "verified", ts_event: "2026-05-02T00:00:00Z" }),
      makeRow({ source_path: "a", state: "regression", ts_event: "2026-05-01T00:00:00Z" }),
    ];
    const out = collapseLedger(rows);
    expect(out.get("a")?.state).toBe("verified");
  });
});

describe("ledger.isStaleLockTimestamp", () => {
  it("returns false when null", () => {
    expect(isStaleLockTimestamp(null, Date.now(), 1000)).toBe(false);
  });

  it("returns true when invalid", () => {
    expect(isStaleLockTimestamp("not-a-date", Date.now(), 1000)).toBe(true);
  });

  it("returns true when older than ttl", () => {
    const now = Date.parse("2026-05-28T12:00:00Z");
    const old = "2026-05-28T07:59:59Z"; // > 4h ago
    expect(isStaleLockTimestamp(old, now, 4 * 60 * 60 * 1000)).toBe(true);
  });

  it("returns false when within ttl", () => {
    const now = Date.parse("2026-05-28T12:00:00Z");
    const recent = "2026-05-28T11:30:00Z";
    expect(isStaleLockTimestamp(recent, now, 4 * 60 * 60 * 1000)).toBe(false);
  });
});

describe("ledger.newTodoRow", () => {
  it("emits a well-formed row with state=todo", () => {
    const row = newTodoRow(
      "src/clj/game/core/eid.clj",
      "clj",
      ["src/ts/game/core/eid.ts"],
      [],
      57,
      "2026-05-28T00:00:00Z",
    );
    expect(row.state).toBe("todo");
    expect(row.source_path).toBe("src/clj/game/core/eid.clj");
    expect(row.ts_paths).toEqual(["src/ts/game/core/eid.ts"]);
    expect(row.source_loc).toBe(57);
    expect(row.schema_version).toBe(SCHEMA_VERSION);
  });
});

describe("enumerate.countLines", () => {
  it("counts trailing-newline-terminated text", () => {
    expect(countLines("a\nb\nc\n")).toBe(3);
  });
  it("counts text with no final newline", () => {
    expect(countLines("a\nb\nc")).toBe(3);
  });
  it("returns 0 for empty input", () => {
    expect(countLines("")).toBe(0);
  });
});

describe("enumerate against scratch files", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "verify-enum-"));
    mkdirSync(join(tmp, "src/clj/game"), { recursive: true });
    mkdirSync(join(tmp, "src/ts/game"), { recursive: true });
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("counts defn/defmethod/defcard in a clj file", () => {
    writeFileSync(
      join(tmp, "src/clj/game/sample.clj"),
      [
        "(ns game.sample)",
        "(defn foo [x] x)",
        "(defn- bar [] 1)",
        "(defmethod thing :a [_] 1)",
        "(defcard \"Foo\" {:abilities []})",
        "(defcard \"Bar Baz\" {:abilities []})",
      ].join("\n"),
    );
    const { units, defcardTitles, defnNames } = enumerateSource(
      "src/clj/game/sample.clj",
      tmp,
    );
    expect(units.defns).toBe(2);
    expect(units.defmethods).toBe(1);
    expect(units.defcards).toBe(2);
    expect(defcardTitles).toEqual(["Foo", "Bar Baz"]);
    expect(defnNames).toContain("foo");
    expect(defnNames).toContain("bar");
  });

  it("counts exports and flags any/stub markers in ts files", () => {
    writeFileSync(
      join(tmp, "src/ts/game/sample.ts"),
      [
        "export function foo(x: number) { return x; }",
        "export const bar: number = 1;",
        "export class Baz { }",
        "// Stub helpers: not yet ported",
        "function helper(): any { return null as any; }",
        "// TODO: finish",
      ].join("\n"),
    );
    const result = enumerateTsPaths(["src/ts/game/sample.ts"], tmp);
    expect(result.units.exported_functions).toBe(1);
    expect(result.units.exported_consts).toBe(1);
    expect(result.units.exported_classes).toBe(1);
    expect(result.anyCount).toBeGreaterThanOrEqual(2);
    expect(result.stubMarkers.length).toBeGreaterThanOrEqual(2);
  });

  it("counts card titles", () => {
    writeFileSync(
      join(tmp, "src/ts/game/cards.ts"),
      `export const cards = [{ title: "Cleaver", cost: 0 }, { title: "Cloak", cost: 1 }];`,
    );
    const result = enumerateTsPaths(["src/ts/game/cards.ts"], tmp);
    expect(result.units.exported_titles).toBe(2);
    expect(result.titles).toEqual(["Cleaver", "Cloak"]);
  });
});

describe("paths.findSourceFiles + mapSourceToTsPaths against scratch tree", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "verify-paths-"));
    mkdirSync(join(tmp, "src/clj/game/core"), { recursive: true });
    mkdirSync(join(tmp, "src/cljc/jinteki"), { recursive: true });
    mkdirSync(join(tmp, "src/cljs/nr/gameboard"), { recursive: true });
    mkdirSync(join(tmp, "src/ts/game/core"), { recursive: true });
    mkdirSync(join(tmp, "src/ts/jinteki"), { recursive: true });
    mkdirSync(join(tmp, "src/ts/nr/gameboard"), { recursive: true });
    mkdirSync(join(tmp, "test/ts/game/core"), { recursive: true });
    writeFileSync(join(tmp, "src/clj/game/core/engine.clj"), "(ns game.core.engine)\n");
    writeFileSync(join(tmp, "src/cljc/jinteki/utils.cljc"), "(ns jinteki.utils)\n");
    writeFileSync(join(tmp, "src/cljs/nr/gameboard/board.cljs"), "(ns nr.gameboard.board)\n");
    writeFileSync(join(tmp, "src/ts/game/core/engine.ts"), "");
    writeFileSync(join(tmp, "src/ts/game/core/engine_1.ts"), "");
    writeFileSync(join(tmp, "src/ts/game/core/engine_2.ts"), "");
    writeFileSync(join(tmp, "src/ts/jinteki/utils.ts"), "");
    writeFileSync(join(tmp, "src/ts/nr/gameboard/board.tsx"), "");
    writeFileSync(join(tmp, "test/ts/game/core/engine.test.ts"), "");
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("findSourceFiles picks up all three flavors", () => {
    const sources = findSourceFiles(tmp);
    const paths = sources.map((s) => s.source_path);
    expect(paths).toContain("src/clj/game/core/engine.clj");
    expect(paths).toContain("src/cljc/jinteki/utils.cljc");
    expect(paths).toContain("src/cljs/nr/gameboard/board.cljs");
  });

  it("mapSourceToTsPaths matches the engine + numbered splits", () => {
    const ts = mapSourceToTsPaths("src/clj/game/core/engine.clj", tmp);
    expect(ts).toEqual([
      "src/ts/game/core/engine.ts",
      "src/ts/game/core/engine_1.ts",
      "src/ts/game/core/engine_2.ts",
    ]);
  });

  it("mapSourceToTsPaths handles .tsx for cljs sources", () => {
    const ts = mapSourceToTsPaths("src/cljs/nr/gameboard/board.cljs", tmp);
    expect(ts).toEqual(["src/ts/nr/gameboard/board.tsx"]);
  });

  it("mapSourceToTsTests finds .test.ts adjacent to source", () => {
    const tests = mapSourceToTsTests("src/clj/game/core/engine.clj", tmp);
    expect(tests).toEqual(["test/ts/game/core/engine.test.ts"]);
  });
});

describe("renderStatusMarkdown", () => {
  it("renders a header, overall counts, and per-tier table", () => {
    const collapsed = new Map<string, LedgerRow>();
    collapsed.set(
      "src/clj/game/core/engine.clj",
      makeRow({ source_path: "src/clj/game/core/engine.clj", state: "verified" }),
    );
    collapsed.set(
      "src/clj/game/cards/basic.clj",
      makeRow({ source_path: "src/clj/game/cards/basic.clj", state: "todo" }),
    );
    const md = renderStatusMarkdown(collapsed, new Date("2026-05-28T12:00:00Z"));
    expect(md).toContain("# Port Verification Status");
    expect(md).toContain("Tier 0 — foundations");
    expect(md).toContain("verified");
  });
});

describe("runResume end-to-end against scratch repo", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "verify-resume-"));
    // Minimal repo shape so paths.REPO_ROOT-style discovery isn't needed.
    mkdirSync(join(tmp, "src/clj/game/core"), { recursive: true });
    mkdirSync(join(tmp, "src/cljc/jinteki"), { recursive: true });
    mkdirSync(join(tmp, "src/cljs/nr"), { recursive: true });
    mkdirSync(join(tmp, "src/ts/game/core"), { recursive: true });
    mkdirSync(join(tmp, "src/ts/jinteki"), { recursive: true });
    mkdirSync(join(tmp, "src/ts/nr"), { recursive: true });
    writeFileSync(join(tmp, "package.json"), '{"name":"x"}');
    writeFileSync(join(tmp, "src/clj/game/core/engine.clj"), "(ns game.core.engine)\n(defn foo [] 1)\n");
    writeFileSync(join(tmp, "src/cljc/jinteki/utils.cljc"), "(ns jinteki.utils)\n");
    writeFileSync(join(tmp, "src/cljs/nr/main.cljs"), "(ns nr.main)\n");
    writeFileSync(join(tmp, "src/ts/game/core/engine.ts"), "");
    writeFileSync(join(tmp, "src/ts/jinteki/utils.ts"), "");
    writeFileSync(join(tmp, "src/ts/nr/main.ts"), "");
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("seeds todo rows for all source files on first run", () => {
    const r = runResume({ repoRoot: tmp });
    expect(r.totalSourceFiles).toBe(3);
    expect(r.seededTodoRows).toBe(3);
    expect(r.perState.todo).toBe(3);
    expect(existsSync(join(tmp, "work/verification/STATUS.md"))).toBe(true);
    expect(existsSync(join(tmp, "work/verification/ledger.jsonl"))).toBe(true);
  });

  it("a second run seeds nothing new and keeps state", () => {
    runResume({ repoRoot: tmp });
    const second = runResume({ repoRoot: tmp });
    expect(second.seededTodoRows).toBe(0);
    expect(second.totalSourceFiles).toBe(3);
    expect(second.totalLedgerRows).toBe(3);
  });

  it("resets claimed rows whose lock is missing", () => {
    runResume({ repoRoot: tmp });
    // Append a claimed row without ever creating the lock file.
    const ledgerPath = join(tmp, "work/verification/ledger.jsonl");
    const row = makeRow({
      source_path: "src/clj/game/core/engine.clj",
      state: "claimed",
      claimed_by: "session-zzz",
      claimed_at: new Date(Date.now() - 1000).toISOString(),
      ts_event: new Date().toISOString(),
    });
    writeFileSync(ledgerPath, readFileSync(ledgerPath, "utf8") + JSON.stringify(row) + "\n", "utf8");
    const r = runResume({ repoRoot: tmp });
    expect(r.resetClaimedRows).toBe(1);
    expect(r.perState.todo).toBe(3);
    expect(r.perState.claimed).toBe(0);
  });

  it("removes lock files older than ttl", () => {
    runResume({ repoRoot: tmp });
    const lockDir = join(tmp, "work/verification/locks");
    const lockFile = join(lockDir, "stale.lock");
    writeFileSync(lockFile, "session-yyy");
    // Backdate the lock by 5 hours.
    const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000);
    utimesSync(lockFile, fiveHoursAgo, fiveHoursAgo);
    const r = runResume({ repoRoot: tmp });
    expect(r.removedStaleLocks).toBe(1);
    expect(existsSync(lockFile)).toBe(false);
  });
});
