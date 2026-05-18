// Mirrors: test/clj/game/rewrite.clj
//
// Utility functions for parsing/rewriting Clojure test source files.
// Used by the test rewrite pipeline that splits `(testing ...)` branches
// out of `(deftest ...)` into individual deftests.
//
// The TypeScript port uses simple text-based parsing over Clojure source
// rather than a full EDN/CLJ parser, since only a narrow set of patterns
// need to be handled (deftest forms with optional metadata, testing blocks).

// ──────────────────────────────────────────────────────────────────────
// Detection helpers
// ──────────────────────────────────────────────────────────────────────

/** Check if a node is a `deftest` form */
export function isDeftest(source: string): boolean {
  const trimmed = source.trim();
  return /^\s*\(?\s*deftest\b/.test(trimmed);
}

/** Check if a node is a `testing` form */
export function isTesting(source: string): boolean {
  const trimmed = source.trim();
  return /^\s*\(?\s*testing\b/.test(trimmed);
}

/**
 * Check if this is a "basic test" branch.
 * A basic test has the string "(?i).*basic .*test.*" matching it.
 */
export function isBasicTest(source: string): boolean {
  if (!isTesting(source)) return false;
  // Extract the string argument after `testing`
  const match = source.match(/\(\s*testing\s+"([^"]*)"/);
  if (!match) return false;
  return /basic\s+.*test/i.test(match[1]);
}

// ──────────────────────────────────────────────────────────────────────
// Node symbol extraction
// ──────────────────────────────────────────────────────────────────────

/**
 * Extract the test name symbol from a `deftest` form.
 *
 * Handles:
 *   (deftest foo ...)
 *   (deftest ^{:foo "bar"} foo ...)
 *   (deftest ^:qualifier foo ...)
 *
 * When metadata is present (a vector `^{...}` or keyword `^:...`),
 * the symbol follows after the metadata.
 */
export function getNodeSymbol(source: string): string {
  let s = source.trim();

  // Strip leading paren
  if (s.startsWith("(")) {
    s = s.slice(1).trim();
  }

  // Strip `deftest` keyword
  if (s.startsWith("deftest")) {
    s = s.replace(/^deftest\s*/, "").trim();
  }

  // Handle metadata: ^{...} (with possible nested braces)
  if (s.startsWith("^{")) {
    let depth = 0;
    let i = 1;
    for (; i < s.length; i++) {
      if (s[i] === "{") depth++;
      if (s[i] === "}") {
        depth--;
        if (depth === 0) break;
      }
    }
    s = s.slice(i + 1).trim();
  }

  // Handle metadata: ^:keyword or ^namespace/keyword
  else if (s.startsWith("^:")) {
    // Skip the keyword (non-whitespace chars after ^:)
    const match = s.match(/^\^:(\S+)\s*/);
    if (match) {
      s = s.slice(match[0].length).trim();
    }
  }

  // Now s should start with the symbol name
  // Extract just the first token (the test name)
  const tokenMatch = s.match(/^(\S+)/);
  return tokenMatch ? tokenMatch[1] : "";
}

// ──────────────────────────────────────────────────────────────────────
// Testing branch extraction
// ──────────────────────────────────────────────────────────────────────

/**
 * Count the number of `(testing "...")` branches in a deftest body.
 *
 * Filters out "basic test" branches (matching /(?i)basic\s+.*test/).
 *
 * Returns the count of qualifying testing branches.
 */
export function getTestingBranches(source: string): number {
  // Find all `(testing "..." ...)` patterns using balanced-paren approach
  const branches: string[] = [];
  let i = 0;
  const len = source.length;

  while (i < len) {
    // Look for `(` followed by `testing`
    const parenIdx = source.indexOf("(", i);
    if (parenIdx === -1) break;

    let j = parenIdx + 1;
    // Skip whitespace
    while (j < len && /\s/.test(source[j])) j++;

    // Check for `testing` keyword
    if (source.substring(j, j + 7) === "testing") {
      // Find matching close paren using depth counting
      let depth = 1;
      j += 7;
      while (j < len && depth > 0) {
        if (source[j] === "(") depth++;
        if (source[j] === ")") depth--;
        j++;
      }
      const branch = source.substring(parenIdx, j);
      if (!isBasicTest(branch)) {
        branches.push(branch);
      }
      i = j;
    } else {
      i = parenIdx + 1;
    }
  }

  return branches.length;
}

// ──────────────────────────────────────────────────────────────────────
// Slugify utility (mirrors jinteki.utils/slugify)
// ──────────────────────────────────────────────────────────────────────

/**
 * Convert a string to a slug suitable for use as a symbol name.
 * Replaces non-alphanumeric chars (except hyphens/underscores) with hyphens,
 * collapses runs, trims edges, and lowercases.
 */
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9_\-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// ──────────────────────────────────────────────────────────────────────
// Test name builder (mirrors build-deftest-name)
// ──────────────────────────────────────────────────────────────────────

/**
 * Build a new deftest name by appending a slugified string.
 * e.g. buildDeftestName("card-test", 'some "description"') => "card-test-some-description"
 */
export function buildDeftestName(deftestName: string, str: string): string {
  // Clean the string: remove surrounding quotes, trim
  let cleaned = str;
  if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
    cleaned = cleaned.slice(1, -1);
  }
  // Join multiline strings
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  return `${deftestName}-${slugify(cleaned)}`;
}
