// Dev tool: rewrite TS card-test files to use the changed() assertion helper.
// Mirrors: src/clj/tasks/changed.clj
//
// The Clojure original uses rewrite-clj to transform:
//   (is (changes-credits <side> <amt> <body...>) [<msg>])
//   (changes-val-macro <amt> <expr> <body...>)
// into:
//   (is (changed? [<expr> <amt> ...] <body...>) [<msg>])
//
// This port transforms equivalent TS call patterns:
//   changesCredits(sideExpr, amount, bodyFn)
//   changesValMacro(amount, expr, bodyFn)
// into:
//   changed([[sideExpr, amount], ...], bodyFn)
//
// Nested calls in bodyFn are gathered recursively, same as the CLJ subgather loop.

import * as ts from "typescript";
import * as fs from "fs";
import * as path from "path";

// ──────────────────────────────────────────────────────────────────
// Detection helpers (mirror changes-credits? / changes-zloc?)
// ──────────────────────────────────────────────────────────────────

function callName(node: ts.Node): string | null {
  if (!ts.isCallExpression(node)) return null;
  const expr = node.expression;
  if (ts.isIdentifier(expr)) return expr.text;
  return null;
}

function isChangesCreditsCall(node: ts.Node): node is ts.CallExpression {
  return callName(node) === "changesCredits";
}

function isChangesValMacroCall(node: ts.Node): node is ts.CallExpression {
  return callName(node) === "changesValMacro";
}

function isChangesCall(node: ts.Node): node is ts.CallExpression {
  return isChangesCreditsCall(node) || isChangesValMacroCall(node);
}

// ──────────────────────────────────────────────────────────────────
// Piece extraction (mirror changes-credits-pieces / changes-pieces)
// ──────────────────────────────────────────────────────────────────

interface Gathered {
  pairs: Array<[ts.Expression, ts.Expression]>; // [expr, amt]
  bodyArgs: ts.Expression[];
  msg: ts.Expression | null;
}

/** Extract [expr, amt] pair and body from a changesCredits call. */
function gatherChangesCredits(
  node: ts.CallExpression,
): { pair: [ts.Expression, ts.Expression]; body: ts.Expression[] } | null {
  // changesCredits(sideExpr, amount, ...bodyArgs)
  const args = node.arguments;
  if (args.length < 2) return null;
  const side = args[0];
  const amt = args[1];
  const body = Array.from(args.slice(2));
  return { pair: [side, amt], body };
}

/** Extract [expr, amt] pair and body from a changesValMacro call. */
function gatherChangesValMacro(
  node: ts.CallExpression,
): { pair: [ts.Expression, ts.Expression]; body: ts.Expression[] } | null {
  // changesValMacro(amount, expr, ...bodyArgs)
  const args = node.arguments;
  if (args.length < 2) return null;
  const amt = args[0];
  const expr = args[1];
  const body = Array.from(args.slice(2));
  return { pair: [expr, amt], body };
}

// ──────────────────────────────────────────────────────────────────
// subgather: recursively pull nested changes calls out of body args
// Mirrors: subgather / drop-do
// ──────────────────────────────────────────────────────────────────

interface SubGathered {
  pairs: Array<[ts.Expression, ts.Expression]>;
  forms: ts.Expression[];
}

function subgather(
  init: SubGathered,
  body: ts.Expression[],
): SubGathered {
  let ctx = init;
  let remaining = body;

  while (remaining.length > 0) {
    const cur = remaining[0];
    remaining = remaining.slice(1);

    if (isChangesCreditsCall(cur)) {
      const g = gatherChangesCredits(cur);
      if (g) {
        ctx = { ...ctx, pairs: [...ctx.pairs, g.pair] };
        remaining = [...g.body, ...remaining];
        continue;
      }
    } else if (isChangesValMacroCall(cur)) {
      const g = gatherChangesValMacro(cur);
      if (g) {
        ctx = { ...ctx, pairs: [...ctx.pairs, g.pair] };
        remaining = [...g.body, ...remaining];
        continue;
      }
    }
    ctx = { ...ctx, forms: [...ctx.forms, cur] };
  }

  return ctx;
}

// ──────────────────────────────────────────────────────────────────
// Text reconstruction (mirrors the n/list-node / n/vector-node building)
// Uses original source text slices to preserve formatting of sub-expressions.
// ──────────────────────────────────────────────────────────────────

function nodeText(node: ts.Node, sourceText: string): string {
  return sourceText.slice(node.getStart(), node.getEnd());
}

function buildChangedCall(
  sub: SubGathered,
  msg: ts.Expression | null,
  sourceText: string,
): string {
  const pairsText = sub.pairs
    .map(([e, a]) => `[${nodeText(e, sourceText)}, ${nodeText(a, sourceText)}]`)
    .join(", ");

  const formsText = sub.forms
    .map((f) => nodeText(f, sourceText))
    .join(", ");

  const allArgs = [
    `[${pairsText}]`,
    ...(formsText ? [formsText] : []),
    ...(msg ? [nodeText(msg, sourceText)] : []),
  ];

  return `changed(${allArgs.join(", ")})`;
}

// ──────────────────────────────────────────────────────────────────
// Node transformation (mirrors process-deftest / gather)
// ──────────────────────────────────────────────────────────────────

interface Replacement {
  start: number;
  end: number;
  text: string;
}

function collectReplacements(
  sourceFile: ts.SourceFile,
  sourceText: string,
): Replacement[] {
  const replacements: Replacement[] = [];

  function visit(node: ts.Node): void {
    if (isChangesCall(node)) {
      const isCC = isChangesCreditsCall(node);
      const g = isCC
        ? gatherChangesCredits(node)
        : gatherChangesValMacro(node);

      if (g) {
        // Detect optional trailing message: last arg that's a string literal
        let bodyArgs = g.body;
        let msg: ts.Expression | null = null;
        const last = bodyArgs[bodyArgs.length - 1];
        if (last && ts.isStringLiteral(last)) {
          msg = last;
          bodyArgs = bodyArgs.slice(0, -1);
        }

        const sub = subgather({ pairs: [g.pair], forms: [] }, bodyArgs);
        const newText = buildChangedCall(sub, msg, sourceText);
        replacements.push({ start: node.getStart(), end: node.getEnd(), text: newText });
        // Don't recurse into this node — subgather handles nested calls
        return;
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return replacements;
}

// ──────────────────────────────────────────────────────────────────
// File processing (mirrors process-file / rewrite-file)
// ──────────────────────────────────────────────────────────────────

export function processFile(filePath: string): void {
  const sourceText = fs.readFileSync(filePath, "utf-8");
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
  );

  const replacements = collectReplacements(sourceFile, sourceText);
  if (replacements.length === 0) return;

  // Apply from right to left so earlier positions stay valid
  const sorted = replacements.sort((a, b) => b.start - a.start);
  let result = sourceText;
  for (const { start, end, text } of sorted) {
    result = result.slice(0, start) + text + result.slice(end);
  }

  fs.writeFileSync(filePath, result, "utf-8");
}

// ──────────────────────────────────────────────────────────────────
// Entry point — walk a directory and rewrite all .ts test files
// Mirrors the comment block at bottom of changed.clj:
//   (doseq [file (file-seq (io/file "test/clj/game"))] (process-file ...))
// ──────────────────────────────────────────────────────────────────

export function rewriteChangedAssertions(dir = "test/ts/game"): void {
  const resolved = path.resolve(dir);
  if (!fs.existsSync(resolved)) {
    console.error(`Directory not found: ${resolved}`);
    process.exit(1);
  }

  function walk(d: string): void {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && full.endsWith(".ts") && !full.includes("macros")) {
        processFile(full);
      }
    }
  }

  walk(resolved);
}
