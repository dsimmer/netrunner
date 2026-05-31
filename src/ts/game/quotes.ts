/**
 * Quotes - Random quote generation for game interactions
 * Ported from Clojure quotes.clj to TypeScript
 */

import * as fs from 'fs';
import * as path from 'path';

const quotesCorpFilename = 'data/quotes-corp.edn';
const quotesRunnerFilename = 'data/quotes-runner.edn';
const genericKey = 'Default';

interface PlayerQuotes {
  [identityTitle: string]: {
    [factionOrTitle: string]: string[];
  };
}

// Store loaded quotes as nested map: { identityTitle: { factionOrTitle: [quotes...] } }
let identityQuotes: PlayerQuotes = {};

// ============================================================
// Simple EDN parser for the quote file format
// Handles: maps {}, vectors [], strings (with escapes)
// ============================================================

interface EdnValue {
  [key: string]: string[] | EdnValue;
}

function parseEdnQuotes(content: string): EdnValue {
  let pos = 0;

  function skipWhitespace(): void {
    while (pos < content.length && /\s/.test(content[pos])) {
      pos++;
    }
  }

  function parseString(): string {
    skipWhitespace();
    if (content[pos] !== '"') {
      throw new Error(`Expected '"' at position ${pos}`);
    }
    pos++; // skip opening quote
    let result = '';
    while (pos < content.length && content[pos] !== '"') {
      if (content[pos] === '\\') {
        pos++;
        switch (content[pos]) {
          case '"': result += '"'; break;
          case '\\': result += '\\'; break;
          case '/': result += '/'; break;
          case 'n': result += '\n'; break;
          case 't': result += '\t'; break;
          case 'r': result += '\r'; break;
          default: result += content[pos];
        }
      } else {
        result += content[pos];
      }
      pos++;
    }
    if (pos >= content.length) {
      throw new Error('Unterminated string');
    }
    pos++; // skip closing quote
    return result;
  }

  function parseVector(): string[] {
    skipWhitespace();
    if (content[pos] !== '[') {
      throw new Error(`Expected '[' at position ${pos}`);
    }
    pos++; // skip opening bracket
    const result: string[] = [];
    while (pos < content.length && content[pos] !== ']') {
      skipWhitespace();
      if (content[pos] === '"') {
        result.push(parseString());
      } else {
        throw new Error(`Unexpected character at position ${pos}`);
      }
    }
    if (pos >= content.length) {
      throw new Error('Unterminated vector');
    }
    pos++; // skip closing bracket
    return result;
  }

  function parseMap(): EdnValue {
    skipWhitespace();
    if (content[pos] !== '{') {
      throw new Error(`Expected '{' at position ${pos}`);
    }
    pos++; // skip opening brace
    const result: EdnValue = {};
    while (pos < content.length && content[pos] !== '}') {
      skipWhitespace();
      const key = parseString();
      skipWhitespace();
      if (content[pos] === '[') {
        result[key] = parseVector();
      } else if (content[pos] === '{') {
        result[key] = parseMap();
      } else {
        throw new Error(`Unexpected character at position ${pos}, expected '[' or '{'`);
      }
    }
    if (pos >= content.length) {
      throw new Error('Unterminated map');
    }
    pos++; // skip closing brace
    return result;
  }

  skipWhitespace();
  return parseMap();
}

/**
 * Load quote file from EDN format
 * Mirrors: load-quote-file
 */
function loadQuoteFile(filename: string): PlayerQuotes | null {
  try {
    // Try relative to process.cwd() first (for tests and server)
    let fullPath = path.resolve(filename);
    if (!fs.existsSync(fullPath)) {
      // Try relative to the source directory
      fullPath = path.resolve(__dirname, '../../', filename);
    }
    if (!fs.existsSync(fullPath)) {
      return null;
    }
    const content = fs.readFileSync(fullPath, 'utf-8');
    return parseEdnQuotes(content) as PlayerQuotes;
  } catch {
    return null;
  }
}

/**
 * Load all quotes from files
 * Mirrors: load-quotes!
 */
export function loadQuotes(): void {
  const corpQuotes = loadQuoteFile(quotesCorpFilename);
  const runnerQuotes = loadQuoteFile(quotesRunnerFilename);

  // Merge the two quote files
  identityQuotes = { ...corpQuotes, ...runnerQuotes };
}

/**
 * Choose a random quote from options, repeated qty times
 * Mirrors: choose-and-repeat
 */
function chooseAndRepeat(options: string[], qty: number): string[] {
  if (!options || options.length === 0) {
    return [];
  }
  const selected = options[Math.floor(Math.random() * options.length)];
  return Array(qty).fill(selected);
}

/**
 * Generate a random quote between two player identities
 * Mirrors: make-quote
 * @param playerIdent - Player's identity info { title, faction }
 * @param oppIdent - Opponent's identity info { title, faction }
 * @returns A random quote string
 */
export function makeQuote(
  playerIdent: { title?: string; faction?: string },
  oppIdent: { title?: string; faction?: string }
): string {
  const playerIdentTitle = playerIdent.title ?? "";
  const oppIdentTitle = oppIdent.title ?? "";
  const oppFaction = oppIdent.faction;

  const playerQuotes = identityQuotes[playerIdentTitle];
  if (!playerQuotes) {
    return 'NO QUOTE SRY';
  }

  const generic = playerQuotes[genericKey] ?? [];
  const oppFactionQuote = playerQuotes[oppFaction ?? ''] ?? [];
  const oppSpecificQuote = playerQuotes[oppIdentTitle] ?? [];

  // Build weighted list: generic x1, faction x3, specific x20
  const weighted = [
    ...chooseAndRepeat(generic, 1),
    ...chooseAndRepeat(oppFactionQuote, 3),
    ...chooseAndRepeat(oppSpecificQuote, 20),
  ];

  // Filter out blank/null values
  const nonBlank = weighted.filter((q): q is string => !!q);

  if (nonBlank.length > 0) {
    return nonBlank[Math.floor(Math.random() * nonBlank.length)];
  }

  return 'NO QUOTE SRY';
}
