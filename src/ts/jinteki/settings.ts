// Centralized settings definitions for the application.
// Mirrors: src/cljc/jinteki/settings.cljc
//
// Settings are loaded with precedence: defaults < localStorage < user profile (database).
// Device-specific settings (sync: false) are never saved to the database.

// ──────────────────────────────────────────────────────────────────
// Validation sets
// ──────────────────────────────────────────────────────────────────

export const VALID_BACKGROUND_SLUGS = new Set([
  "apex-bg", "custom-bg", "find-the-truth-bg", "freelancer-bg",
  "monochrome-bg", "mushin-no-shin-bg", "push-your-luck-bg", "rumor-mill-bg",
  "the-root-bg", "traffic-jam-bg", "worlds2020",
]);

export const VALID_LANGUAGES = new Set([
  "en", "es", "de", "ca", "it", "fr", "ja", "ko", "pl", "pt", "ru", "zh-simp", "zh-trad",
]);

export const VALID_PRONOUNS = new Set([
  "none", "any", "myodb", "blank", "they", "she", "sheit", "shethey",
  "he", "heit", "hethey", "heshe", "heshe2", "it", "faefaer", "ne", "ve", "ey",
  "zehir", "zezir", "xe", "xi",
]);

export const VALID_STATS_OPTIONS = new Set(["always", "competitive", "none"]);
export const VALID_CARD_ZOOM_OPTIONS = new Set(["image", "text"]);
export const VALID_CARD_RESOLUTION_OPTIONS = new Set(["default", "high"]);
export const VALID_RUNNER_BOARD_ORDER = new Set(["jnet", "irl"]);
export const VALID_LOG_PLAYER_HIGHLIGHT = new Set(["blue-red", "none"]);
export const VALID_CARD_BACK_DISPLAY = new Set(["them", "me", "ffg", "nsg"]);
export const VALID_CARD_SLEEVES = new Set(["ffg-card-back", "nsg-card-back", "ffg", "nsg"]);
export const VALID_FORMATS = new Set([
  "standard", "throwback", "startup", "system-gateway",
  "core", "preconstructed", "eternal", "casual",
]);

// ──────────────────────────────────────────────────────────────────
// Validators
// ──────────────────────────────────────────────────────────────────

type ValidateFn = (v: unknown) => boolean;

function isBoolean(v: unknown): v is boolean { return typeof v === "boolean"; }
function isNumber(v: unknown): v is number { return typeof v === "number"; }
function isString(v: unknown): v is string { return typeof v === "string"; }

function validateCollOf(itemPred: (v: unknown) => boolean, collPred: (v: unknown) => boolean): ValidateFn {
  return (v) => collPred(v) && Array.isArray(v) && (v as unknown[]).every(itemPred);
}

function validateMapOf(keyPred: (k: string) => boolean, valPred: (v: unknown) => boolean): ValidateFn {
  return (v) => {
    if (!v || typeof v !== "object" || Array.isArray(v)) return false;
    return Object.entries(v as Record<string, unknown>).every(([k, val]) => keyPred(k) && valPred(val));
  };
}

export const validateBlockedUsers = validateCollOf(isString, Array.isArray);
export const validateAltArts = validateMapOf(() => true, () => true);
export const validateBespokeSounds = validateMapOf(() => true, isBoolean);

export function validateCardSleeve(v: unknown): boolean {
  return isString(v) && (VALID_CARD_SLEEVES.has(v) || v.length > 0);
}

export function validatePrizes(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v !== "object" || Array.isArray(v)) return false;
  const obj = v as Record<string, unknown>;
  if (obj["card-backs"] !== null && obj["card-backs"] !== undefined) {
    return validateMapOf(() => true, isBoolean)(obj["card-backs"]);
  }
  return true;
}

export const validateVisibleFormats: ValidateFn = (v) => {
  if (!v || typeof v !== "object") return false;
  const items = v instanceof Set ? Array.from(v) : Object.keys(v as object);
  return items.every(item => VALID_FORMATS.has(item as string));
};

// ──────────────────────────────────────────────────────────────────
// Setting definition
// ──────────────────────────────────────────────────────────────────

export interface SettingDef {
  key: string;
  default: unknown;
  sync: boolean;
  validateFn?: ValidateFn;
  doc?: string;
}

export const ALL_SETTINGS: SettingDef[] = [
  { key: "alt-arts", default: {}, sync: true, validateFn: validateAltArts, doc: "User's selected alternate art set when show-alt-art is true" },
  { key: "archives-sorted", default: false, sync: true, validateFn: isBoolean, doc: "Whether to sort cards in Archives by name" },
  { key: "background", default: "worlds2020", sync: true, validateFn: (v) => isString(v) && VALID_BACKGROUND_SLUGS.has(v), doc: "Selected game board background" },
  { key: "bespoke-sounds", default: {}, sync: true, validateFn: validateBespokeSounds, doc: "Card-specific sound effect preferences" },
  { key: "blocked-users", default: [], sync: true, validateFn: validateBlockedUsers, doc: "List of usernames to block in chat and lobbies" },
  { key: "card-back-display", default: "them", sync: true, validateFn: (v) => isString(v) && VALID_CARD_BACK_DISPLAY.has(v), doc: "Which card backs to display (them/me/ffg/nsg)" },
  { key: "card-language", default: "en", sync: true, validateFn: (v) => isString(v) && VALID_LANGUAGES.has(v), doc: "Card language preference" },
  { key: "card-resolution", default: "default", sync: false, validateFn: (v) => isString(v) && VALID_CARD_RESOLUTION_OPTIONS.has(v), doc: "Card image quality preference for this device" },
  { key: "card-zoom", default: "image", sync: true, validateFn: (v) => isString(v) && VALID_CARD_ZOOM_OPTIONS.has(v), doc: "How to display zoomed cards (image/text)" },
  { key: "corp-card-sleeve", default: "nsg-card-back", sync: true, validateFn: validateCardSleeve, doc: "Selected card back design for Corp deck" },
  { key: "custom-bg-url", default: "https://nullsignal.games/wp-content/uploads/2022/07/Mechanics-of-Midnight-Sun-Header.png", sync: true, validateFn: isString, doc: "URL for custom game board background image" },
  { key: "deckstats", default: "always", sync: true, validateFn: (v) => isString(v) && VALID_STATS_OPTIONS.has(v), doc: "When to show deck statistics (always/competitive/none)" },
  { key: "default-format", default: "standard", sync: true, validateFn: (v) => isString(v) && VALID_FORMATS.has(v), doc: "Default game format when creating new games" },
  { key: "disable-websockets", default: false, sync: false, validateFn: isBoolean, doc: "Disable WebSocket connections on this device" },
  { key: "display-encounter-info", default: false, sync: true, validateFn: isBoolean, doc: "Show detailed encounter information during runs" },
  { key: "gamestats", default: "always", sync: true, validateFn: (v) => isString(v) && VALID_STATS_OPTIONS.has(v), doc: "When to record game statistics (always/competitive/none)" },
  { key: "ghost-trojans", default: true, sync: true, validateFn: isBoolean, doc: "Show ghost images for Trojan programs" },
  { key: "heap-sorted", default: false, sync: true, validateFn: isBoolean, doc: "Whether to sort cards in Heap by name" },
  { key: "labeled-cards", default: false, sync: false, validateFn: isBoolean, doc: "Show card name labels on game board (device-specific)" },
  { key: "labeled-unrezzed-cards", default: false, sync: false, validateFn: isBoolean, doc: "Show labels on unrezzed cards (device-specific)" },
  { key: "language", default: "en", sync: true, validateFn: (v) => isString(v) && VALID_LANGUAGES.has(v), doc: "User interface language preference" },
  { key: "lobby-sounds", default: true, sync: false, validateFn: isBoolean, doc: "Play sounds in lobby on this device" },
  { key: "log-player-highlight", default: "blue-red", sync: true, validateFn: (v) => isString(v) && VALID_LOG_PLAYER_HIGHLIGHT.has(v), doc: "Color scheme for highlighting players in game log" },
  { key: "log-timestamps", default: true, sync: true, validateFn: isBoolean, doc: "Show timestamps in game log" },
  { key: "log-top", default: 419, sync: false, validateFn: isNumber, doc: "Vertical position of game log panel (device-specific)" },
  { key: "log-width", default: 300, sync: false, validateFn: isNumber, doc: "Width of game log panel in pixels (device-specific)" },
  { key: "pass-on-rez", default: false, sync: true, validateFn: isBoolean, doc: "Automatically pass priority after rezzing cards" },
  { key: "pin-zoom", default: false, sync: true, validateFn: isBoolean, doc: "Keep card zoom window pinned open" },
  { key: "pin-base-art", default: false, sync: true, validateFn: isBoolean, doc: "Zoom window will always use base art if possible" },
  { key: "player-stats-icons", default: true, sync: false, validateFn: isBoolean, doc: "Show icons in player stats area (device-specific)" },
  { key: "prizes", default: null, sync: true, validateFn: validatePrizes, doc: "Unlocked prize content (card backs, etc.); set by admins not user" },
  { key: "pronouns", default: "none", sync: true, validateFn: (v) => isString(v) && VALID_PRONOUNS.has(v), doc: "User's preferred pronouns for display" },
  { key: "runner-board-order", default: "irl", sync: true, validateFn: (v) => isString(v) && VALID_RUNNER_BOARD_ORDER.has(v), doc: "Layout order for Runner board areas (irl/jnet)" },
  { key: "runner-card-sleeve", default: "nsg-card-back", sync: true, validateFn: validateCardSleeve, doc: "Selected card back design for Runner deck" },
  { key: "show-alt-art", default: true, sync: true, validateFn: isBoolean, doc: "Display alternate card art when available" },
  { key: "sides-overlap", default: true, sync: false, validateFn: isBoolean, doc: "Allow Corp/Runner areas to overlap on small screens (device-specific)" },
  { key: "sounds", default: true, sync: false, validateFn: isBoolean, doc: "Enable in-game sound effects on this device" },
  { key: "sounds-volume", default: 100, sync: false, validateFn: isNumber, doc: "Sound effects volume level (0-100) on this device" },
  { key: "stacked-cards", default: true, sync: true, validateFn: isBoolean, doc: "Stack un-iced servers of the same card" },
  { key: "visible-formats", default: null, sync: false, validateFn: validateVisibleFormats, doc: "Set of game formats to show in lobby (device-specific)" },
];

// ──────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────

export type UserSettings = Record<string, unknown>;

/** Get browser language mapped to a supported language or 'en'. */
export function browserLanguage(): string {
  const lang = navigator.language?.split("-")[0];
  if (lang === "zh") return "zh-simp";
  if (lang && VALID_LANGUAGES.has(lang)) return lang;
  return "en";
}

/** Returns map of setting keys to their default values. Language is browser-detected. */
export function defaultSettings(): UserSettings {
  const out: UserSettings = {};
  for (const s of ALL_SETTINGS) {
    out[s.key] = s.key === "language" ? browserLanguage() : s.default;
  }
  return out;
}

/** Keys of all settings. */
export function settingKeys(): string[] {
  return ALL_SETTINGS.map(s => s.key);
}

/** Keys of settings that sync to the database. */
export function syncKeys(): string[] {
  return ALL_SETTINGS.filter(s => s.sync).map(s => s.key);
}

/** Keys of settings that are local-only (device-specific). */
export function localOnlyKeys(): string[] {
  return ALL_SETTINGS.filter(s => !s.sync).map(s => s.key);
}

/** Get a setting definition by key. */
export function getSetting(key: string): SettingDef | undefined {
  return ALL_SETTINGS.find(s => s.key === key);
}

/** Filter a settings map to only include valid values, removing invalid ones. */
export function filterValidSettings(settingsMap: Record<string, unknown>): UserSettings {
  const out: UserSettings = {};
  for (const s of ALL_SETTINGS) {
    const value = settingsMap[s.key];
    if (value !== undefined && value !== null && s.validateFn && s.validateFn(value)) {
      out[s.key] = value;
    }
  }
  return out;
}

/** Load settings from localStorage, returning only values that differ from defaults. */
export function loadFromStorage(
  storageLoadFn: (key: string, defaultVal: unknown) => unknown,
): UserSettings {
  const defaults = defaultSettings();
  const out: UserSettings = {};
  for (const s of ALL_SETTINGS) {
    const defaultVal = defaults[s.key];
    const loaded = storageLoadFn(s.key, defaultVal);
    if (loaded !== defaultVal) {
      out[s.key] = loaded;
    }
  }
  return out;
}
