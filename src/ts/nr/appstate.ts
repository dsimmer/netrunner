// Global application state using Zustand.
// Mirrors: src/cljs/nr/appstate.cljs
//
// Zustand's create() is the closest analog to Clojure's (r/atom {...}):
// one central store, components subscribe to slices, mutations go through
// store actions.
import { create } from "zustand";
import { GET } from "./ajax";
import { insertLang } from "../jinteki/i18n";
import { load, save, migrateKeys } from "./local_storage";
import { defaultSettings, filterValidSettings, type UserSettings } from "../jinteki/settings";

// Mirrors: migrate-legacy-localStorage-keys! in appstate.cljs
function migrateLegacyLocalStorageKeys(): void {
  migrateKeys([
    ["custom_bg_url", "custom-bg-url"],
    ["sounds_volume", "sounds-volume"],
    ["lobby_sounds", "lobby-sounds"],
    ["volume", "sounds-volume"],
  ]);
}

// Run migration before creating the store (mirrors top-level call in appstate.cljs)
migrateLegacyLocalStorageKeys();

// Mirrors: new-formats in appstate.cljs
const NEW_FORMATS = new Set(["quick-draft", "chimera"]);

function getNewFormats(): Set<string> {
  const seen: Set<string> = load("seen-formats", new Set());
  const fresh = new Set([...NEW_FORMATS].filter((f) => !seen.has(f)));
  const newSeen = new Set([...seen, ...fresh]);
  save("seen-formats", newSeen);
  return fresh;
}

function loadVisibleFormats(): Set<string> {
  const defaults = new Set([
    "standard", "system-gateway", "quick-draft", "core",
    "throwback", "startup", "eternal", "preconstructed",
    "chimera", "casual",
  ]);
  const visible: Set<string> = load("visible-formats", defaults);
  const unseen = getNewFormats();
  if (unseen.size > 0) {
    const updated = new Set([...visible, ...unseen]);
    save("visible-formats", updated);
    return updated;
  }
  return visible;
}

// Channel names for chat. Mirrors :channels key in appstate.cljs.
export type ChatChannel =
  | "general" | "america" | "europe" | "asia-pacific" | "united-kingdom"
  | "français" | "español" | "italia" | "polska" | "português"
  | "sverige" | "stimhack-league" | "русский";

export interface ChatMessage {
  username: string;
  // Mirrors :msg in cljs chat messages (server payload field). Older code may
  // also set `text`; keep both for compatibility.
  msg?: string;
  text?: string;
  date: string;
  emailhash?: string;
  pronouns?: string;
  _id?: string;
  channel?: string;
}

export interface GameState {
  gameid: string;
  started: boolean;
  [key: string]: unknown;
}

export interface AppStateShape {
  activePage: string;
  user: Record<string, unknown> | null;
  options: UserSettings;
  cardsLoaded: boolean;
  connected: boolean;
  previousCards: Record<string, unknown>;
  sets: unknown[];
  mwl: unknown[];
  cycles: unknown[];
  decks: unknown[];
  decksLoaded: boolean;
  stats: unknown;
  visibleFormats: Set<string>;
  channels: Record<ChatChannel, ChatMessage[]>;
  games: unknown[];
  currentGame: GameState | null;
  blockGameCreation: boolean;
  // Mirrors arbitrary fields from the original Clojure app-state atom
  // (e.g. :alt-info, :display-decklists, :all-cards-and-flips, etc).
  [key: string]: unknown;
}

// Mirrors: app-state atom in appstate.cljs
export const useAppState = create<AppStateShape & {
  setConnected: (v: boolean) => void;
  setCurrentGame: (g: GameState | null) => void;
  setGames: (games: unknown[]) => void;
  setDecks: (decks: unknown[]) => void;
  setCardsLoaded: (v: boolean) => void;
  setOptions: (opts: Partial<UserSettings>) => void;
  setUser: (user: Record<string, unknown>) => void;
  appendChannel: (channel: ChatChannel, msg: ChatMessage) => void;
  setBlockGameCreation: (v: boolean) => void;
}>((set) => {
  // Read user from page-embedded JSON (mirrors js/user in ClojureScript)
  const jsUser = (window as unknown as { user?: Record<string, unknown> }).user ?? null;
  const localSettings = filterValidSettings(load("options", {}));
  const userProfileSettings = filterValidSettings((jsUser?.options as Record<string, unknown>) ?? {});
  const options: UserSettings = { ...defaultSettings(), ...localSettings, ...userProfileSettings };

  const emptyChannels: Record<ChatChannel, ChatMessage[]> = {
    general: [], america: [], europe: [], "asia-pacific": [],
    "united-kingdom": [], français: [], español: [], italia: [],
    polska: [], português: [], sverige: [], "stimhack-league": [], русский: [],
  };

  return {
    activePage: "/",
    user: jsUser,
    options,
    cardsLoaded: false,
    connected: false,
    previousCards: {},
    sets: [],
    mwl: [],
    cycles: [],
    decks: [],
    decksLoaded: false,
    stats: jsUser?.stats ?? null,
    visibleFormats: loadVisibleFormats(),
    channels: emptyChannels,
    games: [],
    currentGame: null,
    blockGameCreation: false,

    setConnected: (v) => set({ connected: v }),
    setCurrentGame: (g) => set({ currentGame: g }),
    setGames: (games) => set({ games }),
    setDecks: (decks) => set({ decks, decksLoaded: true }),
    setCardsLoaded: (v) => set({ cardsLoaded: v }),
    setOptions: (opts) =>
      set((s) => ({ options: { ...s.options, ...opts } })),
    setUser: (user) => set({ user }),
    appendChannel: (channel, msg) =>
      set((s) => ({
        channels: {
          ...s.channels,
          [channel]: [...s.channels[channel], msg],
        },
      })),
    setBlockGameCreation: (v) => set({ blockGameCreation: v }),
  };
});

// Mirrors: current-gameid in appstate.cljs
export function currentGameID(): string | null {
  return useAppState.getState().currentGame?.gameid ?? null;
}

// Load the i18n language bundle on startup.
// Mirrors: go block at the bottom of appstate.cljs
export async function loadInitialData(): Promise<void> {
  const lang = (useAppState.getState().options.language as string | undefined) ?? "en";
  const response = await GET(`/data/language/${lang}`);
  if (response.status === 200 && response.json) {
    insertLang(lang, response.json as unknown as string);
  }
}
