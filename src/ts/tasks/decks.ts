/* eslint-disable no-console */
import { MongoClient, ObjectId } from "mongodb";

// ---------------------------------------------------------------------------
// decks (mirrors tasks.decks)
// Deck modification tasks
// ---------------------------------------------------------------------------

/**
 * Convert a value to a MongoDB ObjectId.
 * Mirrors: web.mongodb/->object-id
 */
function toObjectId(id: unknown): ObjectId {
	if (id instanceof ObjectId) return id;
	return new ObjectId(String(id));
}

/**
 * Get all usernames from the users collection.
 * Mirrors: (get-all-usernames db)
 */
async function getAllUsernames(db: import("mongodb").Db): Promise<string[]> {
	const docs = await db.collection("users").find({}, { projection: { username: 1 } }).toArray();
	return docs.map((d) => d.username as string);
}

/**
 * Get a deck by _id (without the _id field).
 * Mirrors: (get-deck db deck-id)
 * @returns deck without _id, or undefined if not found
 */
async function getDeck(
	db: import("mongodb").Db,
	deckId: string,
): Promise<Record<string, unknown> | undefined> {
	const objId = toObjectId(deckId);
	const doc = await db.collection("decks").findOne({ _id: objId });
	if (!doc) return undefined;
	// dissoc the _id field (mirrors: (dissoc doc :_id))
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const { _id, ...deck } = doc;
	return deck;
}

/**
 * Add the specified deck to all users (creates one copy per username).
 * Mirrors: (add-for-all-users deck-id)
 * @param deckId - The deck ID to replicate
 */
export async function addForAllUsers(deckId: string): Promise<void> {
	const uri = process.env.MONGO_CONNECTION_URI || "mongodb://localhost:27017/netrunner";
	const client = new MongoClient(uri);

	await client.connect();
	const db = client.db(uri.split("/").pop()?.split("?")[0] || "netrunner");

	try {
		const deck = await getDeck(db, deckId);

		if (!deck) {
			console.log("ERROR: Unknown deck-id", deckId);
			return;
		}

		const usernames = await getAllUsernames(db);
		// distinct (mirrors: (distinct ...))
		const distinctUsernames = [...new Set(usernames)];
		// assoc deck with each username (mirrors: (map #(assoc deck :username %) usernames))
		const newDecks = distinctUsernames.map((username) => ({
			...deck,
			username,
		}));

		const result = await db.collection("decks").insertMany(newDecks);

		// acknowledged? check (mirrors: (acknowledged? result))
		if (result.acknowledged) {
			console.log(`${newDecks.length} decks added`);
		} else {
			console.log("ERROR ADDING DECKS");
		}
	} finally {
		await client.close();
	}
}

// CLI entry point: bun src/ts/tasks/decks.ts add-for-all-users <deck-id>
if (require.main === module) {
	const [, , cmd, deckId] = process.argv;
	if (cmd === "add-for-all-users" && deckId) {
		addForAllUsers(deckId).catch((err) => {
			console.error(err);
			process.exit(1);
		});
	} else {
		console.log(`Usage: bun src/ts/tasks/decks.ts add-for-all-users <deck-id>`);
		process.exit(1);
	}
}
