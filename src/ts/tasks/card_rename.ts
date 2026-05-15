/* eslint-disable no-console */
import { Db } from "mongodb";
import { connect, disconnect } from "./setup";

// ---------------------------------------------------------------------------
// card_rename (mirrors tasks.card-rename)
// Rename cards used in decks
// ---------------------------------------------------------------------------

/**
 * Replace a card name in all decks with a new card name.
 * Mirrors: (command from to)
 * @param from - The old card name to find
 * @param to   - The new card name to replace with
 */
export async function command(from: string, to: string, db: Db): Promise<void> {
  console.log("Renaming", from, "->", to);

  const origCount = await db
    .collection("decks")
    .countDocuments({ "cards.card": from });
  console.log("Found", origCount, "decks containing", from);

  const result = await db
    .collection("decks")
    .updateMany({ "cards.card": from }, { $set: { "cards.$.card": to } });

  console.log("Updated", result.modifiedCount, "decks");
}
