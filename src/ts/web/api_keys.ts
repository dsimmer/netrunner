// API Keys management. Mirrors: src/clj/web/api_keys.clj
//
// Handles listing, creating, and deleting API keys for authenticated users.

import { randomUUID } from "crypto";
import { Db, Document, ObjectId } from "mongodb";
import { mongoTimeToUtcString, response, type HttpResponse } from "./utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ApiKeysRequest {
  system?: { db?: Db };
  user?: { username?: string };
}

interface ApiKeysDeleteRequest extends ApiKeysRequest {
  "path-params"?: { id?: string };
}

// ---------------------------------------------------------------------------
// HTTP Handlers
// ---------------------------------------------------------------------------

export async function apiKeysHandler(
  req: ApiKeysRequest,
): Promise<HttpResponse> {
  const db = req.system?.db;
  const username = req.user?.username;

  if (!username) {
    return response(401, { message: "Unauthorized" });
  }

  if (!db) {
    return response(500, { message: "No database" });
  }

  const keys = await db
    .collection<Document>("api-keys")
    .find({ username })
    .toArray();

  const converted = keys.map((k: Document) => ({
    ...k,
    date: mongoTimeToUtcString(k.date),
  }));

  return response(200, converted);
}

export async function apiKeysCreateHandler(
  req: ApiKeysRequest,
): Promise<HttpResponse> {
  const db = req.system?.db;
  const username = req.user?.username;

  if (!username) {
    return response(401, { message: "Unauthorized" });
  }

  if (!db) {
    return response(500, { message: "No database" });
  }

  const newKey = randomUUID();

  const result = await db.collection<Document>("api-keys").insertOne({
    username,
    date: new Date(),
    "api-key": newKey,
  });

  if (result.acknowledged) {
    const userUpdateResult = await db
      .collection<Document>("users")
      .updateOne({ username }, { $set: { "has-api-keys": true } });

    if (userUpdateResult.acknowledged) {
      return response(201, { message: "Created API Key" });
    }
    return response(500, { message: "Failed to update user info" });
  }
  return response(500, { message: "Failed to create API Key" });
}

export async function apiKeysDeleteHandler(
  req: ApiKeysDeleteRequest,
): Promise<HttpResponse> {
  const db = req.system?.db;
  const username = req.user?.username;
  const id = req["path-params"]?.id;

  try {
    if (!username || !id) {
      return response(401, { message: "Unauthorized" });
    }

    if (!db) {
      return response(403, { message: "Forbidden" });
    }

    const result = await db
      .collection<Document>("api-keys")
      .deleteOne({ _id: new ObjectId(id), username });

    if (result.acknowledged) {
      const keyCount = await db
        .collection<Document>("api-keys")
        .countDocuments({ username });

      if (keyCount === 0) {
        await db.collection<Document>("users").updateOne(
          { username },
          { $set: { "has-api-keys": false } },
        );
      }
      return response(200, { message: "Deleted" });
    }
    return response(403, { message: "Forbidden" });
  } catch {
    return response(409, { message: "Unknown API Key" });
  }
}
