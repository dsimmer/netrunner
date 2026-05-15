/* eslint-disable no-console */
import { randomUUID } from "node:crypto";
import * as http from "node:http";
import * as https from "node:https";
import WebSocket from "ws";
import { connect, disconnect, TaskSystem } from "./setup";

// ---------------------------------------------------------------------------
// Type definitions
// ---------------------------------------------------------------------------

type WsMessage = Record<string, unknown>;

interface HttpRequestResult {
  status: number;
  headers: Record<string, string | string[]>;
  body?: string;
  error?: Error;
}

interface HttpClientOptions {
  formParams?: Record<string, string>;
  headers?: Record<string, string>;
  asText?: boolean;
}

// ---------------------------------------------------------------------------
// Safe print (mirrors clojure.core/safe-println – no interleaving)
// ---------------------------------------------------------------------------

function safePrintln(...more: unknown[]): void {
  process.stdout.write(more.join(" ") + "\n");
}

// ---------------------------------------------------------------------------
// HTTP request helpers (mirrors org.httpkit.client)
// ---------------------------------------------------------------------------

function httpRequest(
  method: string,
  url: string,
  options: HttpClientOptions,
): Promise<HttpRequestResult> {
  return new Promise((resolve) => {
    const parsed = new URL(url);
    const isHttps = parsed.protocol === "https:";
    const lib = isHttps ? https : http;

    const reqHeaders: Record<string, string> = { ...options.headers };
    let body: Buffer | string | undefined = options.formParams
      ? new URLSearchParams(options.formParams).toString()
      : undefined;

    if (body && !reqHeaders["Content-Type"]) {
      reqHeaders["Content-Type"] = "application/x-www-form-urlencoded";
    }

    const req = lib.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: parsed.pathname + parsed.search + parsed.hash,
        method,
        headers: reqHeaders,
      },
      (res: http.IncomingMessage) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const bodyStr = options.asText
            ? Buffer.concat(chunks).toString("utf-8")
            : undefined;
          resolve({
            status: res.statusCode || 0,
            headers: res.headers as Record<string, string | string[]>,
            body: bodyStr,
            error: undefined,
          });
        });
      },
    );

    req.on("error", (err: Error) => {
      resolve({ status: 0, headers: {}, error: err });
    });

    if (body) {
      req.write(body);
    }
    req.end();
  });
}

// ---------------------------------------------------------------------------
// add-test-users (mirrors tasks.load-generator/add-test-users)
// Creates test users that don't already exist in the database
// ---------------------------------------------------------------------------

async function addTestUsers(
  system: TaskSystem,
  maxUsers: number,
): Promise<void> {
  const playingUsers = ["TestCorp", "TestRunner"];
  const watchingUsers = Array.from(
    { length: maxUsers },
    (_, n) => `TestUser${n}`,
  );
  const allUsers = [...playingUsers, ...watchingUsers];

  // Find existing users (mirrors: (mc/find-maps db "users" {:username {$in all-users}} [:username]))
  const existing = await system.db
    .collection("users")
    .find({ username: { $in: allUsers } })
    .toArray();
  const existingSet = new Set(
    (existing as unknown as { username: string }[]).map((u) => u.username),
  );

  // Users not in DB yet (mirrors: set/difference + mapv)
  const missing = allUsers.filter((u) => !existingSet.has(u));
  if (missing.length > 0) {
    const newUsers = missing.map((username) => ({
      username,
      password: "password",
      email: `${username}@mailinator.com`,
    }));
    await system.db.collection("users").insertMany(newUsers);
  }
}

// ---------------------------------------------------------------------------
// login (mirrors tasks.load-generator/login)
// POST /login with credentials, then GET / to get CSRF token
// ---------------------------------------------------------------------------

async function login(
  username: string,
  password: string,
): Promise<Record<string, string>> {
  // POST /login (mirrors: http/post "http://localhost:1042/login" options)
  const postRes = await httpRequest("POST", "http://localhost:1042/login", {
    formParams: { username, password },
  });

  if (postRes.error || postRes.status === 401) {
    safePrintln(
      "Login failed for",
      username,
      ":",
      postRes.error?.message || postRes.status,
    );
    return {};
  }

  const postCookie = ((postRes.headers["set-cookie"] as string) ||
    "") as string;

  // GET / to get CSRF token (mirrors: http/get "http://localhost:1042" ...)
  const getRes = await httpRequest("GET", "http://localhost:1042", {
    headers: { Cookie: postCookie },
    asText: true,
  });

  if (getRes.error || getRes.status === 401) {
    safePrintln(
      "Login failed for",
      username,
      ":",
      getRes.error?.message || getRes.status,
    );
    return {};
  }

  // Extract CSRF token from HTML (mirrors: re-find #"data-csrf-token=\"(.*?)\"" ...)
  const csrfMatch = getRes.body?.match(/data-csrf-token="([^"]+)"/);
  const csrfToken = csrfMatch ? csrfMatch[1] : "";

  const getCookie = ((getRes.headers["set-cookie"] as string) || "") as string;

  return {
    Origin: "http://localhost:1042",
    Cookie: `${postCookie}; ${getCookie}`,
    "X-CSRF-Token": csrfToken,
  };
}

// ---------------------------------------------------------------------------
// create-game (mirrors tasks.load-generator/create-game)
// Creates WebSocket connections and sends lobby/deck/start messages
// ---------------------------------------------------------------------------

async function createGame(system: TaskSystem, maxUsers: number): Promise<void> {
  await addTestUsers(system, maxUsers);

  const corpClientId = randomUUID();
  const runnerClientId = randomUUID();

  const corpLogin = await login("TestCorp", "password");
  const runnerLogin = await login("TestRunner", "password");

  const corpDecks = (await system.db
    .collection("decks")
    .find({ username: "TestCorp" })
    .toArray()) as {
    _id: unknown;
    identity?: { side?: string };
  }[];
  const runnerDecks = (await system.db
    .collection("decks")
    .find({ username: "TestRunner" })
    .toArray()) as {
    _id: unknown;
    identity?: { side?: string };
  }[];

  // Set max text message size (mirrors: (.setMaxTextMessageSize (.getPolicy client) (* 1024 1024)))
  const maxPayloadBytes = 1024 * 1024;

  // Corp WebSocket connection (mirrors: gniazdo/connect)
  safePrintln("Login Corp");
  const corpCsrf = encodeURIComponent(corpLogin["X-CSRF-Token"] || "");
  const corpWsUrl = `ws://localhost:1042/chsk?client-id=${corpClientId}&csrf-token=${corpCsrf}`;
  const corpWs = new WebSocket(corpWsUrl, {
    headers: corpLogin,
    maxPayload: maxPayloadBytes,
  });

  corpWs.on("open", () => safePrintln("Corp Connected"));
  corpWs.on("error", (err: Error) => safePrintln("corp error", err.message));
  corpWs.on("close", () => safePrintln("Corp Disconnected"));

  await new Promise<void>((resolve) => {
    corpWs.on("open", () => resolve());
  });

  // Runner WebSocket connection
  safePrintln("Login Runner");
  const runnerCsrf = encodeURIComponent(runnerLogin["X-CSRF-Token"] || "");
  const runnerWsUrl = `ws://localhost:1042/chsk?client-id=${runnerClientId}&csrf-token=${runnerCsrf}`;
  const runnerWs = new WebSocket(runnerWsUrl, {
    headers: runnerLogin,
    maxPayload: maxPayloadBytes,
  });

  runnerWs.on("open", () => safePrintln("Runner Connected"));
  runnerWs.on("error", (err: Error) =>
    safePrintln("runner error", err.message),
  );
  runnerWs.on("close", () => safePrintln("Runner Disconnected"));

  await new Promise<void>((resolve) => {
    runnerWs.on("open", () => resolve());
  });

  // Create lobby (mirrors: game-ws-handler/-msg-handler with :lobby/create)
  safePrintln("Create lobby");
  const createLobbyMsg: WsMessage = {
    id: "lobby/create",
    "ring-req": { user: { username: "TestCorp" } },
    "client-id": corpClientId,
    uid: "TestCorp",
    "?data": {
      title: "Performance Game",
      format: "standard",
      "allow-spectator": true,
      spectatorhands: false,
      password: "",
      room: "casual",
      side: "Corp",
      options: {},
    },
  };
  corpWs.send(JSON.stringify(createLobbyMsg));

  // Wait for server to process the create lobby
  await new Promise((r) => setTimeout(r, 500));

  // Find the game ID (mirrors: (first (first @all-games)))
  const games = (await system.db.collection("games").find({}).toArray()) as {
    _id: unknown;
  }[];
  const gameId = games.length > 0 ? games[0]._id : null;
  if (!gameId) {
    safePrintln("No game found after creating lobby");
    return;
  }
  const gameIdStr = typeof gameId === "string" ? gameId : String(gameId);

  // Runner join (mirrors: :lobby/join)
  const joinMsg: WsMessage = {
    id: "lobby/join",
    "ring-req": {
      "system/db": system.db,
      user: { username: "TestRunner" },
    },
    "client-id": runnerClientId,
    uid: "TestRunner",
    "?data": { gameid: gameIdStr, password: "" },
  };
  runnerWs.send(JSON.stringify(joinMsg));

  await new Promise((r) => setTimeout(r, 200));

  // Select Corp deck (mirrors: :lobby/deck with Corp deck)
  const corpDeck = corpDecks.find((d) => d.identity?.side === "Corp");
  if (corpDeck) {
    const deckMsg1: WsMessage = {
      id: "lobby/deck",
      "ring-req": {
        "system/db": system.db,
        user: { username: "TestCorp" },
      },
      uid: "TestCorp",
      "client-id": corpClientId,
      "?data": String(corpDeck._id),
    };
    corpWs.send(JSON.stringify(deckMsg1));
  }

  // Select Runner deck (mirrors: :lobby/deck with Runner deck)
  const runnerDeck = runnerDecks.find((d) => d.identity?.side === "Runner");
  if (runnerDeck) {
    const deckMsg2: WsMessage = {
      id: "lobby/deck",
      "ring-req": {
        "system/db": system.db,
        user: { username: "TestRunner" },
      },
      uid: "TestRunner",
      "client-id": runnerClientId,
      "?data": String(runnerDeck._id),
    };
    runnerWs.send(JSON.stringify(deckMsg2));
  }

  await new Promise((r) => setTimeout(r, 200));

  // Connect spectators (mirrors: pmap for spectators)
  const sockets: WebSocket[] = [];
  for (let n = 0; n < maxUsers; n++) {
    const userClientID = randomUUID();
    const username = `TestUser${n}`;
    const creds = await login(username, "password");

    const spectatorCsrf = encodeURIComponent(creds["X-CSRF-Token"] || "");
    const spectatorUrl = `ws://localhost:1042/chsk?client-id=${userClientID}&csrf-token=${spectatorCsrf}`;
    const socket = new WebSocket(spectatorUrl, {
      headers: creds,
      maxPayload: maxPayloadBytes,
    });

    socket.on("error", () => safePrintln("spectator error"));
    socket.on("close", () => safePrintln("closed"));

    // Wait for connection before sending watch message
    await new Promise<void>((resolve) => {
      socket.on("open", () => resolve());
    });

    const watchMsg: WsMessage = {
      id: "lobby/watch",
      "ring-req": {
        "system/db": system.db,
        user: { username },
      },
      "client-id": userClientID,
      "?data": { gameid: gameIdStr, password: "" },
    };
    socket.send(JSON.stringify(watchMsg));

    sockets.push(socket);
  }

  safePrintln("Spectators connected");

  // Start game (mirrors: :game/start)
  const startMsg: WsMessage = {
    id: "game/start",
    "ring-req": {
      "system/db": system.db,
      user: { username: "TestCorp" },
    },
    uid: "TestCorp",
    "client-id": corpClientId,
  };
  corpWs.send(JSON.stringify(startMsg));
  safePrintln("Started game");

  // Close spectator sockets
  for (const s of sockets) {
    s.close();
  }
  corpWs.close();
  runnerWs.close();
}

// ---------------------------------------------------------------------------
// CLI parsing (mirrors clojure.tools.cli parse-opts)
// ---------------------------------------------------------------------------

interface ParseResult {
  options: { num: number };
  errors: string[];
  extraArgs: string[];
}

function parseArgs(args: string[]): ParseResult {
  const options = { num: 1000 };
  const errors: string[] = [];
  const extraArgs: string[] = [];

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg === "-n" || arg === "--num") {
      const val = args[++i];
      if (!val) {
        errors.push("--num requires a NUM argument");
      } else {
        const num = parseInt(val, 10);
        if (isNaN(num) || num <= 0 || num >= 0x10000) {
          errors.push(`Must be a number between 0 and 65536 (got ${val})`);
        } else {
          options.num = num;
        }
      }
    } else {
      extraArgs.push(arg);
    }
    i++;
  }

  return { options, errors, extraArgs };
}

// ---------------------------------------------------------------------------
// Usage text (mirrors tasks.load-generator/usage)
// ---------------------------------------------------------------------------

function usage(optionsSummary: string): string {
  return [
    "",
    "Usage: lein load-generator [options]",
    "",
    "Options:",
    optionsSummary,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Exit helper (mirrors tasks.load-generator/exit)
// ---------------------------------------------------------------------------

function exit(status: number, msg: string): never {
  process.stderr.write(msg + "\n");
  process.exit(status);
}

// ---------------------------------------------------------------------------
// command (mirrors tasks.load-generator/command)
// Main entry point: parse args, start system, create game, shutdown hook
// ---------------------------------------------------------------------------

async function command(...args: string[]): Promise<void> {
  const { options, errors, extraArgs } = parseArgs(args);

  if (errors.length > 0 || extraArgs.length > 0) {
    const allErrors = [...errors];
    if (extraArgs.length > 0) {
      allErrors.push(`Unexpected arguments: ${extraArgs.join(", ")}`);
    }
    exit(1, allErrors.join("\n") + "\n" + usage(""));
  }

  const system = await connect();

  await createGame(system, options.num);

  // Shutdown hook (mirrors: (.addShutdownHook (Runtime/getRuntime) (Thread. #(stop system))))
  const shutdown = () => {
    disconnect(system);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  await command(...process.argv.slice(2));
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

export {
  connect,
  disconnect,
  createGame,
  addTestUsers,
  login,
  parseArgs,
  usage,
  exit,
  command,
};
