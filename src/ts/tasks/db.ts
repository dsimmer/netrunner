/* eslint-disable no-console */
import { createHash, randomUUID } from "node:crypto";
import * as readline from "node:readline";
import bcrypt from "bcryptjs";
import { Db, MongoClient, ObjectId } from "mongodb";
import { calculateDeckStatus, CardData, Deck, DeckLine, DeckStatus } from "../jinteki/validator.js";

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
// Utility helpers
// ---------------------------------------------------------------------------

function md5(s: string): string {
	return createHash("md5").update(s).digest("hex");
}

function toObjectId(id: unknown): ObjectId {
	if (id instanceof ObjectId) return id;
	return new ObjectId(String(id));
}

// ---------------------------------------------------------------------------
// Card resolution (mirrors web.decks/update-deck)
// ---------------------------------------------------------------------------

async function loadAllCards(db: Db): Promise<Map<string, CardData>> {
	const docs = await db.collection("cards").find({}).toArray();
	const map = new Map<string, CardData>();
	for (const doc of docs) {
		if (doc.title) map.set(doc.title as string, doc as unknown as CardData);
	}
	return map;
}

function updateDeckWithCards(
	deck: Record<string, unknown>,
	allCards: Map<string, CardData>,
): Deck {
	const rawCards = (deck.cards ?? []) as Array<Record<string, unknown>>;
	const cards: DeckLine[] = rawCards.map((line) => {
		const title = typeof line.card === "string"
			? line.card
			: (line.card as CardData)?.title ?? "";
		return { qty: (line.qty as number) ?? 1, card: allCards.get(title) ?? { title } };
	});

	const rawId = deck.identity as Record<string, unknown> | string | undefined;
	const idTitle = typeof rawId === "string" ? rawId : rawId?.title as string | undefined;
	const identity = idTitle ? (allCards.get(idTitle) ?? { title: idTitle }) : undefined;

	return { ...deck, cards, identity, format: deck.format as string } as Deck;
}

// ---------------------------------------------------------------------------
// updateAllDecks
// ---------------------------------------------------------------------------

export async function updateAllDecks(): Promise<void> {
	const { db, client } = await connect();
	let cnt = 0;
	try {
		const allCards = await loadAllCards(db);
		const cursor = db.collection("decks").find({});
		for await (const rawDeck of cursor) {
			const deckId = rawDeck._id;
			cnt++;
			if (cnt % 1000 === 0) process.stdout.write(".");

			const identity = rawDeck.identity as Record<string, unknown> | string | undefined;
			const identityEmpty = !identity || (typeof identity === "object" && Object.keys(identity).length === 0);
			if (identityEmpty) {
				console.log(`Skipping deck ${deckId}: nil/empty identity`);
				continue;
			}

			const deck = updateDeckWithCards(rawDeck as unknown as Record<string, unknown>, allCards);
			const status: DeckStatus = calculateDeckStatus(deck);
			await db.collection("decks").updateOne(
				{ _id: toObjectId(deckId) },
				{ $set: { status } },
			);
		}
		console.log();
		console.log("Updated", cnt, "decks");
	} catch (e) {
		console.log("Something got hecked", (e as Error).message);
	} finally {
		await disconnect(client);
	}
}

// ---------------------------------------------------------------------------
// deleteDuplicateUsers
// ---------------------------------------------------------------------------

export async function deleteDuplicateUsers(...args: string[]): Promise<void> {
	const { db, client } = await connect();
	try {
		const dryRun = args.includes("--dry-run");
		const users = await db
			.collection("users")
			.find({}, { projection: { email: 1, username: 1, registrationDate: 1, lastConnection: 1 } })
			.toArray();

		const grouped = new Map<string, typeof users>();
		for (const u of users) {
			const key = u.username as string;
			if (!grouped.has(key)) grouped.set(key, []);
			grouped.get(key)!.push(u);
		}
		const duplicates = [...grouped.values()].filter((g) => g.length > 1);

		if (dryRun) console.log("DRY RUN: not deleting accounts");
		console.log("Found", users.length, "user accounts.");
		console.log("Found", duplicates.length, "duplicated usernames.");

		for (const group of duplicates) {
			const sorted = [...group].sort(
				(a, b) =>
					new Date(a.registrationDate as string).getTime() -
					new Date(b.registrationDate as string).getTime(),
			);
			const [keep, ...toDelete] = sorted;
			console.log("Found username:", keep.username);
			console.log("\tKeeping:", keep.email, ",", keep.registrationDate);
			console.log(dryRun ? "\tWould delete:" : "\tDeleting:");
			for (const del of toDelete) {
				console.log("\t\t", del.email, ",", del.registrationDate);
				if (!dryRun) {
					await db.collection("users").deleteOne({ _id: del._id });
				}
			}
		}
	} catch (e) {
		console.log("Delete duplicate users failed", (e as Error).message);
		console.error(e);
	} finally {
		await disconnect(client);
	}
}

// ---------------------------------------------------------------------------
// NRDB deck download (mirrors web.nrdb/download-public-decklist)
// ---------------------------------------------------------------------------

const NRDB_API_URL = "https://netrunnerdb.com/api/2.0/public/";
const NRDB_BASE_URL = "https://netrunnerdb.com/en/";

type Endpoint = "decklist/" | "deck/" | "unknown";

function parseNrdbInput(input: string): [Endpoint, string] {
	let id: string;
	if (input.includes("/")) {
		const frame = input.split(/decklist\/|deck\/view\/|deck\//)[1] ?? "";
		id = frame.split("/")[0];
	} else {
		id = input;
	}
	const endpoint: Endpoint = input.includes("/decklist/")
		? "decklist/"
		: input.includes("/deck/")
			? "deck/"
			: "unknown";
	return [endpoint, id];
}

interface NrdbApiDeck {
	name: string;
	id: string | number;
	cards: Record<string, number>;
}

async function tryDownloadDecklist(
	db: Db,
	deckId: string,
	endpoint: Endpoint,
): Promise<Record<string, unknown> | null> {
	const chosen: "decklist/" | "deck/" =
		endpoint === "deck/" ? "deck/" : "decklist/";
	const url = `${NRDB_API_URL}${chosen}${deckId}`;

	let res: Response;
	try {
		res = await fetch(url);
	} catch (e) {
		console.log("Failed to download deck", deckId, (e as Error).message);
		return null;
	}

	if (!res.ok) {
		if (endpoint === "unknown") return tryDownloadDecklist(db, deckId, "deck/");
		console.log("Failed to download deck", deckId, "status:", res.status);
		return null;
	}

	const parsed = await res.json() as {
		success?: boolean;
		total?: number;
		data?: NrdbApiDeck[];
	};

	if (!parsed.success || parsed.total !== 1 || !parsed.data?.length) {
		if (endpoint === "unknown") return tryDownloadDecklist(db, deckId, "deck/");
		return null;
	}

	const deck = parsed.data[0];
	const readableUrl = chosen === "decklist/"
		? `${NRDB_BASE_URL}decklist/${deck.id}`
		: `${NRDB_BASE_URL}deck/view/${deck.id}`;

	const cards: DeckLine[] = [];
	let identity: CardData | undefined;

	for (const [code, qty] of Object.entries(deck.cards ?? {})) {
		const card = await db.collection("cards").findOne({
			$or: [{ code }, { "previous-versions": { $elemMatch: { code } } }],
		}) as CardData | null;
		if (!card) continue;
		if (card.type === "Identity") {
			identity = card;
		} else {
			cards.push({ card, qty });
		}
	}

	return {
		name: deck.name,
		notes: `imported from ${readableUrl}`,
		identity,
		cards,
	};
}

async function downloadPublicDecklist(
	db: Db,
	input: string,
): Promise<Record<string, unknown> | null> {
	const [endpoint, id] = parseNrdbInput(input);
	if (!id) return null;
	return tryDownloadDecklist(db, id, endpoint);
}

// ---------------------------------------------------------------------------
// Sample data helpers (mirrors private functions in db.clj)
// ---------------------------------------------------------------------------

async function prepareSampleDecks(
	db: Db,
	urls: string[],
): Promise<Array<{ deck: Record<string, unknown>; status: DeckStatus }>> {
	const allCards = await loadAllCards(db);
	return Promise.all(
		urls.map(async (url) => {
			const deck = await downloadPublicDecklist(db, url);
			if (!deck || !(deck.cards as DeckLine[])?.length) {
				throw new Error("A deck contains no cards. Did you forget to run `fetch`?");
			}
			const withMeta = { ...deck, date: new Date(), format: "standard" };
			const resolved = updateDeckWithCards(withMeta, allCards);
			const status = calculateDeckStatus(resolved);
			return { deck: withMeta, status };
		}),
	);
}

function createSampleUser(username: string, passwordHash: string): Record<string, unknown> {
	const email = `${username}@example.com`;
	const now = new Date();
	return {
		username,
		email,
		emailhash: md5(email),
		registrationDate: now,
		lastConnection: now,
		password: passwordHash,
		isadmin: false,
		options: { "default-format": "standard", pronouns: "none" },
	};
}

function prepareDeckForDb(
	deck: Record<string, unknown>,
	username: string,
	status: DeckStatus,
): Record<string, unknown> {
	const cards = (deck.cards as DeckLine[] ?? []).map((line) => ({
		qty: line.qty,
		card: (line.card as CardData).title ?? line.card,
	}));
	return { ...deck, cards, username, status };
}

function createSampleDeck(
	username: string,
	sampleDecks: Array<{ deck: Record<string, unknown>; status: DeckStatus }>,
): Record<string, unknown> {
	const { deck, status } = sampleDecks[Math.floor(Math.random() * sampleDecks.length)];
	return prepareDeckForDb(deck, username, status);
}

const NOBODY_HASH = md5("nobody@example.com");

function createSampleGameLog(username: string): Record<string, unknown> {
	const email = `${username}@example.com`;
	const nobody = { username: "<nobody>", emailhash: NOBODY_HASH };
	const players = {
		runner: {
			player: { ...nobody },
			"deck-name": "Firestorm (Worlds 110th)",
			identity: "Ele \"Smoke\" Scovak: Cynosure of the Net",
		},
		corp: {
			player: { ...nobody },
			"deck-name": "That One SYNC Deck -- 35th at Worlds",
			identity: "SYNC: Everything, Everywhere",
		},
	};
	const side = Math.random() < 0.5 ? "runner" : "corp";
	(players[side as keyof typeof players] as Record<string, unknown>).player =
		{ username, emailhash: md5(email) };

	const now = new Date(Date.now() - 100_000);
	const logLines = [
		"<username> has created the game.",
		"<username> joined the game.",
		"[hr]",
		"<username> keeps their hand.",
		"<username> keeps their hand.",
		"<username> concedes.",
		"<username> wins the game.",
		"<username> has left the game.",
	];

	return {
		gameid: randomUUID(),
		format: "standard",
		"replay-shared": false,
		"end-date": new Date(),
		winner: "runner",
		replay: null,
		title: `${username}'s game`,
		turn: 0,
		reason: "Concede",
		"creation-date": now,
		runner: players.runner,
		corp: players.corp,
		room: "casual",
		"start-date": now,
		log: logLines.map((text, idx) => ({
			user: "__system__",
			text,
			timestamp: new Date(now.getTime() + idx * 1000),
		})),
		stats: {
			time: { elapsed: 0 },
			corp: { gain: { card: 5 } },
			runner: { gain: { card: 5 } },
		},
	};
}

const SAMPLE_MESSAGES = [
	"Hello", "¡Hola!", "Grüß Gott", "Hyvää päivää", "Tere õhtust", "⠓⠑⠇⠇⠕",
	"Bonġu", "Cześć!", "Dobrý den", "Здравствуйте!", "Γειά σας", "გამარჯობა",
];

function createSampleMessage(username: string): Record<string, unknown> {
	const email = `${username}@example.com`;
	return {
		username,
		emailhash: md5(email),
		msg: SAMPLE_MESSAGES[Math.floor(Math.random() * SAMPLE_MESSAGES.length)],
		channel: "general",
		date: new Date(),
	};
}

function samplesForUser(userIndex: number, users: number, minTotalSamples: number): number {
	const commonCase = minTotalSamples / (998 + users);
	if (users <= 1) return minTotalSamples;
	if (userIndex === 0) return 0;
	if (userIndex === 1) return Math.ceil(minTotalSamples - (users - 2) * commonCase);
	return Math.ceil(commonCase);
}

function totalSamples(users: number, samples: number): number {
	return samplesForUser(1, users, samples) + (users - 2) * samplesForUser(2, users, samples);
}

async function promptContinue(): Promise<void> {
	const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
	return new Promise<void>((resolve) => {
		rl.question("Press any key to continue.\n", () => {
			rl.close();
			resolve();
		});
	});
}

// ---------------------------------------------------------------------------
// createSampleData
// ---------------------------------------------------------------------------

export async function createSampleData(
	usersArg?: string,
	usernamePrefixArg?: string,
	avgDecksArg?: string,
	avgGameLogsArg?: string,
	avgMessagesArg?: string,
): Promise<void> {
	const { db, client } = await connect();
	try {
		const usernamePrefix = usernamePrefixArg ?? "sample";
		const users = parseInt(usersArg ?? "50000", 10);
		const decks = users * parseInt(avgDecksArg ?? "11", 10);
		const gameLogs = users * parseInt(avgGameLogsArg ?? "5", 10);
		const messages = users * parseInt(avgMessagesArg ?? "5", 10);

		console.log(
			"This will take a few minutes to create",
			users, "users,",
			totalSamples(users, decks), "decks,",
			totalSamples(users, gameLogs), "game-logs and",
			totalSamples(users, messages), "messages.",
		);
		await promptContinue();

		const passwordHash = await bcrypt.hash("password", 10);
		const sampleDecks = await prepareSampleDecks(db, [
			"https://netrunnerdb.com/en/decklist/62104/that-one-sync-deck-35th-at-worlds",
			"https://netrunnerdb.com/en/decklist/62113/firestorm-worlds-110th-",
		]);

		const BATCH_SIZE = 10;
		for (let b = 0; b < Math.ceil(users / BATCH_SIZE); b++) {
			const userBatch: Record<string, unknown>[] = [];
			const deckBatch: Record<string, unknown>[] = [];
			const gameLogBatch: Record<string, unknown>[] = [];
			const messageBatch: Record<string, unknown>[] = [];

			for (let k = b * BATCH_SIZE; k < Math.min((b + 1) * BATCH_SIZE, users); k++) {
				const username = `${usernamePrefix}${k}`;
				userBatch.push(createSampleUser(username, passwordHash));
				for (let i = 0; i < samplesForUser(k, users, decks); i++) {
					deckBatch.push(createSampleDeck(username, sampleDecks));
				}
				for (let i = 0; i < samplesForUser(k, users, gameLogs); i++) {
					gameLogBatch.push(createSampleGameLog(username));
				}
				for (let i = 0; i < samplesForUser(k, users, messages); i++) {
					messageBatch.push(createSampleMessage(username));
				}
			}

			if (userBatch.length) await db.collection("users").insertMany(userBatch, { ordered: false });
			if (deckBatch.length) await db.collection("decks").insertMany(deckBatch, { ordered: false });
			if (gameLogBatch.length) await db.collection("game-logs").insertMany(gameLogBatch, { ordered: false });
			if (messageBatch.length) await db.collection("messages").insertMany(messageBatch, { ordered: false });
		}

		console.log("Successfully created sample data.");
		console.log(`You can now login with e.g. username "${usernamePrefix}1", password "password".`);
	} catch (e) {
		console.log("Create sample data failed:", (e as Error).message);
		console.error(e);
	} finally {
		await disconnect(client);
	}
}
