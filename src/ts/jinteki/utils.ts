// Shared utility functions.
// Mirrors: src/cljc/jinteki/utils.cljc

export const INFINITY = 2147483647;

export function strToInt(s: string): number {
  return parseInt(s, 10);
}

export function sideFromStr(sideStr: string): string {
  return sideStr.toLowerCase();
}

/** Returns faction of a card as a lowercase hyphenated label. */
export function factionLabel(card: { faction?: string }): string {
  if (!card.faction) return "neutral";
  return card.faction.toLowerCase().replace(/ /g, "-");
}

export function otherSide(side: string): string {
  if (side === "corp" || side === ":corp") return "runner";
  if (side === "runner" || side === ":runner") return "corp";
  return "";
}

export function superuser(user: { isadmin?: boolean; ismoderator?: boolean }): boolean {
  return !!(user.isadmin || user.ismoderator);
}

export function tournamentOrganizer(user: { "tournament-organizer"?: boolean }): boolean {
  return !!user["tournament-organizer"];
}

/**
 * Slugify a string.
 * As defined here: https://you.tools/slugify/
 */
export function slugify(string: string, sep = "-"): string {
  if (typeof string !== "string") return "";
  return string
    .normalize("NFD")
    .replace(/[^\x00-\x7F]+/g, "")
    .toLowerCase()
    .trim()
    .split(/[ \t\n\x0B\f\r!"#$%&'()*+,\-./:;<=>?@\\[\]^_`{|}~]+/)
    .filter(Boolean)
    .join(sep);
}

export function capitalize(s: string): string {
  if (!s.length) return "";
  return s[0].toUpperCase() + s.slice(1);
}

export function decapitalize(s: string): string {
  if (!s.length) return "";
  return s[0].toLowerCase() + s.slice(1);
}

export interface Ability {
  label?: string;
  msg?: unknown;
  "cost-label"?: string;
  costLabel?: string;
}

export function makeLabel(ability: Ability): string {
  // Clojure: (or (:label ability) (and (string? (:msg ability)) (:msg ability)) "")
  // Empty string is falsy in Clojure, so fall through to msg
  if (ability.label) return capitalize(ability.label);
  if (typeof ability.msg === "string" && ability.msg) return capitalize(ability.msg);
  return capitalize("");
}

export function addCostToLabel(ability: Ability): string {
  const label = makeLabel(ability);
  const costLabel = ability["cost-label"] ?? ability.costLabel;
  // Clojure uses str/blank? which treats "" and whitespace-only as blank
  const costLabelBlank = !costLabel || costLabel.trim().length === 0;
  const labelBlank = !label || label.trim().length === 0;
  if (!costLabelBlank && !labelBlank) {
    return `${costLabel}: ${label}`;
  }
  return label;
}

/** Returns a new object containing only keys from keyseq whose value is non-null/undefined. */
export function selectNonNilKeys<T extends Record<string, unknown>>(
  m: T,
  keyseq: (keyof T)[],
): Partial<T> {
  const ret: Partial<T> = {};
  for (const k of keyseq) {
    if (k in m && m[k] !== null && m[k] !== undefined) {
      ret[k] = m[k];
    }
  }
  return ret;
}

/** Counts bad publicity corp has (base + additional). */
export function countBadPub(state: any): number {
  return (state?.corp?.badPublicity?.base ?? state?.corp?.["bad-publicity"]?.base ?? 0) +
         (state?.corp?.badPublicity?.additional ?? state?.corp?.["bad-publicity"]?.additional ?? 0);
}

export function hasBadPub(state: any): boolean {
  return countBadPub(state) > 0;
}

/** Counts total tags runner has. */
export function countTags(state: any): number {
  return state?.runner?.tag?.total ?? 0;
}

/** Counts non-additional (base) tags runner has. */
export function countRealTags(state: any): number {
  return state?.runner?.tag?.base ?? 0;
}

export function isTagged(state: any): boolean {
  return !!(state?.runner?.tag?.["is-tagged"] || countTags(state) > 0);
}

export interface CommandInfo {
  name: string;
  hasArgs?: "required" | "optional";
  usage: string;
  help: string;
}

export const commandInfo: CommandInfo[] = [
  { name: "/adv-counter", hasArgs: "required", usage: "/adv-counter n", help: "set advancement counters on a card to n (player's own cards only). Deprecated in favor of /counter ad n" },
  { name: "/bp", hasArgs: "required", usage: "/bp n", help: "Set your bad publicity to n" },
  { name: "/bug", usage: "/bug", help: "Report a bug on GitHub" },
  { name: "/card-info", usage: "/card-info", help: "display debug info about a card (player's own cards only)" },
  { name: "/charge", usage: "/charge", help: "Charge an installed card" },
  { name: "/choose-hq-access", usage: "/choose-hq-access", help: "allows the corp player to choose the cards accessed from HQ during this run. Use this for manual fixes that require a re-run" },
  { name: "/clear-win", usage: "/clear-win", help: "requests game to clear the current win state.  Requires both players to request it" },
  { name: "/click", hasArgs: "required", usage: "/click n", help: "Set your clicks to n" },
  { name: "/close-prompt", usage: "/close-prompt", help: "close an active prompt and show the next waiting prompt, or the core click actions" },
  { name: "/counter", hasArgs: "required", usage: "/counter n", help: "set counters on a card to n (player's own cards only). Attempts to infer the type of counter to place. If the inference fails, you must use the next command to specify the counter type." },
  { name: "/counter", hasArgs: "required", usage: "/counter type n", help: "set the specified counter type on a card to n (player's own cards only). Type must be agenda, advance, credit, power, or virus. Can be abbreviated as ag, ad, c, p, or v respectively." },
  { name: "/credit", hasArgs: "required", usage: "/credit n", help: "Set your credits to n" },
  { name: "/deck", hasArgs: "required", usage: "/deck #n", help: "Put card number n from your hand on top of your deck" },
  { name: "/derez", usage: "/derez", help: "derez a rezzed card (corp only)" },
  { name: "/disable-card", usage: "/disable-card", help: "Disable a card" },
  { name: "/discard", hasArgs: "required", usage: "/discard #n", help: "Discard card number n from your hand" },
  { name: "/discard-random", usage: "/discard-random", help: "Discard a random card from your hand" },
  { name: "/draw", hasArgs: "optional", usage: "/draw n", help: "Draw n cards" },
  { name: "/enable-api-access", usage: "/enable-api-access", help: "Enables API access for the current game" },
  { name: "/enable-card", usage: "/enable-card", help: "Enable a card" },
  { name: "/end-run", usage: "/end-run", help: "End the run (Corp only)" },
  { name: "/error", usage: "/error", help: "Displays an error toast" },
  { name: "/facedown", usage: "/facedown", help: "Install a card facedown (Runner only)" },
  { name: "/handsize", hasArgs: "required", usage: "/handsize n", help: "Set your handsize to n" },
  { name: "/host", usage: "/host", help: "Manually host a card on another card" },
  { name: "/install", usage: "/install", help: "Install an arbitrary card from hand or your discard pile" },
  { name: "/install-ice", usage: "/install-ice", help: "Install a piece of ice at any position in a server (Corp only)" },
  { name: "/install-free", usage: "/install-free", help: "Install an arbitrary card from hand or your discard pile, ignoring all costs" },
  { name: "/jack-out", usage: "/jack-out", help: "Jack out (Runner only)" },
  { name: "/link", hasArgs: "required", usage: "/link n", help: "Set your link to n" },
  { name: "/mark", usage: "/mark", help: "Identify your mark" },
  { name: "/memory", hasArgs: "required", usage: "/memory n", help: "Set your memory to n" },
  { name: "/move-bottom", usage: "/move-bottom", help: "Pick a card in your hand to put on the bottom of your deck" },
  { name: "/move-deck", usage: "/move-deck", help: "Pick a card from your play-area to put on top of your deck" },
  { name: "/move-hand", usage: "/move-hand", help: "Pick a card from your play-area to put into your hand" },
  { name: "/peek", hasArgs: "optional", usage: "/peek n", help: "See n top cards of your deck" },
  { name: "/psi", usage: "/psi", help: "Start a Psi game (Corp only)" },
  { name: "/reload-id", usage: "/reload-id", help: "Reloads your ID (this can sometimes fix gamestates)" },
  { name: "/replace-id", hasArgs: "required", usage: "/replace-id n", help: "Replace your ID with the card \"n\"" },
  { name: "/rez", usage: "/rez", help: "Choose a card to rez, ignoring all costs (Corp only)" },
  { name: "/rez-all", usage: "/rez-all", help: "Rez all cards, ignoring all costs and flip cards in archives faceup (Corp only). For revealing your servers at the end of a game." },
  { name: "/rez-free", usage: "/rez-free", help: "Choose a card to rez, ignoring all costs and on-rez abilities (Corp only)" },
  { name: "/rfg", usage: "/rfg", help: "Choose a card to remove from the game" },
  { name: "/roll", hasArgs: "required", usage: "/roll n", help: "Roll an n-sided die" },
  { name: "/sabotage", hasArgs: "required", usage: "/sabotage n", help: "Sabotage n cards" },
  { name: "/save-replay", usage: "/save-replay", help: "Save a replay of the game" },
  { name: "/score", usage: "/score", help: "Score an agenda from hand or from the board, ignoring all restrictions (corp only)" },
  { name: "/set-mark", hasArgs: "required", usage: "/set-mark n", help: "Set the central server n as your mark (Runner only)" },
  { name: "/show-hand", usage: "/show-hand", help: "Shows your hand in the chat log (does not proc reveal triggers)" },
  { name: "/summon", hasArgs: "required", usage: "/summon n", help: "Add card \"n\" to your hand (from outside the game)" },
  { name: "/swap-ice", usage: "/swap-ice", help: "Swap the position of 2 installed pieces of ice (Corp only)" },
  { name: "/swap-installed", usage: "/swap-installed", help: "Swap the position of two installed non-ice (Corp only)" },
  { name: "/swap-sides", usage: "/swap-sides", help: "Request to swap sides with your opponent" },
  { name: "/tag", hasArgs: "required", usage: "/tag n", help: "Set your tags to n" },
  { name: "/take-core", hasArgs: "required", usage: "/take-core n", help: "Take n core damage (Runner only)" },
  { name: "/take-meat", hasArgs: "required", usage: "/take-meat n", help: "Take n meat damage (Runner only)" },
  { name: "/take-net", hasArgs: "required", usage: "/take-net n", help: "Take n net damage (Runner only)" },
  { name: "/trace", hasArgs: "required", usage: "/trace n", help: "Start a trace with base strength n (Corp only)" },
  { name: "/trash", usage: "/trash", help: "Trash an installed card" },
  { name: "/undo-paid-ability", usage: "/undo-paid-ability", help: "Resets the game back to start of the last paid ability.  One paid ability only retained." },
  { name: "/undo-click", usage: "/undo-click", help: "Resets the game back to start of the click.  One click only retained. Only allowed for active player" },
  { name: "/undo-turn", usage: "/undo-turn", help: "Resets the game back to end of the last turn. Requires both players to request it" },
  { name: "/unique", usage: "/unique", help: "Toggles uniqueness of selected card (can be used to e.g. play with non-errata version of Wireless Net Pavillion)" },
];
