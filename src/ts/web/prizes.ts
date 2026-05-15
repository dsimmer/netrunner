// Prizes management module. Mirrors: src/clj/web/prizes.clj
//
// Handles loading and updating prize data for users by moderators/admins.

import { Db } from "mongodb";
import { registerMsgHandler, broadcastTo, type WSMessage } from "./ws";
import { activeUser } from "./user";
import { response } from "./utils";

// ---- Types ----

interface WSMessageWithReq extends WSMessage {
  "ring-req"?: {
    system?: {
      db?: Db;
    };
    user?: Record<string, unknown>;
  };
}

// ---- Utility helpers ----

/**
 * Auth check endpoint (unused in current routing, kept for compatibility).
 * Mirrors: (defn auth [_] (response 200 {:message "ok"}))
 */
export function auth(_req: unknown): { status: number; body: Record<string, string>; headers: Record<string, string> } {
  return response(200, { message: "ok" });
}

// ---- WebSocket message handlers ----

registerMsgHandler("prizes/load-user", async (msg: WSMessageWithReq) => {
  const ringReq = msg["ring-req"];
  const db = ringReq?.system?.db;
  const user = ringReq?.user;
  const data = msg.data as Record<string, unknown> | undefined;
  const uid = msg.uid;

  const username = data?.username as string | undefined;

  if (!activeUser(user as any) || (!user?.ismoderator && !user?.isadmin)) {
    await broadcastTo(uid ? [uid] : [], "prizes/load-user", { error: "Not allowed" });
    return;
  }

  if (!db || !username) {
    await broadcastTo(uid ? [uid] : [], "prizes/load-user", { error: "No such user" });
    return;
  }

  const foundUser = await db
    .collection("users")
    .findOne(
      { username },
      { projection: { _id: 1, username: 1, options: 1 } },
    );

  if (!foundUser) {
    await broadcastTo(uid ? [uid] : [], "prizes/load-user", { error: "No such user" });
    return;
  }

  const result = {
    _id: String(foundUser._id),
    username: foundUser.username,
    prizes: (foundUser.options as any)?.prizes,
  };

  await broadcastTo(uid ? [uid] : [], "prizes/load-user", { success: result });
});

registerMsgHandler("prizes/update-user", async (msg: WSMessageWithReq) => {
  const ringReq = msg["ring-req"];
  const db = ringReq?.system?.db;
  const user = ringReq?.user;
  const data = msg.data as Record<string, unknown> | undefined;
  const uid = msg.uid;

  const username = data?.username as string | undefined;
  const prizes = data?.prizes;

  if (!activeUser(user as any) || (!user?.ismoderator && !user?.isadmin)) {
    await broadcastTo(uid ? [uid] : [], "prizes/update-user", {
      error: `failed updating prizes for ${username ?? "unknown"}`,
    });
    return;
  }

  if (!db || !username) {
    await broadcastTo(uid ? [uid] : [], "prizes/update-user", {
      error: `failed updating prizes for ${username ?? "unknown"}`,
    });
    return;
  }

  const foundUser = await db
    .collection("users")
    .findOne(
      { username },
      { projection: { _id: 1, username: 1, options: 1 } },
    );

  if (!foundUser) {
    await broadcastTo(uid ? [uid] : [], "prizes/update-user", {
      error: `failed updating prizes for ${username}`,
    });
    return;
  }

  const newOptions = { ...(foundUser.options as any), prizes };

  const result = await db
    .collection("users")
    .updateOne(
      { username },
      { $set: { options: newOptions } },
    );

  if (result.acknowledged) {
    await broadcastTo(uid ? [uid] : [], "prizes/update-user", {
      success: `updated prizes for ${username}`,
    });
  } else {
    await broadcastTo(uid ? [uid] : [], "prizes/update-user", {
      error: `failed updating prizes for ${username}`,
    });
  }
});
