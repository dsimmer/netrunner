// Tests for game.core.async (sync/async eid completion validation)
// Mirrors: test/clj/game/core/async_test.clj
//
// This is intended to be a (mostly) exhaustive test for if cards that are
// marked as async to in-fact complete eids, and if cards that are not
// are also correct.
//
// I currently don't have support for macros (mainly, just the tokens).
//
// If something is incorrect, you can prevent it being evaluated by adding
// the following metadata to a card-def: ^:ignore-async-check
// like: (defcard "Fall Guy" ^:ignore-async-check {:effect (req (do-something-cool))})
//
// There's a list of 'safe fns' (right-most fns that can contain an eid) and
// terminal fns. If something gets caught out at some point in the future, it probably
// means that one of these needs to be updated.
//
// --nbk, Jan 2025

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const CARD_BASE_STR = "src/clj/game/cards/";
const CORE_BASE_STR = "src/clj/game/core/";

// ============================================================================
// Clojure s-expression parser (replacement for instaparse grammar)
// ============================================================================

type ClojureValue =
  | { type: "string"; value: string }
  | { type: "keyword"; value: string }
  | { type: "number"; value: string }
  | { type: "truthy"; value: string }
  | { type: "character"; value: string }
  | { type: "symbol"; value: string; quoted?: boolean; deref?: boolean }
  | { type: "fn"; items: ClojureValue[]; quoted?: boolean }
  | { type: "vector"; items: ClojureValue[] }
  | { type: "map"; items: ClojureValue[] }
  | { type: "set"; items: ClojureValue[] }
  | { type: "metadata"; meta: ClojureValue; body: ClojureValue }
  | { type: "comment"; value: ClojureValue }
  | { type: "unquote"; value: ClojureValue }
  | { type: "splice"; value: ClojureValue };

// Tokenizer for Clojure
interface Token {
  type: "open-paren" | "close-paren" | "open-bracket" | "close-bracket" | "open-brace" | "close-brace" | "string" | "keyword" | "number" | "symbol" | "truthy" | "character";
  value: string;
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < input.length) {
    // Skip whitespace and commas
    if (/\s/.test(input[i]) || input[i] === ",") {
      i++;
      continue;
    }

    // Handle strings
    if (input[i] === '"') {
      let str = "";
      i++; // skip opening quote
      while (i < input.length && input[i] !== '"') {
        if (input[i] === "\\" && i + 1 < input.length) {
          str += input[i] + input[i + 1];
          i += 2;
        } else {
          str += input[i];
          i++;
        }
      }
      i++; // skip closing quote
      tokens.push({ type: "string", value: str });
      continue;
    }

    // Handle parens and brackets
    if (input[i] === "(") { tokens.push({ type: "open-paren", value: "(" }); i++; continue; }
    if (input[i] === ")") { tokens.push({ type: "close-paren", value: ")" }); i++; continue; }
    if (input[i] === "[") { tokens.push({ type: "open-bracket", value: "[" }); i++; continue; }
    if (input[i] === "]") { tokens.push({ type: "close-bracket", value: "]" }); i++; continue; }
    if (input[i] === "{") { tokens.push({ type: "open-brace", value: "{" }); i++; continue; }
    if (input[i] === "}") { tokens.push({ type: "close-brace", value: "}" }); i++; continue; }

    // Handle special prefixes
    if (input[i] === "#") {
      if (i + 1 < input.length && input[i + 1] === "_") {
        // comment form #_<form> - skip this token, will be handled during parsing
        i += 2;
        continue;
      }
      if (i + 1 < input.length && input[i + 1] === "{") {
        tokens.push({ type: "open-brace", value: "#{" });
        i += 2;
        continue;
      }
      if (i + 1 < input.length && input[i + 1] === '"') {
        // raw string
        let str = "";
        i += 2; // skip #"
        while (i < input.length && input[i] !== '"') {
          if (input[i] === "\\" && i + 1 < input.length) {
            str += input[i] + input[i + 1];
            i += 2;
          } else {
            str += input[i];
            i++;
          }
        }
        i++; // skip closing quote
        tokens.push({ type: "string", value: str });
        continue;
      }
      i++;
      continue;
    }

    // Handle ~ (unquote) and ~@ (splice)
    if (input[i] === "~") {
      if (i + 1 < input.length && input[i + 1] === "@") {
        tokens.push({ type: "symbol", value: "~@" });
        i += 2;
        continue;
      }
      tokens.push({ type: "symbol", value: "~" });
      i++;
      continue;
    }

    // Handle ^ (metadata)
    if (input[i] === "^") {
      tokens.push({ type: "symbol", value: "^" });
      i++;
      continue;
    }

    // Handle ' and ` (quote/list)
    if (input[i] === "'" || input[i] === "`") {
      tokens.push({ type: "symbol", value: input[i] });
      i++;
      continue;
    }

    // Handle @ (deref)
    if (input[i] === "@") {
      tokens.push({ type: "symbol", value: "@" });
      i++;
      continue;
    }

    // Handle \ (character)
    if (input[i] === "\\") {
      let charVal = "\\";
      i++;
      // Handle named characters
      const namedChars = ["newline", "space", "tab", "backspace", "formfeed", "return"];
      let matchedNamed = false;
      for (const nc of namedChars) {
        if (input.substring(i, i + nc.length) === nc) {
          charVal += nc;
          i += nc.length;
          matchedNamed = true;
          break;
        }
      }
      if (!matchedNamed && i < input.length) {
        charVal += input[i];
        i++;
      }
      tokens.push({ type: "character", value: charVal });
      continue;
    }

    // Handle keywords
    if (input[i] === ":") {
      let kw = "";
      i++;
      while (i < input.length && /[\w+*/<>=?!.#:-]/.test(input[i])) {
        kw += input[i];
        i++;
      }
      tokens.push({ type: "keyword", value: kw });
      continue;
    }

    // Handle numbers
    if (input[i] === "-" && i + 1 < input.length && /\d/.test(input[i + 1])) {
      let num = "-";
      i++;
      while (i < input.length && /\d/.test(input[i])) {
        num += input[i];
        i++;
      }
      tokens.push({ type: "number", value: num });
      continue;
    }
    if (/\d/.test(input[i])) {
      let num = "";
      while (i < input.length && /\d/.test(input[i])) {
        num += input[i];
        i++;
      }
      tokens.push({ type: "number", value: num });
      continue;
    }

    // Handle truthy values
    if (input.substring(i, i + 4) === "true") {
      tokens.push({ type: "truthy", value: "true" });
      i += 4;
      continue;
    }
    if (input.substring(i, i + 5) === "false") {
      tokens.push({ type: "truthy", value: "false" });
      i += 5;
      continue;
    }
    if (input.substring(i, i + 3) === "nil") {
      tokens.push({ type: "truthy", value: "nil" });
      i += 3;
      continue;
    }

    // Handle symbols
    if (/['\&%a-zA-Z_+\-*/<>=?!\.]/.test(input[i])) {
      let sym = "";
      while (i < input.length && /['\&%a-zA-Z0-9_+\-*/<>=?!\.#:]/.test(input[i])) {
        sym += input[i];
        i++;
      }
      tokens.push({ type: "symbol", value: sym });
      continue;
    }

    // Skip unknown characters
    i++;
  }

  return tokens;
}

// Parser for Clojure s-expressions
class ClojureParser {
  private tokens: Token[];
  private pos: number;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
    this.pos = 0;
  }

  peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  advance(): Token | undefined {
    return this.tokens[this.pos++];
  }

  parse(): ClojureValue {
    const token = this.peek();
    if (!token) return { type: "truthy", value: "nil" };

    switch (token.type) {
      case "open-paren":
        this.advance();
        return this.parseFn();
      case "open-bracket":
        this.advance();
        return this.parseVector();
      case "open-brace": {
        this.advance();
        const val = this.peek();
        if (val && val.value === "#{") {
          // set
          return this.parseSet();
        }
        return this.parseMap();
      }
      case "string":
        this.advance();
        return { type: "string", value: token.value };
      case "keyword":
        this.advance();
        return { type: "keyword", value: token.value };
      case "number":
        this.advance();
        return { type: "number", value: token.value };
      case "truthy":
        this.advance();
        return { type: "truthy", value: token.value };
      case "character":
        this.advance();
        return { type: "character", value: token.value };
      case "symbol": {
        this.advance();
        // Handle metadata ^
        if (token.value === "^") {
          const meta = this.parse();
          const body = this.parse();
          return { type: "metadata", meta, body };
        }
        // Handle quote ' and `
        if (token.value === "'" || token.value === "`") {
          const fn = this.parse();
          if (fn.type === "fn") {
            return { ...fn, quoted: true };
          }
          return fn;
        }
        // Handle deref @
        if (token.value === "@") {
          const val = this.parse();
          return { ...val as any, deref: true };
        }
        // Handle unquote ~ and splice ~@
        if (token.value === "~") {
          const val = this.parse();
          return { type: "unquote", value: val };
        }
        if (token.value === "~@") {
          const val = this.parse();
          return { type: "splice", value: val };
        }
        return { type: "symbol", value: token.value };
      }
      default:
        this.advance();
        return { type: "symbol", value: token.value };
    }
  }

  parseFn(): ClojureValue {
    const items: ClojureValue[] = [];
    while (true) {
      const token = this.peek();
      if (!token || token.type === "close-paren") {
        this.advance(); // consume )
        return { type: "fn", items };
      }
      items.push(this.parse());
    }
  }

  parseVector(): ClojureValue {
    const items: ClojureValue[] = [];
    while (true) {
      const token = this.peek();
      if (!token || token.type === "close-bracket") {
        this.advance(); // consume ]
        return { type: "vector", items };
      }
      items.push(this.parse());
    }
  }

  parseMap(): ClojureValue {
    const items: ClojureValue[] = [];
    while (true) {
      const token = this.peek();
      if (!token || token.type === "close-brace") {
        this.advance(); // consume }
        return { type: "map", items };
      }
      items.push(this.parse());
    }
  }

  parseSet(): ClojureValue {
    // Skip the "#{ token that was already consumed as open-brace
    const items: ClojureValue[] = [];
    while (true) {
      const token = this.peek();
      if (!token || token.type === "close-brace") {
        this.advance(); // consume }
        return { type: "set", items };
      }
      items.push(this.parse());
    }
  }
}

function parseClojure(input: string): ClojureValue {
  const tokens = tokenize(input);
  const parser = new ClojureParser(tokens);
  return parser.parse();
}

// ============================================================================
// Helper functions (mirroring Clojure versions)
// ============================================================================

/**
 * stitch-and-split-card-files: splits file content by def... patterns and
 * removes comments (with special handling for tagged/TLDR)
 */
function stitchAndSplitCardFiles(file: string): string[] {
  const splitFile = file.split(/(?=\n\(def)/);
  return splitFile.map((chunk) => {
    const lines = chunk.split("\n");
    // special case specifically for the hydra subs, which have semicolons,
    // and TLDR, which contains a semicolon in the title
    const sansComments = lines.map((line) => {
      const parts = line.split(/(?<!(tagged)|(TL));/);
      return parts[0];
    });
    return sansComments.join("\n");
  });
}

/**
 * get-fn-name: extracts a function name from a parsed segment of code
 */
function getFnName(parsed: ClojureValue): string | string[] | null {
  let actual: ClojureValue = parsed;

  const sig = parsed.type === "fn" ? (parsed.items[0] as any)?.value : null;
  const ide = parsed.type === "fn" && parsed.items.length >= 2 ? parsed.items[1] : null;
  const multi = parsed.type === "fn" && parsed.items.length >= 3 ? parsed.items[2] : null;
  const rest = parsed.type === "fn" ? parsed.items.slice(3) : [];

  if (!ide) return null;

  let ideValue: string | null = null;
  if (ide.type === "symbol") {
    ideValue = ide.value;
  } else if (ide.type === "string") {
    ideValue = ide.value;
  }

  if (!ideValue && !(ide.type === "fn")) return null;

  if (sig === "defmethod") {
    return [parsed, multi] as any;
  }

  return ideValue;
}

/**
 * assemble-keywords: convert chunks into keywords where appropriate
 */
function assembleKeywords(chunk: ClojureValue): ClojureValue | string {
  if (chunk.type === "keyword") {
    return chunk.value;
  }
  return chunk as any;
}

/**
 * Type for memory (banked let/letfn bindings)
 */
interface MemoryEntry {
  key: string;
  value: ClojureValue;
}

/**
 * bank-fn!: if the func is a let, or letfn, bank it in memory to refer to later
 */
function bankFn(chunk: ClojureValue, memory: MemoryEntry[]): void {
  if (chunk.type !== "fn" || chunk.items.length < 1) return;

  const sig = chunk.items[0];
  if (sig.type !== "symbol") return;

  if (sig.value === "let") {
    const bindings = chunk.items.slice(2);
    for (let i = 0; i < bindings.length - 1; i += 2) {
      const k = bindings[i];
      const rhs = bindings[i + 1];
      if (k.type === "symbol") {
        memory.push({ key: k.value, value: rhs });
      }
    }
  } else if (sig.value === "letfn") {
    const fns = chunk.items.slice(2);
    for (const fn of fns) {
      if (fn.type === "fn" && fn.items.length >= 3) {
        const k = fn.items[0];
        const rhs = fn; // the whole fn definition
        if (k.type === "symbol") {
          memory.push({ key: k.value, value: rhs });
        }
      }
    }
  }
}

// ============================================================================
// Terminal and safe functions
// ============================================================================

const TERMINAL_FNS = new Set([
  "checkpoint", "complete-with-result", "continue-ability", "corp-install",
  "damage", "draw", "effect-completed", "gain-credits", "gain-tags", "make-run",
  "reveal", "rez", "resolve-ability", "runner-install", "add-counter", "add-prop",
  "trash", "trash-cards", "trigger-event-simult", "trigger-event-sync", "wait-for",
]);

const SAFE_FNS = new Set(["can-pay?", "cost-value", "recurring-fn"]);

// ============================================================================
// Eid detection logic
// ============================================================================

/**
 * contains-eid?: check if a chunk contains an eid reference
 * Mirrors the Clojure (some #(cond ...) chunk) pattern
 */
function containsEid(chunk: ClojureValue, depth: number): boolean {
  // Only iterate over fn items (the Clojure version iterates over vectors from instaparse)
  if (chunk.type !== "fn") {
    return false;
  }

  return chunk.items.some((item: ClojureValue) => {
    // string check
    if (item.type === "string") {
      return item.value === "eid";
    }

    // symbol check - is it the literal "eid"?
    if (item.type === "symbol") {
      return item.value === "eid";
    }

    // not a fn - skip (nil in Clojure)
    if (item.type !== "fn") {
      return false;
    }

    // (make-eid ...) → true
    if (item.items.length >= 1 && item.items[0].type === "symbol" && item.items[0].value === "make-eid") {
      return true;
    }

    // safe fns → skip
    if (item.items.length >= 1 && item.items[0].type === "symbol" && SAFE_FNS.has(item.items[0].value)) {
      return false;
    }

    // assoc/assoc-in → recurse with depth+1
    if (item.items.length >= 1 && item.items[0].type === "symbol" &&
        (item.items[0].value === "assoc" || item.items[0].value === "assoc-in")) {
      return containsEid(item, depth + 1);
    }

    // at depth 0, recurse into the item with depth=1
    if (depth === 0) {
      return containsEid(item, 1);
    }

    // otherwise skip
    return false;
  });
}

/**
 * CompletesEidResult: the possible results of completesEid check
 */
type CompletesEidResult = boolean | "maybe";

/**
 * completes-eid?: check if a function completes an eid
 */
function completesEid(
  chunk: ClojureValue,
  memory: MemoryEntry[],
  depth: number
): CompletesEidResult {
  // max depth guard
  if (depth > 15) return false;

  if (typeof chunk === "string") {
    const entry = memory.find((m) => m.key === chunk);
    if (entry) {
      return completesEid(entry.value, memory, depth + 1);
    }
    return false;
  }

  // Check if this is a symbol referencing a banked let/letfn binding
  if (chunk.type === "symbol") {
    const entry = memory.find((m) => m.key === chunk.value);
    if (entry) {
      return completesEid(entry.value, memory, depth + 1);
    }
    return false;
  }

  if (chunk.type !== "fn") {
    return false;
  }

  const sig = chunk.items[0];
  const ide = chunk.items[1];
  const ideValue = (ide?.type === "symbol" || ide?.type === "string") ? (ide as any).value : null;

  // referring to a pre-deffed fn
  if (ideValue && memory.some((m) => m.key === ideValue)) {
    const entry = memory.find((m) => m.key === ideValue);
    if (entry) {
      return completesEid(entry.value, memory, depth + 1);
    }
  }

  // if it's a safe function, it does not complete
  if (ideValue && SAFE_FNS.has(ideValue)) {
    return false;
  }

  // both sides of the ifn should complete
  if (ideValue && ["if", "if-not", "if-let"].includes(ideValue)) {
    // items: [sig, ide, condition, lhs, rhs]
    if (chunk.items.length >= 4) {
      const lhs = completesEid(chunk.items[3], memory, depth + 1);
      const rhs = completesEid(chunk.items[4], memory, depth + 1);
      return lhs && rhs;
    }
    return false;
  }

  // `when ... complete` is a bad pattern
  if (ideValue && ["when", "when-not", "when-let"].includes(ideValue)) {
    return false;
  }

  // cond - every RHS element completes
  if (ideValue === "cond") {
    const assignments = chunk.items.slice(3).filter((_, idx) => idx % 2 === 1);
    return assignments.every((a: ClojureValue) => completesEid(a, memory, depth + 1));
  }

  // condp - every RHS, and the terminal element, complete
  if (ideValue === "condp") {
    const items = chunk.items.slice(5);
    const assignments = items.filter((_, idx) => idx % 2 === 1);
    const terminal = chunk.items[chunk.items.length - 1];
    const allItems = [...assignments, terminal];
    return allItems.every((a: ClojureValue) => completesEid(a, memory, depth + 1));
  }

  // case - every RHS, and the terminal element, complete
  if (ideValue === "case") {
    const items = chunk.items.slice(4);
    const assignments = items.filter((_, idx) => idx % 2 === 1);
    const terminal = chunk.items[chunk.items.length - 1];
    const allItems = [...assignments, terminal];
    return allItems.every((a: ClojureValue) => completesEid(a, memory, depth + 1));
  }

  // cond+ - every RHS element of the leaves completes
  if (ideValue === "cond+") {
    const assignments = chunk.items.slice(2).map((item: ClojureValue) => {
      if (item.type === "vector" && item.items.length > 0) {
        return item.items[item.items.length - 1];
      }
      return item;
    });
    return assignments.every((a: ClojureValue) => completesEid(a, memory, depth + 1));
  }

  // continue-ability or contains eid
  if (ideValue === "continue-ability" || containsEid(chunk, 0)) {
    return "maybe";
  }

  // leftover fn - check the last member completes
  if (chunk.items.length > 2) {
    return completesEid(chunk.items[chunk.items.length - 1], memory, depth + 1);
  }

  return false;
}

/**
 * should-be-async?: should a chunk (probably) complete an eid?
 */
function shouldBeAsync(
  chunk: ClojureValue,
  memory: MemoryEntry[],
  depth: number
): boolean {
  if (depth >= 15) return false;

  // Check if this is a symbol referencing a banked let/letfn binding
  if (chunk.type === "symbol") {
    const entry = memory.find((m) => m.key === chunk.value);
    if (entry) {
      return shouldBeAsync(entry.value, memory, depth + 1);
    }
    return false;
  }

  if (chunk.type !== "fn") return false;

  const sig = chunk.items[0];
  const ide = chunk.items[1];
  const ideValue = (ide?.type === "symbol" || ide?.type === "string") ? (ide as any).value : null;

  // Check if terminal fn
  if (ideValue && TERMINAL_FNS.has(ideValue)) {
    return true;
  }

  // Check all child items
  const body = chunk.items.slice(2);
  return body.some((item: ClojureValue) => shouldBeAsync(item, memory, depth + 1));
}

/**
 * read-metadata: extract body from metadata, returning null if ignore-async-check
 */
function readMetadata(metadata: ClojureValue): ClojureValue | null {
  if (metadata.type !== "metadata") return metadata;

  const meta = metadata.meta;
  if (meta.type === "keyword" && meta.value === "ignore-async-check") {
    return null;
  }

  return metadata.body;
}

// ============================================================================
// Validation logic
// ============================================================================

/**
 * is-valid-chunk?: checks if a chunk of code is 'valid' in terms of sync/async classification.
 */
function isValidChunk(
  chunk: ClojureValue,
  memory: MemoryEntry[],
  sig?: string
): boolean {
  // Handle literals - they're always fine
  if (["string", "keyword", "number", "character", "truthy"].includes(chunk.type)) {
    return true;
  }
  if (chunk.type === "comment") {
    return true;
  }
  if (chunk.type === "unquote") {
    return true;
  }

  // fn, vector, set - recurse into items
  if (chunk.type === "fn" || chunk.type === "vector" || chunk.type === "set") {
    bankFn(chunk, memory);
    const items = (chunk as any).items;
    return items.every((item: ClojureValue) => isValidChunk(item, memory));
  }

  // maps -> require more complicated logic
  if (chunk.type === "map") {
    const keypairs = [];
    const items = chunk.items;
    for (let i = 0; i < items.length - 1; i += 2) {
      keypairs.push([items[i], items[i + 1]]);
    }

    const mapped: Record<string, ClojureValue> = {};
    for (const [key, val] of keypairs) {
      const keyStr = assembleKeywords(key) as string;
      mapped[keyStr] = val;
    }

    let result = true;

    // :effect
    if (mapped["effect"]) {
      if (mapped["async"]) {
        result = result && isValidChunk(mapped["effect"], memory, "async");
      } else {
        result = result && isValidChunk(mapped["effect"], memory, "sync");
      }
    }

    // :move-zone should complete an eid
    if (mapped["move-zone"]) {
      result = result && isValidChunk(mapped["move-zone"], memory, "async");
    }

    // :cancel
    if (mapped["cancel"]) {
      result = result && isValidChunk(mapped["cancel"], memory);
    }

    // if no :effect or :cancel-effect, check all values
    if (!mapped["effect"] && !mapped["cancel-effect"]) {
      result = result && Object.values(mapped).every((val) => isValidChunk(val, memory));
    }

    return result;
  }

  // metadata
  if (chunk.type === "metadata") {
    const nextChunk = readMetadata(chunk);
    if (nextChunk) {
      return isValidChunk(nextChunk, memory);
    }
    return true;
  }

  // symbol
  if (chunk.type === "symbol") {
    return true;
  }

  return true;
}

/**
 * isValidChunk with explicit sig parameter (for async/sync checks)
 */
function isValidChunkWithSig(
  chunk: ClojureValue,
  memory: MemoryEntry[],
  sig: string
): boolean {
  if (sig === "map") {
    // Already handled in main isValidChunk
    return isValidChunk(chunk, memory);
  }

  // things that are async should be completing eids
  if (sig === "async") {
    const completes = completesEid(chunk, memory, 0);
    const valid = isValidChunk(chunk, memory);
    return (completes === true || completes === "maybe") && valid;
  }

  if (sig === "sync") {
    const shouldAsync = shouldBeAsync(chunk, memory, 0);
    const completes = completesEid(chunk, memory, 0);
    const valid = isValidChunk(chunk, memory);
    return !shouldAsync && !completes && valid;
  }

  return true;
}

// Override isValidChunk to handle sig properly
const _originalIsValidChunk = isValidChunk;
function isValidChunkMain(
  chunk: ClojureValue,
  memory: MemoryEntry[],
  sig?: string
): boolean {
  // Handle literals - they're always fine
  if (["string", "keyword", "number", "character", "truthy"].includes(chunk.type)) {
    return true;
  }
  if (chunk.type === "comment") {
    return true;
  }
  if (chunk.type === "unquote") {
    return true;
  }

  // explicit sig check (async/sync) - must come BEFORE fn/vector/set handling
  if (sig === "async" || sig === "sync") {
    return isValidChunkWithSig(chunk, memory, sig);
  }

  // fn, vector, set - recurse into items
  if (chunk.type === "fn" || chunk.type === "vector" || chunk.type === "set") {
    bankFn(chunk, memory);
    const items = (chunk as any).items;
    return items.every((item: ClojureValue) => isValidChunkMain(item, memory));
  }

  // maps -> require more complicated logic
  if (chunk.type === "map") {
    const keypairs: [ClojureValue, ClojureValue][] = [];
    const items = chunk.items;
    for (let i = 0; i < items.length - 1; i += 2) {
      keypairs.push([items[i], items[i + 1]]);
    }

    const mapped: Record<string, ClojureValue> = {};
    for (const [key, val] of keypairs) {
      const keyStr = assembleKeywords(key) as string;
      mapped[keyStr] = val;
    }

    let result = true;

    // :effect
    if (mapped["effect"]) {
      if (mapped["async"]) {
        result = result && isValidChunkMain(mapped["effect"], memory, "async");
      } else {
        result = result && isValidChunkMain(mapped["effect"], memory, "sync");
      }
    }

    // :move-zone should complete an eid
    if (mapped["move-zone"]) {
      result = result && isValidChunkMain(mapped["move-zone"], memory, "async");
    }

    // :cancel
    if (mapped["cancel"]) {
      result = result && isValidChunkMain(mapped["cancel"], memory);
    }

    // if no :effect or :cancel-effect, check all values
    if (!mapped["effect"] && !mapped["cancel-effect"]) {
      result = result && Object.values(mapped).every((val) => isValidChunkMain(val, memory));
    }

    return result;
  }

  // metadata
  if (chunk.type === "metadata") {
    const nextChunk = readMetadata(chunk);
    if (nextChunk) {
      return isValidChunkMain(nextChunk, memory);
    }
    return true;
  }

  // symbol
  if (chunk.type === "symbol") {
    return true;
  }

  return true;
}

/**
 * invalid-chunk?: check if a chunk of card code has invalid async/sync patterns
 */
function invalidChunk(chunk: string): string | null {
  let parsed;
  try {
    parsed = parseClojure(chunk);
  } catch (e) {
    console.log("unable to parse chunk: ", chunk);
    console.log(e);
    return "[parse-error]";
  }

  if (parsed.type !== "fn") {
    return null;
  }

  const body = parsed.items.slice(1);
  const memory: MemoryEntry[] = [];

  for (const item of body) {
    if (!isValidChunkMain(item, memory)) {
      return getFnName(item) as string;
    }
  }

  return null;
}

/**
 * get-clojure-files: list .clj files in a directory (excluding backup files)
 */
function getClojureFiles(dir: string): string[] {
  const files = fs.readdirSync(dir).filter((f) => {
    // exclude emacs autosave (#) and backup (~) files
    return !f.includes("#") && !f.includes("~") && f.endsWith(".clj");
  });
  return files.sort();
}

// ============================================================================
// Tests
// ============================================================================

describe("cards-are-async-test", () => {
  const cardDir = path.join(process.cwd(), CARD_BASE_STR);

  if (fs.existsSync(cardDir)) {
    const files = getClojureFiles(cardDir);

    for (const fname of files) {
      it(`validates async/sync in ${fname}`, () => {
        const f = fs.readFileSync(path.join(cardDir, fname), "utf-8");
        const chunks = stitchAndSplitCardFiles(f).slice(1); // skip first empty chunk

        const invalids = chunks
          .map((chunk) => invalidChunk(chunk))
          .filter((r): r is string => r !== null);

        expect(invalids).toEqual(
          [],
          `the following definitions in ${fname} may have sync/async issues: ${invalids.join(", ")}`
        );
      });
    }
  } else {
    it.skip("card directory does not exist");
  }
});

describe("core-fns-are-async-test", () => {
  const coreDir = path.join(process.cwd(), CORE_BASE_STR);

  if (fs.existsSync(coreDir)) {
    const files = getClojureFiles(coreDir);

    for (const fname of files) {
      it(`validates async/sync in ${fname}`, () => {
        const f = fs.readFileSync(path.join(coreDir, fname), "utf-8");
        const chunks = stitchAndSplitCardFiles(f).slice(1); // skip first empty chunk

        const invalids = chunks
          .map((chunk) => invalidChunk(chunk))
          .filter((r): r is string => r !== null);

        expect(invalids).toEqual(
          [],
          `the following definitions in ${fname} may have sync/async issues: ${invalids.join(", ")}`
        );
      });
    }
  } else {
    it.skip("core directory does not exist");
  }
});

describe("metadata-ignore-works", () => {
  it("c1 is valid because we ignore the async check", () => {
    const c1 = '(defcard \\a ^:ignore-async-check {:async true :effect (req nil)})';
    expect(invalidChunk(c1)).toBeNull();
  });

  it("c2 is invalid because we do not ignore the async check", () => {
    const c2 = '(defcard \\b {:async true :effect (req nil)})';
    expect(invalidChunk(c2)).not.toBeNull();
  });
});

describe("async-test-defferred-fns-are-correct", () => {
  it("deffered block c1 is picked up as being correct (x completes)", () => {
    const c1 = '(defcard "c1" (let [x (req (do-something state side eid))] {:async true :effect x}))';
    expect(invalidChunk(c1)).toBeNull();
  });

  it("deffered block c2 is picked up as being wrong (x should complete)", () => {
    const c2 = '(defcard "c2" (let [x (req (do-something state side nil))] {:async true :effect x}))';
    expect(invalidChunk(c2)).not.toBeNull();
  });

  it("deffered block c3 is picked up as being wrong (x should complete)", () => {
    const c3 = '(defcard "c3" (let [x (req (do-something state side eid))] {:effect x}))';
    expect(invalidChunk(c3)).not.toBeNull();
  });

  it("deffered block c4 is picked up as being correct (x should not complete)", () => {
    const c4 = '(defcard "c4" (let [x (req (do-something state side nil))] {:effect x}))';
    expect(invalidChunk(c4)).toBeNull();
  });

  it("deffered block c5 is picked up as being correct (x completes)", () => {
    const c5 = '(defcard "c5" (letfn [(x [] (req (do-something state side eid)))] {:async true :effect (x)}))';
    expect(invalidChunk(c5)).toBeNull();
  });

  it("deffered block c6 is picked up as being wrong (x should complete)", () => {
    const c6 = '(defcard "c6" (letfn [(x [] (req (do-something state side nil)))] {:async true :effect (x)}))';
    expect(invalidChunk(c6)).not.toBeNull();
  });

  it("deffered block c7 is picked up as being wrong (x is not async, but should be)", () => {
    const c7 = '(defcard "c7" (letfn [(x [] (req (do-something state side eid)))] {:effect (x)}))';
    expect(invalidChunk(c7)).not.toBeNull();
  });

  it("deffered block c8 is picked up as being correct (x should not complete)", () => {
    const c8 = '(defcard "c8" (letfn [(x [] (req (do-something state side nil)))] {:effect (x)}))';
    expect(invalidChunk(c8)).toBeNull();
  });
});

describe("async-test-if-block-is-correct?", () => {
  it("If block C1 is picked up as being wrong (RHS does not complete)", () => {
    const c1 = invalidChunk(
      '(defcard "c1" {:async true :effect (req (if (some corp-installable-type? (:hand corp)) (continue-ability state side select-ability card nil) (damage state)))})'
    );
    expect(c1).not.toBeNull();
  });

  it("If block C2 is picked up as being wrong (LHS does not complete)", () => {
    const c2 = invalidChunk(
      '(defcard "c2" {:async true :effect (req (if-not (some corp-installable-type? (:hand corp)) (damage 2) (damage state side eid 1)))})'
    );
    expect(c2).not.toBeNull();
  });

  it("If block C3 is picked up as being right (LHS and RHS both complete)", () => {
    const c3 = invalidChunk(
      '(defcard "c3" {:async true :effect (req (if-let (some corp-installable-type? (:hand corp)) (continue-ability state side select-ability card nil) (damage state side eid 1)))})'
    );
    expect(c3).toBeNull();
  });
});

describe("async-test-when-block-is-correct?", () => {
  it("When block C1 is picked up as being wrong (conditional may not complete)", () => {
    const c1 = '(defcard "c1" {:async true :effect (req (when x (do-something state side eid)))})';
    expect(invalidChunk(c1)).not.toBeNull();
  });

  it("When block C2 is picked up as being right (conditional does not block completion)", () => {
    const c2 = '(defcard "c2" {:async true :effect (req (do (when x y) (do-something state side eid)))})';
    expect(invalidChunk(c2)).toBeNull();
  });
});

describe("async-test-case-block-is-correct?", () => {
  it("Case block C1 is picked up as being wrong (terminal does not complete)", () => {
    const c1 = '(defcard "c1" {:async true :effect (req (case x a (do-something state side eid) (system-msg state side "whoops"))))';
    expect(invalidChunk(c1)).not.toBeNull();
  });

  it("Case block C2 is picked up as being wrong (LHS does not complete)", () => {
    const c2 = '(defcard "c2" {:async true :effect (req (case x a (system-msg state side "whoops") (do-something state side eid))))';
    expect(invalidChunk(c2)).not.toBeNull();
  });

  it("Case block C3 is picked up as being right (LHS and terminal both complete)", () => {
    const c3 = '(defcard "c3" {:async true :effect (req (case x a (do-thing state side eid) (do-something state side eid))))';
    expect(invalidChunk(c3)).toBeNull();
  });
});

describe("async-test-cond+-is-correct?", () => {
  it("Cond+ block C1 is picked up as being wrong (RHS does not complete)", () => {
    const c1 = '(defcard "c1" {:async true :effect (req (cond+ [a (damage state :runner)] [:else (do-something state side eid)]))})';
    expect(invalidChunk(c1)).not.toBeNull();
  });

  it("Cond+ block C2 is picked up as being wrong (LHS does not complete)", () => {
    const c2 = '(defcard "c2" {:async true :effect (req (cond+ [a (do-something state :runner eid)] [:else (damage state side)]))})';
    expect(invalidChunk(c2)).not.toBeNull();
  });

  it("Cond+ block C3 is picked up as being right (LHS and RHS both complete)", () => {
    const c3 = '(defcard "c3" {:async true :effect (req (cond+ [a (do-something state :runner eid)] [:else (do-something state side eid)]))})';
    expect(invalidChunk(c3)).toBeNull();
  });
});
