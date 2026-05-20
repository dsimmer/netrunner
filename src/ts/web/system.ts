// Server system module. Mirrors: src/clj/web/system.clj
// Manages application startup, configuration, MongoDB connection,
// HTTP/WebSocket servers, card data loading, i18n, and cleanup.

import * as fs from "fs";
import * as path from "path";
import * as http from "http";
import { MongoClient, Db, WithId } from "mongodb";
import { parse } from "yaml";

// Import card modules for side-effect registration (mirrors Clojure :require)
import "../game/cards/agendas";
import "../game/cards/assets";
import "../game/cards/basic";
import "../game/cards/events";
import "../game/cards/hardware";
import "../game/cards/ice";
import "../game/cards/identities";
import "../game/cards/operations";
import "../game/cards/programs";
import "../game/cards/resources";
import "../game/cards/upgrades";

import { loadQuotes } from "../game/quotes";
import { AllCards, Sets, Cycles, MWL, SetAllCards, SetSets, SetCycles, SetMWL } from "../jinteki/cards";
import { insertLang } from "../jinteki/i18n";
import { bannedMsg, frontendVersion, setFrontendVersion, setBannedMsg } from "./versions";
import { getAppState, swapAppState } from "./app_state";
import { tick } from "./utils";
import type { Lobby } from "./app_state";
import { initWebSocketServer, stopWebSocketServer, setSystem as setWsSystem } from "./ws";
import { clearInactiveLobbies } from "./lobby_3";
import { makeApp, makeDevApp, type System as ApiSystem } from "./api";
import { startLobbySubsCleanup, stopLobbySubsCleanup } from "./app_state";

// Side-effect imports that register WebSocket message handlers.
// Mirrors :require of web.game, web.lobby, web.telemetry, web.angel-arena.utils, etc.
// in the Clojure system module — each of those namespaces uses defmethod to
// register handlers at load time.
import "./game";
import "./lobby";
import "./angel_arena";
import "./angel_arena/utils";
import { startStatsLogging, stopStatsLogging } from "./telemetry";
import type { Card, Server, Side } from '../types';


// ---- Types ----

interface ServerConfig {
  "server/mode"?: string;
  "mongodb/connection"?: MongoConfig;
  "web/app-state"?: unknown;
  "web/server"?: ServerOpts;
  "web/auth"?: AuthSettings;
  "web/lobby"?: LobbyConfig;
  "web/chat"?: ChatSettings;
  "web/email"?: EmailSettings;
  "web/app"?: AppOpts;
  "web/banned-msg"?: BannedMsgConfig;
  "web/i18n"?: unknown;
  "frontend/version"?: FrontendVersionConfig;
  "sente/router"?: unknown;
  "game/quotes"?: unknown;
  "jinteki/cards"?: CardsConfig;
}

interface MongoConfig {
  address?: string;
  port?: number;
  name?: string;
  "connection-string"?: string;
}

interface ServerOpts {
  port?: number;
  app?: unknown;
}

interface AuthSettings {
  expiration?: number;
  secret?: string;
  cookie?: Record<string, unknown>;
}

interface LobbyConfig {
  interval?: number;
  mongo?: MongoConnectionResult;
  "time-inactive"?: number;
}

interface ChatSettings {
  "max-length"?: number;
  "rate-window"?: number;
  "rate-cnt"?: number;
}

interface EmailSettings {
  host?: string | null;
  user?: string | null;
  pass?: string | null;
  ssl?: unknown;
  from?: string;
  "reset-subject"?: string;
  "confirm-reset-subject"?: string;
}

interface AppOpts {
  "server-mode"?: string;
  "mongodb/connection"?: MongoConfig;
  "web/auth"?: AuthSettings;
  "web/chat"?: ChatSettings;
  "web/email"?: EmailSettings;
}

interface BannedMsgConfig {
  initial?: string;
  mongo?: MongoConnectionResult;
}

interface FrontendVersionConfig {
  initial?: string;
  mongo?: MongoConnectionResult;
}

interface CardsConfig {
  mongo?: MongoConnectionResult;
}

interface MongoConnectionResult {
  client: MongoClient;
  db: Db;
  uri: string;
}

interface SystemComponents {
  config: ServerConfig;
  mongo?: MongoConnectionResult;
  server?: http.Server;
  wsServer?: ReturnType<typeof initWebSocketServer>;
  lobbyStopper?: () => void;
  authSettings?: AuthSettings;
  chatSettings?: ChatSettings;
  emailSettings?: EmailSettings;
  bannedMsgConfig?: Record<string, unknown>;
  frontendVersionConfig?: Record<string, unknown>;
  cardsData?: CardsResult;
}

interface CardsResult {
  allCards: Record<string, Record<string, unknown>>;
  sets: Array<Record<string, unknown>>;
  cycles: Array<Record<string, unknown>>;
  mwl: Record<string, Record<string, unknown>>;
}

// ---- Config loading (mirrors server-config with aero) ----

function loadConfigFile(filePath: string): Record<string, unknown> | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath, "utf-8");
    if (filePath.endsWith(".yaml") || filePath.endsWith(".yml")) {
      return parse(content) as Record<string, unknown>;
    }
    // .edn files are not natively supported; fall back to treating as YAML if parseable
    return parse(content) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...target };
  for (const key of Object.keys(source)) {
    const sourceVal = source[key];
    const targetVal = result[key];
    if (
      sourceVal != null &&
      typeof sourceVal === "object" &&
      !Array.isArray(sourceVal) &&
      targetVal != null &&
      typeof targetVal === "object" &&
      !Array.isArray(targetVal)
    ) {
      result[key] = deepMerge(targetVal as Record<string, unknown>, sourceVal as Record<string, unknown>);
    } else if (sourceVal != null) {
      result[key] = sourceVal;
    }
  }
  return result;
}

export function serverConfig(): ServerConfig {
  const resourcesDir = path.resolve(__dirname, "../../../resources");
  const devFile = path.join(resourcesDir, "dev.edn");
  const prodFile = path.join(resourcesDir, "prod.edn");

  const devConfig = loadConfigFile(devFile) as ServerConfig | null;
  const prodConfig = loadConfigFile(prodFile) as ServerConfig | null;

  // deep-merge: dev overrides prod (mirrors Clojure order)
  if (devConfig && prodConfig) {
    return deepMerge(prodConfig as Record<string, unknown>, devConfig as Record<string, unknown>) as ServerConfig;
  }
  return (devConfig ?? prodConfig ?? {}) as ServerConfig;
}

// ---- MongoDB connection (mirrors :mongodb/connection) ----

export async function initMongoConnection(opts: MongoConfig): Promise<MongoConnectionResult> {
  const connection = opts["connection-string"] ?? `mongodb://${opts.address}:${opts.port}/${opts.name}`;
  const client = new MongoClient(connection);
  await client.connect();
  const dbName = connection.split("/").pop()?.split("?")[0] ?? "netrunner";
  const db = client.db(dbName);
  return { client, db, uri: connection };
}

export async function haltMongoConnection(mongo: MongoConnectionResult): Promise<void> {
  await mongo.client.close();
}

// ---- App state initialization (mirrors :web/app-state) ----

export function initAppState(): void {
  swapAppState((state) => ({
    ...state,
    lobbies: {},
    "lobby-updates": {},
    users: {},
  }));
}

// ---- HTTP Server (mirrors :web/server) ----

export function initServer(app: unknown, port: number): http.Server {
  // In the full implementation, `app` is an Express app or similar.
  // For now, create a basic HTTP server that delegates to the app.
  const server = http.createServer((req, res) => {
    // If `app` is an Express app, delegate to it
    if (typeof (app as any) === "function") {
      (app as any)(req, res);
    } else {
      res.writeHead(500);
      res.end("Server not configured");
    }
  });
  server.listen(port);
  return server;
}

export function haltServer(server: http.Server): void {
  server.close();
}

// ---- Auth settings (mirrors :web/auth) ----

export function initAuth(settings: AuthSettings): AuthSettings {
  return settings;
}

// ---- Lobby cleanup ticker (mirrors :web/lobby) ----

export function initLobby(
  interval: number,
  mongo: MongoConnectionResult,
  timeInactive: number,
): () => void {
  const db = mongo.db;
  const stopper = tick(
    () => clearInactiveLobbies(db, timeInactive),
    interval,
  );
  return stopper;
}

export function haltLobby(stoppers: (() => void)[]): void {
  for (const stop of stoppers) {
    stop();
  }
}

// ---- Chat settings (mirrors :web/chat) ----

export function initChat(settings: ChatSettings): ChatSettings {
  return settings;
}

// ---- Email settings (mirrors :web/email) ----

export function initEmail(settings: EmailSettings): EmailSettings {
  return settings;
}

// ---- Banned message (mirrors :web/banned-msg) ----

export async function initBannedMsg(
  initial: string,
  mongo: MongoConnectionResult,
): Promise<Record<string, unknown>> {
  const db = mongo.db;
  let config: WithId<Record<string, unknown>> | null = null;
  try {
    config = await db.collection("config").findOne({}) as WithId<Record<string, unknown>> | null;
  } catch {
    // collection may not exist yet
  }

  if (config) {
    // eslint-disable-next-line no-console
    console.log("Loading banned-msg from config");
    const msg = String(config["banned-msg"] ?? initial);
    // Update the module-level atom equivalent
    setBannedMsg(msg);
    return config;
  }

  // Create config collection and insert initial value
  await db.createCollection("config");
  const inserted = await db.collection("config").insertOne({ "banned-msg": initial });
  setBannedMsg(initial);
  return { _id: inserted.insertedId, "banned-msg": initial };
}

// Helper to access the module-level bannedMsg
// bannedMsgModule removed — use setBannedMsg from versions.ts instead

// ---- Frontend version (mirrors :frontend/version) ----

export async function initFrontendVersion(
  initial: string,
  mongo: MongoConnectionResult,
): Promise<Record<string, unknown>> {
  const db = mongo.db;
  let config: WithId<Record<string, unknown>> | null = null;
  try {
    config = await db.collection("config").findOne({}) as WithId<Record<string, unknown>> | null;
  } catch {
    // collection may not exist yet
  }

  if (config) {
    // eslint-disable-next-line no-console
    console.log("Loading frontend version from config");
    const version = String(config["version"] ?? initial);
    setFrontendVersion(version);
    return config;
  }

  await db.createCollection("config");
  const inserted = await db.collection("config").insertOne({ version: initial, "cards-version": 0 });
  setFrontendVersion(initial);
  return { _id: inserted.insertedId, version: initial, "cards-version": 0 };
}

// frontendVersionModule removed — use setFrontendVersion from versions.ts instead

// ---- Sente/WS router (mirrors :sente/router) ----
// In TypeScript, the WS router is handled via initWebSocketServer in ws.ts
// This is a placeholder for integrant compatibility.

export function initSenteRouter(): void {
  // WebSocket router is initialized via initWebSocketServer(server) in ws.ts
  // The ch-chsk and event-msg-handler are replaced by the native ws setup.
}

export function haltSenteRouter(): void {
  stopWebSocketServer();
}

// ---- Game quotes (mirrors :game/quotes) ----

export function initQuotes(): void {
  loadQuotes();
}

// ---- i18n (mirrors :web/i18n) ----

const SUPPORTED_LANGUAGES = [
  "en", "es", "ca", "fr", "it", "ja", "ko",
  "la-pig", "pl", "pt", "ru", "zh-simp", "zh-trad",
];

export function initI18n(dir: string): string[] {
  const errors: string[] = [];
  for (const lang of SUPPORTED_LANGUAGES) {
    const filePath = path.join(dir, `${lang}.ftl`);
    try {
      if (!fs.existsSync(filePath)) continue;
      const content = fs.readFileSync(filePath, "utf-8");
      if (!content.trim()) continue;
      insertLang(lang, content);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(`Error inserting i18n data for ${lang}`);
      // eslint-disable-next-line no-console
      console.error(e);
      errors.push(lang);
    }
  }
  return errors;
}

export function haltI18n(): void {
  // Clear the fluent dictionary (mirrors reset! fluent-dictionary nil)
  // In the current i18n.ts implementation, we clear via re-initialization.
  // The i18n module uses an internal Map, so we'd need an export for clearing.
  // For now, this is a no-op since the Map is not directly accessible.
}

// ---- Card key formatting (mirrors format-card-key->string) ----

function formatCardKeyToString(fmt: Record<string, unknown>): Record<string, unknown> {
  const cards = fmt.cards as Record<string, unknown> | undefined;
  if (!cards) return fmt;
  const converted: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(cards)) {
    converted[k] = v;
  }
  return { ...fmt, cards: converted };
}

// ---- Cards loading (mirrors :jinteki/cards) ----

export async function initCards(mongo: MongoConnectionResult): Promise<CardsResult> {
  const db = mongo.db;

  const cards = await db.collection("cards").find({}).toArray();
  const strippedCards: Record<string, unknown>[] = cards.map((c) => ({
    ...(c as Record<string, unknown>),
    _id: String(c._id),
  }));
  const allCards: Record<string, Record<string, unknown>> = {};
  for (const card of strippedCards) {
    const title = card.title as string;
    if (title) {
      allCards[title] = card;
    }
  }

  const sets = await db.collection("sets").find({}).toArray();
  const cycles = await db.collection("cycles").find({}).toArray();
  const mwl = await db.collection("mwls").find({}).toArray();

  // Build latest MWL per format (mirrors Clojure MWL parsing)
  const latestMwl: Record<string, Record<string, unknown>> = {};
  const mwlByFormat: Record<string, Record<string, unknown>[]> = {};
  for (const entry of mwl) {
    const fmt = entry.format as string;
    if (!mwlByFormat[fmt]) mwlByFormat[fmt] = [];
    mwlByFormat[fmt].push(entry as unknown as Record<string, unknown>);
  }
  for (const [format, entries] of Object.entries(mwlByFormat)) {
    // Sort by date-start and take the latest
    entries.sort((a, b) => {
      const dateA = new Date(a["date-start"] as string).getTime();
      const dateB = new Date(b["date-start"] as string).getTime();
      return dateA - dateB;
    });
    const latest = formatCardKeyToString(entries[entries.length - 1]);
    latestMwl[format] = latest;
  }

  // Update global card registries (mirrors reset! calls)
  SetAllCards(allCards);
  SetSets(sets as Array<Record<string, unknown>>);
  SetCycles(cycles as Array<Record<string, unknown>>);
  SetMWL(latestMwl);

  return {
    allCards,
    sets: sets as Array<Record<string, unknown>>,
    cycles: cycles as Array<Record<string, unknown>>,
    mwl: latestMwl,
  };
}

export function haltCards(): void {
  SetAllCards({});
  SetSets([]);
  SetCycles([]);
  SetMWL({});
}

// ---- System start/stop (mirrors start/stop with integrant) ----

/**
 * Initialize and start all server components.
 * Mirrors: (start) with integrant ig/init
 *
 * @param config - Server configuration object. If not provided, loaded from config files.
 * @returns System components map for later cleanup.
 */
export async function start(config?: ServerConfig): Promise<SystemComponents> {
  const cfg = config ?? serverConfig();
  const system: SystemComponents = { config: cfg };

  // 1. Server mode
  const serverMode = cfg["server/mode"] ?? "dev";
  // eslint-disable-no-console
  console.log(`Starting server in ${serverMode} mode`);

  // 2. MongoDB connection
  const mongoOpts = cfg["mongodb/connection"];
  if (mongoOpts) {
    system.mongo = await initMongoConnection(mongoOpts);
    console.log("MongoDB connected");
  }

  // 3. App state
  initAppState();

  // 4. Auth settings
  if (cfg["web/auth"]) {
    system.authSettings = initAuth(cfg["web/auth"]);
  }

  // 5. Chat settings
  if (cfg["web/chat"]) {
    system.chatSettings = initChat(cfg["web/chat"]);
  }

  // 6. Email settings
  if (cfg["web/email"]) {
    system.emailSettings = initEmail(cfg["web/email"]);
  }

  // 7. Banned message (requires mongo)
  if (cfg["web/banned-msg"] && system.mongo) {
    const { initial } = cfg["web/banned-msg"];
    if (initial) {
      system.bannedMsgConfig = await initBannedMsg(initial, system.mongo);
    }
  }

  // 8. Frontend version (requires mongo)
  if (cfg["frontend/version"] && system.mongo) {
    const { initial } = cfg["frontend/version"];
    if (initial) {
      system.frontendVersionConfig = await initFrontendVersion(initial, system.mongo);
    }
  }

  // 9. Cards (requires mongo)
  if (system.mongo) {
    system.cardsData = await initCards(system.mongo);
    console.log("Cards loaded");
  }

  // 10. Quotes
  initQuotes();

  // 11. i18n
  const i18nDir = path.resolve(__dirname, "../../../resources/public/i18n");
  const i18nErrors = initI18n(i18nDir);
  if (i18nErrors.length > 0) {
    console.warn(`i18n loading errors for: ${i18nErrors.join(", ")}`);
  }

  // 12. Lobby cleanup ticker (requires mongo)
  const lobbyConfig = cfg["web/lobby"];
  if (lobbyConfig && system.mongo) {
    const stopper = initLobby(
      lobbyConfig.interval ?? 1000,
      system.mongo,
      lobbyConfig["time-inactive"] ?? 600,
    );
    system.lobbyStopper = stopper;
  }

  // 13. HTTP server (mirrors :web/app + :web/server)
  const serverOpts = cfg["web/server"];
  if (serverOpts?.port) {
    const apiSystem: ApiSystem = {
      db: system.mongo?.db,
      "server-mode": serverMode,
      auth: system.authSettings as Record<string, unknown> | undefined,
      chat: system.chatSettings as Record<string, unknown> | undefined,
      email: system.emailSettings as Record<string, unknown> | undefined,
    };
    const app = serverMode === "dev" ? makeDevApp(apiSystem) : makeApp(apiSystem);
    system.server = initServer(app, serverOpts.port);

    // 14. WebSocket router (mirrors :sente/router)
    setWsSystem(apiSystem as unknown as Record<string, unknown>);
    system.wsServer = initWebSocketServer(system.server);
  }

  // 15. Lobby subscription cleanup loop (mirrors cleanup-lobby-subs go-block)
  startLobbySubsCleanup();

  // 16. Periodic stats logging (mirrors telemetry/log-stats go-block)
  startStatsLogging();

  return system;
}

/**
 * Stop and clean up all server components.
 * Mirrors: (stop system) with integrant ig/halt!
 *
 * @param system - The system components map returned by start().
 */
export async function stop(system: SystemComponents): Promise<void> {
  if (!system) return;

  // Halt in reverse order of initialization

  // 0. Periodic stats logging
  stopStatsLogging();

  // 0. Lobby subscription cleanup loop
  stopLobbySubsCleanup();

  // 1. Lobby stoppers
  if (system.lobbyStopper) {
    haltLobby([system.lobbyStopper]);
  }

  // 2. WS server
  haltSenteRouter();

  // 3. HTTP server
  if (system.server) {
    haltServer(system.server);
  }

  // 4. Cards
  haltCards();

  // 5. i18n
  haltI18n();

  // 6. MongoDB
  if (system.mongo) {
    await haltMongoConnection(system.mongo);
    console.log("MongoDB disconnected");
  }
}

// ---- Development helper ----

// Commented block for REPL usage (mirrors Clojure comment block):
// const system = await start();
// await stop(system);
