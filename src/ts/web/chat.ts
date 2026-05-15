// Chat module. Mirrors: src/clj/web/chat.clj
// Handles chat message retrieval, sending, and moderation (deletion) via WebSocket and HTTP.

import { Db, ObjectId } from "mongodb";
import { response, mongoTimeToUtcString, type HttpResponse } from "./utils";
import { toObjectId } from "./mongodb";
import { activeUser, visibleToUser, type User } from "./user";
import { getAllUsers } from "./app_state";
import { connectedUids, broadcastTo, registerMsgHandler, type WSMessage } from "./ws";
import { logDelay } from "./lobby";

// ---- Constants ----

const MSG_COLLECTION = "messages";
const LOG_COLLECTION = "moderator_actions";

// ---- Types ----

interface ChatSettings {
  "max-length"?: number;
  "rate-window"?: number;
  "rate-cnt"?: number;
}

interface ChatMessage {
  _id?: ObjectId | string;
  emailhash: string;
  username: string;
  pronouns?: string;
  msg: string;
  channel: string;
  date: Date;
}

interface WSMessageWithReq extends WSMessage {
  ringReq?: {
    system?: {
      db?: Db;
      chatSettings?: ChatSettings;
    };
    user?: User;
  };
  pathParams?: Record<string, string>;
}

// ---- Helpers ----

function chatMaxLength(chatSettings: ChatSettings | undefined): number {
  return chatSettings?.["max-length"] ?? 144;
}

async function blockedByUser(
  db: Db,
  username: string,
): Promise<{ username: string; blocks: Record<string, unknown> | null }> {
  const blocks = await db
    .collection("users")
    .findOne(
      { username },
      { projection: { username: 1, "options.blocked-users": 1, _id: 0 } },
    );
  return { username, blocks };
}

function withinRateLimit(
  db: Db,
  chatSettings: ChatSettings | undefined,
  username: string,
): Promise<boolean> {
  const window = chatSettings?.["rate-window"] ?? 60;
  const startDate = new Date(Date.now() - window * 1000);
  const maxCnt = chatSettings?.["rate-cnt"] ?? 10;
  return db
    .collection(MSG_COLLECTION)
    .countDocuments({ username, date: { $gt: startDate } })
    .then((msgCnt) => msgCnt < maxCnt);
}

// ---- HTTP Handlers ----

/**
 * GET /chat/config
 * Returns chat configuration (max message length).
 */
export function configHandler(
  req: { system?: { chatSettings?: ChatSettings } },
  _res: unknown,
): HttpResponse {
  const chatSettings = req.system?.chatSettings;
  return response(200, { "max-length": chatMaxLength(chatSettings) });
}

/**
 * GET /messages/:channel
 * Returns the last 100 messages for the given channel, filtered by user visibility.
 */
export async function messagesHandler(
  req: WSMessageWithReq,
  _res: unknown,
): Promise<HttpResponse> {
  const db = req.ringReq?.system?.db;
  const user = req.ringReq?.user;
  const channel = req.pathParams?.channel;

  if (!user || !db || !channel) {
    return response(200, []);
  }

  const collection = db.collection<ChatMessage>(MSG_COLLECTION);
  let messages = await collection
    .find({ channel })
    .sort({ date: -1 })
    .limit(100)
    .toArray();
  messages = messages.reverse();

  // Convert date to UTC string
  const messagesWithStringDate: Record<string, unknown>[] = messages.map((msg) => ({
    ...msg,
    date: mongoTimeToUtcString(msg.date),
  }));

  // Build sender -> blocks map
  const senderUsernames = Array.from(
    new Set(messagesWithStringDate.map((m) => m.username as string)),
  );
  const blocksResults = await Promise.all(
    senderUsernames.map((username) => blockedByUser(db, username)),
  );
  const senders: Record<string, { username: string; blocks: Record<string, unknown> | null }> =
    Object.fromEntries(blocksResults.map((r) => [r.username, r]));

  // Determine visible senders
  const connectedUsers = getAllUsers();
  const connectedUsersRecord: Record<string, User> = Object.fromEntries(
    Array.from(connectedUsers.entries()).map(([k, v]) => [k, v as unknown as User]),
  );

  const visibleUsers = new Set(
    senderUsernames
      .filter(
        (username) =>
          username === user.username ||
          visibleToUser(user, { username } as User, connectedUsersRecord),
      ),
  );

  // Filter messages to only visible senders
  const filtered = messagesWithStringDate.filter((msg) =>
    visibleUsers.has(msg.username as string),
  );

  return response(200, filtered);
}

// ---- WebSocket Handlers ----

/**
 * WS handler for sending chat messages.
 * Mirrors: defmethod -msg-handler :chat/say chat--say
 */
registerMsgHandler("chat/say", async (msg: WSMessageWithReq) => {
  const ringReq = msg.ringReq ?? {};
  const db = ringReq.system?.db;
  const chatSettings = ringReq.system?.chatSettings;
  const user = ringReq.user;
  const uid = msg.uid;
  const data = msg.data as { channel?: string; msg?: string } | undefined;
  const channel = data?.channel;
  const msgText = data?.msg;
  const id = msg.id;
  const timestamp = msg.timestamp;

  const active = activeUser(user);
  if (active && msgText && msgText.trim().length > 0 && db) {
    const lenValid = msgText.length <= chatMaxLength(chatSettings);
    const rateValid = await withinRateLimit(db, chatSettings, active.username);

    if (lenValid && rateValid) {
      const collection = db.collection<ChatMessage>(MSG_COLLECTION);
      const message: ChatMessage = {
        emailhash: active.emailhash,
        username: active.username,
        pronouns: active.options?.pronouns,
        msg: msgText,
        channel: channel ?? "",
        date: new Date(),
      };
      const result = await collection.insertOne(message);
      const inserted = { ...message, _id: result.insertedId };
      // Convert _id and date to strings for transmission
      (inserted as Record<string, unknown>)._id = String(
        (inserted._id as ObjectId | string).toString(),
      );
      (inserted as Record<string, unknown>).date = (inserted.date as Date).toString();

      const connectedUsers = getAllUsers();
      const connectedUsersRecord: Record<string, User> = Object.fromEntries(
        Array.from(connectedUsers.entries()).map(([k, v]) => [
          k,
          v as unknown as User,
        ]),
      );

      for (const targetUid of connectedUids()) {
        if (
          targetUid === active.username ||
          visibleToUser(active, { username: targetUid } as User, connectedUsersRecord)
        ) {
          broadcastTo([targetUid], "chat/message", inserted);
        }
      }
    } else if (uid) {
      broadcastTo(
        [uid],
        "chat/blocked",
        { reason: lenValid ? "rate-exceeded" : "length-exceeded" },
      );
    }
  }

  logDelay(timestamp ?? 0, id ?? "");
});

/**
 * WS handler for deleting a single chat message (moderator action).
 * Mirrors: defmethod -msg-handler :chat/delete-msg chat--delete-msg
 */
registerMsgHandler("chat/delete-msg", async (msg: WSMessageWithReq) => {
  const ringReq = msg.ringReq ?? {};
  const db = ringReq.system?.db;
  const user = ringReq.user;
  const data = msg.data as { msg?: Record<string, unknown> } | undefined;
  const msgData = data?.msg;
  const id = msg.id;
  const timestamp = msg.timestamp;

  if (msgData && db && user) {
    const msgId = msgData._id as string | undefined;
    if (msgId && (user.isadmin || user.ismoderator)) {
      console.info(
        `[mod-action] ${user.username} deleted message ${JSON.stringify(msgData)}\n`,
      );
      await db
        .collection(MSG_COLLECTION)
        .deleteOne({ _id: toObjectId(msgId) });
      await db.collection(LOG_COLLECTION).insertOne({
        moderator: user.username,
        action: "delete-message",
        date: new Date(),
        msg: msgData,
      });
      for (const uid of connectedUids()) {
        broadcastTo([uid], "chat/delete-msg", msgData);
      }
    }
  }

  logDelay(timestamp ?? 0, id ?? "");
});

/**
 * WS handler for deleting all messages from a user (moderator action).
 * Mirrors: defmethod -msg-handler :chat/delete-all chat--delete-all
 */
registerMsgHandler("chat/delete-all", async (msg: WSMessageWithReq) => {
  const ringReq = msg.ringReq ?? {};
  const db = ringReq.system?.db;
  const user = ringReq.user;
  const data = msg.data as { sender?: string } | undefined;
  const sender = data?.sender;
  const id = msg.id;
  const timestamp = msg.timestamp;

  if (sender && db && user && (user.isadmin || user.ismoderator)) {
    console.info(
      `[mod-action] ${user.username} deleted all messages from user ${sender}\n`,
    );
    await db.collection(MSG_COLLECTION).deleteMany({ username: sender });
    await db.collection(LOG_COLLECTION).insertOne({
      moderator: user.username,
      action: "delete-all-messages",
      date: new Date(),
      sender,
    });
    for (const uid of connectedUids()) {
      broadcastTo([uid], "chat/delete-all", { username: sender });
    }
  }

  logDelay(timestamp ?? 0, id ?? "");
});
