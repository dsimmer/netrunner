import { Db } from "mongodb";

export function typeToDir(card: { type: string }): string {
	switch (card.type) {
		case "Agenda": return "agendas";
		case "Asset": return "assets";
		case "Event": return "events";
		case "Fake-Identity": return "identities";
		case "Hardware": return "hardware";
		case "ICE": return "ice";
		case "Identity": return "identities";
		case "Operation": return "operations";
		case "Program": return "programs";
		case "Resource": return "resources";
		case "Upgrade": return "upgrades";
		default: throw new Error(`Unknown card type: ${card.type}`);
	}
}

export async function replaceCollection(
	db: Db,
	col: string,
	data: Record<string, unknown>[],
): Promise<void> {
	const collection = db.collection(col);
	await collection.deleteMany({});
	if (data.length > 0) {
		await collection.insertMany(data, { ordered: false });
	}
}
