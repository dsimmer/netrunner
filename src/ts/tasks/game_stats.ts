/* eslint-disable no-console */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { Db, MongoClient } from "mongodb";

// ---------------------------------------------------------------------------
// MongoDB connection helpers
// ---------------------------------------------------------------------------

interface ConnectResult {
	db: Db;
	client: MongoClient;
}

async function connect(connectionString?: string): Promise<ConnectResult> {
	const uri =
		connectionString ||
		process.env.MONGO_CONNECTION_URI ||
		"mongodb://localhost:27017/netrunner";
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
// Date helpers
// ---------------------------------------------------------------------------

function convertDate(d: unknown): string | null {
	if (!d) return null;
	const date = d instanceof Date ? d : new Date(String(d));
	return date.toISOString().slice(0, 10);
}

export function monthsAgo(n: number): string {
	const d = new Date();
	d.setMonth(d.getMonth() - n);
	return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// CSV writer
// ---------------------------------------------------------------------------

interface GameDoc {
	"start-date"?: unknown;
	"end-date"?: unknown;
	room?: unknown;
	format?: unknown;
	winner?: unknown;
	reason?: unknown;
	turn?: unknown;
	corp?: { identity?: unknown };
	runner?: { identity?: unknown };
}

function csvRow(fields: (string | number | null | undefined)[]): string {
	return fields.map((f) => {
		if (f == null) return "";
		const s = String(f);
		return s.includes(",") || s.includes('"') || s.includes("\n")
			? `"${s.replace(/"/g, '""')}"`
			: s;
	}).join(",");
}

function writeToFile(filename: string, data: GameDoc[]): void {
	mkdirSync(dirname(filename), { recursive: true });

	const header = csvRow(["start", "end", "room", "format", "winner", "reason", "turn", "corp", "runner"]);
	const rows = data.map((g) =>
		csvRow([
			convertDate(g["start-date"]),
			convertDate(g["end-date"]),
			g.room as string | null,
			g.format as string | null,
			g.winner as string | null,
			g.reason as string | null,
			g.turn as number | null,
			g.corp?.identity as string | null,
			g.runner?.identity as string | null,
		]),
	);

	writeFileSync(filename, [header, ...rows].join("\n") + "\n", "utf-8");
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

const COLL = "game-logs";

export async function allGames(filename: string, startDateStr?: string): Promise<void> {
	const start = startDateStr ?? monthsAgo(3);
	const startDate = new Date(start);

	const { db, client } = await connect();
	try {
		const games = await db
			.collection<GameDoc>(COLL)
			.find(
				{ "start-date": { $gte: startDate } },
				{
					projection: {
						_id: 0,
						"start-date": 1,
						"end-date": 1,
						room: 1,
						format: 1,
						winner: 1,
						reason: 1,
						turn: 1,
						"corp.identity": 1,
						"runner.identity": 1,
					},
					sort: { "start-date": -1 },
				},
			)
			.toArray();

		writeToFile(filename, games);
		console.log("Wrote", games.length, "entries");
	} catch (e) {
		console.error(e);
	} finally {
		await disconnect(client);
	}
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
	const [filename, startDate] = process.argv.slice(2);
	if (!filename) {
		console.log("Usage: game_stats.ts <filename> [start-date YYYY-MM-DD]");
		return;
	}
	await allGames(filename, startDate);
}

if (require.main === module) {
	main().catch(console.error);
}
