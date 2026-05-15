// Tasks to import alt art, alternate language, and high-res card images
// Mirrors: src/clj/tasks/images.clj

import * as fs from "fs";
import * as path from "path";
import { Db, MongoClient, WithId } from "mongodb";

// ──────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────

const ALT_ART_SETS_FILE = "data/promos.edn";
const IMG_DIRECTORY = ["resources", "public", "img", "cards"];
const OVERRIDES_IMG_DIRECTORY = ["resources", "public", "img", "cards", "overrides"];
const ALT_COLLECTION = "altarts";
const CARD_COLLECTION = "cards";

// ──────────────────────────────────────────────────────────────────
// Simple EDN parser (subset: vectors, maps, strings, keywords)
// ──────────────────────────────────────────────────────────────────

type EdnValue = string | number | boolean | null | EdnMap | EdnList;
interface EdnMap {
  [key: string]: EdnValue;
}
interface EdnList extends Array<EdnValue> {
  [index: number]: EdnValue;
}

function parseEdn(str: string): EdnValue {
  let pos = 0;

  function skipWhitespace() {
    while (pos < str.length && /\s/.test(str[pos])) pos++;
  }

  function peek(): string | undefined {
    return str[pos];
  }

  function advance(): string | undefined {
    return str[pos++];
  }

  function parseString(): string {
    advance(); // consume opening quote
    let result = "";
    while (pos < str.length && str[pos] !== '"') {
      if (str[pos] === "\\" && pos + 1 < str.length) {
        const next = str[pos + 1];
        if (next === "n") {
          result += "\n";
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
    advance(); // consume closing quote
    return result;
  }

  function parseKeyword(): string {
    let start = pos;
    while (pos < str.length && !/[\s\}\]\)]/.test(str[pos])) pos++;
    return str.slice(start, pos);
  }

  function parseNumber(): number | string {
    let start = pos;
    let hasDot = false;
    while (pos < str.length) {
      const c = str[pos];
      if (c === "." || (c >= "0" && c <= "9") || c === "-" || c === "+" || c === "e" || c === "E") {
        if (c === ".") hasDot = true;
        pos++;
      } else {
        break;
      }
    }
    const s = str.slice(start, pos);
    const num = Number(s);
    return !isNaN(num) && (hasDot || s.includes("e") || s.includes("E")) ? num : s;
  }

  function parseMap(): EdnMap {
    advance(); // consume {
    const result: EdnMap = {};
    skipWhitespace();
    while (peek() !== "}") {
      const key = parseValue();
      skipWhitespace();
      const value = parseValue();
      if (typeof key === "string" && key.startsWith(":")) {
        result[key.slice(1)] = value;
      }
      skipWhitespace();
    }
    advance(); // consume }
    return result;
  }

  function parseVector(): EdnList {
    advance(); // consume [
    const result: EdnList = [];
    skipWhitespace();
    while (peek() !== "]") {
      result.push(parseValue());
      skipWhitespace();
    }
    advance(); // consume ]
    return result;
  }

  function parseValue(): EdnValue {
    skipWhitespace();
    const c = peek();
    if (c === '"') return parseString();
    if (c === "{") return parseMap();
    if (c === "[") return parseVector();
    if (c === ":") {
      skipWhitespace();
      return parseKeyword();
    }
    if (c === "n" && str.slice(pos, pos + 4) === "nil") {
      pos += 4;
      return null;
    }
    if (c === "t" && str.slice(pos, pos + 4) === "true") {
      pos += 4;
      return true;
    }
    if (c === "f" && str.slice(pos, pos + 5) === "false") {
      pos += 5;
      return false;
    }
    if (c && (c >= "0" && c <= "9" || c === "-" || c === "+" || c === ".")) {
      return parseNumber();
    }
    // bare symbol
    let start = pos;
    while (pos < str.length && !/[\s\}\]\(\)\[\}"]/.test(str[pos])) pos++;
    return str.slice(start, pos);
  }

  return parseValue();
}

// ──────────────────────────────────────────────────────────────────
// MongoDB connection helpers (mirrors tasks.setup + web.system)
// ──────────────────────────────────────────────────────────────────

interface ConnectResult {
  db: Db;
  client: MongoClient;
}

async function connect(connectionString?: string): Promise<ConnectResult> {
  const uri =
    connectionString ||
    process.env.MONGO_CONNECTION_URI ||
    `mongodb://localhost:27017/netrunner`;

  const client = new MongoClient(uri);
  await client.connect();
  const dbName = uri.split("/").pop()?.split("?")[0] || "netrunner";
  const db = client.db(dbName);
  return { db, client };
}

async function disconnect(client: MongoClient): Promise<void> {
  await client.close();
}

// ──────────────────────────────────────────────────────────────────
// replace-collection (mirrors tasks.utils/replace-collection)
// ──────────────────────────────────────────────────────────────────

function ednToDbValue(val: EdnValue): unknown {
  if (Array.isArray(val)) return val.map(ednToDbValue);
  if (typeof val === "object" && val !== null) {
    const obj: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val)) {
      obj[k] = ednToDbValue(v);
    }
    return obj;
  }
  return val;
}

async function replaceCollection(db: Db, collection: string, data: EdnValue): Promise<void> {
  const collectionObj = db.collection(collection);
  await collectionObj.deleteMany({});
  if (Array.isArray(data)) {
    const docs = data.map((item) => ednToDbValue(item)) as Record<string, unknown>[];
    if (docs.length > 0) {
      await collectionObj.insertMany(docs, { ordered: false });
    }
  }
}

// ──────────────────────────────────────────────────────────────────
// Directory / file helpers (mirrors find-dirs / find-files)
// ──────────────────────────────────────────────────────────────────

function findDirs(dirPath: string): fs.Dirent[] {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory());
}

function findFiles(dirPath: string): fs.Dirent[] {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  return entries.filter((entry) => entry.isFile());
}

// ──────────────────────────────────────────────────────────────────
// read-alt-sets (mirrors read-alt-sets)
// ──────────────────────────────────────────────────────────────────

function readAltSets(): EdnValue | null {
  try {
    const resolvedPath = path.resolve(ALT_ART_SETS_FILE);
    const raw = fs.readFileSync(resolvedPath, "utf-8");
    return parseEdn(raw);
  } catch (e: unknown) {
    console.error("Failed to load alt art set info:", (e as Error).message);
    return null;
  }
}

// ──────────────────────────────────────────────────────────────────
// remove-old-images (mirrors remove-old-images)
// ──────────────────────────────────────────────────────────────────

async function removeOldImages(db: Db): Promise<void> {
  console.log("Removing old images from db cards");
  const collection = db.collection(CARD_COLLECTION);
  await collection.updateMany({}, { $unset: { faces: "" } });
  await collection.updateMany({}, { $unset: { images: "" } });
}

// ──────────────────────────────────────────────────────────────────
// Regex for selecting card code from filename (mirrors image-select-regex)
// ──────────────────────────────────────────────────────────────────

// Note: this should select a period, perhaps preceded by an alphabetic string,
// so long as it either has front, back, or some numbers behind it.
// the excess dots are because the lookbehind needs to be fixed width
// but this ensures we don't split on "front." and instead split on "." for multi-faced cards
const IMAGE_SELECT_REGEX = /(?<=(.tank|house|ewery|front|posal|rface|enure|.back|....[0123456789]))[a-zA-Z]*\./;

// ──────────────────────────────────────────────────────────────────
// cards-to-skip (mirrors cards-to-skip)
// ──────────────────────────────────────────────────────────────────

const CARDS_TO_SKIP = new Set([
  "08012",
  "09001",
  "26066",
  "26120",
  "35023",
  "35057",
  "36036",
]);

// ──────────────────────────────────────────────────────────────────
// add-flip-card-image (mirrors add-flip-card-image)
// ──────────────────────────────────────────────────────────────────

function addFlipCardImage(
  db: Db,
  basePath: string,
  lang: string,
  resolution: string,
  artSet: string,
  filename: string,
): void {
  const codeFace = filename.split(IMAGE_SELECT_REGEX)[0];
  const codeFaceSplit = codeFace.split("-");
  const code = codeFaceSplit[0];
  const face = codeFaceSplit[1];
  const k = ["faces", face, "images", lang, resolution, artSet].join(".");
  const prevKRoot = artSet === "stock" ? code : artSet;
  const prevK = ["faces", face, "images", lang, resolution, prevKRoot].join(".");
  const filePath = [basePath, lang, resolution, artSet, filename].join("/");

  // Use $addToSet to avoid duplicates
  const filter = { code };
  const updateSet = { [k]: filePath };
  const updateAddToSet = { [k]: filePath };

  // For the current card
  db.collection(CARD_COLLECTION).updateMany(
    filter,
    { $addToSet: updateAddToSet },
  );

  // For previous versions
  const prevFilter = { "previous-versions": { $elemMatch: { code } } };
  db.collection(CARD_COLLECTION).updateMany(
    prevFilter,
    { $set: { [prevK]: filePath } },
  );
}

// ──────────────────────────────────────────────────────────────────
// add-card-image (mirrors add-card-image)
// ──────────────────────────────────────────────────────────────────

function addCardImage(
  db: Db,
  basePath: string,
  lang: string,
  resolution: string,
  artSet: string,
  file: fs.Dirent,
): void {
  const filename = file.name;

  if (filename.includes("-")) {
    addFlipCardImage(db, basePath, lang, resolution, artSet, filename);
  } else {
    const code = filename.split(IMAGE_SELECT_REGEX)[0];
    const k = ["images", lang, resolution, artSet].join(".");
    const prevKRoot = artSet === "stock" ? code : artSet;
    const prevK = ["images", lang, resolution, prevKRoot].join(".");
    const filePath = [basePath, lang, resolution, artSet, filename].join("/");

    if (!CARDS_TO_SKIP.has(code)) {
      // Add to current card
      db.collection(CARD_COLLECTION).updateMany(
        { code },
        { $addToSet: { [k]: filePath } },
      );

      // Add to previous versions
      db.collection(CARD_COLLECTION).updateMany(
        { "previous-versions": { $elemMatch: { code } } },
        { $addToSet: { [prevK]: filePath } },
      );
    }
  }
}

// ──────────────────────────────────────────────────────────────────
// Image quality helpers (mirrors format-rank, higher-quality?, add-best-card)
// ──────────────────────────────────────────────────────────────────

const FORMAT_RANK: Record<string, number> = {
  gif: 0,
  jpg: 1,
  jpeg: 1,
  png: 2,
};

function normalizeFmt(s: string | undefined | null): string | undefined {
  return s?.toLowerCase();
}

function higherQuality(fmt1: string | undefined, fmt2: string | undefined): boolean {
  const r1 = normalizeFmt(fmt1);
  const r2 = normalizeFmt(fmt2);
  return (
    (r1 !== undefined ? FORMAT_RANK[r1] ?? -1 : -1) >
    (r2 !== undefined ? FORMAT_RANK[r2] ?? -1 : -1)
  );
}

interface FileEntry {
  name: string;
  isFile(): boolean;
}

function addBestCard(acc: Record<string, fs.Dirent>, card: fs.Dirent): Record<string, fs.Dirent> {
  const cardName = card.name;
  const parts = cardName.split(".");
  const cardId = parts[0];
  const fmt = parts[1];
  const currCard = acc[cardId];
  const currCardName = currCard ? currCard.name : "";

  if (!currCard) {
    return { ...acc, [cardId]: card };
  }

  const currParts = currCardName.split(".");
  const currFmt = currParts[1];

  if (higherQuality(fmt, currFmt)) {
    console.log(`Replacing ${currCardName}, ${cardName} is higher image quality.`);
    return { ...acc, [cardId]: card };
  }

  console.log(`Not importing ${cardName}, ${currCardName} is higher image quality.`);
  return acc;
}

function filterDups(cards: fs.Dirent[]): fs.Dirent[] {
  const reduced = cards.reduce<Record<string, fs.Dirent>>(addBestCard, {});
  return Object.values(reduced);
}

// ──────────────────────────────────────────────────────────────────
// Recursive directory processing (mirrors add-alt-images, add-resolution-images, add-language-images)
// ──────────────────────────────────────────────────────────────────

function addAltImages(
  db: Db,
  basePath: string,
  lang: string,
  resolution: string,
  altDir: fs.Dirent,
): void {
  const altName = altDir.name;
  const altDirPath = path.join(altDir.parentPath ?? "", altDir.name);
  const images = filterDups(findFiles(altDirPath));

  for (const img of images) {
    addCardImage(db, basePath, lang, resolution, altName, img);
  }

  console.log(`Added ${images.length} images to ${lang} ${resolution} ${altName}`);
}

function addResolutionImages(
  db: Db,
  basePath: string,
  lang: string,
  resDir: fs.Dirent,
): void {
  const resolution = resDir.name;
  const resDirPath = path.join(resDir.parentPath ?? "", resDir.name);
  const altDirs = findDirs(resDirPath);

  for (const altDir of altDirs) {
    addAltImages(db, basePath, lang, resolution, altDir);
  }
}

function addLanguageImages(db: Db, basePath: string, langDir: fs.Dirent): void {
  const lang = langDir.name;
  const langDirPath = path.join(langDir.parentPath ?? "", langDir.name);
  const resDirs = findDirs(langDirPath);

  for (const resDir of resDirs) {
    addResolutionImages(db, basePath, lang, resDir);
  }
}

// ──────────────────────────────────────────────────────────────────
// add-images (mirrors add-images - main entry point)
// ──────────────────────────────────────────────────────────────────

export async function addImages(dbOrString?: Db | string): Promise<void> {
  let ownConnection = false;
  let client: MongoClient | null = null;
  let db: Db;

  if (dbOrString instanceof Db) {
    db = dbOrString;
  } else if (typeof dbOrString === "string") {
    // Connection string provided
    const result = await connect(dbOrString);
    db = result.db;
    client = result.client;
    ownConnection = true;
  } else {
    // No connection provided - use default
    const result = await connect();
    db = result.db;
    client = result.client;
    ownConnection = true;
  }

  try {
    const altSets = readAltSets();
    const cardDirPath = path.join(...IMG_DIRECTORY);
    const cardDir = fs.readdirSync(cardDirPath, { withFileTypes: true });
    const langs = cardDir.filter(
      (e) => e.isDirectory() && e.name !== "overrides",
    );
    const overridesDirPath = path.join(...OVERRIDES_IMG_DIRECTORY);

    if (altSets) {
      await replaceCollection(db, ALT_COLLECTION, altSets);
    }

    await removeOldImages(db);

    for (const langDir of langs) {
      addLanguageImages(db, "/img/cards", langDir);
    }

    console.log("Adding override images...");
    if (fs.existsSync(overridesDirPath)) {
      const overridesEntries = fs.readdirSync(overridesDirPath, { withFileTypes: true });
      for (const o of overridesEntries) {
        if (o.isDirectory()) {
          const overridesLangsPath = path.join(o.parentPath ?? "", o.name);
          const overridesLangs = fs.readdirSync(overridesLangsPath, { withFileTypes: true }).filter(
            (e) => e.isDirectory(),
          );
          const baseOverridePath = `/img/cards/overrides/${o.name}`;
          for (const ol of overridesLangs) {
            addLanguageImages(db, baseOverridePath, ol);
          }
        }
      }
    }
  } catch (e: unknown) {
    console.error("Image import failed:", (e as Error).message);
    console.error((e as Error).stack);
  } finally {
    if (ownConnection && client) {
      await disconnect(client);
    }
  }
}
