/* eslint-disable no-console */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";

// ---------------------------------------------------------------------------
// update_alt_arts (mirrors tasks.update-alt-arts)
// Import alt-art cards from a private GitHub repo
// ---------------------------------------------------------------------------

const OWNER = "NBKelly";
const REPO = "netrunner-alt-art-collection";
const BRANCH = "master";

const GITHUB_API = "https://api.github.com";

/**
 * Compute SHA-1 checksum of a file, formatted as GitHub does (blob header).
 * Mirrors: sha1-checksum
 */
function sha1Checksum(filePath: string): string {
	const fs = require("node:fs");
	const digest = createHash("sha1");
	const buffer = fs.readFileSync(filePath);
	const byteCount = buffer.byteLength;
	const blobHeader = `blob ${byteCount}\0`;
	digest.update(blobHeader, "utf8");
	digest.update(buffer);
	return digest.digest("hex");
}

/**
 * Fetch directory listing from GitHub API.
 * Mirrors: list-content
 * @param token   - GitHub bearer token
 * @param key     - card key / promo path
 * @param lang    - language fragment (e.g. "en")
 * @param high    - if "high", fetch high-res; otherwise standard-res
 * @param verbose - if true, log errors
 * @returns Array of file info objects or undefined on error
 */
async function listContent(
	token: string,
	key: string,
	lang: string,
	high: boolean,
	verbose: boolean,
): Promise<
	| { name: string; path: string; sha: string; type: string }[]
	| undefined
> {
	const url = `${GITHUB_API}/repos/${OWNER}/${REPO}/contents/images/${lang}/${high ? "high" : "default"}/${key}?ref=${BRANCH}`;
	console.log(`fetching cards: ${key} (${high ? "high-res)" : "standard-res)"}`);

	const res = await fetch(url, {
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: "application/vnd.github.v3+json",
		},
	});

	if (res.ok) {
		return (await res.json()) as { name: string; path: string; sha: string; type: string }[];
	}
	if (verbose || !high) {
		console.log(`Error fetching files for url: ${url}\n  -- ${res.status} ${res.statusText}`);
	}
	return undefined;
}

/**
 * Write binary data to a file, creating parent directories if needed.
 * Mirrors: write-to-file
 */
function writeFile(filename: string, data: Buffer): void {
	const fs = require("node:fs");
	const { dirname } = require("node:path");
	const dir = dirname(filename);
	if (!existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}
	fs.writeFileSync(filename, data);
}

/**
 * Download a file from GitHub API and save to disk.
 * Mirrors: download-github-file
 * @returns true on success
 */
async function downloadGithubFile(
	token: string,
	filepath: string,
	outputPath: string,
): Promise<boolean> {
	const url = `${GITHUB_API}/repos/${OWNER}/${REPO}/contents/${filepath}?ref=${BRANCH}`;

	const res = await fetch(url, {
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: "application/vnd.github.v3.raw",
		},
	});

	if (res.status === 200) {
		const buffer = Buffer.from(await res.arrayBuffer());
		writeFile(outputPath, buffer);
		console.log("Downloaded", outputPath);
		return true;
	}
	if (res.status === 404) {
		console.log("Error: File not found (404)");
	} else {
		console.log(`Error: HTTP ${res.status}`);
	}
	return false;
}

/**
 * Construct the local image file path.
 * Mirrors: local-image-path
 */
function localImagePath(key: string, lang: string, high: boolean, name: string): string {
	return `resources/public/img/cards/${lang}/${high ? "high" : "default"}/${key}/${name}`;
}

/**
 * Fetch an image from GitHub if the local copy doesn't match or force is true.
 * Mirrors: fetch-image
 */
async function fetchImage(
	token: string,
	key: string,
	lang: string,
	high: boolean,
	data: { name: string; path: string; sha: string },
	force: boolean,
): Promise<void> {
	const localPath = localImagePath(key, lang, high, data.name);
	const fs = require("node:fs");

	if (!force && fs.existsSync(localPath)) {
		const localSha = sha1Checksum(localPath);
		if (localSha === data.sha) {
			return; // no update needed
		}
	}
	await downloadGithubFile(token, data.path, localPath);
}

/**
 * EDN map value type.
 */
interface EdnMap {
	[key: string]: unknown;
}

/**
 * Simple EDN parser (subset: vectors, maps, strings, keywords, numbers, nil).
 * Mirrors: clojure.edn/read-string
 */
function parseEdn(str: string): EdnMap | EdnMap[] {
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

	function parseVector(): unknown[] {
		pos++; // [
		const result: unknown[] = [];
		skipWhitespaceAndComments();
		while (pos < str.length && str[pos] !== "]") {
			result.push(parseValue());
			skipWhitespaceAndComments();
		}
		pos++; // ]
		return result;
	}

	function parseAtom(): unknown {
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

	function parseValue(): unknown {
		skipWhitespaceAndComments();
		const c = str[pos];
		if (c === undefined) return null;
		if (c === '"') return parseString();
		if (c === "{") return parseMap();
		if (c === "[") return parseVector();
		if (c === "(") {
			pos++;
			const result: unknown[] = [];
			skipWhitespaceAndComments();
			while (pos < str.length && str[pos] !== ")") {
				result.push(parseValue());
				skipWhitespaceAndComments();
			}
			pos++;
			return result;
		}
		return parseAtom();
	}

	return parseValue() as EdnMap | EdnMap[];
}

/**
 * Get promo card paths from data/promos.edn, excluding "prev" versions.
 * Mirrors: get-promo-paths
 */
function getPromoPaths(): string[] {
	const fs = require("node:fs");
	const promos = parseEdn(fs.readFileSync("data/promos.edn", "utf-8")) as EdnMap[];
	const versionKeys = promos
		.map((p) => (p.version as string) ?? "")
		.filter((v) => v !== "prev");
	return versionKeys;
}

/**
 * Download standard-res and high-res images for all promo cards.
 * Mirrors: update-promos
 */
export async function updatePromos(
	token: string,
	lang = "en",
	force = false,
	verbose = false,
): Promise<void> {
	console.log("updating promo cards...");

	// Download the latest promos.edn from remote
	const downloaded = await downloadGithubFile(token, "promos.edn", "data/promos.edn");

	if (!downloaded) {
		console.log(
			"Unable to read promo data from remote source - is your key accurate?",
		);
		return;
	}

	const promoPaths = getPromoPaths();

	// Process all promo paths in parallel (mirrors doseq + pmap)
	await Promise.all(
		promoPaths.map(async (path) => {
			// Standard res images (sequential within, mirroring pmap 3)
			const content = await listContent(token, path, lang, false, verbose);
			if (content) {
				for (const item of content) {
					if (item.type === "file") {
						await fetchImage(token, path, lang, false, item, force);
					}
				}
			}

			// High-res images
			const highContent = await listContent(token, path, lang, true, verbose);
			if (highContent) {
				for (const item of highContent) {
					if (item.type === "file") {
						await fetchImage(token, path, lang, true, item, force);
					}
				}
			}
		}),
	);
}

/**
 * CLI argument type.
 */
interface CliOptions {
	token: string;
	lang?: string;
	force?: boolean;
	verbose?: boolean;
}

/**
 * Print usage instructions.
 * Mirrors: usage
 */
function usage(optionsSummary: string): string {
	return [
		"",
		"Usage: bun src/ts/tasks/update_alt_arts.ts [options]",
		"",
		"Options:",
		optionsSummary,
	].join("\n");
}

/**
 * Main CLI entry point.
 * Mirrors: command
 */
export function command(args: string[]): void {
	const options: Partial<CliOptions> = {};
	let errors: string[] = [];

	let i = 0;
	while (i < args.length) {
		switch (args[i]) {
			case "-f":
			case "--force":
				options.force = true;
				break;
			case "-l":
			case "--language":
				i++;
				options.lang = args[i];
				break;
			case "-v":
			case "--verbose":
				options.verbose = true;
				break;
			case "-t":
			case "--token":
				i++;
				options.token = args[i];
				break;
			default:
				errors.push(`Unknown option: ${args[i]}`);
				break;
		}
		i++;
	}

	const fs = require("node:fs");

	if (errors.length > 0 || !options.token || !fs.existsSync(options.token)) {
		const optSummary = [
			"-f, --force              Force refetch all files",
			"-l, --language LANG      Language fragment (default: 'en')",
			"-v, --verbose            Nags for every path that can't be found",
			"-t, --token PATH         Path to fetch token from",
		].join("\n");
		console.error(usage(optSummary));
		process.exit(1);
	}

	updatePromos(options.token, options.lang, options.force, options.verbose).catch((err) => {
		console.error(err);
		process.exit(1);
	});
}

// Allow running from command line: bun src/ts/tasks/update_alt_arts.ts ...
if (import.meta.url === `file://${process.argv[1]}`) {
	command(process.argv.slice(2));
}
