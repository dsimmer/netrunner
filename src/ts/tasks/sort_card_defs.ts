/* eslint-disable no-console */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { slugify } from "../jinteki/utils";
import type { Card } from '../types';


// ---------------------------------------------------------------------------
// sort_card_defs (mirrors tasks.sort-card-defs)
// Sorts defcard definitions within each card type file
// ---------------------------------------------------------------------------

const BASE_DIR = "src/clj/game/cards";

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
 * Reads all .clj files from the base cards directory, sorted by filename.
 * Mirrors: (open-base-defs)
 */
function openBaseDefs(): string[] {
  const dirPath = join(process.cwd(), BASE_DIR);
  const filenames = readdirSync(dirPath)
    .filter((f) => f.endsWith(".clj"))
    .sort();
  return filenames.map((f) => readFileSync(join(dirPath, f), "utf-8"));
}

/**
 * Splits each file's card definitions, sorts them by slugified title, and writes back.
 * Mirrors: (split-em)
 */
export function splitEm(fileStrings: string[] = openBaseDefs()): void {
  for (const [idx, type] of TYPES.entries()) {
    const file = fileStrings[idx];
    if (!file) continue;

    // Header: everything up to and including ";; Card definitions\n\n"
    const header = file
      .split(";; Card definitions\n\n")[0]
      .concat(";; Card definitions\n\n");

    // Card defs: everything after ";; Card definitions"
    // Split on "\n\n(defcard " to get individual card definitions
    const cardDefs =
      file
        .split(";; Card definitions")[1]
        ?.split(/\n\n\(defcard /)
        .filter((d): d is string => Boolean(d?.trim()))
        .map((d) => `(defcard ${d}`)
        .sort((a, b) => {
          const slugA = slugify(getCardName(a), " ");
          const slugB = slugify(getCardName(b), " ");
          return slugA.localeCompare(slugB);
        })
        .join("\n\n") ?? "";

    const outputPath = join(process.cwd(), BASE_DIR, `${type}.clj`);
    writeFileSync(outputPath, header + cardDefs);
    console.log("Wrote", outputPath);
  }
}

/**
 * Extracts the card name from a defcard form.
 * Mirrors: (last (re-find #"defcard \"(.+)\"" %))
 */
function getCardName(defcard: string): string {
  const match = defcard.match(/defcard "([^"]+)"/);
  return match ? match[1] : "";
}

// Allow running from command line
if (require.main === module) {
  splitEm();
  console.log("Done.");
}
