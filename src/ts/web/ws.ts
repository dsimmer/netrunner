// WebSocket server module. Mirrors: src/clj/web/ws.clj
//
// Replaces sente (taoensso.sente) with native ws + Express integration.
// Protocol (server → client): { id: "event/name", data: {...} }
// Protocol (client → server): { id: "event/name", data: {...} }
import * as ws from "ws";
import * as crypto from "crypto";
import type { IncomingMessage } from "http";
import type { Server } from "http";
import { registerUserInAppState as registerUser, deregisterUserFromAppState as deregisterUser } from "./app_state";
import { activeUser } from "./user";

// ---- Types ----

export interface WSRingReq {
  system?: any;
  user?: any;
  [key: string]: any;
}

export interface WSMessage {
  id: string;
  data?: unknown;
  uid?: string;
  replyFn?: (data: unknown) => void;
  timestamp?: number;
  "ring-req"?: WSRingReq;
  ringReq?: WSRingReq;
}

export type WSMsgHandler = (msg: WSMessage) => void;

// ---- Logging middleware (mirrors redact-uid-middleware) ----
// Redacts UIDs from log lines: "u_[REDACTED]/c_" instead of "u_<uid>/c_<conn>"
const uidRedactionRegex = /u_[^/]+\/c_/g;
function redactUid(str: string): string {
  return str.replace(uidRedactionRegex, "u_[REDACTED]/c_");
}

function logError(...args: unknown[]): void {
  const redacted = args.map((arg) =>
    typeof arg === "string" ? redactUid(arg) : arg,
  );
  console.error(...redacted);
}

// ---- WebSocket Server Setup ----
// Mirrors: sente/make-channel-socket-server! with http-kit adapter

let wss: ws.WebSocketServer | null = null;

// System reference used to populate `ring-req` on every dispatched message.
// Mirrors sente's :ring-req field which carries the original ring request
// (including :system, :user, etc.) into every WS event handler.
let attachedSystem: Record<string, unknown> | null = null;

export function setSystem(system: Record<string, unknown> | null): void {
  attachedSystem = system;
}

// Per-connection user maps, keyed by uid. Populated at connection time
// from the upgrade request's session (mirrors ring-anti-forgery's user
// being available on the ring-req).
const connectionUsers = new Map<string, Record<string, unknown>>();

// Connected sockets: Map<uid, Set<ws.WebSocket>>
export const connectedSockets = new Map<string, Set<ws.WebSocket>>();

// Internal connection tracking (mirrors conns_) — for debugging only
const connections_ = new Map<ws.WebSocket, { uid: string }>();

// ws-kalive-ms: keepalive interval in milliseconds
const KAAliveMs = 2500;
let kaTimer: ReturnType<typeof setInterval> | null = null;

function extractUid(req: IncomingMessage): string {
  // Mirrors sente's user-id-fn: check session :uid then fallback to client-id
  // In the Express+ws world, session data comes from the upgrade request.
  const session = (req as any).session as Record<string, unknown> | undefined;
  const uid = session?.uid as string | undefined;
  if (uid) return uid;

  // Fallback: client-id query parameter (for non-authenticated connections)
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const clientId = url.searchParams.get("client-id");
  if (clientId) return clientId;

  // Generate a unique ID as last resort
  return `u_auto/${crypto.randomUUID()}`;
}

/**
 * Initialize the WebSocket server.
 * Attach to an existing HTTP/HTTPS server instance.
 * Mirrors the sente server creation block (let [chsk-server ...]).
 */
export function initWebSocketServer(server: Server): ws.WebSocketServer {
  wss = new ws.WebSocketServer({ noServer: true });

  server.on("upgrade", (request: IncomingMessage, socket: any, head: Buffer) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host}`);
    // Only handle /chsk WebSocket upgrades (mirrors sente routing)
    if (url.pathname !== "/chsk") return;

    wss!.handleUpgrade(request, socket, head, (client) => {
      wss!.emit("connection", client, request);
    });
  });

  wss.on("connection", (client: ws.WebSocket, req: IncomingMessage) => {
    const uid = extractUid(req);
    const uidSockets = connectedSockets.get(uid) ?? new Set<ws.WebSocket>();
    uidSockets.add(client);
    connectedSockets.set(uid, uidSockets);
    connections_.set(client, { uid });

    // Capture session user from the upgrade request so it is available on
    // every subsequent message (mirrors :user on :ring-req in Clojure).
    const sessionUser = ((req as any).session as Record<string, unknown> | undefined)?.user as
      | Record<string, unknown>
      | undefined;
    if (sessionUser) {
      connectionUsers.set(uid, sessionUser);
    }

    client.on("message", (data: ws.Data) => {
      try {
        const msg: WSMessage = JSON.parse(data.toString());
        msg.uid = uid;
        const ringReq: WSRingReq = {
          system: attachedSystem ?? undefined,
          user: connectionUsers.get(uid),
        };
        msg["ring-req"] = ringReq;
        msg.ringReq = ringReq;
        handleEventMsg(msg);
      } catch (e) {
        logError(e, "Failed to parse WS message from", uid);
      }
    });

    client.on("close", () => {
      uidSockets.delete(client);
      if (uidSockets.size === 0) {
        connectedSockets.delete(uid);
        connectionUsers.delete(uid);
        deregisterUser(uid);
      }
      connections_.delete(client);
    });

    client.on("error", (err) => {
      logError(err, "WebSocket error for", uid);
    });
  });

  // Start keepalive timer (mirrors :ws-kalive-ms 2500)
  kaTimer = setInterval(() => {
    wss?.clients.forEach((client) => {
      if (client.readyState === ws.WebSocket.OPEN) {
        client.ping();
      }
    });
  }, KAAliveMs);

  return wss;
}

/**
 * Stop the WebSocket server and clean up timers.
 */
export function stopWebSocketServer(): void {
  if (kaTimer) {
    clearInterval(kaTimer);
    kaTimer = null;
  }
  if (wss) {
    wss.close();
    wss = null;
  }
}

// ---- Public API (mirrors sente exports) ----

/**
 * Send a message to a specific client uid.
 * Mirrors: chsk-send! [uid ev]
 * @param uid - The client uid (e.g., "u_abc123/c_def456")
 * @param eventMsg - [event, msg] tuple or string event id, with optional data
 */
export function chskSend(uid: string, eventMsg: [string, unknown?] | string): void {
  const [event, msg] = Array.isArray(eventMsg) ? eventMsg : [eventMsg, undefined];
  const sockets = connectedSockets.get(uid);
  if (!sockets) return;
  const payload = JSON.stringify({ id: event, data: msg });
  sockets.forEach((socket) => {
    if (socket.readyState === ws.WebSocket.OPEN) {
      socket.send(payload);
    }
  });
}

/**
 * Get list of all connected uids.
 * Mirrors: connected-uids []
 */
export function connectedUids(): string[] {
  return Array.from(connectedSockets.keys());
}

// ---- Rate-limited broadcast (mirrors sente async buffer) ----

// Maximum throughput is 25,000 client updates a second
// or 1024 pending broadcast-to!'s (asyncs limit for pending takes).
// At a duration of 40ms, a maximum of 2 buffer sizes can be processed
// in one sente tick (sentes buffer window is 30ms)
export const bufferClearTimerMs = 40;

// If two buffers can be exhausted in one sente tick, we should use a max
// buffer size of roughly half the 1024 core.async limit
export const bufferSize = 500;

// Token bucket for rate limiting broadcasts
let bufferTokens = bufferSize;
let bufferTimer: ReturnType<typeof setInterval> | null = null;

function startBufferTimer(): void {
  if (bufferTimer) return;
  bufferTimer = setInterval(() => {
    // Refill tokens up to buffer-size each tick
    bufferTokens = bufferSize;
  }, bufferClearTimerMs);
}

function stopBufferTimer(): void {
  if (bufferTimer) {
    clearInterval(bufferTimer);
    bufferTimer = null;
  }
  bufferTokens = bufferSize;
}

function acquireToken(): Promise<void> {
  return new Promise((resolve) => {
    if (bufferTokens > 0) {
      bufferTokens--;
      resolve();
    } else {
      // Wait for next tick
      setTimeout(resolve, bufferClearTimerMs);
    }
  });
}

/**
 * Sends the given event and msg to all clients in the given uids sequence.
 * Mirrors: broadcast-to! [uids event msg]
 *
 * TODO in high stress situations, multiple async operations could be competing.
 * This could result in out of order messages and thus a stale client.
 * To fix, we would want to keep the order of loading correct perhaps by blocking
 * successive operations until the previous ones have completed.
 */
export async function broadcastTo(uids: string[], event: string, msg?: unknown): Promise<void> {
  startBufferTimer();
  const payload = JSON.stringify({ id: event, data: msg });

  for (const clientUid of uids) {
    if (!clientUid) continue;
    // Block if we have recently sent a lot of messages. The data supplied is arbitrary
    await acquireToken();
    const sockets = connectedSockets.get(clientUid);
    if (sockets) {
      sockets.forEach((socket) => {
        if (socket.readyState === ws.WebSocket.OPEN) {
          socket.send(payload);
        }
      });
    }
  }
}

/**
 * Shut down the broadcast rate limiter.
 */
export function stopBroadcastLimiter(): void {
  stopBufferTimer();
}

// ---- Message Handler (mirrors defmulti -msg-handler) ----

const msgHandlers = new Map<string, WSMsgHandler>();

/**
 * Register a handler for a given event id.
 * Mirrors: defmethod -msg-handler :some-id name [msg] ...
 */
export function registerMsgHandler(id: string, handler: WSMsgHandler): void {
  msgHandlers.set(id, handler);
}

/**
 * Default handler for unhandled messages.
 * Mirrors: defmethod -msg-handler :default msg-handler--default
 */
const defaultHandler: WSMsgHandler = (msg) => {
  logError(`Unhandled WS msg ${msg.id} ${msg.uid} ${JSON.stringify(msg.data)}`);
  if (msg.replyFn) {
    msg.replyFn({ msg: "Unhandled event" });
  }
};

/**
 * Core message dispatcher. Looks up handler by :id.
 */
function dispatchMsg(msg: WSMessage): void {
  const handler = msgHandlers.get(msg.id) ?? defaultHandler;
  handler(msg);
}

// ---- Built-in handlers ----

// Mirrors: defmethod -msg-handler :chsk/ws-ping chsk--ws-ping [_]
registerMsgHandler("chsk/ws-ping", () => {});

// Mirrors: defmethod -msg-handler :chsk/ws-pong chsk--ws-pong [_]
registerMsgHandler("chsk/ws-pong", () => {});

// NOTE - :chsk/uidport-close is handled in game.ts

// Mirrors: defmethod -msg-handler :chsk/uidport-open chsk--uidport-open
registerMsgHandler("chsk/uidport-open", (msg) => {
  const uid = msg.uid;
  // Extract user from ring-req equivalent
  // In the ws world, user info comes from the session attached at connection time
  if (!uid) return;
  // The user object should already be registered via app_state at connection time
  // This handler fires when uidport opens — register if active
  // Since we don't have ring-req here, we rely on connection-time registration
  const user = (connections_ as any)?.__user ?? undefined;
  if (user && activeUser(user)) {
    registerUser(uid, user as unknown as Record<string, unknown>);
  }
});

// ---- Event Message Handler (mirrors event-msg-handler) ----

/**
 * Wraps `-msg-handler` with logging, error catching, etc.
 * Mirrors: event-msg-handler [event]
 */
export function handleEventMsg(event: WSMessage): void {
  try {
    // Add timestamp (mirrors assoc event :timestamp (inst/now))
    event.timestamp = Date.now();
    dispatchMsg(event);
  } catch (e) {
    logError(e, "Caught an error in the message handler");
  }
}

// ---- Handshake / Post handlers (for /chsk route) ----

/**
 * Handshake handler for GET /chsk.
 * Mirrors: handshake-handler (wraps ajax-get-or-ws-handshake-fn)
 *
 * In the native ws + Express setup, the handshake is handled by the
 * WebSocket upgrade flow. This function is a no-op placeholder for
 * compatibility with the route table.
 */
export function handshakeHandler(req: any, res: any): void {
  try {
    // WebSocket upgrades bypass this handler.
    // If we reach here, it's a regular HTTP GET to /chsk — reject it.
    res.statusCode = 426; // Upgrade Required
    res.end();
  } catch (ex) {
    logError(ex, "Caught an error in the handshake handler");
    res.statusCode = 500;
    res.end();
  }
}

/**
 * Post handler for POST /chsk (AJAX fallback).
 * Mirrors: post-handler (ajax-post-fn from sente)
 *
 * Handles JSON POST messages when WebSocket is unavailable.
 */
export function postHandler(req: any, res: any): void {
  try {
    const body = req.body as WSMessage | WSMessage[] | undefined;
    if (!body) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: "No body" }));
      return;
    }

    const session = (req as any).session as Record<string, unknown> | undefined;
    const uid = session?.uid as string | undefined;

    const messages = Array.isArray(body) ? body : [body];
    const responses: unknown[] = [];

    for (const msg of messages) {
      if (uid) msg.uid = uid;
      try {
        handleEventMsg(msg);
        responses.push({ id: msg.id, status: "ok" });
      } catch (e) {
        logError(e, "Error handling POST message", msg.id);
        responses.push({ id: msg.id, error: String(e) });
      }
    }

    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(responses));
  } catch (ex) {
    logError(ex, "Caught an error in the post handler");
    res.statusCode = 500;
    res.end(JSON.stringify({ error: "Internal server error" }));
  }
}

// ---- Exports for compatibility with existing consumers ----

// Expose internal state for debugging (mirrors connections_)
export { connections_ as connections };

/**
 * Current buffer usage for telemetry.
 * Mirrors telemetry.clj: (count (.buf ws/websocket-buffer))
 */
export function getBufferUsage(): number {
  return bufferSize - bufferTokens;
}
