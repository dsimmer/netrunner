import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "./paths";
import {
  emptySourceUnits,
  emptyTsUnits,
  type SourceUnits,
  type TsUnits,
} from "./types";

function safeRead(rel: string, repoRoot: string): string {
  const abs = join(repoRoot, rel);
  if (!existsSync(abs)) return "";
  return readFileSync(abs, "utf8");
}

export function countLines(text: string): number {
  if (text.length === 0) return 0;
  let count = 0;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) count++;
  }
  if (text.charCodeAt(text.length - 1) !== 10) count++;
  return count;
}

export function enumerateSource(
  sourcePath: string,
  repoRoot: string = REPO_ROOT,
): { units: SourceUnits; loc: number; defcardTitles: string[]; defnNames: string[] } {
  const text = safeRead(sourcePath, repoRoot);
  const units = emptySourceUnits();
  const defcardTitles: string[] = [];
  const defnNames: string[] = [];
  if (text.length === 0) return { units, loc: 0, defcardTitles, defnNames };

  // Line-anchored regexes
  const defnRe = /^\s*\(defn-?\s+([A-Za-z0-9!?\-*+<>=/_.]+)/gm;
  const defmethodRe = /^\s*\(defmethod\s+/gm;
  const defmacroRe = /^\s*\(defmacro\s+/gm;
  const defmultiRe = /^\s*\(defmulti\s+/gm;
  const defcardRe = /\(defcard\s+"((?:[^"\\]|\\.)*)"/g;

  let m: RegExpExecArray | null;
  while ((m = defnRe.exec(text)) !== null) {
    defnNames.push(m[1]);
    units.defns++;
  }
  while ((m = defmethodRe.exec(text)) !== null) units.defmethods++;
  while ((m = defmacroRe.exec(text)) !== null) units.defmacros++;
  while ((m = defmultiRe.exec(text)) !== null) units.defmultis++;
  while ((m = defcardRe.exec(text)) !== null) {
    defcardTitles.push(m[1]);
    units.defcards++;
  }

  return { units, loc: countLines(text), defcardTitles, defnNames };
}

export interface TsEnumeration {
  units: TsUnits;
  totalLoc: number;
  titles: string[];
  exportedNames: string[];
  anyCount: number;
  tsNocheckCount: number;
  stubMarkers: string[];
}

export function enumerateTsPaths(
  tsPaths: string[],
  repoRoot: string = REPO_ROOT,
): TsEnumeration {
  const units = emptyTsUnits();
  const titles: string[] = [];
  const exportedNames: string[] = [];
  let totalLoc = 0;
  let anyCount = 0;
  let tsNocheckCount = 0;
  const stubMarkers: string[] = [];

  const exportFnRe = /^\s*export\s+(?:async\s+)?function\s+([A-Za-z_][A-Za-z0-9_]*)/gm;
  const exportConstRe = /^\s*export\s+const\s+([A-Za-z_][A-Za-z0-9_]*)\s*[:=]/gm;
  const exportClassRe = /^\s*export\s+class\s+([A-Za-z_][A-Za-z0-9_]*)/gm;
  const titleRe = /title:\s*"((?:[^"\\]|\\.)*)"/g;
  const anyRe = /(?::\s*any\b|<\s*any\s*>|\bas\s+any\b)/g;
  const tsNocheckRe = /@ts-(?:nocheck|ignore)\b/g;
  const stubMarkerRe = /\/\/\s*(?:Stub helpers|TODO|FIXME|stub)\b/gi;

  for (const path of tsPaths) {
    const text = safeRead(path, repoRoot);
    if (text.length === 0) continue;
    totalLoc += countLines(text);

    let m: RegExpExecArray | null;
    while ((m = exportFnRe.exec(text)) !== null) {
      exportedNames.push(m[1]);
      units.exported_functions++;
    }
    while ((m = exportConstRe.exec(text)) !== null) {
      exportedNames.push(m[1]);
      units.exported_consts++;
    }
    while ((m = exportClassRe.exec(text)) !== null) {
      exportedNames.push(m[1]);
      units.exported_classes++;
    }
    while ((m = titleRe.exec(text)) !== null) {
      titles.push(m[1]);
      units.exported_titles++;
    }
    while (anyRe.exec(text) !== null) anyCount++;
    while (tsNocheckRe.exec(text) !== null) tsNocheckCount++;
    while ((m = stubMarkerRe.exec(text)) !== null) {
      stubMarkers.push(`${path}:${m[0]}`);
    }
  }

  return { units, totalLoc, titles, exportedNames, anyCount, tsNocheckCount, stubMarkers };
}
