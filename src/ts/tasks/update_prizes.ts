/* eslint-disable no-console */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

// ---------------------------------------------------------------------------
// update_prizes (mirrors tasks.update-prizes)
// Import prize data from a GitHub repo
// ---------------------------------------------------------------------------

const EDN_BASE_URL = "https://raw.githubusercontent.com/NBKelly/netrunner-prizes/main/";
const BASE_CARD_BACK_URL = "https://raw.githubusercontent.com/NBKelly/netrunner-prizes/main/img/card-backs/";
const BASE_CARD_BACK_PATH = "resources/public/img/card-backs/";

// ---------------------------------------------------------------------------
// EDN parser (mirrors clojure.edn/read-string, subset)
// ---------------------------------------------------------------------------

type EdnValue = string | number | boolean | null | EdnMap | EdnValue[];
interface EdnMap {
	[key: string]: EdnValue;
}

function parseEdn(str: string): EdnValue {
	let pos = 0;

	function skipWhitespaceAndComments(): void {
		while (pos < str.length) {
			if (/\s/.test(str[pos])) {
				pos++;
			} else if (str[pos] === ";") {
				while (pos < str.length && str[pos] !== "\n") pos++;
			} else {
				break;
			}
		}
	}

	function parseString(): string {
		pos++; // opening "
		let result = "";
		while (pos < str.length && str[pos] !== '"') {
			if (str[pos] === "\\" && pos + 1 < str.length) {
				const next = str[pos + 1];
				if (next === "n") { result += "\n"; pos += 2; }
				else if (next === "t") { result += "\t"; pos += 2; }
				else if (next === "r") { result += "\r"; pos += 2; }
				else if (next === "\\") { result += "\\"; pos += 2; }
				else if (next === '"') { result += '"'; pos += 2; }
				else { result += str[pos++]; }
			} else {
				result += str[pos++];
			}
		}
		pos++; // closing "
		return result;
	}

	function parseMap(): EdnMap {
		pos++; // {
		const result: EdnMap = {};
		skipWhitespaceAndComments();
		while (pos < str.length && str[pos] !== "}") {
			const key = parseValue();
			skipWhitespaceAndComments();
			const value = parseValue();
			skipWhitespaceAndComments();
			if (typeof key === "string" && key.startsWith(":")) {
				result[key.slice(1)] = value;
			}
		}
		pos++; // }
		return result;
	}

	function parseVector(): EdnValue[] {
		pos++; // [
		const result: EdnValue[] = [];
		skipWhitespaceAndComments();
		while (pos < str.length && str[pos] !== "]") {
			result.push(parseValue());
			skipWhitespaceAndComments();
		}
		pos++; // ]
		return result;
	}

	function parseAtom(): EdnValue {
		const start = pos;
		while (pos < str.length && !/[\s,\}\]\(\)]/.test(str[pos])) pos++;
		const s = str.slice(start, pos);
		if (s === "nil") return null;
		if (s === "true") return true;
		if (s === "false") return false;
		const num = Number(s);
		if (!isNaN(num) && s.length > 0) return num;
		return s;
	}

	function parseValue(): EdnValue {
		skipWhitespaceAndComments();
		const c = str[pos];
		if (c === undefined) return null;
		if (c === '"') return parseString();
		if (c === "{") return parseMap();
		if (c === "[") return parseVector();
		if (c === "(") {
			pos++; // (
			const result: EdnValue[] = [];
			skipWhitespaceAndComments();
			while (pos < str.length && str[pos] !== ")") {
				result.push(parseValue());
				skipWhitespaceAndComments();
			}
			pos++; // )
			return result;
		}
		return parseAtom();
	}

	return parseValue();
}

/**
 * Download prize EDN data from local file or remote URL.
 * Mirrors: (download-prize-data localpath listing)
 */
async function downloadPrizeData(
	localpath: string | undefined,
	listing: string,
): Promise<EdnValue> {
	if (localpath) {
		return parseEdn(readFileSync(join(localpath, listing), "utf-8"));
	}
	const url = EDN_BASE_URL + listing;
	const res = await fetch(url);
	if (res.status === 200) {
		return parseEdn(await res.text());
	}
	throw new Error(`Failed to download file, status ${res.status}`);
}

/**
 * Write EDN data to a .edn file.
 * Mirrors: (write-to-file filename data)
 */
function writeToFile(filename: string, data: EdnValue): void {
	const dir = dirname(filename);
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}
	writeFileSync(filename, JSON.stringify(data, null, 2));
}

// Card back info type
interface CardBackEntry {
	name: string;
	side: string;
	file: string;
}

/**
 * Fetch card-back images and prize data from the prizes repo.
 * Mirrors: (fetch-prizes opts)
 * @param opts - Options object
 */
export async function fetchPrizes(opts: {
	cardImages?: boolean;
	local?: string;
}): Promise<void> {
	const { cardImages = true, local } = opts;

	const cardBackData = await downloadPrizeData(local, "/data/card-backs.edn");
	if (!cardBackData || !Array.isArray(cardBackData)) {
		console.log("Unable to fetch card-back prize data");
		return;
	}

	writeToFile("data/card-backs.edn", cardBackData);

	if (cardImages) {
		for (const entry of cardBackData) {
			const { name, side, file } = entry as Record<string, string>;
			const ext = `${side}/${file}.png`;
			const url = BASE_CARD_BACK_URL + ext;
			console.log("Downloading:", name, "\t\t(", url, ")");

			const res = await fetch(url, {
				headers: { "Accept": "image/png" },
				signal: AbortSignal.timeout(120000), // 120s timeout, mirroring :timeout 120000
			});

			if (res.status === 404) {
				console.log("No image for card-back:", name, "\t\t(", url, ")");
			} else if (res.status === 200) {
				const path = BASE_CARD_BACK_PATH + ext;
				const dir = dirname(path);
				mkdirSync(dir, { recursive: true });
				const buffer = Buffer.from(await res.arrayBuffer());
				writeFileSync(path, buffer);
			} else {
				console.log("Error downloading art for card-back:", name, res.statusText);
			}
		}
	}

	// Touch the prizes.cljc file so shadow-cljs recompiles (mirrors setLastModified)
	const prizesPath = "src/cljc/jinteki/prizes.cljc";
	if (existsSync(prizesPath)) {
		const now = Date.now();
		// Update mtime to current time
		const fs = require("node:fs");
		fs.utimesSync(prizesPath, new Date(now), new Date(now));
	}

	console.log("done!");
}

/**
 * Print usage instructions.
 * Mirrors: (usage options-summary)
 */
function usage(optionsSummary: string): string {
	return [
		"",
		"Usage: bun src/ts/tasks/update_prizes.ts [options]",
		"",
		"Options:",
		optionsSummary,
	].join("\n");
}

/**
 * CLI argument parsing (mirrors parse-opts + cli-options).
 */
interface CliOptions {
	cardImages?: boolean;
	local?: string;
}

/**
 * Main CLI entry point.
 * Mirrors: (command & args)
 */
export function command(args: string[]): void {
	const options: Partial<CliOptions> = { cardImages: true };
	let errors: string[] = [];
	let i = 0;

	while (i < args.length) {
		const arg = args[i];
		switch (arg) {
			case "-l":
			case "--local":
				i++;
				options.local = args[i];
				break;
			case "-i":
			case "--card-images":
				options.cardImages = true;
				break;
			case "-j":
			case "--no-card-images":
				options.cardImages = false;
				break;
			default:
				errors.push(`Unknown option: ${arg}`);
				break;
		}
		i++;
	}

	const fs = require("node:fs");

	// Validate --local path if provided
	if (options.local && !fs.existsSync(options.local)) {
		errors.push("Could not find local data file");
	}

	if (errors.length > 0) {
		const optSummary = [
			"-l, --local PATH          Path to fetch card edn from",
			"-i, --card-images         Fetch card images from the prizes repo (default)",
			"-j, --no-card-images      Do not fetch card images from the prizes repo",
		].join("\n");
		console.error(usage(optSummary));
		process.exit(1);
	}

	fetchPrizes(options).catch((err) => {
		console.error(err);
		process.exit(1);
	});
}

// Allow running from command line: bun src/ts/tasks/update_prizes.ts ...
if (import.meta.url === `file://${process.argv[1]}`) {
	command(process.argv.slice(2));
}
