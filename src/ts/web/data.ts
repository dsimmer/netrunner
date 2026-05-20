// Data endpoints for the web layer.
// Mirrors: src/clj/web/data.clj

import { Db } from "mongodb";
import { response, mongoTimeToUtcString, type HttpResponse } from "./utils";
import { getContent } from "../jinteki/i18n";
import { cardImplemented } from "../game/core/initializing";
import type { Card } from '../types';


// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Request {
  system?: {
    db?: Db;
  };
  "path-params"?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Strip the _id field from a document.
 */
function stripId(doc: Record<string, unknown>): Record<string, unknown> {
  const { _id, ...rest } = doc;
  return rest;
}

/**
 * Validate that a language code is one of the supported card languages.
 * Mirrors: validate-lang
 */
function validateLang(lang: string): boolean {
  return new Set(["de", "es", "fr", "it", "ja", "ko", "pl", "zh-simp", "zh-trad"]).has(lang);
}

// ---------------------------------------------------------------------------
// News
// ---------------------------------------------------------------------------

/**
 * Fetch news items sorted by date descending, with dates converted to UTC strings.
 * Mirrors: news-handler
 */
export async function newsHandler(req: Request): Promise<HttpResponse> {
  const db = req.system?.db;
  if (!db) {
    return response(500, { message: "Database not available" });
  }

  const data = await db
    .collection("news")
    .find({})
    .project({ _id: 1, item: 1, date: 1 })
    .sort({ date: -1 })
    .toArray();

  const result = data.map((doc: Record<string, unknown>) => ({
    ...doc,
    date: mongoTimeToUtcString(doc.date as Date | string | null | undefined),
  }));

  return response(200, result);
}

// ---------------------------------------------------------------------------
// Cards version
// ---------------------------------------------------------------------------

/**
 * Get the cards version from the config collection.
 * Mirrors: cards-version
 */
async function cardsVersion(db: Db): Promise<number | null> {
  const doc = await db.collection("config").findOne({});
  return doc ? (doc["cards-version"] as number) ?? null : null;
}

/**
 * Return the cards version as an integer.
 * Mirrors: cards-version-handler
 */
export async function cardsVersionHandler(req: Request): Promise<HttpResponse> {
  const db = req.system?.db;
  if (!db) {
    return response(500, { message: "Database not available" });
  }

  const version = await cardsVersion(db);
  return response(200, { version: version != null ? Math.floor(version) : null });
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

/**
 * Fetch all cards and enrich each with implementation status, stripping _id.
 * Mirrors: enriched-cards
 */
async function enrichedCards(db: Db): Promise<Record<string, unknown>[]> {
  const cards = await db.collection("cards").find({}).toArray();
  return cards.map((card: Record<string, unknown>) => ({
    ...stripId(card),
    implementation: cardImplemented(card as any),
  }));
}

/**
 * Return all enriched cards.
 * Mirrors: cards-handler
 */
export async function cardsHandler(req: Request): Promise<HttpResponse> {
  const db = req.system?.db;
  if (!db) {
    return response(500, { message: "Database not available" });
  }

  return response(200, await enrichedCards(db));
}

// ---------------------------------------------------------------------------
// Card translations (by language)
// ---------------------------------------------------------------------------

/**
 * Return card translations for a given language.
 * Maps zh-simp -> cards-zh-hans and zh-trad -> cards-zh-hant.
 * Mirrors: card-lang-handler
 */
export async function cardLangHandler(req: Request): Promise<HttpResponse> {
  const db = req.system?.db;
  const lang = req["path-params"]?.lang;

  if (!validateLang(lang ?? "")) {
    return response(200, {});
  }

  const collectionName =
    lang === "zh-simp"
      ? "cards-zh-hans"
      : lang === "zh-trad"
      ? "cards-zh-hant"
      : `cards-${lang}`;

  if (!db) {
    return response(500, { message: "Database not available" });
  }

  const docs = await db.collection(collectionName).find({}).toArray();
  return response(200, docs.map((doc: Record<string, unknown>) => stripId(doc)));
}

// ---------------------------------------------------------------------------
// Language content (i18n)
// ---------------------------------------------------------------------------

/**
 * Return i18n content for a given language as a string.
 * Mirrors: lang-handler
 */
export function langHandler(req: Request): HttpResponse {
  const lang = req["path-params"]?.lang;
  const content = getContent(lang ?? "");

  if (content) {
    return response(200, content);
  }
  return response(200, {});
}

// ---------------------------------------------------------------------------
// Alt arts
// ---------------------------------------------------------------------------

/**
 * Return all alt art entries.
 * Mirrors: alt-arts-handler
 */
export async function altArtsHandler(req: Request): Promise<HttpResponse> {
  const db = req.system?.db;
  if (!db) {
    return response(500, { message: "Database not available" });
  }

  const docs = await db.collection("altarts").find({}).toArray();
  return response(200, docs.map((doc: Record<string, unknown>) => stripId(doc)));
}

// ---------------------------------------------------------------------------
// Sets
// ---------------------------------------------------------------------------

/**
 * Return all set entries.
 * Mirrors: sets-handler
 */
export async function setsHandler(req: Request): Promise<HttpResponse> {
  const db = req.system?.db;
  if (!db) {
    return response(500, { message: "Database not available" });
  }

  const docs = await db.collection("sets").find({}).toArray();
  return response(200, docs.map((doc: Record<string, unknown>) => stripId(doc)));
}

// ---------------------------------------------------------------------------
// MWL (Minimum Wins / Meta Win List)
// ---------------------------------------------------------------------------

/**
 * Return all MWL entries.
 * Mirrors: mwl-handler
 */
export async function mwlHandler(req: Request): Promise<HttpResponse> {
  const db = req.system?.db;
  if (!db) {
    return response(500, { message: "Database not available" });
  }

  const docs = await db.collection("mwls").find({}).toArray();
  return response(200, docs.map((doc: Record<string, unknown>) => stripId(doc)));
}

// ---------------------------------------------------------------------------
// Cycles
// ---------------------------------------------------------------------------

/**
 * Return all cycle entries.
 * Mirrors: cycles-handler
 */
export async function cyclesHandler(req: Request): Promise<HttpResponse> {
  const db = req.system?.db;
  if (!db) {
    return response(500, { message: "Database not available" });
  }

  const docs = await db.collection("cycles").find({}).toArray();
  return response(200, docs.map((doc: Record<string, unknown>) => stripId(doc)));
}

// ---------------------------------------------------------------------------
// Donators
// ---------------------------------------------------------------------------

/**
 * Return donator entries sorted by amount descending.
 * Amounts stored as strings are parsed to numbers.
 * Returns username if present, otherwise name.
 * Mirrors: donors-handler
 */
export async function donorsHandler(req: Request): Promise<HttpResponse> {
  const db = req.system?.db;
  if (!db) {
    return response(500, { message: "Database not available" });
  }

  const docs = await db.collection("donators").find({}).toArray();

  // Parse amount: if it's a string, evaluate it as a number; otherwise use as-is
  const parsed = docs.map((doc: Record<string, unknown>) => {
    let amount = doc.amount;
    if (typeof amount === "string") {
      // Clojure uses edn/read-string which handles numbers in string form
      amount = Number(amount);
    }
    return { ...doc, amount };
  });

  // Sort by amount descending
  parsed.sort((a: Record<string, unknown>, b: Record<string, unknown>) => {
    return (b.amount as number) - (a.amount as number);
  });

  // Extract display name: username if non-empty, otherwise name
  const result = parsed.map((doc: Record<string, unknown>) => {
    const username = doc.username as string;
    if (!username || username.length === 0) {
      return doc.name as string;
    }
    return username;
  });

  return response(200, result);
}
