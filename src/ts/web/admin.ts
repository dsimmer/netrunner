// Admin API endpoints. Mirrors: src/clj/web/admin.clj
//
// Handles admin-only operations: news management, version control,
// banned message configuration, user management, and IP bans.
// WebSocket handlers are registered in this module for admin WS operations.

import { Db, UpdateResult, DeleteResult, InsertOneResult, Document, WithId } from "mongodb";
import { ObjectId } from "mongodb";
import { response, type HttpResponse } from "./utils";
import { registerMsgHandler, broadcastTo, connectedUids, chskSend, type WSMessage } from "./ws";
import { activeUser } from "./user";
import { superuser } from "../jinteki/utils";
import { setFrontendVersion, setBannedMsg } from "./versions";
import { getAppState, swapAppState } from "./app_state";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NewsRequest {
  system?: { db?: Db };
  body?: { item?: string };
}

interface NewsDeleteRequest {
  system?: { db?: Db };
  "path-params"?: { id?: string };
}

interface VersionRequest {
  system?: { db?: Db };
}

interface VersionUpdateRequest {
  system?: { db?: Db };
  body?: { version?: string };
}

interface BannedMessageRequest {
  system?: { db?: Db };
}

interface BannedMessageUpdateRequest {
  system?: { db?: Db };
  body?: { banned?: string };
}

interface WSMessageWithReq extends WSMessage {
  "ring-req"?: {
    system?: { db?: Db };
    user?: Record<string, unknown>;
  };
}

// ---------------------------------------------------------------------------
// HTTP Handlers
// ---------------------------------------------------------------------------

export async function newsCreateHandler(req: NewsRequest): Promise<HttpResponse> {
  const db = req.system?.db;
  const item = req.body?.item;

  if (!db || !item || item.trim() === "") {
    return response(400, { message: "Missing news item" });
  }

  await db.collection("news").insertOne({
    _id: new ObjectId(),
    item,
    date: new Date(),
  });

  return response(200, { message: "ok" });
}

export async function newsDeleteHandler(req: NewsDeleteRequest): Promise<HttpResponse> {
  const db = req.system?.db;
  const id = req["path-params"]?.id;

  if (!id) {
    return response(400, { message: "Missing new items id" });
  }

  try {
    if (!db) {
      return response(403, { message: "Forbidden" });
    }

    const result: DeleteResult = await db.collection("news").deleteOne({ _id: new ObjectId(id) });

    if (result.acknowledged) {
      return response(200, { message: "Deleted" });
    }
    return response(403, { message: "Forbidden" });
  } catch {
    return response(409, { message: "Unknown news item id" });
  }
}

export async function versionHandler(req: VersionRequest): Promise<HttpResponse> {
  const db = req.system?.db;

  if (!db) {
    return response(200, { message: "ok", version: "0.0" });
  }

  const config = await db.collection<WithId<Document>>("config").findOne({});
  const version = config?.version as string | undefined;
  return response(200, { message: "ok", version: version || "0.0" });
}

export async function versionUpdateHandler(req: VersionUpdateRequest): Promise<HttpResponse> {
  const db = req.system?.db;
  const version = req.body?.version;

  if (!version || version.trim() === "") {
    return response(400, { message: "Missing version item" });
  }

  if (!db) {
    return response(500, { message: "No database" });
  }

  setFrontendVersion(version);
  await db.collection("config").updateOne({}, { $set: { version } });
  return response(200, { message: "ok", version });
}

export async function bannedMessageHandler(req: BannedMessageRequest): Promise<HttpResponse> {
  const db = req.system?.db;

  if (!db) {
    return response(200, { message: "ok", banned: "Account is locked" });
  }

  const config = await db.collection<WithId<Document>>("config").findOne({});
  const banned = (config?.["banned-msg"] as string | undefined) || "Account is locked";
  return response(200, { message: "ok", banned });
}

export async function bannedMessageUpdateHandler(req: BannedMessageUpdateRequest): Promise<HttpResponse> {
  const db = req.system?.db;
  const banned = req.body?.banned;

  if (!banned || banned.trim() === "") {
    return response(400, { message: "Missing banned message item" });
  }

  if (!db) {
    return response(500, { message: "No database" });
  }

  setBannedMsg(banned);
  await db.collection("config").updateOne({}, { $set: { "banned-msg": banned } });
  return response(200, { message: "ok", banned });
}

// ---------------------------------------------------------------------------
// WebSocket message handlers
// ---------------------------------------------------------------------------

const userCollection = "users";
const ipBanCollection = "ip-bans";

const userTypeToField: Record<string, string> = {
  mods: "ismoderator",
  specials: "special",
  tos: "tournament-organizer",
  banned: "banned",
};

function lastIpAddress(user: Record<string, unknown>): string | undefined {
  return (user as any)["last-ip-address"] || (user as any).lastIpAddress;
}

registerMsgHandler("admin/announce", async (msg: WSMessageWithReq) => {
  const ringReq = msg["ring-req"];
  const user = ringReq?.user;
  const data = msg.data as Record<string, unknown> | undefined;
  const message = data?.message as string | undefined;
  const replyFn = msg.replyFn;

  if (!superuser(user as any)) {
    if (replyFn) replyFn(403);
    return;
  }
  if (!message || message.trim() === "") {
    if (replyFn) replyFn(400);
    return;
  }

  for (const uid of connectedUids()) {
    chskSend(uid, ["lobby/toast", { message, type: "warning" }]);
  }

  if (replyFn) replyFn(200);
});

registerMsgHandler("admin/edit-user", async (msg: WSMessageWithReq) => {
  const ringReq = msg["ring-req"];
  const db = ringReq?.system?.db;
  const user = ringReq?.user;
  const data = msg.data as Record<string, unknown> | undefined;
  const uid = msg.uid ?? "";

  const action = data?.action;
  const userType = data?.["user-type"];
  const username = data?.username as string | undefined;

  const userIsActive = activeUser(user as any);
  const isAdmin = (user as any)?.isadmin;
  const isModerator = (user as any)?.ismoderator;
  const allowedModeratorTypes = ["specials", "tos", "banned"];

  if (userIsActive && (isAdmin || (isModerator && allowedModeratorTypes.includes(userType as string))) && username) {
    const field = userTypeToField[userType as string];
    const value = action === "admin/add-user" ? true : action === "admin/remove-user" ? false : null;

    if (field && value !== null && db) {
      const result: UpdateResult = await db.collection(userCollection).updateOne(
        { username },
        { $set: { [field]: value } },
      );

      const modified = result.modifiedCount > 0;

      if (modified) {
        const foundUser = await db.collection<WithId<Document>>(userCollection).findOne(
          { username },
          { projection: { _id: 1, username: 1 } },
        );

        if (foundUser) {
          const updatedUser = {
            _id: String(foundUser._id),
            username: foundUser.username as string,
          };

          broadcastTo([uid], "admin/user-edit", { success: { ...data, user: updatedUser } });

          if (userType === "banned") {
            const appState = getAppState();
            const connectedUsers = appState.users;
            for (const connectedUser of Object.values(connectedUsers)) {
              if ((connectedUser as Record<string, unknown>).username === username) {
                const connectedUid = (connectedUser as Record<string, unknown>).uid as string;
                if (connectedUid) {
                  broadcastTo([connectedUid], "system/force-disconnect", {});
                }
                break;
              }
            }
          }
          return;
        }
      }
      broadcastTo([uid], "admin/user-edit", { error: "Not found" });
    } else {
      broadcastTo([uid], "admin/user-edit", { error: "Not allowed" });
    }
  } else {
    broadcastTo([uid], "admin/user-edit", { error: "Not allowed" });
  }
});

registerMsgHandler("admin/look-up-ip", async (msg: WSMessageWithReq) => {
  const ringReq = msg["ring-req"];
  const db = ringReq?.system?.db;
  const user = ringReq?.user;
  const data = msg.data as Record<string, unknown> | undefined;
  const uid = msg.uid ?? "";
  const username = data?.username as string | undefined;

  if (activeUser(user as any) && ((user as any)?.ismoderator || (user as any)?.isadmin)) {
    if (db && username) {
      const res = await db.collection(userCollection).findOne(
        { username },
        { projection: { username: 1, lastIpAddress: 1, "last-ip-address": 1, _id: 0 } },
      );

      if (res) {
        broadcastTo([uid], "admin/look-up-ip", {
          success: {
            username: res.username,
            "last-ip-address": lastIpAddress(res as unknown as Record<string, unknown>),
          },
        });
      } else {
        broadcastTo([uid], "admin/look-up-ip", { error: "Not found" });
      }
    } else {
      broadcastTo([uid], "admin/look-up-ip", { error: "Not found" });
    }
  } else {
    broadcastTo([uid], "admin/look-up-ip", { error: "Not allowed" });
  }
});

registerMsgHandler("admin/fetch-ip-bans", async (msg: WSMessageWithReq) => {
  const ringReq = msg["ring-req"];
  const db = ringReq?.system?.db;
  const user = ringReq?.user;
  const uid = msg.uid ?? "";

  if (activeUser(user as any) && ((user as any)?.ismoderator || (user as any)?.isadmin)) {
    if (db) {
      const ipBans = await db.collection(ipBanCollection).find({}).project({
        username: 1,
        "ip-address": 1,
        _id: 0,
      }).toArray();

      broadcastTo([uid], "admin/fetch-ip-bans", { success: ipBans });
    }
  } else {
    broadcastTo([uid], "admin/fetch-ip-bans", { error: "Not allowed" });
  }
});

registerMsgHandler("admin/ip-ban-user", async (msg: WSMessageWithReq) => {
  const ringReq = msg["ring-req"];
  const db = ringReq?.system?.db;
  const user = ringReq?.user;
  const data = msg.data as Record<string, unknown> | undefined;
  const uid = msg.uid ?? "";
  const username = data?.username as string | undefined;

  if (activeUser(user as any) && ((user as any)?.ismoderator || (user as any)?.isadmin)) {
    if (db && username) {
      const res = await db.collection(userCollection).findOne(
        { username },
        { projection: { username: 1, lastIpAddress: 1, "last-ip-address": 1, _id: 0 } },
      );

      if (res) {
        const ip = lastIpAddress(res as unknown as Record<string, unknown>);
        if (ip) {
          console.log("res: ", res);
          console.log("ip: ", ip);
          await db.collection(ipBanCollection).insertOne({ username, "ip-address": ip });
          broadcastTo([uid], "admin/ip-ban-user", { success: { username, "ip-address": ip } });
        } else {
          broadcastTo([uid], "admin/ip-ban-user", { error: "Legacy user? No IP Address on record" });
        }
      } else {
        broadcastTo([uid], "admin/ip-ban-user", { error: "Not found" });
      }
    }
  } else {
    broadcastTo([uid], "admin/ip-ban-user", { error: "Not allowed" });
  }
});

registerMsgHandler("admin/ip-unban-user", async (msg: WSMessageWithReq) => {
  const ringReq = msg["ring-req"];
  const db = ringReq?.system?.db;
  const user = ringReq?.user;
  const data = msg.data as Record<string, unknown> | undefined;
  const uid = msg.uid ?? "";
  const username = data?.username as string | undefined;

  if (activeUser(user as any) && ((user as any)?.ismoderator || (user as any)?.isadmin)) {
    if (db && username) {
      const result: DeleteResult = await db.collection(ipBanCollection).deleteOne({ username });

      if (result.deletedCount! > 0) {
        broadcastTo([uid], "admin/ip-unban-user", { success: username });
      } else {
        broadcastTo([uid], "admin/ip-unban-user", { error: "Not found" });
      }
    }
  } else {
    broadcastTo([uid], "admin/ip-unban-user", { error: "Not allowed" });
  }
});

registerMsgHandler("admin/fetch-users", async (msg: WSMessageWithReq) => {
  const ringReq = msg["ring-req"];
  const db = ringReq?.system?.db;
  const user = ringReq?.user;
  const uid = msg.uid ?? "";

  if (activeUser(user as any) && ((user as any)?.ismoderator || (user as any)?.isadmin)) {
    if (db) {
      const users = await db.collection<WithId<Document>>(userCollection).find({
        $or: [
          { ismoderator: true },
          { special: { $exists: true } },
          { "tournament-organizer": true },
          { banned: true },
        ],
      }).project({
        _id: 1, username: 1, ismoderator: 1, special: 1,
        "tournament-organizer": 1, banned: 1,
      }).toArray();

      const converted = users.map((u: Document) => ({
        ...u,
        _id: String((u as WithId<Document>)._id),
      }));

      broadcastTo([uid], "admin/fetch-users", { success: converted });
    }
  } else {
    broadcastTo([uid], "admin/fetch-users", { error: "Not allowed" });
  }
});

registerMsgHandler("admin/block-game-creation", async (msg: WSMessageWithReq) => {
  const ringReq = msg["ring-req"];
  const user = ringReq?.user;
  const blockGameCreation = msg.data as boolean | undefined;

  if (activeUser(user as any) && ((user as any)?.ismoderator || (user as any)?.isadmin)) {
    const block = Boolean(blockGameCreation);
    swapAppState((state) => ({ ...state, "block-game-creation": block }));
    if (msg.replyFn) {
      msg.replyFn(block);
    }
  }
});
