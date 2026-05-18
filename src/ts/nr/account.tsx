// Account / settings page.
// Mirrors: src/cljs/nr/account.cljs
import React, { useState, useEffect, useRef, useCallback } from "react";
import { useAppState } from "./appstate";
import { GET, PUT, POST, DELETE } from "./ajax";
import { tr, trElement, trSpan, trFormat } from "./translations";
import {
  formatDateTime,
  iSOIshFormatter,
  slugToFormat,
  nonGameToast,
  trNonGameToast,
  setScrollTop,
  storeScrollTop,
} from "./utils";
import { insertLang, getBundle } from "../jinteki/i18n";
import { AllCards } from "../jinteki/cards";
import { cardBacksForSide } from "../jinteki/card_backs";
import { ALL_SETTINGS } from "../jinteki/settings";
import { updateLocalStorageSettings } from "./local_storage";
import {
  bespokeSounds,
  playSfx,
  randomSound,
  selectRandomFromGrouping,
} from "./sounds";
import Avatar from "./avatar";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PRONOUN_LIST: [string, string][] = [
  ["Unspecified", "none"],
  ["Any", "any"],
  ["Prefer not to say", "myodb"],
  ["[blank]", "blank"],
  ["They/them", "they"],
  ["She/her", "she"],
  ["She/it", "sheit"],
  ["She/they", "shethey"],
  ["He/him", "he"],
  ["He/it", "heit"],
  ["He/they", "hethey"],
  ["He/She/they", "heshe"],
  ["He/She", "heshe2"],
  ["It", "it"],
  ["Fae/faer", "faefaer"],
  ["Ne/nem", "ne"],
  ["Ve/ver", "ve"],
  ["Ey/em", "ey"],
  ["Ze/hir", "zehir"],
  ["Ze/zir", "zezir"],
  ["Xe/xem", "xe"],
  ["Xi/xir", "xi"],
];

const BACKGROUND_LIST: [string, string][] = [
  ["Apex", "apex-bg"],
  ["Find The Truth", "find-the-truth-bg"],
  ["Freelancer", "freelancer-bg"],
  ["Monochrome", "monochrome-bg"],
  ["Mushin No Shin", "mushin-no-shin-bg"],
  ["Push Your Luck", "push-your-luck-bg"],
  ["Rumor Mill", "rumor-mill-bg"],
  ["The Root", "the-root-bg"],
  ["Traffic Jam", "traffic-jam-bg"],
  ["Worlds 2020", "worlds2020"],
  ["Custom BG (input URL below)", "custom-bg"],
];

const LANGUAGE_LIST: [string, string][] = [
  ["English", "en"],
  ["Spanish", "es"],
  ["中文 (Simplified)", "zh-simp"],
  ["中文 (Traditional)", "zh-trad"],
  ["Français", "fr"],
  ["Deutsch", "de"],
  ["Italiano", "it"],
  ["日本語", "ja"],
  ["한국어", "ko"],
  ["Polski", "pl"],
  ["Português", "pt"],
  ["Русский", "ru"],
  ["Catalan", "ca"],
  ["Igpay Atinlay", "la-pig"],
];

const EMAIL_RE =
  /[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?/;

function validEmail(email: string): boolean {
  return EMAIL_RE.test(email.toLowerCase());
}

// ---------------------------------------------------------------------------
// Helper: tr-option (mirrors tr-option in CLJS)
// ---------------------------------------------------------------------------
interface TrOption {
  name: string;
  ref: string;
  dataI18nKey: string | [string, string];
}

function trOption(trVec: [string, string], ref: string): TrOption {
  return { name: tr(trVec), ref, dataI18nKey: trVec[0] };
}

// ---------------------------------------------------------------------------
// API Key interface
// ---------------------------------------------------------------------------
interface ApiKey {
  _id: string;
  date: string;
  "api-key": string;
}

// ---------------------------------------------------------------------------
// State keys extracted from app-state options (mirrors select-keys in CLJS)
// ---------------------------------------------------------------------------
const STATE_KEYS = [
  "pronouns",
  "bespoke-sounds",
  "language",
  "card-language",
  "sounds",
  "default-format",
  "lobby-sounds",
  "sounds-volume",
  "background",
  "custom-bg-url",
  "card-zoom",
  "pin-zoom",
  "show-alt-art",
  "card-resolution",
  "pass-on-rez",
  "player-stats-icons",
  "stacked-cards",
  "ghost-trojans",
  "corp-card-sleeve",
  "runner-card-sleeve",
  "prizes",
  "display-encounter-info",
  "sides-overlap",
  "log-timestamps",
  "runner-board-order",
  "log-width",
  "log-top",
  "log-player-highlight",
  "blocked-users",
  "alt-arts",
  "gamestats",
  "deckstats",
  "disable-websockets",
  "archives-sorted",
  "heap-sorted",
  "card-back-display",
  "labeled-cards",
  "labeled-unrezzed-cards",
] as const;

// ---------------------------------------------------------------------------
// Alt art helpers (mirrors all-alt-art-types, alt-art-name)
// ---------------------------------------------------------------------------
function allAltArtTypes(): string[] {
  const altInfo = useAppState.getState().altInfo as
    | Record<string, unknown>[]
    | undefined;
  if (!altInfo) return [];
  return altInfo.map((a) => String(a.version));
}

function altArtName(version: string): string {
  const altInfo = useAppState.getState().altInfo as
    | Record<string, unknown>[]
    | undefined;
  if (!altInfo) return "Official";
  const alt = altInfo.find((a) => String(a.version) === version);
  return alt ? String(alt.name) || "Official" : "Official";
}

// ---------------------------------------------------------------------------
// Art availability / update helpers (mirrors art-available, update-card-art, etc.)
// ---------------------------------------------------------------------------
function artAvailable(
  card: Record<string, unknown>,
  art: string,
  lang: string,
  res: string,
): boolean {
  const images = card.images as Record<string, unknown> | undefined;
  if (!images) return false;
  const langLevel = images[lang] as Record<string, unknown> | undefined;
  if (!langLevel) return false;
  const resLevel = langLevel[res] as Record<string, unknown> | undefined;
  if (!resLevel) return false;
  return art in resLevel;
}

// ---------------------------------------------------------------------------
// Log width/position option components (mirrors log-width-option, log-top-option)
// ---------------------------------------------------------------------------
function LogWidthOption({
  s,
  setS,
}: {
  s: AccountState;
  setS: (updater: Partial<AccountState>) => void;
}) {
  const [value, setValue] = useState(String(s.logWidth ?? 300));
  const options = useAppState((state) => state.options);
  return (
    <div>
      <input
        type="number"
        min={100}
        max={2000}
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          setValue(v);
          setS({ logWidth: v });
        }}
      />
      <button
        className="update-log-width"
        type="button"
        onClick={() => {
          const w = (options["log-width"] as number | undefined) ?? 300;
          setS({ logWidth: w });
          setValue(String(w));
        }}
      >
        {trSpan(["settings_get-log-width", "Get current log width"])}
      </button>
    </div>
  );
}

function LogTopOption({
  s,
  setS,
}: {
  s: AccountState;
  setS: (updater: Partial<AccountState>) => void;
}) {
  const [value, setValue] = useState(String(s.logTop ?? 419));
  const options = useAppState((state) => state.options);
  return (
    <div>
      <input
        type="number"
        min={100}
        max={2000}
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          setValue(v);
          setS({ logTop: v });
        }}
      />
      <button
        className="update-log-width"
        type="button"
        onClick={() => {
          const t = (options["log-top"] as number | undefined) ?? 419;
          setS({ logTop: t });
          setValue(String(t));
        }}
      >
        {trSpan(["settings_get-log-top", "Get current log top"])}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Change email modal (mirrors change-email)
// ---------------------------------------------------------------------------
interface ChangeEmailProps {
  s: AccountState;
  onClose: () => void;
}

function ChangeEmail({ s, onClose }: ChangeEmailProps): React.ReactElement {
  const [email, setEmail] = useState("");
  const [flashMessage, setFlashMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validEmail(email)) return;
    const response = await PUT("/profile/email", { email }, "json");
    if (response.status === 200) {
      window.location.reload();
    } else {
      const json = response.json as Record<string, unknown> | null;
      setFlashMessage((json?.message as string) ?? "Failed");
    }
  }

  return (
    <div>
      {trElement("h3", ["settings_email-title", "Change email address"])}
      {flashMessage && <p className="flash-message">{flashMessage}</p>}
      <form onSubmit={handleSubmit}>
        {s.email ? (
          <p>
            {trElement("label.email", [
              "settings_current-email",
              "Current email",
            ])}{" "}
            :{" "}
            <input
              className="email"
              type="text"
              value={s.email}
              name="current-email"
              readOnly
            />
          </p>
        ) : null}
        <p>
          {trElement("label.email", [
            "settings_desired-email",
            "Desired email",
          ])}{" "}
          :{" "}
          <input
            className="email"
            type="text"
            data-i18n-key={":settings_email-placeholder"}
            placeholder={tr(["settings_email-placeholder", "Email address"])}
            name="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={(e) => {
              if (!validEmail(e.target.value)) {
                setFlashMessage(
                  tr([
                    "settings_enter-valid",
                    "Please enter a valid email address",
                  ]),
                );
              } else {
                setFlashMessage("");
              }
            }}
          />
        </p>
        <p className="float-right">
          <button
            disabled={!validEmail(email)}
            className={!validEmail(email) ? "disabled" : ""}
          >
            {trSpan(["settings_update", "Update"])}
          </button>
          <button type="button" onClick={onClose}>
            {trSpan(["settings_cancel", "Cancel"])}
          </button>
        </p>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// API Keys section (mirrors api-keys, create-api-key, delete-api-key)
// ---------------------------------------------------------------------------
function ApiKeysSection({
  s,
  setS,
}: {
  s: AccountState;
  setS: (updater: Partial<AccountState>) => void;
}): React.ReactElement {
  const keys = s.apiKeys ?? [];

  async function createApiKey() {
    const response = await POST("/data/api-keys", {}, "json");
    await handleApiKeysResponse(response, s, setS);
  }

  async function deleteApiKey(id: string) {
    const response = await DELETE(`/data/api-keys/${id}`);
    await handleApiKeysResponse(response, s, setS);
  }

  return (
    <section>
      {trElement("h3", ["settings_api-keys", "API Keys"])}
      <div className="news-box panel blue-shade">
        <ul className="list">
          {keys.map((d: ApiKey) => (
            <li className="news-item" key={d._id}>
              <span>
                <button
                  className="delete"
                  onClick={(e) => {
                    e.preventDefault();
                    deleteApiKey(d._id);
                  }}
                >
                  {trSpan(["settings_delete-api-key", "Delete"])}
                </button>
              </span>
              <span className="date">
                {formatDateTime(iSOIshFormatter, d.date)}
              </span>
              <span className="title">{d["api-key"] ?? ""}</span>
            </li>
          ))}
        </ul>
      </div>
      <button
        onClick={(e) => {
          e.preventDefault();
          createApiKey();
        }}
      >
        {trSpan(["settings_create-api-key", "Create API Key"])}
      </button>
    </section>
  );
}

async function handleApiKeysResponse(
  response: { status: number; json: unknown },
  s: AccountState,
  setS: (updater: Partial<AccountState>) => void,
): Promise<void> {
  const status = response.status;
  if (status === 200 || status === 201) {
    const r = await GET("/data/api-keys");
    setS({ apiKeys: r.json as ApiKey[] });
    trNonGameToast(
      ["settings_api-keys-updated", "Updated API keys"],
      "success",
      null,
    );
  } else {
    trNonGameToast(
      ["settings_api-keys-not-updated", "Failed to update API keys"],
      "error",
      null,
    );
  }
}

// ---------------------------------------------------------------------------
// Account state interface
// ---------------------------------------------------------------------------
interface AccountState {
  pronouns?: string;
  bespokeSounds?: Record<string, boolean>;
  language?: string;
  cardLanguage?: string;
  sounds?: boolean;
  defaultFormat?: string;
  lobbySounds?: boolean;
  soundsVolume?: number;
  background?: string;
  customBgUrl?: string;
  cardZoom?: string;
  pinZoom?: boolean;
  showAltArt?: boolean;
  cardResolution?: string;
  passOnRez?: boolean;
  playerStatsIcons?: boolean;
  stackedCards?: boolean;
  ghostTrojans?: boolean;
  corpCardSleeve?: string;
  runnerCardSleeve?: string;
  prizes?: Record<string, unknown>;
  displayEncounterInfo?: boolean;
  sidesOverlap?: boolean;
  logTimestamps?: boolean;
  runnerBoardOrder?: string;
  logWidth?: number | string;
  logTop?: number | string;
  logPlayerHighlight?: string;
  blockedUsers?: string[];
  altArts?: Record<string, string>;
  gamestats?: string;
  deckstats?: string;
  disableWebsockets?: boolean;
  archivesSorted?: boolean;
  heapSorted?: boolean;
  cardBackDisplay?: string;
  labeledCards?: boolean;
  labeledUnrezzedCards?: boolean;
  pinBaseArt?: boolean;
  flashMessage?: string;
  allArtSelect?: string;
  email?: string;
  blockUserInput?: string;
  apiKeys?: ApiKey[];
}

// ---------------------------------------------------------------------------
// Convert camelCase state keys to kebab-case for settings sync (mirrors CLJS keyword->kebab)
// ---------------------------------------------------------------------------
function stateKeyToSettingKey(key: string): string {
  return key.replace(/([A-Z])/g, (m) => "-" + m.toLowerCase());
}

function settingKeyToStateKey(key: string): string {
  const parts = key.split("-");
  return (
    parts[0] +
    parts
      .slice(1)
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join("")
  );
}

// ---------------------------------------------------------------------------
// Change Email Modal wrapper
// ---------------------------------------------------------------------------
function ChangeEmailModal({
  s,
  onClose,
}: {
  s: AccountState;
  onClose: () => void;
}): React.ReactElement {
  return (
    <div
      className="modal fade"
      style={{
        display: "block",
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0,0,0,0.5)",
        zIndex: 1050,
      }}
    >
      <div className="modal-dialog" style={{ margin: "10vh auto" }}>
        <div className="modal-content">
          <div className="modal-header">
            <button type="button" className="close" onClick={onClose}>
              &times;
            </button>
            <h4 className="modal-title">
              {tr(["settings_email-title", "Change email address"])}
            </h4>
          </div>
          <div className="modal-body">
            <ChangeEmail s={s} onClose={onClose} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Account page
// ---------------------------------------------------------------------------
export default function AccountPage(): React.ReactElement {
  const user = useAppState((state) => state.user);
  const options = useAppState((state) => state.options);
  const setOptions = useAppState((state) => state.setOptions);
  const altInfo = useAppState((state) => state.altInfo);

  // Scroll position tracking (mirrors scroll-top atom + set-scroll-top/store-scroll-top)
  const scrollTopRef = useRef(0);
  const contentNodeRef = useRef<HTMLDivElement>(null);

  // Extract settings from options (mirrors select-keys)
  const initialState = (): AccountState => {
    const s: AccountState = {};
    for (const key of STATE_KEYS) {
      const camelKey = settingKeyToStateKey(key);
      const value = (options as Record<string, unknown>)[key];
      if (value !== undefined) {
        (s as Record<string, unknown>)[camelKey] = value;
      }
    }
    (s as Record<string, unknown>).flashMessage = "";
    (s as Record<string, unknown>).allArtSelect = "wc2015";
    (s as Record<string, unknown>).blockUserInput = "";
    return s;
  };

  const [s, setSraw] = useState<AccountState>(initialState);
  // Force re-init when options change
  useEffect(() => {
    setSraw(initialState());
  }, [options]);

  // Helper to update state immutably (mirrors swap!)
  const setS = useCallback((updater: Partial<AccountState>) => {
    setSraw((prev) => ({ ...prev, ...updater }));
  }, []);

  // Fetch email on mount (mirrors go block for GET /profile/email)
  useEffect(() => {
    GET("/profile/email").then((response) => {
      if (response.status === 200) {
        const json = response.json as Record<string, unknown> | null;
        if (json?.email) {
          setS({ email: String(json.email) });
        }
      }
    });
  }, []);

  // Fetch API keys on mount (mirrors go block for GET /data/api-keys)
  useEffect(() => {
    GET("/data/api-keys").then((response) => {
      setS({ apiKeys: response.json as ApiKey[] });
    });
  }, []);

  // Scroll restoration on mount
  useEffect(() => {
    if (contentNodeRef.current) {
      setScrollTop(contentNodeRef.current, scrollTopRef.current);
    }
  }, []);

  // Store scroll on unmount
  useEffect(() => {
    return () => {
      if (contentNodeRef.current) {
        storeScrollTop(contentNodeRef.current, (n: number) => {
          scrollTopRef.current = n;
        });
      }
    };
  }, []);

  // Change email modal visibility
  const [changeEmailOpen, setChangeEmailOpen] = useState(false);

  // ---------------------------------------------------------------------------
  // Form submission (mirrors handle-post)
  // ---------------------------------------------------------------------------
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setS({ flashMessage: tr(["settings_updating", "Updating profile..."]) });

    // Build settings map from state (mirrors reduce over all-settings)
    const settingsMap: Record<string, unknown> = {};
    for (const setting of ALL_SETTINGS) {
      const camelKey = settingKeyToStateKey(setting.key);
      const value = (s as Record<string, unknown>)[camelKey];
      if (value !== undefined && value !== null) {
        settingsMap[setting.key] = value;
      }
    }

    // Update app-state (mirrors swap! app-state update :options merge)
    setOptions({ ...useAppState.getState().options, ...settingsMap });

    // Update localStorage (mirrors ls/update-local-storage-settings!)
    updateLocalStorageSettings(settingsMap);

    // If current language bundle not loaded, send lang
    const params = { ...settingsMap };
    if (!getBundle(params.language as string)) {
      params.lang = params.language;
    }

    const response = await PUT("/profile", params, "json");
    postResponse(response);
  }

  function postResponse(response: { status: number; json: unknown }) {
    switch (response.status) {
      case 401:
        trNonGameToast(
          ["settings_invalid-password", "Invalid login or password"],
          "error",
          null,
        );
        break;
      case 404:
        trNonGameToast(
          [
            "settings_invalid-email",
            "No account with that email address exists",
          ],
          "error",
          null,
        );
        break;
      default: {
        const json = response.json as Record<string, unknown> | null;
        if (json?.lang && json?.content) {
          insertLang(String(json.lang), String(json.content));
        }
        trNonGameToast(
          ["settings_updated", "Profile updated - Please refresh your browser"],
          "success",
          null,
        );
        break;
      }
    }
    setS({ flashMessage: "" });
  }

  // ---------------------------------------------------------------------------
  // Block list helpers (mirrors add-user-to-block-list, remove-user-from-block-list)
  // ---------------------------------------------------------------------------
  function addUserToBlockList() {
    const blockedUser = s.blockUserInput ?? "";
    const myUserName = (user?.username as string) ?? "";
    const currentBlocked = s.blockedUsers ?? [];
    setS({ blockUserInput: "" });
    if (
      blockedUser.trim() !== "" &&
      blockedUser !== myUserName &&
      !currentBlocked.includes(blockedUser)
    ) {
      setS({ blockedUsers: [...currentBlocked, blockedUser] });
    }
  }

  function removeUserFromBlockList(userName: string) {
    const currentBlocked = s.blockedUsers ?? [];
    setS({ blockedUsers: currentBlocked.filter((u) => u !== userName) });
  }

  // ---------------------------------------------------------------------------
  // Alt art helpers (mirrors update-card-art, reset-card-art, clear-card-art)
  // ---------------------------------------------------------------------------
  function removeCardArt(card: Record<string, unknown>) {
    const code = String(card.code);
    const altArts = { ...(s.altArts ?? {}) };
    delete altArts[code];
    setS({ altArts });
  }

  function addCardArt(card: Record<string, unknown>, art: string) {
    const code = String(card.code);
    setS({ altArts: { ...(s.altArts ?? {}), [code]: art } });
  }

  function updateCardArt(
    card: Record<string, unknown>,
    art: string,
    lang: string,
    res: string,
  ) {
    if (!card || typeof art !== "string") return;
    if (art === "default") {
      removeCardArt(card);
    } else if (artAvailable(card, art, lang, res)) {
      addCardArt(card, art);
    }
  }

  function clearCardArt() {
    setS({ altArts: {} });
  }

  function resetCardArt() {
    const art = s.allArtSelect ?? "wc2015";
    const lang = (options["card-language"] as string) ?? "en";
    const res = (options["card-resolution"] as string) ?? "default";
    for (const card of Object.values(AllCards)) {
      updateCardArt(card as Record<string, unknown>, art, lang, res);
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  if (!user) {
    return (
      <div className="page-container">
        <div className="panel blue-shade content-page">
          <p>You must be logged in to view this page.</p>
        </div>
      </div>
    );
  }

  const customBgSelected = (s.background ?? "") === "custom-bg";
  const customBgUrl = s.customBgUrl ?? "";
  const blockedUsers = s.blockedUsers ?? [];
  const altArts = s.altArts ?? {};
  const prizes = s.prizes as Record<string, unknown> | undefined;
  const cardBacksPrizes =
    (prizes?.["card-backs"] as Record<string, boolean>) ?? {};
  const unlockedCardBacks = new Set(
    Object.entries(cardBacksPrizes)
      .filter(([, v]) => v)
      .map(([k]) => k),
  );

  // Corp card back file path
  const corpCardBacks = cardBacksForSide("Corp", unlockedCardBacks);
  const corpSleeveKey = s.corpCardSleeve ?? "nsg-card-back";
  const corpSleeveFile = corpCardBacks[corpSleeveKey]?.file ?? "nsg";

  // Runner card back file path
  const runnerCardBacks = cardBacksForSide("Runner", unlockedCardBacks);
  const runnerSleeveKey = s.runnerCardSleeve ?? "nsg-card-back";
  const runnerSleeveFile = runnerCardBacks[runnerSleeveKey]?.file ?? "nsg";

  // Bespoke sound groupings
  const groupings = [
    ...new Set(Object.values(bespokeSounds).map((bs) => bs.grouping)),
  ];

  return (
    <div className="page-container">
      <div className="account-bg" />
      <div
        id="profile-form"
        className="panel blue-shade content-page"
        ref={contentNodeRef}
      >
        {trElement("h2", ["nav_settings", "Settings"])}
        <form onSubmit={handleSubmit}>
          <button type="submit" className="float-right">
            {trSpan(["settings_update-profile", "Update Profile"])}
          </button>

          {/* Email section */}
          <section>
            {trElement("h3", ["settings_email", "Email"])}
            <a
              href=""
              onClick={(e) => {
                e.preventDefault();
                setChangeEmailOpen(true);
              }}
            >
              {trSpan(["settings_change-email", "Change email"])}
            </a>
          </section>

          {/* Avatar section */}
          <section>
            {trElement("h3", ["settings_avatar", "Avatar"])}
            <Avatar
              user={user as { emailhash?: string; username?: string }}
              opts={{ size: 38 }}
            />
            <a href="http://gravatar.com" target="_blank" rel="noreferrer">
              {trSpan(["settings_change-avatar", "Change on gravatar.com"])}
            </a>
          </section>

          {/* Pronouns section */}
          <section>
            {trElement("h3", ["settings_pronouns", "Pronouns"])}
            <select
              value={s.pronouns ?? "none"}
              onChange={(e) => setS({ pronouns: e.target.value })}
            >
              {PRONOUN_LIST.map(([title, ref]) => (
                <option
                  key={ref}
                  value={ref}
                  data-i18n-key={":pronouns"}
                  data-i18n-value={title}
                >
                  {tr(["pronouns", title], { pronoun: ref })}
                </option>
              ))}
            </select>
            <div>
              {trSpan([
                "settings_pronouns-request",
                "If your personal pronouns are not represented, you can request them",
              ])}{" "}
              <a href="https://github.com/mtgred/netrunner/issues">
                {trSpan(["settings_pronouns-here", "here"])}
              </a>
            </div>
          </section>

          {/* Language section */}
          <section>
            {trElement("h3", ["settings_language", "Language"])}
            <select
              value={s.language ?? "en"}
              onChange={(e) => setS({ language: e.target.value })}
            >
              {LANGUAGE_LIST.map(([name, ref]) => (
                <option key={ref} value={ref}>
                  {name}
                </option>
              ))}
            </select>
            <div>
              {trSpan([
                "settings_language-tip",
                "Some languages are not fully translated yet. If you would like to help with translations, please contact us.",
              ])}
            </div>
          </section>

          {/* Card language section */}
          <section>
            {trElement("h3", ["settings_card-language", "Card language"])}
            <select
              value={s.cardLanguage ?? "en"}
              onChange={(e) => setS({ cardLanguage: e.target.value })}
            >
              {LANGUAGE_LIST.map(([name, ref]) => (
                <option key={ref} value={ref}>
                  {name}
                </option>
              ))}
            </select>
          </section>

          {/* Card-Specific Sounds section */}
          <section>
            {trElement(
              "h3",
              ["settings_bespoke-sounds", "Card-Specific Sounds"],
              undefined,
            )}
            {groupings.map((grouping) => (
              <div key={grouping}>
                <label>
                  <input
                    type="checkbox"
                    checked={(s.bespokeSounds?.[grouping] as boolean) ?? false}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      if (checked) {
                        const selected = selectRandomFromGrouping(grouping);
                        if (selected) {
                          playSfx([selected], {
                            volume: (s.soundsVolume as number) ?? 50,
                            force: true,
                          });
                        }
                      }
                      setS({
                        bespokeSounds: {
                          ...(s.bespokeSounds ?? {}),
                          [grouping]: checked,
                        },
                      });
                    }}
                  />
                  {trSpan(["settings_bespoke-sounds", grouping], {
                    sound: grouping,
                  })}
                </label>
              </div>
            ))}
          </section>

          {/* Default game format section */}
          <section>
            {trElement("h3", [
              "lobby_default-game-format",
              "Default game format",
            ])}
            <select
              className="format"
              value={s.defaultFormat ?? "standard"}
              onChange={(e) => setS({ defaultFormat: e.target.value })}
            >
              {Object.entries(slugToFormat).map(([k, v]) => (
                <option key={k} value={k} data-i18n-key={k}>
                  {trFormat(v)}
                </option>
              ))}
            </select>
          </section>

          {/* Gameplay Settings section */}
          <section>
            {trElement("h3", [
              "settings_gameplay-settings",
              "Gameplay Settings",
            ])}
            <div>
              <label>
                <input
                  type="checkbox"
                  checked={(s.passOnRez as boolean) ?? false}
                  onChange={(e) => setS({ passOnRez: e.target.checked })}
                />
                {trSpan([
                  "settings_pass-on-rez",
                  "Pass priority when rezzing ice",
                ])}
              </label>
            </div>
          </section>

          {/* Layout options section */}
          <section>
            {trElement("h3", ["settings_layout-options", "Layout options"])}

            <div>
              <label>
                <input
                  type="checkbox"
                  checked={(s.stackedCards as boolean) ?? true}
                  onChange={(e) => setS({ stackedCards: e.target.checked })}
                />
                {trSpan([
                  "settings_stacked-cards",
                  "Card stacking (on by default)",
                ])}
              </label>
            </div>
            <div>
              <label>
                <input
                  type="checkbox"
                  checked={(s.ghostTrojans as boolean) ?? true}
                  onChange={(e) => setS({ ghostTrojans: e.target.checked })}
                />
                {trSpan([
                  "settings_ghost-trojans",
                  "Display ghosts for hosted programs",
                ])}
              </label>
            </div>
            <div>
              <label>
                <input
                  type="checkbox"
                  checked={(s.displayEncounterInfo as boolean) ?? false}
                  onChange={(e) =>
                    setS({ displayEncounterInfo: e.target.checked })
                  }
                />
                {trSpan([
                  "settings_display-encounter-info",
                  "Always display encounter info",
                ])}
              </label>
            </div>
            <div>
              <label>
                <input
                  type="checkbox"
                  checked={(s.logTimestamps as boolean) ?? true}
                  onChange={(e) => setS({ logTimestamps: e.target.checked })}
                />
                {trSpan([
                  "settings_toggle-log-timestamps",
                  "Show log timestamps",
                ])}
              </label>
            </div>
            <div>
              <label>
                <input
                  type="checkbox"
                  checked={(s.archivesSorted as boolean) ?? false}
                  onChange={(e) => setS({ archivesSorted: e.target.checked })}
                />
                {trSpan(["settings_sort-archives", "Sort Archives"])}
              </label>
            </div>
            <div>
              <label>
                <input
                  type="checkbox"
                  checked={(s.heapSorted as boolean) ?? false}
                  onChange={(e) => setS({ heapSorted: e.target.checked })}
                />
                {trSpan(["settings_sort-heap", "Sort Heap"])}
              </label>
            </div>

            <br />
            {trElement("h4", [
              "settings_runner-layout",
              "Runner layout from Corp perspective",
            ])}
            <div>
              <div className="radio">
                <label>
                  <input
                    name="runner-board-order"
                    type="radio"
                    value="jnet"
                    checked={(s.runnerBoardOrder ?? "irl") === "jnet"}
                    onChange={(e) => setS({ runnerBoardOrder: e.target.value })}
                  />
                  {trSpan([
                    "settings_runner-classic",
                    "Runner rig layout is classic jnet (Top to bottom: Programs, Hardware, Resources)",
                  ])}
                </label>
              </div>
              <div className="radio">
                <label>
                  <input
                    name="runner-board-order"
                    type="radio"
                    value="irl"
                    checked={(s.runnerBoardOrder ?? "irl") === "irl"}
                    onChange={(e) => setS({ runnerBoardOrder: e.target.value })}
                  />
                  {trSpan([
                    "settings_runner-reverse",
                    "Runner rig layout is reversed (Top to bottom: Resources, Hardware, Programs)",
                  ])}
                </label>
              </div>
            </div>

            <br />
            {trElement("h4", [
              "settings_log-player-highlight",
              "Log player highlight",
            ])}
            <div>
              <div className="radio">
                <label>
                  <input
                    name="log-player-highlight"
                    type="radio"
                    value="blue-red"
                    checked={
                      (s.logPlayerHighlight ?? "blue-red") === "blue-red"
                    }
                    onChange={(e) =>
                      setS({ logPlayerHighlight: e.target.value })
                    }
                  />
                  {trSpan([
                    "settings_log-player-highlight-red-blue",
                    "Corp: Blue / Runner: Red",
                  ])}
                </label>
              </div>
              <div className="radio">
                <label>
                  <input
                    name="log-player-highlight"
                    type="radio"
                    value="none"
                    checked={(s.logPlayerHighlight ?? "blue-red") === "none"}
                    onChange={(e) =>
                      setS({ logPlayerHighlight: e.target.value })
                    }
                  />
                  {trSpan(["settings_log-player-highlight-none", "None"])}
                </label>
              </div>
            </div>
          </section>

          {/* Game board background section */}
          <section>
            {trElement("h3", ["settings_background", "Game board background"])}
            {BACKGROUND_LIST.map(([title, slug]) => (
              <div className="radio" key={slug}>
                <label>
                  <input
                    type="radio"
                    name="background"
                    value={slug}
                    checked={(s.background ?? "worlds2020") === slug}
                    onChange={(e) => setS({ background: e.target.value })}
                  />
                  {trSpan(["settings_bg", title], { slug })}
                </label>
              </div>
            ))}
            <div>
              <input
                type="text"
                hidden={!customBgSelected}
                value={customBgUrl}
                onChange={(e) => setS({ customBgUrl: e.target.value })}
              />
            </div>
          </section>

          {/* Corp card backs section */}
          <section>
            {trElement("h3", ["settings_corp-card-sleeve", "Corp card backs"])}
            <select
              value={s.corpCardSleeve ?? "nsg-card-back"}
              onChange={(e) =>
                setS({ corpCardSleeve: e.target.value || "nsg-card-back" })
              }
            >
              {Object.entries(corpCardBacks).map(([k, v]) => {
                const trKey: [string, string] = [
                  "card-backs_" + k,
                  String(v.name),
                ];
                return (
                  <option key={k} value={k}>
                    {tr(trKey)}
                  </option>
                );
              })}
            </select>

            {trElement("h3", [
              "settings_runner-card-sleeve",
              "Runner card backs",
            ])}
            <select
              value={s.runnerCardSleeve ?? "nsg-card-back"}
              onChange={(e) =>
                setS({ runnerCardSleeve: e.target.value || "nsg-card-back" })
              }
            >
              {Object.entries(runnerCardBacks).map(([k, v]) => {
                const trKey: [string, string] = [
                  "card-backs_" + k,
                  String(v.name),
                ];
                return (
                  <option key={k} value={k}>
                    {tr(trKey)}
                  </option>
                );
              })}
            </select>
            <div>
              {trSpan([
                "settings_card-backs-tip",
                "You can earn more card backs by placing well in select online tournaments. If you're an artist with art that you think would make for a good card back, please feel free to contact us",
              ])}
            </div>

            <div style={{ display: "flex", justifyContent: "center" }}>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  margin: "1rem",
                }}
              >
                <img
                  src={`/img/card-backs/corp/${corpSleeveFile}.png`}
                  style={{ maxWidth: "200px" }}
                  alt="Corp card back"
                />
                <div style={{ marginTop: "0.5rem", textAlign: "center" }}>
                  {trSpan(["settings_corp-card-back", "Corp card back"])}
                </div>
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  margin: "1rem",
                }}
              >
                <img
                  src={`/img/card-backs/runner/${runnerSleeveFile}.png`}
                  style={{ maxWidth: "200px" }}
                  alt="Runner card back"
                />
                <div style={{ marginTop: "0.5rem", textAlign: "center" }}>
                  {trSpan(["settings_runner-card-back", "Runner card back"])}
                </div>
              </div>
            </div>

            {trElement("h3", [
              "settings_card-back-display",
              "Display Opponent Card backs",
            ])}
            {(
              [
                trOption(
                  ["settings_card-backs-their-choice", "Their Choice"],
                  "them",
                ),
                trOption(["settings_card-backs-my-choice", "My Choice"], "me"),
                trOption(["settings_card-backs-ffg", "FFG Card Back"], "ffg"),
                trOption(["settings_card-backs-nsg", "NSG Card Back"], "nsg"),
              ] as TrOption[]
            ).map((option) => (
              <div className="radio" key={option.name}>
                <label>
                  <input
                    type="radio"
                    name="card-back-display"
                    value={option.ref}
                    checked={(s.cardBackDisplay ?? "them") === option.ref}
                    onChange={(e) => setS({ cardBackDisplay: e.target.value })}
                  />
                  <span data-i18n-key={String(option.dataI18nKey)}>
                    {option.name}
                  </span>
                </label>
              </div>
            ))}
          </section>

          {/* Card preview zoom section */}
          <section>
            {trElement("h3", [
              "settings_card-preview-zoom",
              "Card preview zoom",
            ])}
            {(
              [
                trOption(["settings_card-image", "Card Image"], "image"),
                trOption(["settings_card-text", "Card Text"], "text"),
              ] as TrOption[]
            ).map((option) => (
              <div className="radio" key={option.name}>
                <label>
                  <input
                    type="radio"
                    name="card-zoom"
                    value={option.ref}
                    checked={(s.cardZoom ?? "image") === option.ref}
                    onChange={(e) => setS({ cardZoom: e.target.value })}
                  />
                  <span data-i18n-key={String(option.dataI18nKey)}>
                    {option.name}
                  </span>
                </label>
              </div>
            ))}
            <br />
            <div>
              <label>
                <input
                  type="checkbox"
                  name="pin-base-art"
                  checked={(s.pinBaseArt as boolean) ?? false}
                  onChange={(e) => setS({ pinBaseArt: e.target.checked })}
                />
                {trSpan([
                  "settings_pin-base-art",
                  "Zoomed cards always use base art",
                ])}
              </label>
            </div>
            <br />
            <div>
              <label>
                <input
                  type="checkbox"
                  name="pin-zoom"
                  checked={(s.pinZoom as boolean) ?? false}
                  onChange={(e) => setS({ pinZoom: e.target.checked })}
                />
                {trSpan(["settings_pin-zoom", "Keep zoomed cards on screen"])}
              </label>
            </div>
          </section>

          {/* Game stats section */}
          <section>
            {trElement("h3", [
              "settings_game-stats",
              " Game Win/Lose statistics ",
            ])}
            {(
              [
                trOption(["settings_always", "Always"], "always"),
                trOption(
                  ["settings_comp-only", "Competitive Lobby Only"],
                  "competitive",
                ),
                trOption(["settings_none", "None"], "none"),
              ] as TrOption[]
            ).map((option) => (
              <div key={option.name}>
                <label>
                  <input
                    type="radio"
                    name="gamestats"
                    value={option.ref}
                    checked={(s.gamestats ?? "always") === option.ref}
                    onChange={(e) => setS({ gamestats: e.target.value })}
                  />
                  <span data-i18n-key={String(option.dataI18nKey)}>
                    {option.name}
                  </span>
                </label>
              </div>
            ))}
          </section>

          {/* Deck stats section */}
          <section>
            {trElement("h3", ["settings_deck-stats", " Deck statistics "])}
            {(
              [
                trOption(["settings_always", "Always"], "always"),
                trOption(
                  ["settings_comp-only", "Competitive Lobby Only"],
                  "competitive",
                ),
                trOption(["settings_none", "None"], "none"),
              ] as TrOption[]
            ).map((option) => (
              <div key={option.name}>
                <label>
                  <input
                    type="radio"
                    name="deckstats"
                    value={option.ref}
                    checked={(s.deckstats ?? "always") === option.ref}
                    onChange={(e) => setS({ deckstats: e.target.value })}
                  />
                  <span data-i18n-key={String(option.dataI18nKey)}>
                    {option.name}
                  </span>
                </label>
              </div>
            ))}
          </section>

          {/* Alt arts section */}
          <section id="alt-art">
            {trElement("h3", ["settings_alt-art", "Alt arts"])}
            <div>
              <label>
                <input
                  type="checkbox"
                  name="show-alt-art"
                  checked={(s.showAltArt as boolean) ?? true}
                  onChange={(e) => setS({ showAltArt: e.target.checked })}
                />
                {trSpan(["settings_show-alt", "Show alternate card arts"])}
              </label>
            </div>
            <br />

            {(user.special as boolean) &&
            (s.showAltArt as boolean) &&
            altInfo ? (
              <div id="my-alt-art">
                <div id="set-all">
                  {trSpan(["settings_set-all", "Set all cards to"])} :{" "}
                  <select
                    ref={(el) => {
                      // In CLJS this was a ref for later access; not needed in React state model
                    }}
                    value={s.allArtSelect ?? "wc2015"}
                    onChange={(e) => setS({ allArtSelect: e.target.value })}
                  >
                    {allAltArtTypes()
                      .filter((t) => t !== "prev")
                      .map((t) => (
                        <option key={t} value={t}>
                          {altArtName(t)}
                        </option>
                      ))}
                  </select>
                  <button type="button" onClick={resetCardArt}>
                    {trSpan(["settings_set", "Set"])}
                  </button>
                </div>
                <div className="reset-all">
                  <button
                    type="button"
                    disabled={Object.keys(altArts).length === 0}
                    className={
                      Object.keys(altArts).length === 0 ? "disabled" : ""
                    }
                    onClick={clearCardArt}
                  >
                    {trSpan(["settings_reset", "Reset All to Official Art"])}
                  </button>
                </div>
              </div>
            ) : null}
          </section>

          {/* Blocked users section */}
          <section>
            {trElement("h3", ["settings_blocked", "Blocked users"])}
            <div>
              <input
                type="text"
                ref="block-user-input"
                value={s.blockUserInput ?? ""}
                onChange={(e) => setS({ blockUserInput: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addUserToBlockList();
                  }
                }}
                data-i18n-key={":settings_user-name"}
                placeholder={tr(["settings_user-name", "User name"])}
              />
              <button
                className="block-user-btn"
                type="button"
                name="block-user-button"
                onClick={addUserToBlockList}
              >
                {trSpan(["settings_block", "Block user"])}
              </button>
            </div>
            {blockedUsers.map((bu) => (
              <div className="line" key={bu}>
                <button
                  className="small unblock-user"
                  type="button"
                  onClick={() => removeUserFromBlockList(bu)}
                >
                  X
                </button>
                <span className="blocked-user-name">{"  " + bu}</span>
              </div>
            ))}
          </section>

          {/* Device-specific settings section */}
          <section>
            {trElement("h3", [
              "settings_device-specific",
              "Device-specific settings",
            ])}
            {trElement("p", [
              "settings_device-specific-note",
              "These settings are stored locally on this device and do not sync across devices.",
            ])}

            {trElement("h4", ["settings_sounds", "Sounds"])}
            <div>
              <label>
                <input
                  type="checkbox"
                  checked={(s.lobbySounds as boolean) ?? true}
                  onChange={(e) => setS({ lobbySounds: e.target.checked })}
                />
                {trSpan([
                  "settings_enable-lobby-sounds",
                  "Enable lobby sounds",
                ])}
              </label>
            </div>
            <div>
              <label>
                <input
                  type="checkbox"
                  checked={(s.sounds as boolean) ?? true}
                  onChange={(e) => setS({ sounds: e.target.checked })}
                />
                {trSpan(["settings_enable-game-sounds", "Enable game sounds"])}
              </label>
            </div>
            <div>
              {trSpan(["settings_volume", "Volume"])}
              <input
                type="range"
                min={1}
                max={100}
                step={1}
                value={(s.soundsVolume as number) ?? 50}
                onMouseUp={(e) => {
                  playSfx([randomSound()], {
                    volume: parseInt((e.target as HTMLInputElement).value, 10),
                  });
                }}
                onChange={(e) =>
                  setS({ soundsVolume: parseInt(e.target.value, 10) })
                }
                disabled={
                  !((s.sounds as boolean) ?? true) &&
                  !((s.lobbySounds as boolean) ?? true)
                }
              />
            </div>

            {trElement("h4", ["settings_layout-device", "Device Layout"])}
            <div>
              <label>
                <input
                  type="checkbox"
                  checked={(s.playerStatsIcons as boolean) ?? true}
                  onChange={(e) => setS({ playerStatsIcons: e.target.checked })}
                />
                {trSpan([
                  "settings_player-stats-icons",
                  "Use icons for player stats",
                ])}
              </label>
            </div>
            <div>
              <label>
                <input
                  type="checkbox"
                  checked={(s.sidesOverlap as boolean) ?? true}
                  onChange={(e) => setS({ sidesOverlap: e.target.checked })}
                />
                {trSpan([
                  "settings_sides-overlap",
                  "Runner and Corp board may overlap",
                ])}
              </label>
            </div>
            <div>
              <label>
                <input
                  type="checkbox"
                  checked={(s.labeledCards as boolean) ?? false}
                  onChange={(e) => setS({ labeledCards: e.target.checked })}
                />
                {trSpan(["settings_label-faceup-cards", "Label face up cards"])}
              </label>
            </div>
            <div>
              <label>
                <input
                  type="checkbox"
                  checked={(s.labeledUnrezzedCards as boolean) ?? false}
                  onChange={(e) =>
                    setS({ labeledUnrezzedCards: e.target.checked })
                  }
                />
                {trSpan([
                  "settings_label-unrezzed-cards",
                  "Label unrezzed cards",
                ])}
              </label>
            </div>

            {trElement("h4", ["settings_log-size", "Log size"])}
            <div>
              <LogWidthOption s={s} setS={setS} />
              <LogTopOption s={s} setS={setS} />
            </div>

            {trElement("h4", ["settings_card-images", "Card images"])}
            <div>
              <label>
                <input
                  type="checkbox"
                  name="use-high-res"
                  checked={(s.cardResolution ?? "default") === "high"}
                  onChange={(e) =>
                    setS({
                      cardResolution: e.target.checked ? "high" : "default",
                    })
                  }
                />
                {trSpan([
                  "settings_high-res",
                  "Enable high-resolution card images",
                ])}
              </label>
            </div>

            {trElement("h4", ["settings_connection", "Connection"])}
            <div>
              <label>
                <input
                  type="checkbox"
                  name="disable-websockets"
                  checked={(s.disableWebsockets as boolean) ?? false}
                  onChange={(e) =>
                    setS({ disableWebsockets: e.target.checked })
                  }
                />
                {trSpan([
                  "settings_disable-websockets",
                  "Disable websockets - requires browser refresh after clicking Update Profile [Not Recommended!]",
                ])}
              </label>
            </div>
          </section>

          {/* API Keys section */}
          <ApiKeysSection s={s} setS={setS} />

          {/* Flash message */}
          <section>
            <span className="flash-message">{s.flashMessage ?? ""}</span>
          </section>
        </form>
      </div>

      {/* Change email modal */}
      {changeEmailOpen && (
        <ChangeEmailModal s={s} onClose={() => setChangeEmailOpen(false)} />
      )}
    </div>
  );
}
