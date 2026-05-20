// Game log / chat message functions.
// Mirrors: src/clj/game/core/say.clj + src/go/game/core/say.go

import type { GameState, LogEntry } from "./state";
import type { Card } from "./card";
import { getTitle } from "./card";
import { CORP_SIDE, RUNNER_SIDE } from "./state";
import { toast } from "./toasts";

export interface SystemMsgOptions {
  hr?: boolean;
  logSide?: string | string[];
}

export interface Message {
  user: string | Record<string, unknown>;
  text: string;
  timestamp: string;
}

/**
 * Create a message map, along with timestamp if none is provided.
 * Mirrors: make-message in say.clj
 */
export function makeMessage(opts: {
  user?: string | Record<string, unknown> | null;
  text?: string | string[];
  timestamp?: string;
}): Message {
  const user = opts.user ?? null;
  const processedUser =
    user === "__system__"
      ? user
      : user
        ? {
            username: (user as Record<string, unknown>).username,
            emailhash: (user as Record<string, unknown>).emailhash,
          }
        : user;
  const text =
    typeof opts.text === "string"
      ? opts.text.trim()
      : Array.isArray(opts.text)
        ? opts.text
            .map((t: any) => (typeof t === "string" ? t.trim() : String(t)))
            .join(" ")
        : "";
  return {
    user: processedUser ?? "",
    text,
    timestamp: opts.timestamp ?? new Date().toISOString(),
  };
}

/**
 * Creates a message map from the __system__ user, which won't display a username.
 * Mirrors: make-system-message in say.clj
 */
export function makeSystemMessage(text: string): Message {
  return makeMessage({ user: "__system__", text });
}

/**
 * Selects an appropriate plural pronoun.
 * 'their' is neuter, so it's appropriate to everyone as a fallback.
 * Mirrors: select-pronoun in say.clj
 */
function selectPronoun(user: Record<string, unknown> | undefined): string {
  if (!user) return "their";
  const options = user.options as Record<string, unknown> | undefined;
  const key = options?.pronouns as string | undefined;
  switch (key) {
    case "they":
      return "their";
    case "she":
      return "her";
    case "sheit":
      return "its";
    case "shethey":
      return "their";
    case "he":
      return "his";
    case "heit":
      return "its";
    case "hethey":
      return "their";
    case "heshe":
      return "their";
    case "heshe2":
      return "her";
    case "it":
      return "its";
    case "faefaer":
      return "faer";
    case "ne":
      return "nir";
    case "ve":
      return "vis";
    case "ey":
      return "eir";
    case "zehir":
      return "hir";
    case "zezir":
      return "zir";
    case "xe":
      return "xyr";
    case "xi":
      return "xir";
    default:
      return "their";
  }
}

/**
 * Inserts pronouns into text based on the side speaking.
 * Mirrors: insert-pronouns in say.clj
 */
function insertPronouns(state: GameState, side: string, text: string): string {
  const corpPronoun = selectPronoun(state.corp.user);
  const runnerPronoun = selectPronoun(state.runner.user);
  const userPronoun =
    side === CORP_SIDE
      ? corpPronoun
      : side === RUNNER_SIDE
        ? runnerPronoun
        : "their";

  return text
    .replace(/(\[pronoun\])|(\[their\])/g, userPronoun)
    .replace(/\[corp-pronoun\]/g, corpPronoun)
    .replace(/\[runner-pronoun\]/g, runnerPronoun);
}

/**
 * Log a message to the state's log.
 * Mirrors: log in say.clj
 */
function log(state: GameState, message: Record<string, unknown>): void {
  const logSides = Object.keys(message);
  for (const side of logSides) {
    const msg = message[side] as Message;
    const entry: LogEntry = {
      user: msg.user === "__system__" ? "__system__" : undefined,
      text: msg.text,
    };
    if (side === "public") {
      state.log.public.push(entry);
    } else if (side === "corp") {
      state.log.corp.push(entry);
    } else if (side === "runner") {
      state.log.runner.push(entry);
    }
  }
}

/**
 * Prints a message to the log as coming from the given user.
 * Mirrors: say in say.clj
 */
export function say(
  state: GameState,
  side: string,
  opts: { user?: Record<string, unknown> | null; text: string },
  logSide?: string | string[],
): void {
  const author =
    opts.user ?? (side === CORP_SIDE ? state.corp.user : state.runner.user);
  const message = makeMessage({
    user: author,
    text: insertPronouns(state, side, opts.text),
  });

  const logSides: string[] = Array.isArray(logSide)
    ? logSide
    : logSide
      ? [logSide]
      : ["public"];

  const logMap: Record<string, Message> = {};
  for (const ls of logSides) {
    logMap[ls] = message;
  }
  log(state, logMap);
}

/**
 * Prints multiple messages to different log sides.
 * Mirrors: multi-say in say.clj
 */
function multiSay(
  state: GameState,
  side: string,
  messageMap: Record<string, string>,
): void {
  const logMap: Record<string, Message> = {};
  for (const [k, v] of Object.entries(messageMap)) {
    logMap[k] = makeSystemMessage(insertPronouns(state, side, v));
  }
  log(state, logMap);
}

/**
 * Prints a system message to log (say from user __system__).
 * Mirrors: system-say in say.clj
 */
export function systemSay(
  state: GameState,
  side: string,
  textOrMsg: string | Message,
  opts: SystemMsgOptions | null = null,
): void {
  const text = typeof textOrMsg === "string" ? textOrMsg : textOrMsg.text;
  const finalText = opts?.hr ? `${text} [hr]` : text;
  const message = makeSystemMessage(finalText);
  const logSide = opts?.logSide ?? "public";
  // Delegate to say() so that pronoun substitution is handled correctly,
  // mirroring the Clojure system-say which calls say internally.
  say(state, side, message as { text: string; user?: Record<string, unknown> | null }, logSide);
}

/**
 * Prints a reagent hiccup directly to the log. Do not use for any user-generated content!
 * Mirrors: unsafe-say in say.clj
 */
export function unsafeSay(state: GameState, text: string): void {
  const message = makeSystemMessage(text);
  log(state, { public: message });
}

/**
 * Prints a message to the log without a username.
 * Mirrors: system-msg in say.clj
 */
export function systemMsg(state: GameState, side: string, text: string, opts?: SystemMsgOptions | null): void;
export function systemMsg(text: string): void;
export function systemMsg(...args: any[]): void {
  let state: GameState | undefined, side: string, text: string;
  let opts: SystemMsgOptions | null = null;
  if (args.length === 1) {
    text = args[0];
    return; // No state available — best-effort no-op
  } else {
    state = args[0]; side = args[1]; text = args[2]; opts = args[3] ?? null;
  }
  if (!state) return;
  const user = side === CORP_SIDE ? state.corp.user : state.runner.user;
  const username = (user as Record<string, unknown>)?.username as string;
  systemSay(state, side, `${username} ${text}.`, opts);
}

/**
 * Prints multiple side-specific messages to the log.
 * Mirrors: multi-msg in say.clj
 */
export function multiMsg(
  state: GameState,
  side: string,
  msgs: { public?: string; corp?: string; runner?: string },
): void {
  const user = side === CORP_SIDE ? state.corp.user : state.runner.user;
  const username = (user as Record<string, unknown>)?.username as string;

  const messageMap: Record<string, string> = {};
  if (msgs.public) messageMap.public = `${username} ${msgs.public}.`;
  if (msgs.corp) messageMap.corp = `${username} ${msgs.corp}.`;
  if (msgs.runner) messageMap.runner = `${username} ${msgs.runner}.`;

  multiSay(state, side, messageMap);
}

/**
 * Prints a message related to a rules enforcement on a given card.
 * Example: 'Architect cannot be trashed while installed.'
 * Mirrors: enforce-msg in say.clj
 */
export function enforceMsg(state: GameState, card: Card, text: string): void {
  systemSay(state, "", `${getTitle(card)} ${text}.`);
}

/**
 * Logs a note about a card's implementation status.
 * Mirrors: implementation-msg in say.clj
 */
export function implementationMsg(state: GameState, card: Card | null): void {
  if (!card) return;
  const impl = card.implementation as string | undefined;
  if (!impl || impl === ":full" || impl === "full") return;
  const msg = `[!] ${getTitle(card)} - ${impl}`;
  systemSay(state, "", msg);
}

/**
 * Indicates that a player is taking an action and notifies both players.
 * Mirrors: indicate-action in say.clj
 */
export function indicateAction(
  state: GameState,
  side: string,
  _card: Card,
): void {
  const sideName = side === CORP_SIDE ? "Corp" : "Runner";
  systemSay(state, side, `[!] Please pause, ${sideName} is acting.`);
  toast(state, side, "You have indicated action to your opponent", "info", {
    "time-out": 2000,
    "close-button": false,
  });
  const otherSide = side === CORP_SIDE ? RUNNER_SIDE : CORP_SIDE;
  toast(state, otherSide, "Pause please, opponent is acting", "info", {
    "time-out": 5000,
    "close-button": true,
  });
}

/**
 * Adds a sound effect to play to the sfx queue.
 * Each SFX comes with a unique ID, so each client can track for themselves which sounds have already been played.
 * The sfx queue has size limited to 3 to limit the sound torrent tabbed out or lagged players will experience.
 * Mirrors: play-sfx in say.clj
 */
export function playSfx(sfx: string): void;
export function playSfx(state: GameState, side: string, sfx: string): void;
export function playSfx(...args: any[]): void;
export function playSfx(...args: any[]): void {
  if (args.length === 1) {
    // single-arg shorthand: ignore state/side
    return;
  }
  const state = args[0] as GameState;
  const _side = args[1] as string;
  const sfx = args[2] as string;
  const currentId = state.sfxCurrentId;
  if (!currentId && currentId !== 0) return;
  (state.sfx as any[]).push({ id: currentId + 1, name: sfx });
  // Keep only the last 3 entries
  while ((state.sfx as any[]).length > 3) {
    (state.sfx as any[]).shift();
  }
  state.sfxCurrentId = currentId + 1;
}

/**
 * Returns the last n log messages not sent by a user (i.e. game logs only).
 * Mirrors: n-last-logs in say.clj
 */
export function nLastLogs(
  state: GameState,
  n: number,
  side: string = "public",
): string {
  if (!state) return "unable to fetch log from state";
  const logArr =
    side === "public"
      ? state.log.public
      : side === "corp"
        ? state.log.corp
        : state.log.runner;

  return logArr
    .filter((entry: any) => entry.user === "__system__")
    .map((entry: any) => entry.text ?? "")
    .slice(-n)
    .join("\n\t");
}

/**
 * Appends a horizontal-rule log entry.
 * Mirrors: hr-ref in say.clj
 */
export function hRef(state: GameState): void {
  state.log.public.push({ text: "[hr]" });
}

/** Alias for systemSay. */
export function systemMsgHR(state: GameState, side: string, msg: string): void {
  systemSay(state, side, `${msg} [hr]`);
}
