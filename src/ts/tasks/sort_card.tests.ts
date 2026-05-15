/* eslint-disable no-console */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// sort_card.tests (mirrors tasks.sort-card-tests)
// Sorts deftest definitions within each card test file
// ---------------------------------------------------------------------------

const BASE_DIR = "test/clj/game/cards";

const TYPES = [
	"agendas",
	"assets",
	"basic",
	"events",
	"hardware",
	"ice",
	"identities",
	"operations",
	"programs",
	"resources",
	"upgrades",
];

/**
 * Reads all .clj files from the base test directory, sorted by filename.
 * Mirrors: (open-base-tests)
 */
function openBaseTests(): string[] {
	const dirPath = join(process.cwd(), BASE_DIR);
	const filenames = readdirSync(dirPath)
		.filter((f) => f.endsWith(".clj"))
		.sort();
	return filenames.map((f) => readFileSync(join(dirPath, f), "utf-8"));
}

/**
 * Extracts the test name from a deftest block, checking both the normal
 * test name and the :card-title metadata.
 * Mirrors: (re-find #"deftest ([a-z\-]+)" %) and (re-find #"deftest \^\{:card-title \"([0-9a-z-]+)\"" %)
 */
function getTestName(testDef: string): string {
	const normal = testDef.match(/deftest\s+([a-z\-]+)/);
	const meta = testDef.match(/deftest\s+\^:\{card-title\s+"([0-9a-z-]+)"/);
	return (normal?.[1] ?? meta?.[1]) ?? "";
}

/**
 * Splits each test file's definitions, sorts them by test name, and writes back.
 * Mirrors: (split-em)
 */
export function splitEm(fileStrings: string[] = openBaseTests()): void {
	for (const [idx, type] of TYPES.entries()) {
		const f = fileStrings[idx];
		if (!f) continue;

		// Header: first part when split on "\n\n", then append "\n\n"
		const header = f.split(/\n\n/)[0] + "\n\n";

		// Tests: everything after the first "\n\n" split
		const afterHeader = f
			.split(/\n\n/)
			.slice(1)
			.join("\n\n") + "\n\n";

		// Split on "\n\n(deftest " to get individual test definitions
		const tests = afterHeader
			.split(/\n\n\(deftest /)
			.filter((d): d is string => d.trim() !== "")
			.map((d) => `(deftest ${d}`)
			.sort((a, b) => getTestName(a).localeCompare(getTestName(b)))
			.join("\n\n");

		const outputPath = join(process.cwd(), BASE_DIR, `${type}_test.clj`);
		writeFileSync(outputPath, header + tests);
		console.log("Wrote", outputPath);
	}
}

// Allow running from command line
if (import.meta.url === `file://${process.argv[1]}`) {
	splitEm();
	console.log("Done.");
}
