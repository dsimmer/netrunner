// WebSocket client. Mirrors: src/cljs/nr/ws.cljs
//
// Replaces Sente with a native WebSocket + JSON message protocol.
// Protocol: { id: "event/name", data: {...} }
import { useAppState, currentGameID } from "./appstate";

export interface WSMessage {
  id: string;
  data?: unknown;
}

// Mirrors: defmulti event-msg-handler
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WSEventHandler = (data: any) => void;
const handlers: Map<string, WSEventHandler> = new Map();

let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

// Mirrors: lock atom (ws/lock)
export const lockState = { lock: false };
export function setLock(v: boolean): void {
  lockState.lock = v;
}

// Mirrors: ws-send!
export function wsSend(id: string, data?: unknown): void {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    console.warn("ws: not connected, dropping message", id);
    return;
  }
  socket.send(JSON.stringify({ id, data }));
}

// ---------------------------------------------------------------------------
// Round-trip request/reply (mirrors sente ws-send! with timeout + callback).
// The server is expected to reply to ws-send-with-cb messages with an event
// whose data field carries a matching `_reqId`. On match, the callback is
// invoked with `data.response` (mirroring sente's cb-success?/value form),
// the handler is unregistered, and the timeout cleared.
// ---------------------------------------------------------------------------

let nextReqId = 1;
interface PendingRequest {
  cb: (response: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
}
const pending: Map<number, PendingRequest> = new Map();

export function wsSendWithCb(
  id: string,
  data: unknown,
  timeoutMs: number,
  cb: (response: unknown) => void,
): void {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    console.warn("ws: not connected, dropping cb message", id);
    cb({ error: "not-connected" });
    return;
  }
  const reqId = nextReqId++;
  const timer = setTimeout(() => {
    pending.delete(reqId);
    cb({ error: "timeout" });
  }, timeoutMs);
  pending.set(reqId, { cb, timer });
  const payload =
    data == null
      ? { _reqId: reqId }
      : typeof data === "object"
        ? { ...(data as Record<string, unknown>), _reqId: reqId }
        : { value: data, _reqId: reqId };
  socket.send(JSON.stringify({ id, data: payload }));
}

function resolvePendingReply(reqId: number, response: unknown): boolean {
  const p = pending.get(reqId);
  if (!p) return false;
  clearTimeout(p.timer);
  pending.delete(reqId);
  try {
    p.cb(response);
  } catch (e) {
    console.error("ws cb error:", e);
  }
  return true;
}

// Mirrors: resync
export function resync(): void {
  const gameid = currentGameID();
  if (gameid) wsSend("game/resync", { gameid });
}

// Mirrors: lobby-updates-pause!
export function lobbyUpdatesPause(): void {
  wsSend("lobby/pause-updates");
}

// Mirrors: lobby-updates-continue!
export function lobbyUpdatesContinue(): void {
  wsSend("lobby/continue-updates");
}

// Mirrors: chsk-reconnect!
export function chskReconnect(): void {
  if (socket) socket.close();
}

// Register a handler for an event id.
// Mirrors: defmethod event-msg-handler :some-event
export function onWSEvent(id: string, fn: WSEventHandler): void {
  handlers.set(id, fn);
}

function dispatch(msg: WSMessage): void {
  // Round-trip reply: data carries _reqId from the originating wsSendWithCb.
  const data = msg.data as Record<string, unknown> | undefined;
  const reqId = data?._reqId as number | undefined;
  if (reqId != null) {
    const response = "response" in (data ?? {}) ? data!.response : data;
    if (resolvePendingReply(reqId, response)) return;
  }
  const fn = handlers.get(msg.id);
  if (fn) {
    try {
      fn(msg.data);
    } catch (e) {
      console.error("ws handler error:", msg.id, e);
    }
  } else {
    console.log("ws: unknown event", msg.id, msg);
  }
}

function connect(): void {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const wsUrl = `${proto}://${location.host}/chsk`;
  socket = new WebSocket(wsUrl);

  socket.onopen = () => {
    lockState.lock = false;
    useAppState.getState().setConnected(true);
    // Mirrors: :chsk/handshake handler — send lobby/list on connect
    wsSend("lobby/list");
    // If we were in a game, resync
    if (useAppState.getState().currentGame?.started) {
      resync();
    }
    // Mirror reconnection toast (implementation in ui layer)
    dispatch({ id: "chsk/state", data: { open: true } });
  };

  socket.onclose = () => {
    useAppState.getState().setConnected(false);
    dispatch({ id: "chsk/state", data: { open: false } });
    // Reconnect after 2s
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      connect();
    }, 2000);
  };

  socket.onerror = (err) => {
    console.error("ws error:", err);
  };

  socket.onmessage = (event) => {
    try {
      const msg: WSMessage = JSON.parse(event.data as string);
      dispatch(msg);
    } catch (e) {
      console.error("ws: failed to parse message", event.data, e);
    }
  };
}

// ---- Built-in event handlers ----

// Mirrors: :chsk/ws-ping handler — no-op
onWSEvent("chsk/ws-ping", () => {});

// Mirrors: :system/force-disconnect
onWSEvent("system/force-disconnect", () => {
  lockState.lock = true;
  chskReconnect();
});

// Mirrors: :lobby/list handler (stub; lobby.tsx registers full handler)
onWSEvent("lobby/list", (data) => {
  useAppState.getState().setGames(data as unknown[]);
});

// Mirrors: :game/block-creation
onWSEvent("game/block-creation", (data) => {
  useAppState.getState().setBlockGameCreation(data as boolean);
});

// initWS starts the WebSocket connection.
// Mirrors: start-router! in ws.cljs
export function initWS(): void {
  connect();
}

// Backward compat alias
export { lockState as lock };
