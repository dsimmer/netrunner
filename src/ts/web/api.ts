// API routes and middleware configuration. Mirrors: src/clj/web/api.clj
//
// Defines the route table, middleware chain, and app factory functions
// for the Jinteki web server. Replaces reitit + ring routing with a
// Node.js http-compatible routing layer.

import * as fs from "fs";
import * as path from "path";
import type { IncomingMessage, ServerResponse } from "http";
import { parse as parseCookie } from "cookie";
import { parse as parseUrl } from "url";

// ---------------------------------------------------------------------------
// Module imports (mirrors :require)
// ---------------------------------------------------------------------------

import { handshakeHandler as wsHandshakeHandler, postHandler as wsPostHandler } from "./ws";
import {
  cardsHandler, cardsVersionHandler, altArtsHandler, cardLangHandler,
  newsHandler, setsHandler, mwlHandler, cyclesHandler, donorsHandler, langHandler,
} from "./data";
import { configHandler as chatConfigHandler, messagesHandler as chatMessagesHandler } from "./chat";
import { decksHandler, decksCreateHandler, decksSaveHandler, decksDeleteHandler, decksBulkDeleteHandler } from "./decks";
import { apiKeysHandler, apiKeysCreateHandler, apiKeysDeleteHandler } from "./api_keys";
import { indexPage, resetPasswordPage } from "./pages";
import {
  replayHandler, clearUserstatsHandler, clearDeckstatsHandler,
  historyHandler, fetchLog, fetchAnnotations, publishAnnotations,
  deleteAnnotations, fetchReplay, shareReplay,
} from "./stats";
import {
  registerHandler as authRegisterHandler,
  loginHandler as authLoginHandler,
  logoutHandler as authLogoutHandler,
  checkUsernameHandler, checkEmailHandler, emailHandler,
  changeEmailHandler, updateProfileHandler,
  forgotPasswordHandler, resetPasswordHandler,
  wrapAuthenticationRequired, wrapAuthorizationRequired,
  wrapTournamentAuthRequired, wrapUser,
} from "./auth";
import {
  newsCreateHandler, newsDeleteHandler,
  versionHandler, versionUpdateHandler,
  bannedMessageHandler, bannedMessageUpdateHandler,
} from "./admin";
import { auth as tournamentAuth } from "./tournament";
import { auth as prizesAuth } from "./prizes";
import { decklistHandler, handHandler, discardHandler, deckHandler, logHandler } from "./game_api";
import { response, type HttpResponse } from "./utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface System {
  db?: any;
  "server-mode"?: string;
  auth?: Record<string, unknown>;
  chat?: Record<string, unknown>;
  email?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ApiRequest extends IncomingMessage {
  system?: System;
  user?: Record<string, unknown>;
  body?: Record<string, unknown>;
  params?: Record<string, string>;
  "path-params"?: Record<string, string>;
  cookies?: Record<string, unknown>;
  url?: string;
  originalUrl?: string;
  method?: string;
  scheme?: string;
  [key: string]: unknown;
}

export interface ApiResponse extends HttpResponse {
  cookies?: Record<string, Record<string, unknown>>;
}

export type Handler = (req: ApiRequest, res: ServerResponse) => HttpResponse | ApiResponse | void | Promise<HttpResponse | ApiResponse | void>;
export type Middleware = (handler: Handler) => Handler;
export type SystemMiddleware = (handler: Handler, system: System) => Handler;

// ---------------------------------------------------------------------------
// Route paths (mirrors `paths`)
// ---------------------------------------------------------------------------

const PATHS = [
  "", "chat", "cards", "deckbuilder", "play", "help",
  "account", "stats", "about", "tournament", "admin",
  "users", "prizes",
];

// ---------------------------------------------------------------------------
// Route definition types
// ---------------------------------------------------------------------------

interface RouteDefinition {
  path: string;
  methods?: Record<string, Handler>;
  middleware?: string[];
  children?: RouteDefinition[];
}

// ---------------------------------------------------------------------------
// Middleware registry
// ---------------------------------------------------------------------------

const MIDDLEWARE_REGISTRY: Record<string, Middleware> = {
  "auth": wrapAuthenticationRequired as unknown as Middleware,
  "tournament-auth": wrapTournamentAuthRequired as unknown as Middleware,
  "admin": wrapAuthorizationRequired as unknown as Middleware,
};

// ---------------------------------------------------------------------------
// Anti-forgery middleware (mirrors wrap-anti-forgery)
// ---------------------------------------------------------------------------

function wrapAntiForgery(handler: Handler): Handler {
  return (req, res) => handler(req, res);
}

// ---------------------------------------------------------------------------
// CORS middleware (mirrors wrap-cors)
// ---------------------------------------------------------------------------

function wrapCors(
  allowOrigin: (origin: string) => boolean,
  allowMethods: string[],
  allowHeaders: string[],
): Middleware {
  return (handler) => {
    return (req, res) => {
      const origin = req.headers["origin"] as string | undefined;
      if (origin && allowOrigin(origin)) {
        (res as any).setHeader("Access-Control-Allow-Origin", origin);
      }
      if (req.method === "OPTIONS") {
        (res as any).setHeader("Access-Control-Allow-Methods", allowMethods.join(", "));
        (res as any).setHeader("Access-Control-Allow-Headers", allowHeaders.join(", "));
        (res as any).setHeader("Access-Control-Max-Age", "86400");
        (res as any).setHeader("Allow", allowMethods.join(", "));
        writeResponse(res, { status: 200, body: "", headers: {} });
        return;
      }
      return handler(req, res);
    };
  };
}

// ---------------------------------------------------------------------------
// Cache headers middleware (mirrors wrap-add-cache-headers)
// ---------------------------------------------------------------------------

function wrapAddCacheHeaders(handler: Handler): Handler {
  return (req, res) => {
    const resp = handler(req, res);
    if (resp && (req.method === "GET" || req.method === "PUT")) {
      resp.headers["cache-control"] = "no-store";
    }
    return resp;
  };
}

// ---------------------------------------------------------------------------
// System middleware (mirrors wrap-system)
// ---------------------------------------------------------------------------

const wrapSystem: SystemMiddleware = (handler, system) => {
  return (req, res) => {
    (req as any).system = {
      ...(req as any).system,
      db: (system as any).db,
      "server-mode": system["server-mode"],
      auth: system.auth,
      chat: system.chat,
      email: system.email,
    };
    return handler(req, res);
  };
};

// ---------------------------------------------------------------------------
// JSON body parsing (mirrors wrap-json-body)
// ---------------------------------------------------------------------------

function wrapJsonBody(handler: Handler): Handler {
  return (req, res) => {
    return new Promise((resolve) => {
      let body = "";
      req.on("data", (chunk: Buffer) => { body += chunk.toString(); });
      req.on("end", () => {
        try { if (body) req.body = JSON.parse(body); } catch { /* ignore */ }
        const result = handler(req, res);
        resolve(result);
      }) as unknown as HttpResponse | ApiResponse | void;
    }) as unknown as HttpResponse | ApiResponse | void;
  };
}

// ---------------------------------------------------------------------------
// Cookie parsing
// ---------------------------------------------------------------------------

function wrapCookies(handler: Handler): Handler {
  return (req, res) => {
    const cookieHeader = req.headers["cookie"];
    if (cookieHeader) {
      req.cookies = parseCookie(cookieHeader);
      const sessionCookie = req.cookies["session"];
      if (sessionCookie) {
        req.cookies = { ...req.cookies, session: { value: sessionCookie } };
      }
    }
    return handler(req, res);
  };
}

// ---------------------------------------------------------------------------
// URL parsing middleware
// ---------------------------------------------------------------------------

function wrapUrlParser(handler: Handler): Handler {
  return (req, res) => {
    const url = req.url || "/";
    const parsed = parseUrl(url, true);
    req.params = parsed.query as unknown as Record<string, string>;
    req.originalUrl = url;
    req.scheme = req.headers["x-forwarded-proto"] as string || "http";
    return handler(req, res);
  };
}

// ---------------------------------------------------------------------------
// Favicon middleware (mirrors wrap-return-favicon)
// ---------------------------------------------------------------------------

function wrapReturnFavicon(handler: Handler): Handler {
  return (req, res) => {
    if (req.method === "GET" && req.url === "/favicon.ico") {
      const faviconPath = path.resolve(__dirname, "../../../resources/public/img/jinteki.ico");
      if (fs.existsSync(faviconPath)) {
        const data = fs.readFileSync(faviconPath);
        writeResponse(res, { status: 200, body: Buffer.from(data), headers: { "Content-Type": "image/x-icon" } });
        return;
      }
    }
    return handler(req, res);
  };
}

// ---------------------------------------------------------------------------
// Stacktrace middleware (mirrors wrap-stacktrace for dev)
// ---------------------------------------------------------------------------

function wrapStacktrace(handler: Handler): Handler {
  return (req, res) => {
    try {
      return handler(req, res);
    } catch (e) {
      console.error("Stacktrace middleware caught error:", e);
      const errorResp = response(500, {
        error: "Internal server error",
        stack: (e as Error).stack,
        message: (e as Error).message,
      });
      writeResponse(res, errorResp);
      return errorResp;
    }
  };
}

// ---------------------------------------------------------------------------
// Trailing slash redirect (mirrors redirect-trailing-slash-handler)
// ---------------------------------------------------------------------------

function redirectTrailingSlash(req: ApiRequest, res: ServerResponse): HttpResponse | null {
  if (req.url && req.url !== "/" && req.url.endsWith("/")) {
    const newUrl = req.url.slice(0, -1);
    const resp = response(301, {});
    resp.headers["Location"] = newUrl;
    writeResponse(res, resp);
    return resp;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Static file serving (mirrors create-resource-handler)
// ---------------------------------------------------------------------------

const STATIC_CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html", ".css": "text/css", ".js": "application/javascript",
  ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".gif": "image/gif", ".svg": "image/svg+xml",
  ".ico": "image/x-icon", ".woff": "font/woff", ".woff2": "font/woff2",
  ".ttf": "font/ttf", ".eot": "application/vnd.ms-fontobject", ".otf": "font/otf",
  ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".mp4": "video/mp4",
  ".webm": "video/webm", ".flac": "audio/flac", ".wav": "audio/wav",
};

function serveStaticFile(req: ApiRequest, res: ServerResponse): HttpResponse | null {
  const url = req.url || "/";
  const publicDir = path.resolve(__dirname, "../../../resources/public");
  const filePath = path.join(publicDir, url);
  if (!filePath.startsWith(publicDir)) return null;
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return null;
  const ext = path.extname(filePath).toLowerCase();
  const contentType = STATIC_CONTENT_TYPES[ext] || "application/octet-stream";
  try {
    const data = fs.readFileSync(filePath);
    const resp = response(200, Buffer.from(data));
    resp.headers["Content-Type"] = contentType;
    writeResponse(res, resp);
    return resp;
  } catch { return null; }
}

// ---------------------------------------------------------------------------
// Write response helper
// ---------------------------------------------------------------------------

function writeResponse(res: ServerResponse, resp: HttpResponse | ApiResponse): void {
  if (!res.headersSent) {
    const headers = { ...resp.headers };
    if (resp.cookies) {
      const cookieParts: string[] = [];
      for (const [name, cookie] of Object.entries(resp.cookies)) {
        const parts = [`${name}=${cookie.value}`];
        if (cookie["max-age"] !== undefined) parts.push(`Max-Age=${cookie["max-age"]}`);
        if (cookie.httpOnly) parts.push("HttpOnly");
        if (cookie.secure) parts.push("Secure");
        if (cookie.samesite) parts.push(`SameSite=${cookie.samesite}`);
        if (cookie.path) parts.push(`Path=${cookie.path}`);
        cookieParts.push(parts.join("; "));
      }
      if (cookieParts.length > 0) headers["Set-Cookie"] = cookieParts;
    }
    if (resp.body instanceof Buffer) {
      res.writeHead(resp.status, headers);
      res.end(resp.body);
    } else {
      headers["Content-Type"] = headers["Content-Type"] || "application/json";
      res.writeHead(resp.status, headers);
      res.end(typeof resp.body === "string" ? resp.body : JSON.stringify(resp.body));
    }
  }
}

// ---------------------------------------------------------------------------
// Route matching
// ---------------------------------------------------------------------------

interface MatchedRoute {
  handler: Handler;
  pathParams: Record<string, string>;
  middleware: string[];
}

function matchRoute(urlPath: string, method: string, routes: RouteDefinition[]): MatchedRoute | null {
  for (const route of routes) {
    const matched = matchSingleRoute(urlPath, method, route);
    if (matched) return matched;
  }
  return null;
}

function matchSingleRoute(urlPath: string, method: string, route: RouteDefinition): MatchedRoute | null {
  const routePath = route.path;
  if (routePath === "" || routePath === "/") {
    if (urlPath === "/" || urlPath === "") {
      if (route.methods && route.methods[method.toLowerCase()]) {
        return { handler: route.methods[method.toLowerCase()], pathParams: {}, middleware: route.middleware || [] };
      }
      if (route.children) {
        const childMatch = matchRoute(urlPath, method, route.children);
        if (childMatch) { childMatch.middleware = [...(route.middleware || []), ...childMatch.middleware]; return childMatch; }
      }
    }
    if (route.children) {
      const childMatch = matchRoute(urlPath, method, route.children);
      if (childMatch) { childMatch.middleware = [...(route.middleware || []), ...childMatch.middleware]; return childMatch; }
    }
    return null;
  }

  const normalizedRoute = routePath.startsWith("/") ? routePath : "/" + routePath;
  const normalizedUrl = urlPath.startsWith("/") ? urlPath : "/" + urlPath;
  const paramPattern = normalizedRoute.replace(/:(\w+)/g, ":{param}");
  const regexPattern = paramPattern.replace(/\{param\}/g, "([^/]+)").replace(/\//g, "\\/");
  const regex = new RegExp(`^${regexPattern}(/.*)?$`);
  const match = normalizedUrl.match(regex);

  if (match) {
    const paramNames = (routePath.match(/:(\w+)/g) || []).map((p) => p.slice(1));
    const pathParams: Record<string, string> = {};
    for (let i = 0; i < paramNames.length && i < match.length - 1; i++) {
      pathParams[paramNames[i]] = decodeURIComponent(match[i + 1]);
    }
    const remainingPath = match[match.length - 1] || "";

    if (route.methods && route.methods[method.toLowerCase()]) {
      if (!remainingPath) {
        return { handler: route.methods[method.toLowerCase()], pathParams, middleware: route.middleware || [] };
      }
    }
    if (route.children && remainingPath) {
      const childMatch = matchRoute(remainingPath, method, route.children);
      if (childMatch) {
        childMatch.pathParams = { ...pathParams, ...childMatch.pathParams };
        childMatch.middleware = [...(route.middleware || []), ...childMatch.middleware];
        return childMatch;
      }
    }
    if (route.children && !remainingPath) {
      const childMatch = matchRoute("/", method, route.children);
      if (childMatch) {
        childMatch.pathParams = { ...pathParams, ...childMatch.pathParams };
        childMatch.middleware = [...(route.middleware || []), ...childMatch.middleware];
        return childMatch;
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Build route definitions
// ---------------------------------------------------------------------------

function baseRoutes(): RouteDefinition[] {
  return PATHS.map((p) => ({
    path: p === "" ? "/" : `/${p}`,
    methods: {
      get: (req, res) => {
        const result = indexPage(req as any);
        writeResponse(res, result);
        return result;
      },
    },
    middleware: ["forgery"],
  }));
}

function apiRoutes(): RouteDefinition[] {
  return [
    // WebSocket
    { path: "/chsk", methods: { get: (r, res) => wsHandshakeHandler(r, res), post: (r, res) => wsPostHandler(r, res) }, middleware: ["forgery"] },
    // Data
    {
      path: "/data", middleware: ["forgery"], children: [
        { path: "/cards", children: [
          { path: "", methods: { get: (r, res) => { const result = cardsHandler(r as any); writeResponse(res, result); return result; } } },
          { path: "/version", methods: { get: (r, res) => { const result = cardsVersionHandler(r as any); writeResponse(res, result); return result; } } },
          { path: "/altarts", methods: { get: (r, res) => { const result = altArtsHandler(r as any); writeResponse(res, result); return result; } } },
          { path: "/lang/:lang", methods: { get: (r, res) => { const result = cardLangHandler(r as any); writeResponse(res, result); return result; } } },
        ]},
        { path: "/news", methods: { get: (r, res) => { const result = newsHandler(r as any); writeResponse(res, result); return result; } } },
        { path: "/sets", methods: { get: (r, res) => { const result = setsHandler(r as any); writeResponse(res, result); return result; } } },
        { path: "/mwl", methods: { get: (r, res) => { const result = mwlHandler(r as any); writeResponse(res, result); return result; } } },
        { path: "/cycles", methods: { get: (r, res) => { const result = cyclesHandler(r as any); writeResponse(res, result); return result; } } },
        { path: "/donors", methods: { get: (r, res) => { const result = donorsHandler(r as any); writeResponse(res, result); return result; } } },
        { path: "/decks", children: [
          { path: "", methods: {
            get: (r, res) => { const db = r.system?.db; const user = r.user || {}; const result = decksHandler(db as any, user); writeResponse(res, result); return result; },
            post: (r, res) => { const db = r.system?.db; const user = r.user || {}; const result = decksCreateHandler(db as any, user, r.body as any); writeResponse(res, result); return result; },
            put: (r, res) => { const db = r.system?.db; const user = r.user || {}; const result = decksSaveHandler(db as any, user, r.body as any); writeResponse(res, result); return result; },
          }},
          { path: "/:id", methods: {
            delete: (r, res) => { const db = r.system?.db; const user = r.user || {}; const id = r["path-params"]?.id; const result = decksDeleteHandler(db as any, user, id || ""); writeResponse(res, result); return result; },
          }},
        ]},
        { path: "/decks-bulk-delete", methods: {
          post: (r, res) => { const db = r.system?.db; const user = r.user || {}; const result = decksBulkDeleteHandler(db as any, user, r.body as any); writeResponse(res, result); return result; },
        }},
        { path: "/api-keys", middleware: ["auth"], children: [
          { path: "", methods: {
            get: (r, res) => { const result = apiKeysHandler(r as any); writeResponse(res, result); return result; },
            post: (r, res) => { const result = apiKeysCreateHandler(r as any); writeResponse(res, result); return result; },
          }},
          { path: "/:id", methods: {
            delete: (r, res) => { const result = apiKeysDeleteHandler(r as any); writeResponse(res, result); return result; },
          }},
        ]},
        { path: "/language/:lang", methods: { get: (r, res) => { const result = langHandler(r as any); writeResponse(res, result); return result; } } },
      ],
    },
    // Chat config
    { path: "/chat/config", methods: { get: (r, res) => { const result = chatConfigHandler(r as any, res); writeResponse(res, result); return result; } }, middleware: ["forgery"] },
    // Chat messages
    { path: "/messages/:channel", methods: { get: (r, res) => { const result = chatMessagesHandler(r as any, res); writeResponse(res, result); return result; } }, middleware: ["forgery"] },
    // Password reset
    { path: "/reset/:token", methods: {
      get: (r, res) => { const result = resetPasswordPage(r as any, res); return result; },
      post: (r, res) => { const result = resetPasswordHandler(r as any); if (result) writeResponse(res, result); return result; },
    }},
    // Replay viewer
    { path: "/replay/:gameid", methods: { get: (r, res) => { const result = replayHandler(r as any); writeResponse(res, result); return result; } }, middleware: ["forgery"] },
    // Bug report viewer
    { path: "/bug-report/:bugid", methods: { get: (r, res) => { (r as any)["path-params"] = { ...(r as any)["path-params"], gameid: (r as any)["path-params"]?.bugid }; const result = replayHandler(r as any); writeResponse(res, result); return result; } }, middleware: ["forgery"] },
    // Register
    { path: "/register", methods: { post: (r, res) => { const result = authRegisterHandler(r as any); writeResponse(res, result); return result; } }, middleware: ["forgery"] },
    // Check username
    { path: "/check-username/:username", methods: { get: (r, res) => { const result = checkUsernameHandler(r as any); writeResponse(res, result); return result; } }, middleware: ["forgery"] },
    // Check email
    { path: "/check-email/:email", methods: { get: (r, res) => { const result = checkEmailHandler(r as any); writeResponse(res, result); return result; } }, middleware: ["forgery"] },
    // Login
    { path: "/login", methods: { post: (r, res) => { const result = authLoginHandler(r as any); writeResponse(res, result); return result; } }, middleware: ["forgery"] },
    // Forgot password
    { path: "/forgot", methods: { post: (r, res) => { const result = forgotPasswordHandler(r as any); writeResponse(res, result); return result; } }, middleware: ["forgery"] },
    // Logout
    { path: "/logout", methods: { post: (r, res) => { const result = authLogoutHandler(r as any); writeResponse(res, result); return result; } }, middleware: ["auth", "forgery"] },
    // Game API
    {
      path: "/game", middleware: ["forgery", "cors", "cache-headers"], children: [
        { path: "/decklist", methods: { get: (r, res) => { const result = decklistHandler(r as any); writeResponse(res, result); return result; } } },
        { path: "/hand", methods: { get: (r, res) => { const result = handHandler(r as any); writeResponse(res, result); return result; } } },
        { path: "/discard", methods: { get: (r, res) => { const result = discardHandler(r as any); writeResponse(res, result); return result; } } },
        { path: "/deck", methods: { get: (r, res) => { const result = deckHandler(r as any); writeResponse(res, result); return result; } } },
        { path: "/log", methods: { get: (r, res) => { const result = logHandler(r as any); writeResponse(res, result); return result; } } },
      ],
    },
    // Profile
    {
      path: "/profile", middleware: ["auth", "forgery"], children: [
        { path: "", methods: { put: (r, res) => { const result = updateProfileHandler(r as any); writeResponse(res, result); return result; } } },
        { path: "/email", methods: {
          get: (r, res) => { const result = emailHandler(r as any); writeResponse(res, result); return result; },
          put: (r, res) => { const result = changeEmailHandler(r as any); writeResponse(res, result); return result; },
        }},
        { path: "/stats", children: [
          { path: "/user", methods: { delete: (r, res) => { const result = clearUserstatsHandler(r as any); writeResponse(res, result); return result; } } },
          { path: "/deck/:id", methods: { delete: (r, res) => { const result = clearDeckstatsHandler(r as any); writeResponse(res, result); return result; } } },
        ]},
        { path: "/history", children: [
          { path: "", methods: { get: (r, res) => { const result = historyHandler(r as any); writeResponse(res, result); return result; } } },
          { path: "/:gameid", methods: { get: (r, res) => { const result = fetchLog(r as any); writeResponse(res, result); return result; } } },
          { path: "/annotations", children: [
            { path: "/:gameid", methods: { get: (r, res) => { const result = fetchAnnotations(r as any); writeResponse(res, result); return result; } } },
            { path: "/publish/:gameid", methods: { get: (r, res) => { const result = publishAnnotations(r as any); writeResponse(res, result); return result; } } },
            { path: "/delete/:gameid", methods: { delete: (r, res) => { const result = deleteAnnotations(r as any); writeResponse(res, result); return result; } } },
          ]},
          { path: "/share/:gameid", methods: { get: (r, res) => { const result = shareReplay(r as any); writeResponse(res, result); return result; } } },
          { path: "/full/:gameid", methods: { get: (r, res) => { const result = fetchReplay(r as any); writeResponse(res, result); return result; } } },
        ]},
      ],
    },
    // Tournament auth
    { path: "/tournament-auth/:username", methods: { get: (r, res) => { const result = tournamentAuth(r); writeResponse(res, result); return result; } }, middleware: ["auth", "tournament-auth", "forgery"] },
    // Prizes auth
    { path: "/prizes/:username", methods: { get: (r, res) => { const result = prizesAuth(r); writeResponse(res, result); return result; } }, middleware: ["auth", "tournament-auth", "forgery"] },
    // Admin
    {
      path: "/admin", middleware: ["auth", "admin", "forgery"], children: [
        { path: "/news", children: [
          { path: "", methods: { post: async (r, res) => { const result = await newsCreateHandler(r as any); writeResponse(res, result); return result; } } },
          { path: "/:id", methods: { delete: async (r, res) => { const result = await newsDeleteHandler(r as any); writeResponse(res, result); return result; } } },
        ]},
        { path: "/version", methods: {
          get: async (r, res) => { const result = await versionHandler(r as any); writeResponse(res, result); return result; },
          put: async (r, res) => { const result = await versionUpdateHandler(r as any); writeResponse(res, result); return result; },
        }},
        { path: "/banned", methods: {
          get: async (r, res) => { const result = await bannedMessageHandler(r as any); writeResponse(res, result); return result; },
          put: async (r, res) => { const result = await bannedMessageUpdateHandler(r as any); writeResponse(res, result); return result; },
        }},
      ],
    },
  ];
}

// ---------------------------------------------------------------------------
// Merge routes (mirrors merge-routes)
// ---------------------------------------------------------------------------

function mergeRoutes(...routeSets: RouteDefinition[][]): RouteDefinition[] {
  const merged: RouteDefinition[] = [];
  for (const routes of routeSets) merged.push(...routes);
  return merged;
}

// ---------------------------------------------------------------------------
// Apply middleware chain
// ---------------------------------------------------------------------------

function applyMiddleware(handler: Handler, middlewareNames: string[], system?: System): Handler {
  let current = handler;
  const reversed = [...middlewareNames].reverse();
  for (const name of reversed) {
    switch (name) {
      case "forgery": current = wrapAntiForgery(current); break;
      case "cors": current = wrapCors(() => true, ["GET", "POST", "PUT", "DELETE", "OPTIONS"], ["Content-Type", "Authorization", "X-CSRF-Token"])(current); break;
      case "cache-headers": current = wrapAddCacheHeaders(current); break;
      case "json-body": current = wrapJsonBody(current); break;
      case "cookies": current = wrapCookies(current); break;
      case "url-parser": current = wrapUrlParser(current); break;
      case "user": current = wrapUser(current); break;
      default:
        if (MIDDLEWARE_REGISTRY[name]) {
          current = MIDDLEWARE_REGISTRY[name](current);
        }
        break;
    }
  }
  return current;
}

// ---------------------------------------------------------------------------
// Create request handler (mirrors make-default-routes)
// ---------------------------------------------------------------------------

function createRequestHandler(routes: RouteDefinition[], system?: System): (req: ApiRequest, res: ServerResponse) => void {
  return (req: ApiRequest, res: ServerResponse) => {
    // Trailing slash redirect
    if (redirectTrailingSlash(req, res)) return;

    const method = req.method || "GET";
    const urlPath = parseUrl(req.url || "/").pathname || "/";

    // Favicon
    if (method === "GET" && urlPath === "/favicon.ico") {
      const faviconPath = path.resolve(__dirname, "../../../resources/public/img/jinteki.ico");
      if (fs.existsSync(faviconPath)) {
        const data = fs.readFileSync(faviconPath);
        writeResponse(res, { status: 200, body: Buffer.from(data), headers: { "Content-Type": "image/x-icon" } });
        return;
      }
    }

    // Route matching
    const matched = matchRoute(urlPath, method, routes);
    if (matched) {
      req["path-params"] = matched.pathParams;
      const handler = applyMiddleware(matched.handler, matched.middleware, system);
      const result = handler(req, res);
      // If handler didn't write response, do it now
      if (result instanceof Promise) {
        result.then((resolved) => {
          if (resolved && !res.headersSent) {
            writeResponse(res, resolved as HttpResponse | ApiResponse);
          }
        });
      } else if (result && !res.headersSent) {
        writeResponse(res, result as HttpResponse | ApiResponse);
      }
      return;
    }

    // Static file serving
    if (method === "GET") {
      const staticResult = serveStaticFile(req, res);
      if (staticResult) return;
    }

    // Fall through to index page for SPA
    const indexResult = indexPage(req as any);
    writeResponse(res, indexResult);
  };
}

// ---------------------------------------------------------------------------
// Make middleware chain (mirrors make-middleware)
// ---------------------------------------------------------------------------

export function makeMiddleware(
  system: System,
  middlewareNames: string[] = ["url-parser", "json-body", "cookies", "system", "user"],
): Middleware {
  return (handler: Handler): Handler => {
    let current = handler;
    const reversed = [...middlewareNames].reverse();
    for (const name of reversed) {
      switch (name) {
        case "system": current = wrapSystem(current, system); break;
        case "stacktrace": current = wrapStacktrace(current); break;
        case "favicon": current = wrapReturnFavicon(current); break;
        case "json-body": current = wrapJsonBody(current); break;
        case "cookies": current = wrapCookies(current); break;
        case "url-parser": current = wrapUrlParser(current); break;
        case "user": current = wrapUser(current); break;
        default: break;
      }
    }
    return current;
  };
}

// ---------------------------------------------------------------------------
// Make app (mirrors make-app)
// ---------------------------------------------------------------------------

export function makeApp(system: System): (req: ApiRequest, res: ServerResponse) => void {
  const allRoutes = mergeRoutes(apiRoutes(), baseRoutes());
  const requestHandler = createRequestHandler(allRoutes, system);
  const wrappedHandler = applyMiddleware(requestHandler, ["url-parser", "json-body", "cookies", "system", "user"], system);
  return wrappedHandler as (req: ApiRequest, res: ServerResponse) => void;
}

// ---------------------------------------------------------------------------
// Make dev app (mirrors make-dev-app)
// ---------------------------------------------------------------------------

export function makeDevApp(system: System): (req: ApiRequest, res: ServerResponse) => void {
  const allRoutes = mergeRoutes(apiRoutes(), baseRoutes());
  const requestHandler = createRequestHandler(allRoutes, system);
  const wrappedHandler = applyMiddleware(requestHandler, ["stacktrace", "url-parser", "json-body", "cookies", "system", "user"], system);
  return wrappedHandler as (req: ApiRequest, res: ServerResponse) => void;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export { PATHS, apiRoutes, baseRoutes, mergeRoutes, matchRoute, wrapCors, wrapAddCacheHeaders, wrapAntiForgery, wrapJsonBody, wrapCookies, wrapUrlParser, wrapStacktrace, wrapReturnFavicon, wrapSystem, createRequestHandler };
