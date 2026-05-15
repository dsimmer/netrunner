/* eslint-disable no-console */
/**
 * Find missing translations, undefined translations, and unused translations.
 * Ported from clj/tasks/translations.clj
 */

import { FluentBundle, FluentResource } from "@fluent/bundle";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Fluent dictionary – store bundles per locale
// ---------------------------------------------------------------------------

interface FluentDictionary {
	[key: string]: FluentBundle;
}

const fluentDictionary: FluentDictionary = {};

// ---------------------------------------------------------------------------
// AST node types (mirroring @fluent/bundle internal structure)
// ---------------------------------------------------------------------------

interface FtlMessage {
	id: string;
	value: string | FtlPatternElement[];
	attributes: Record<string, string | FtlPatternElement[]>;
	comment?: string;
}

type FtlLiteral =
	| { type: "str"; value: string }
	| { type: "num"; value: number; precision: number };

type FtlArg =
	| { type: "var"; name: string }
	| { type: "narg"; name: string; value: FtlLiteral }
	| FtlLiteral;

type FtlPatternElement =
	| string
	| { type: "var"; name: string }
	| { type: "mesg"; name: string; attr: string | null }
	| { type: "term"; name: string; attr: string | null; args: FtlArg[] }
	| { type: "select"; selector: FtlPatternElement; variants: FtlVariant[]; star: number }
	| { type: "func"; name: string; args: FtlArg[] }
	| { type: "str"; value: string }
	| { type: "num"; value: number; precision: number };

interface FtlVariant {
	key: { type: "str"; value: string } | { type: "num"; value: number };
	value: string | FtlPatternElement[];
}

// ---------------------------------------------------------------------------
// Build a FluentBundle from locale string and FTL resource content
// ---------------------------------------------------------------------------

function build(localeStr: string, resource: string): FluentBundle {
	try {
		const lang = localeStr === "la-pig" ? "en" : localeStr;
		const bundle = new FluentBundle(lang);
		const ftlRes = new FluentResource(resource);

		// Check for errors: invalid FTL results in empty body
		if (ftlRes.body.length === 0 && resource.trim().length > 0) {
			throw new Error(`Error parsing FTL for locale: ${localeStr}`);
		}

		bundle.addResource(ftlRes);
		return bundle;
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		console.log(`Error in ${localeStr} adding resource: ${message}`);
		throw err;
	}
}

// ---------------------------------------------------------------------------
// Load all .ftl files from resources/public/i18n
// ---------------------------------------------------------------------------

const i18nDir = join(process.cwd(), "resources", "public", "i18n");

if (existsSync(i18nDir)) {
	Object.assign(fluentDictionary, {});
	for (const file of readdirSync(i18nDir)) {
		if (file.endsWith(".ftl")) {
			const lang = file.replace(/\.ftl$/, "");
			const content = readFileSync(join(i18nDir, file), "utf-8");
			fluentDictionary[lang] = build(lang, content);
		}
	}
	console.log("Loaded");
}

// ---------------------------------------------------------------------------
// Get messages for a locale (excludes "angel-arena*" keys)
// ---------------------------------------------------------------------------

function getMessages(lang: string): Record<string, { id: string; value: string | FtlPatternElement[]; attributes: Record<string, string | FtlPatternElement[]> }> {
	const bundle = fluentDictionary[lang];
	if (!bundle) {
		return {};
	}
	const messages: Record<string, { id: string; value: string | FtlPatternElement[]; attributes: Record<string, string | FtlPatternElement[]> }> = {};
	// Access internal _messages Map from FluentBundle
	const msgMap = (bundle as unknown as { _messages: Map<string, { id: string; value: string | FtlPatternElement[]; attributes: Record<string, string | FtlPatternElement[]> }> })._messages;
	if (msgMap) {
		for (const [id, entry] of msgMap) {
			// Skip term entries (start with -)
			if (id.startsWith("-")) {
				continue;
			}
			// Skip angel-arena keys
			if (id.startsWith("angel-arena")) {
				continue;
			}
			messages[id] = entry;
		}
	}
	return messages;
}

// ---------------------------------------------------------------------------
// Missing translations – compare each locale against "en"
// ---------------------------------------------------------------------------

function missingTranslations(...args: string[]): void {
	const enKeys = Object.keys(getMessages("en"));
	const langs = args.length > 0 ? args : Object.keys(fluentDictionary).filter((l) => l !== "en");

	for (const lang of langs) {
		const langKeys = Object.keys(getMessages(lang));
		console.log("Checking", lang);

		// Missing from this language (in en but not in lang)
		const enWithoutPreconstructed = enKeys.filter((k) => !k.startsWith("preconstructed_"));
		const missing = enWithoutPreconstructed.filter((k) => !langKeys.includes(k));
		if (missing.length > 0) {
			console.log("Missing from", lang);
			console.log(JSON.stringify(missing.sort(), null, 2));
			console.log();
		}

		// Extra in this language (not in en)
		const extra = langKeys.filter((k) => !enKeys.includes(k));
		if (extra.length > 0) {
			console.log("Missing from :en");
			console.log(JSON.stringify(extra.sort(), null, 2));
			console.log();
		}
	}
	console.log("Finished!");
}

// ---------------------------------------------------------------------------
// Extract plain text value from a Message's pattern
// ---------------------------------------------------------------------------

function getEntryValue(entry: { id: string; value: string | FtlPatternElement[]; attributes: Record<string, string | FtlPatternElement[]> }): string | undefined {
	const value = entry.value;
	if (typeof value === "string") {
		return value;
	}
	if (!Array.isArray(value)) {
		return undefined;
	}
	// Check that all elements are plain strings (TextElement)
	if (!value.every((el) => typeof el === "string")) {
		return undefined;
	}
	return value.join(" ");
}

// ---------------------------------------------------------------------------
// Undefined translations – find tr[:key] calls with no en entry
// ---------------------------------------------------------------------------

function undefinedTranslations(): void {
	const enMap = getMessages("en");

	// Collect all .clj files from src/cljs and src/cljc
	const srcDirs = ["src/cljs", "src/cljc"];
	const files: { fileName: string; contents: string }[] = [];
	for (const dir of srcDirs) {
		const dirPath = join(process.cwd(), dir);
		if (!existsSync(dirPath)) continue;
		const entries = readdirSync(dirPath, { recursive: true });
		for (const entry of entries) {
			const fullPath = join(dirPath, entry as string);
			if (statSync(fullPath).isFile() && typeof entry === "string" && entry.includes(".clj")) {
				const contents = readFileSync(fullPath, "utf-8");
				// Skip angel_arena files
				if (!fullPath.includes("angel_arena")) {
					files.push({ fileName: fullPath, contents });
				}
			}
		}
	}

	const finds: { fileName: string; entry: string; msg: (string | undefined)[] }[] = [];

	for (const { fileName, contents } of files) {
		// Match tr [:key] or tr [:key "default"]
		const re = /tr\s+\[:([a-zA-Z0-9_-]*?)(\s+"(.*?)")?\]/g;
		let match;
		const used: { k: string; defaultVal?: string }[] = [];
		while ((match = re.exec(contents)) !== null) {
			used.push({ k: match[1], defaultVal: match[4] ? match[4].trim() : undefined });
		}

		for (const { k, defaultVal } of used) {
			const entry = enMap[k];
			const message = entry ? getEntryValue(entry) : undefined;
			const keyName = `:${k}`;

			// Skip if entry exists in en
			if (entry) continue;

			// Skip if there's a default that matches (case-insensitive)
			if (defaultVal && message) {
				if (message.toLowerCase() === defaultVal.toLowerCase()) continue;
			}

			finds.push({
				fileName,
				entry: keyName,
				msg: [message, defaultVal],
			});
		}
	}

	// Group by file
	const grouped: Record<string, typeof finds> = {};
	for (const f of finds) {
		if (!grouped[f.fileName]) grouped[f.fileName] = [];
		grouped[f.fileName].push(f);
	}

	for (const [fileName, items] of Object.entries(grouped)) {
		for (const { entry, msg } of items) {
			console.log(fileName);
			console.log(JSON.stringify([entry, msg], null, 2));
		}
	}
	console.log("Finished!");
}

// ---------------------------------------------------------------------------
// Keys to exclude from unused check
// ---------------------------------------------------------------------------

const keysToDissoc = new Set([
	"card-type_", // handled by tr-type
	"side_", // handled by tr-side
	"faction_", // handled by tr-faction
	"format_", // handled by tr-format
	"lobby_", // handled by tr-lobby and tr-watch-join
	"pronouns", // handled by tr-pronouns
	"set_", // handled by tr-set
	"game_prompt", // handled by tr-game-prompt
	"preconstructed_",
]);

// ---------------------------------------------------------------------------
// Unused translations – find en keys never used in source code
// ---------------------------------------------------------------------------

function unusedTranslations(): void {
	const enMessages = getMessages("en");

	// Build regex for each key (excluding keys-to-dissoc prefixes)
	const regexen: [string, RegExp][] = [];
	for (const key of Object.keys(enMessages)) {
		if ([...keysToDissoc].some((prefix) => key.startsWith(prefix))) continue;
		// Match tr [:key] or tr [:key "default"] or tr [:key some-other-key]
		const patt = `tr \\[:(?:${key})(?:\\s+\\\"(?:.*?)\\\"|\\s+[a-zA-Z0-9_-]*)?\\]`;
		regexen.push([key, new RegExp(patt)]);
	}

	// Collect all .clj files from src/cljs and src/cljc
	const srcDirs = ["src/cljs", "src/cljc"];
	const fileContents: string[] = [];
	for (const dir of srcDirs) {
		const dirPath = join(process.cwd(), dir);
		if (!existsSync(dirPath)) continue;
		const entries = readdirSync(dirPath, { recursive: true });
		for (const entry of entries) {
			const fullPath = join(dirPath, entry as string);
			if (statSync(fullPath).isFile() && typeof entry === "string" && entry.includes(".clj")) {
				const contents = readFileSync(fullPath, "utf-8");
				if (!fullPath.includes("angel_arena")) {
					fileContents.push(contents);
				}
			}
		}
	}

	// Check each key
	for (const [path, regex] of regexen.sort(([a], [b]) => a.localeCompare(b))) {
		const isUsed = fileContents.some((contents) => regex.test(contents));
		if (!isUsed) {
			console.log(path);
		}
	}
	console.log("Finished!");
}

// ---------------------------------------------------------------------------
// FTL Pretty Printer – serialize FTL AST back to text
// ---------------------------------------------------------------------------

function isPlainString(val: unknown): val is string {
	return typeof val === "string";
}

function formatLiteral(lit: FtlLiteral): string {
	if (lit.type === "str") return `"${lit.value}"`;
	return String(lit.value);
}

function formatArg(arg: FtlArg): string {
	if (arg.type === "narg") return `${arg.name}: ${formatLiteral(arg.value)}`;
	if (arg.type === "var") return `$${arg.name}`;
	return formatLiteral(arg as FtlLiteral);
}

function formatPatternValue(val: string | FtlPatternElement[]): string {
	if (isPlainString(val)) return val as string;
	return (val as FtlPatternElement[]).map(formatPatternElement).join("");
}

// Format an inline expression without outer { } braces (for selectors, args)
function formatInlineExpression(el: FtlPatternElement): string {
	if (typeof el === "string") return el;
	switch (el.type) {
		case "var": return `$${el.name}`;
		case "mesg": return el.attr ? `${el.name}.${el.attr}` : el.name;
		case "str": return `"${el.value}"`;
		case "num": return String(el.value);
		case "term": {
			let ref = `-${el.name}`;
			if (el.attr) ref += `.${el.attr}`;
			if (el.args && el.args.length > 0) ref += `(${el.args.map(formatArg).join(", ")})`;
			return ref;
		}
		case "func": {
			const argsStr = el.args ? el.args.map(formatArg).join(", ") : "";
			return `${el.name}(${argsStr})`;
		}
		default: return String(el);
	}
}

// Format a pattern element as it appears in a message value (with { } for placeables)
function formatPatternElement(el: FtlPatternElement): string {
	if (typeof el === "string") return el;
	if (el.type === "select") {
		const selector = formatInlineExpression(el.selector);
		let result = `{${selector} ->\n`;
		for (let i = 0; i < el.variants.length; i++) {
			const variant = el.variants[i];
			const star = el.star === i ? "*" : "";
			const key = variant.key.value;
			const val = isPlainString(variant.value)
				? (variant.value as string)
				: (variant.value as FtlPatternElement[]).map(formatPatternElement).join("");
			result += `    ${star}[${key}] ${val}\n`;
		}
		return result + "}";
	}
	return `{${formatInlineExpression(el)}}`;
}

function formatFtlResource(ftlRes: FluentResource): string {
	const parts: string[] = [];

	for (const entry of ftlRes.body) {
		const id = entry.id;
		const value = entry.value as string | FtlPatternElement[] | null | undefined;
		const attributes = entry.attributes as Record<string, string | FtlPatternElement[]> | undefined;

		let block = "";

		if (value != null) {
			block += `${id} = ${formatPatternValue(value as string | FtlPatternElement[])}`;
		} else {
			block += `${id} =`;
		}

		if (attributes) {
			for (const [attrName, attrValue] of Object.entries(attributes)) {
				block += `\n    .${attrName} = ${formatPatternValue(attrValue)}`;
			}
		}

		parts.push(block);
	}

	return parts.join("\n\n") + "\n";
}

// ---------------------------------------------------------------------------
// Format i18n files – pretty-print FTL files
// ---------------------------------------------------------------------------

function formatI18nFiles(...args: string[]): void {
	const langs = args.length > 0 ? args : Object.keys(fluentDictionary);

	for (const lang of langs) {
		const filePath = join(process.cwd(), "resources", "public", "i18n", `${lang}.ftl`);
		if (!existsSync(filePath)) continue;

		let contents = readFileSync(filePath, "utf-8");

		// Escape unicode escapes for parsing
		contents = contents.replace(/\\u/g, "__u").replace(/\\U/g, "__U");

		// Parse and re-format
		try {
			const ftlRes = new FluentResource(contents);
			const formatted = formatFtlResource(ftlRes);
			// Unescape unicode escapes
			const final = formatted.replace(/__u/g, "\\u").replace(/__U/g, "\\U").trim() + "\n";
			writeFileSync(filePath, final, "utf-8");
		} catch (err: unknown) {
			console.error(`Error formatting ${lang}:`, err instanceof Error ? err.message : String(err));
		}
	}
	console.log("Finished formatting!");
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

function main(): void {
	const args = process.argv.slice(2);
	if (args.length === 0) {
		console.log("Usage: translations.ts [command] [args...]");
		console.log("Commands:");
		console.log("  missing-translations    Compare locales against en");
		console.log("  undefined-translations  Find tr[:key] with no en entry");
		console.log("  unused-translations     Find en keys never used in source");
		console.log("  format-i18n-files       Pretty-print FTL files");
		console.log("  help                    Show this help");
		return;
	}

	const command = args[0];
	const rest = args.slice(1);

	switch (command) {
		case "missing-translations":
			missingTranslations(...rest);
			break;
		case "undefined-translations":
			undefinedTranslations();
			break;
		case "unused-translations":
			unusedTranslations();
			break;
		case "format-i18n-files":
			formatI18nFiles(...rest);
			break;
		case "help":
			console.log("Usage: translations.ts [command] [args...]");
			console.log("Commands:");
			console.log("  missing-translations    Compare locales against en");
			console.log("  undefined-translations  Find tr[:key] with no en entry");
			console.log("  unused-translations     Find en keys never used in source");
			console.log("  format-i18n-files       Pretty-print FTL files");
			console.log("  help                    Show this help");
			break;
		default:
			// If no recognized command, treat as missing-translations with args as lang filters
			missingTranslations(...args);
			break;
	}
}

// Run if called directly
if (require.main === module) {
	main();
}

export {
	build,
	fluentDictionary,
	getEntryValue,
	getMessages,
	missingTranslations,
	unusedTranslations,
	undefinedTranslations,
	formatI18nFiles,
	formatFtlResource,
	formatPatternValue,
	formatPatternElement,
	formatArg,
	formatLiteral,
	formatInlineExpression,
	keysToDissoc,
};
