/**
 * Quotes - Random quote generation for game interactions
 * Ported from Clojure quotes.clj to TypeScript
 */

import * as path from 'path';

const quotesCorpFilename = 'data/quotes-corp.edn';
const quotesRunnerFilename = 'data/quotes-runner.edn';
const genericKey = 'Default';

interface IdentityQuotes {
  [key: string]: string | undefined;
}

interface PlayerQuotes {
  [identityTitle: string]: {
    [factionOrTitle: string]: string | string[] | undefined;
  };
}

// Store loaded quotes as nested map: { identityTitle: { factionOrTitle: quote } }
let identityQuotes: PlayerQuotes = {};

/**
 * Load quote file from EDN format
 */
function loadQuoteFile(filename: string): { [key: string]: string | string[] } | null {
  // In Node.js environment, we'd use fs.readFileSync
  // In browser, we'd fetch the file
  // For now, this is a stub - actual loading depends on runtime
  return null;
}

/**
 * Load all quotes from files
 */
export function loadQuotes(): void {
  const corpQuotes = loadQuoteFile(quotesCorpFilename);
  const runnerQuotes = loadQuoteFile(quotesRunnerFilename);
  
  // Merge the two quote files
  identityQuotes = { ...corpQuotes, ...runnerQuotes } as PlayerQuotes;
}

/**
 * Choose a random quote from options, repeated qty times
 */
function chooseAndRepeat(options: (string | null | undefined)[], qty: number): (string | null | undefined)[] {
  if (!options || options.length === 0) {
    return [];
  }
  const selected = options[Math.floor(Math.random() * options.length)];
  return Array(qty).fill(selected);
}

/**
 * Generate a random quote between two player identities
 * @param playerIdent - Player's identity info { title, faction }
 * @param oppIdent - Opponent's identity info { title, faction }
 * @returns A random quote string
 */
export function makeQuote(
  playerIdent: { title: string; faction?: string },
  oppIdent: { title: string; faction?: string }
): string {
  const { title: playerIdentTitle } = playerIdent;
  const { title: oppIdentTitle, faction: oppFaction } = oppIdent;
  
  const playerQuotes = identityQuotes[playerIdentTitle] || {};
  
  const generic = playerQuotes[genericKey];
  const oppFactionQuote = playerQuotes[oppFaction || ''];
  const oppSpecificQuote = playerQuotes[oppIdentTitle];
  
  // Build weighted list: generic x1, faction x3, specific x20
  const weighted = [
    ...chooseAndRepeat(generic ? [generic] : [], 1),
    ...chooseAndRepeat(oppFactionQuote ? [oppFactionQuote as string] : [], 3),
    ...chooseAndRepeat(oppSpecificQuote ? [oppSpecificQuote as string] : [], 20),
  ];
  
  // Filter out blank/null values
  const nonBlank = weighted.filter((q): q is string => !!q);
  
  if (nonBlank.length > 0) {
    return nonBlank[Math.floor(Math.random() * nonBlank.length)];
  }
  
  return 'NO QUOTE SRY';
}
