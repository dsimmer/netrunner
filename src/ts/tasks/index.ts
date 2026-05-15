/* eslint-disable no-console */
import { Db, MongoClient } from "mongodb";

// ---------------------------------------------------------------------------
// MongoDB connection helpers
// ---------------------------------------------------------------------------

interface ConnectResult {
	db: Db;
	client: MongoClient;
}

async function connect(): Promise<ConnectResult> {
	const uri = process.env.MONGO_CONNECTION_URI || "mongodb://localhost:27017/netrunner";
	const client = new MongoClient(uri);
	await client.connect();
	const dbName = uri.split("/").pop()?.split("?")[0] || "netrunner";
	const db = client.db(dbName);
	return { db, client };
}

async function disconnect(client: MongoClient): Promise<void> {
	await client.close();
}

// ---------------------------------------------------------------------------
// Index definitions
// ---------------------------------------------------------------------------

type IndexSpec = [string, Record<string, 1 | -1>, Record<string, unknown>?];

const CASE_INSENSITIVE = { collation: { locale: "en", strength: 2 } };

const indexes: IndexSpec[] = [
	["api-keys", { "api-key": 1 }],
	["cards", { code: 1 }],
	["cards", { "previous-versions": 1 }],
	["cards", { type: 1 }],
	["decks", { username: 1 }],
	["game-logs", { gameid: 1 }],
	["game-logs", { "corp.player.username": 1, "start-date": -1 }],
	["game-logs", { "runner.player.username": 1, "start-date": -1 }],
	["messages", { channel: 1, date: -1 }],
	["messages", { username: 1, date: -1 }],
	["news", { date: -1 }],
	["users", { username: 1 }],
	["users", { username: 1 }, { ...CASE_INSENSITIVE, name: "username_ci_1" }],
	["users", { email: 1 }],
	["users", { email: 1 }, { ...CASE_INSENSITIVE, name: "email_ci_1" }],
	["users", { isadmin: 1 }],
	["users", { ismoderator: 1 }],
	["users", { special: 1 }],
	["users", { resetPasswordToken: 1 }],
];

// ---------------------------------------------------------------------------
// createIndexes
// ---------------------------------------------------------------------------

export async function createIndexes(db?: Db): Promise<void> {
	let client: MongoClient | undefined;
	let database: Db;

	if (db) {
		database = db;
	} else {
		const result = await connect();
		client = result.client;
		database = result.db;
	}

	try {
		for (const [coll, keys, opts] of indexes) {
			await database.collection(coll).createIndex(keys, opts ?? {});
		}
		console.log("Indexes successfully created.");
	} catch (e) {
		console.log("Create indexes failed", (e as Error).message);
		console.error(e);
	} finally {
		if (client) await disconnect(client);
	}
}

// ---------------------------------------------------------------------------
// dropIndexes
// ---------------------------------------------------------------------------

export async function dropIndexes(): Promise<void> {
	const { db, client } = await connect();
	try {
		const colls = await db.listCollections().toArray();
		for (const col of colls) {
			await db.collection(col.name).dropIndexes();
			console.log("Dropped indexes on", col.name);
		}
		console.log("\nIndexes successfully dropped.");
	} catch (e) {
		console.log("Drop indexes failed", (e as Error).message);
		console.error(e);
	} finally {
		await disconnect(client);
	}
}
