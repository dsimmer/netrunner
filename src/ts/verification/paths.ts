import { readdirSync, existsSync, statSync } from "node:fs";
import { dirname, basename, join, sep } from "node:path";
import type { SourceKind } from "./types";

export const REPO_ROOT = (() => {
  // Walk up from this file until we find package.json with name "netrunner" or fall back to cwd
  let dir = dirname(new URL(import.meta.url).pathname);
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, "package.json"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
})();

export const SOURCE_ROOTS: Array<{ root: string; kind: SourceKind; ext: string }> = [
  { root: "src/clj", kind: "clj", ext: ".clj" },
  { root: "src/cljc", kind: "cljc", ext: ".cljc" },
  { root: "src/cljs", kind: "cljs", ext: ".cljs" },
];

export const TS_ROOT = "src/ts";
export const TEST_ROOT = "test/ts";
export const VERIFICATION_DIR = "work/verification";

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  const stack: string[] = [dir];
  while (stack.length > 0) {
    const cur = stack.pop();
    if (cur === undefined) break;
    const entries = readdirSync(cur);
    for (const name of entries) {
      const full = join(cur, name);
      const s = statSync(full);
      if (s.isDirectory()) stack.push(full);
      else out.push(full);
    }
  }
  return out;
}

export function findSourceFiles(repoRoot: string = REPO_ROOT): Array<{
  source_path: string;
  source_kind: SourceKind;
}> {
  const results: Array<{ source_path: string; source_kind: SourceKind }> = [];
  for (const { root, kind, ext } of SOURCE_ROOTS) {
    const abs = join(repoRoot, root);
    for (const file of walk(abs)) {
      if (!file.endsWith(ext)) continue;
      const rel = file.slice(repoRoot.length + 1).split(sep).join("/");
      results.push({ source_path: rel, source_kind: kind });
    }
  }
  results.sort((a, b) => a.source_path.localeCompare(b.source_path));
  return results;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function relUnderSource(sourcePath: string): string {
  // src/clj/game/core/engine.clj -> game/core/engine
  // src/cljs/nr/gameboard/board.cljs -> nr/gameboard/board
  return sourcePath.replace(/^src\/(clj|cljc|cljs)\//, "").replace(/\.(clj|cljc|cljs)$/, "");
}

export function mapSourceToTsPaths(
  sourcePath: string,
  repoRoot: string = REPO_ROOT,
): string[] {
  const rel = relUnderSource(sourcePath);
  const tsRelDir = dirname(rel);
  const tsBase = basename(rel);
  const absDir = join(repoRoot, TS_ROOT, tsRelDir);
  if (!existsSync(absDir)) return [];
  const all = readdirSync(absDir);
  // Match: <base>.ts, <base>.tsx, <base>_<suffix>.ts, <base>_<suffix>.tsx
  const re = new RegExp(`^${escapeRegex(tsBase)}(_[^.]+)?\\.tsx?$`);
  const matched = all.filter((name) => re.test(name)).sort();
  return matched.map((name) => `${TS_ROOT}/${tsRelDir}/${name}`);
}

export function mapSourceToTsTests(
  sourcePath: string,
  repoRoot: string = REPO_ROOT,
): string[] {
  const rel = relUnderSource(sourcePath);
  const testRelDir = dirname(rel);
  const testBase = basename(rel);
  const absDir = join(repoRoot, TEST_ROOT, testRelDir);
  if (!existsSync(absDir)) return [];
  const all = readdirSync(absDir);
  // Match: <base>.test.ts, <base>.test.tsx, <base>_<suffix>.test.ts, etc.
  const re = new RegExp(`^${escapeRegex(testBase)}(_[^.]+)?\\.test\\.tsx?$`);
  return all
    .filter((name) => re.test(name))
    .sort()
    .map((name) => `${TEST_ROOT}/${testRelDir}/${name}`);
}

export function flattenPath(sourcePath: string): string {
  // src/clj/game/cards/programs.clj -> src_clj_game_cards_programs_clj
  return sourcePath.replace(/[\\/]/g, "_").replace(/\./g, "_");
}
