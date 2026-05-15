/* eslint-disable no-console */
import { MongoClient } from "mongodb";
import { SetAllCards, SetCycles, SetMWL, SetSets } from "../jinteki/cards";

// ---------------------------------------------------------------------------
// Task system keys (mirrors tasks.setup task-system-keys)
// Only initializes :mongodb/connection and :jinteki/cards from Integrant system
// ---------------------------------------------------------------------------

export interface TaskSystem {
  db: ReturnType<MongoClient["db"]>;
  client: MongoClient;
}

/**
 * Connect to MongoDB and load card/set/cycle/MWL data into global registries.
 * Mirrors: (start task-system-keys)
 */
export async function connect(): Promise<TaskSystem> {
  const uri =
    process.env.MONGO_CONNECTION_URI || "mongodb://localhost:27017/netrunner";
  const client = new MongoClient(uri);
  await client.connect();
  const dbName = uri.split("/").pop()?.split("?")[0] || "netrunner";
  const db = client.db(dbName);

  // Load cards
  const cards = await db.collection("cards").find({}).toArray();
  const allCards = cards.reduce<Record<string, Record<string, unknown>>>(
    (acc, card) => {
      const c = { ...card, _id: String(card._id) } as Record<string, unknown>;
      acc[(c.title as string) || String(c._id)] = c;
      return acc;
    },
    {},
  );
  SetAllCards(allCards);

  // Load sets
  const sets = await db.collection("sets").find({}).toArray();
  SetSets(sets);

  // Load cycles
  const cycles = await db.collection("cycles").find({}).toArray();
  SetCycles(cycles);

  // Load MWL - group by format, take latest by date-start
  // Mirrors: (group-by #(keyword (:format %))) then (sort-by :date-start) then (last)
  const mwlRaw = await db.collection("mwls").find({}).toArray();
  const formatGroups: Record<string, unknown[]> = {};
  for (const entry of mwlRaw) {
    const format = entry.format;
    if (!formatGroups[format]) {
      formatGroups[format] = [];
    }
    formatGroups[format].push(entry);
  }

  const latestMwl: Record<string, Record<string, unknown>> = {};
  for (const [format, entries] of Object.entries(formatGroups)) {
    (entries as Record<string, unknown>[]).sort((a, b) => {
      const dateA = (a["date-start"] as string) || "";
      const dateB = (b["date-start"] as string) || "";
      return dateA.localeCompare(dateB);
    });
    latestMwl[format] = entries[entries.length - 1] as Record<string, unknown>;
  }
  SetMWL(latestMwl);

  return { db, client };
}

/**
 * Disconnect from MongoDB and clear card/set/cycle/MWL registries.
 * Mirrors: (stop system task-system-keys)
 * @param system - The system object returned by connect()
 */
export function disconnect(system: TaskSystem): void {
  if (system) {
    SetAllCards({});
    SetSets([]);
    SetCycles([]);
    SetMWL({});
    // Close the MongoDB client
    // (In Integrant, ig/halt! :mongodb/connection calls mg/disconnect)
    // TypeScript uses async close
    system.client
      .close()
      .catch((err) => console.error("Error closing MongoDB connection:", err));
  }
}
