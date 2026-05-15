/* eslint-disable no-console */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Db, MongoClient } from "mongodb";
import sharp from "sharp";
import { addImages } from "./images";
import { createIndexes } from "./index";

// ---------------------------------------------------------------------------
// EDN parser
// ---------------------------------------------------------------------------

type EdnValue = string | number | boolean | null | EdnMap | EdnValue[];
interface EdnMap {
  [key: string]: EdnValue;
}

function parseEdn(str: string): EdnValue {
  let pos = 0;

  function skipWhitespaceAndComments() {
    while (pos < str.length) {
      if (/\s/.test(str[pos])) {
        pos++;
      } else if (str[pos] === ";") {
        while (pos < str.length && str[pos] !== "\n") pos++;
      } else {
        break;
      }
    }
  }

  function parseString(): string {
    pos++; // opening "
    let result = "";
    while (pos < str.length && str[pos] !== '"') {
      if (str[pos] === "\\" && pos + 1 < str.length) {
        const next = str[pos + 1];
        if (next === "n") {
          result += "\n";
          pos += 2;
        } else if (next === "t") {
          result += "\t";
          pos += 2;
        } else if (next === "r") {
          result += "\r";
          pos += 2;
        } else if (next === "\\") {
          result += "\\";
          pos += 2;
        } else if (next === '"') {
          result += '"';
          pos += 2;
        } else {
          result += str[pos];
          pos++;
        }
      } else {
        result += str[pos++];
      }
    }
    pos++; // closing "
    return result;
  }

  function parseMap(): EdnMap {
    pos++; // {
    const result: EdnMap = {};
    skipWhitespaceAndComments();
    while (pos < str.length && str[pos] !== "}") {
      const key = parseValue();
      skipWhitespaceAndComments();
      const value = parseValue();
      skipWhitespaceAndComments();
      if (typeof key === "string" && key.startsWith(":")) {
        result[key.slice(1)] = value;
      }
    }
    pos++; // }
    return result;
  }

  function parseVector(): EdnValue[] {
    pos++; // [
    const result: EdnValue[] = [];
    skipWhitespaceAndComments();
    while (pos < str.length && str[pos] !== "]") {
      result.push(parseValue());
      skipWhitespaceAndComments();
    }
    pos++; // ]
    return result;
  }

  function parseList(): EdnValue[] {
    pos++; // (
    const result: EdnValue[] = [];
    skipWhitespaceAndComments();
    while (pos < str.length && str[pos] !== ")") {
      result.push(parseValue());
      skipWhitespaceAndComments();
    }
    pos++; // )
    return result;
  }

  function parseSet(): EdnValue[] {
    pos++; // { (after #)
    const result: EdnValue[] = [];
    skipWhitespaceAndComments();
    while (pos < str.length && str[pos] !== "}") {
      result.push(parseValue());
      skipWhitespaceAndComments();
    }
    pos++; // }
    return result;
  }

  function parseAtom(): EdnValue {
    const start = pos;
    while (pos < str.length && !/[\s,\}\]\)\(]/.test(str[pos])) pos++;
    const s = str.slice(start, pos);
    if (s === "nil") return null;
    if (s === "true") return true;
    if (s === "false") return false;
    const num = Number(s);
    if (!isNaN(num) && s.length > 0) return num;
    return s; // keyword or bare symbol
  }

  function parseValue(): EdnValue {
    skipWhitespaceAndComments();
    const c = str[pos];
    if (c === undefined) return null;
    if (c === '"') return parseString();
    if (c === "{") return parseMap();
    if (c === "[") return parseVector();
    if (c === "(") return parseList();
    if (c === "#") {
      pos++;
      if (str[pos] === "{") return parseSet();
      // tagged literal (#inst, #uuid, etc.) – parse and discard tag, return value
      while (pos < str.length && !/[\s{]/.test(str[pos])) pos++;
      skipWhitespaceAndComments();
      return parseValue();
    }
    if (c === ",") {
      pos++;
      return parseValue();
    } // commas are whitespace in EDN
    return parseAtom();
  }

  return parseValue();
}

// ---------------------------------------------------------------------------
// MongoDB helpers
// ---------------------------------------------------------------------------

interface ConnectResult {
  db: Db;
  client: MongoClient;
}

async function connect(): Promise<ConnectResult> {
  const uri =
    process.env.MONGO_CONNECTION_URI || "mongodb://localhost:27017/netrunner";
  const client = new MongoClient(uri);
  await client.connect();
  const dbName = uri.split("/").pop()?.split("?")[0] || "netrunner";
  const db = client.db(dbName);
  return { db, client };
}

async function disconnect(client: MongoClient): Promise<void> {
  await client.close();
}

function ednToDoc(val: EdnValue): unknown {
  if (Array.isArray(val)) return val.map(ednToDoc);
  if (typeof val === "object" && val !== null) {
    const obj: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val)) obj[k] = ednToDoc(v);
    return obj;
  }
  return val;
}

async function replaceCollection(
  db: Db,
  col: string,
  data: EdnValue[],
): Promise<void> {
  const coll = db.collection(col);
  await coll.deleteMany({});
  if (data.length > 0) {
    const docs = data.map((item) => ednToDoc(item)) as Record<
      string,
      unknown
    >[];
    await coll.insertMany(docs, { ordered: false });
  }
}

async function updateConfig(db: Db): Promise<void> {
  await db
    .collection("config")
    .updateOne(
      { "cards-version": { $exists: true } },
      { $inc: { "cards-version": 1 }, $currentDate: { "last-updated": true } },
      { upsert: true },
    );
}

// ---------------------------------------------------------------------------
// EDN writer (simple, handles the types produced by parseEdn)
// ---------------------------------------------------------------------------

function escapeEdnString(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\t/g, "\\t")
    .replace(/\r/g, "\\r");
}

function toEdn(val: EdnValue): string {
  if (val === null || val === undefined) return "nil";
  if (typeof val === "boolean") return val ? "true" : "false";
  if (typeof val === "number") return String(val);
  if (typeof val === "string") return `"${escapeEdnString(val)}"`;
  if (Array.isArray(val)) {
    return "[" + val.map(toEdn).join(" ") + "]";
  }
  if (typeof val === "object") {
    const entries = Object.entries(val);
    if (entries.length === 0) return "{}";
    return "{" + entries.map(([k, v]) => `:${k} ${toEdn(v)}`).join(" ") + "}";
  }
  return String(val);
}

export function writeToFile(filename: string, data: EdnValue): void {
  mkdirSync(dirname(filename), { recursive: true });
  writeFileSync(filename, toEdn(data), "utf-8");
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const JNET_IMAGE_URL = "https://card-images.netrunnerdb.com/v1/large/";
const JNET_IMAGE_URL_V2 = "https://card-images.netrunnerdb.com/v2/large/";

function buildEdnUrl(repo: string, branch: string): string {
  return `https://raw.githubusercontent.com/${repo}/${branch}/edn/raw_data.edn`;
}

// ---------------------------------------------------------------------------
// EDN data download
// ---------------------------------------------------------------------------

export async function downloadEdnData(
  localpath: string | undefined,
  repo: string,
  branch: string,
): Promise<EdnMap> {
  if (localpath) {
    const text = readFileSync(join(localpath, "edn", "raw_data.edn"), "utf-8");
    return parseEdn(text) as EdnMap;
  }

  const url = buildEdnUrl(repo, branch);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download EDN data, status ${res.status}`);
  }
  return parseEdn(await res.text()) as EdnMap;
}

// ---------------------------------------------------------------------------
// Card image paths
// ---------------------------------------------------------------------------

function cardImageFile(code: string): string {
  return join(
    "resources",
    "public",
    "img",
    "cards",
    "en",
    "default",
    "stock",
    `${code}.png`,
  );
}

// ---------------------------------------------------------------------------
// Previous card stubs
// ---------------------------------------------------------------------------

interface CardStub {
  code: string;
  title?: string;
  [key: string]: unknown;
}

function generatePreviousCardStubs(cards: CardStub[]): CardStub[] {
  const stubs: CardStub[] = [];
  for (const card of cards) {
    const prev = card["previous-versions"] as
      | Array<{ code: string }>
      | undefined;
    if (prev) {
      for (const v of prev) {
        stubs.push({ title: card.title, code: v.code });
      }
    }
  }
  return stubs;
}

// ---------------------------------------------------------------------------
// Multi-faced card support
// ---------------------------------------------------------------------------

const faceDownloadOverrides: Record<string, Record<string, number>> = {
  "09001": { back: 0 }, // SYNC: Efficiency Committee — no named-faces or card-id
  "26120": { back: 0 }, // Earth Station: SEA Headquarters — no named-faces
};

interface FaceData {
  "card-id"?: string;
  index?: number;
}

interface MultiCard extends CardStub {
  "named-faces"?: Record<string, string>;
  faces?: FaceData[];
}

function multiFacedCard(card: MultiCard): boolean {
  return !!(card["named-faces"] || faceDownloadOverrides[card.code]);
}

function deriveFaceNameToIndex(card: MultiCard): Record<string, number> {
  const override = faceDownloadOverrides[card.code];
  if (override) return override;

  const namedFaces = card["named-faces"];
  if (!namedFaces) return {};

  const facesWithId = (card.faces ?? []).filter((f) => f["card-id"]);
  const result: Record<string, number> = {};

  for (const faceName of Object.keys(namedFaces)) {
    const match = facesWithId.find((f) => f["card-id"]!.includes(faceName));
    if (match && match.index !== undefined) {
      result[faceName] = match.index;
    }
  }

  if (Object.keys(namedFaces).length > 0 && Object.keys(result).length === 0) {
    console.log(
      `Warning: card ${card.code} has named-faces but no face index could be derived`,
    );
  }

  return result;
}

interface FacePlan {
  url: string;
  file: string;
}

function faceDownloadPlan(card: MultiCard): FacePlan[] {
  const code = card.code;
  const faceMap = deriveFaceNameToIndex(card);
  const plans: FacePlan[] = [
    {
      url: `${JNET_IMAGE_URL_V2}${code}.jpg`,
      file: cardImageFile(`${code}-front`),
    },
  ];
  for (const [faceName, idx] of Object.entries(faceMap)) {
    plans.push({
      url: `${JNET_IMAGE_URL_V2}${code}-${idx}.jpg`,
      file: cardImageFile(`${code}-${faceName}`),
    });
  }
  return plans;
}

// ---------------------------------------------------------------------------
// Throttled HTTP image downloader (max 5 requests/second)
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function downloadImage(url: string, destPath: string): Promise<void> {
  const res = await fetch(url);
  if (res.status === 404) {
    console.log("No image at", url);
    return;
  }
  if (!res.ok) {
    console.log("Error downloading", url, res.status);
    return;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  mkdirSync(dirname(destPath), { recursive: true });
  // Convert JPEG to PNG using sharp (mirrors Java ImageIO behavior)
  await sharp(buf).png().toFile(destPath);
}

async function downloadCardImage(card: CardStub): Promise<void> {
  const url = `${JNET_IMAGE_URL_V2}${card.code}.jpg`;
  console.log("Downloading:", card.title, "\t\t(", url, ")");
  await downloadImage(url, cardImageFile(card.code));
}

async function downloadFaceImage(plan: FacePlan): Promise<void> {
  console.log("Downloading face:", plan.url);
  await downloadImage(plan.url, plan.file);
}

async function throttledMap<T>(
  items: T[],
  fn: (item: T) => Promise<void>,
  maxPerSecond: number,
): Promise<void> {
  const interval = Math.ceil(1000 / maxPerSecond);
  const promises: Promise<void>[] = [];
  for (let i = 0; i < items.length; i++) {
    if (i > 0) await sleep(interval);
    promises.push(fn(items[i]));
  }
  await Promise.all(promises);
}

// ---------------------------------------------------------------------------
// Download card images
// ---------------------------------------------------------------------------

export async function downloadCardImages(cards: CardStub[]): Promise<void> {
  const previousCards = generatePreviousCardStubs(cards);
  const allCards = [...cards, ...previousCards].filter(
    (c) => !multiFacedCard(c as MultiCard),
  );
  const missingCards = allCards.filter(
    (c) => !existsSync(cardImageFile(c.code)),
  );
  const total = allCards.length;
  const missing = missingCards.length;

  if (missing > 0) {
    console.log(
      `Have art for ${total - missing}/${total} cards. Downloading ${missing} missing images...`,
    );
    await throttledMap(missingCards, downloadCardImage, 5);
    console.log("Finished downloading card art");
  } else {
    console.log(`All ${total} card images exist, skipping download`);
  }
}

// ---------------------------------------------------------------------------
// Download face images
// ---------------------------------------------------------------------------

export async function downloadFaceImages(cards: CardStub[]): Promise<void> {
  const multiFaced = (cards as MultiCard[]).filter(multiFacedCard);
  const plans = multiFaced.flatMap(faceDownloadPlan);
  const missing = plans.filter((p) => !existsSync(p.file));
  const total = plans.length;
  const missingCount = missing.length;

  if (missingCount > 0) {
    console.log(
      `Have ${total - missingCount}/${total} face images. Downloading ${missingCount} missing...`,
    );
    await throttledMap(missing, downloadFaceImage, 5);
    console.log("Finished downloading face images");
  } else {
    console.log(`All ${total} face images exist, skipping download`);
  }
}

// ---------------------------------------------------------------------------
// fetchData – main entry point
// ---------------------------------------------------------------------------

export interface FetchOptions {
  local?: string;
  repo: string;
  branch: string;
  db: boolean;
  cardImages: boolean;
}

export async function fetchData(options: FetchOptions): Promise<void> {
  const { local, repo, branch, db: useDb, cardImages } = options;

  const raw = await downloadEdnData(local, repo, branch);
  // Discard promos (not imported)
  delete raw["promos"];
  const edn = raw;

  // Write each collection to disk as EDN
  for (const [k, data] of Object.entries(edn)) {
    const filename = `data/${k}.edn`;
    writeToFile(filename, data as EdnValue);
    console.log(`Wrote ${filename} to disk`);
  }

  // Load into MongoDB
  if (useDb) {
    const { db, client } = await connect();
    try {
      for (const [k, data] of Object.entries(edn)) {
        await replaceCollection(db, k, data as EdnValue[]);
        console.log(`Imported ${k} into database`);
      }
      await updateConfig(db);
      if (cardImages) {
        const cards = edn["cards"] as CardStub[];
        await downloadCardImages(cards);
        await downloadFaceImages(cards);
      }
      await addImages(db);
      await createIndexes(db);
    } finally {
      await disconnect(client);
    }
  }

  const cards = edn["cards"] as unknown[] | undefined;
  const cycles = edn["cycles"] as unknown[] | undefined;
  const sets = edn["sets"] as unknown[] | undefined;
  const mwls = edn["mwls"] as unknown[] | undefined;
  console.log(cycles?.length ?? 0, "cycles imported");
  console.log(sets?.length ?? 0, "sets imported");
  console.log(mwls?.length ?? 0, "MWL versions imported");
  console.log(cards?.length ?? 0, "cards imported");
}
