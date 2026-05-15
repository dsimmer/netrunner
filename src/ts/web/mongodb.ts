// MongoDB helpers for the web layer.
// Mirrors: src/clj/web/mongodb.clj

import { Collection, Db, Document, ObjectId } from "mongodb";

// ---------------------------------------------------------------------------
// Date/time conversion helpers
// ---------------------------------------------------------------------------
// The Clojure version uses Monger's ConvertToDBObject / ConvertFromDBObject
// protocols to serialize java.time types to java.util.Date for MongoDB and
// deserialize back to LocalDateTime (UTC). The Node.js mongodb driver works
// natively with JavaScript Date, so these are provided as explicit helpers
// for any code that needs to normalise values before insert / after find.

/**
 * Convert a date-like value to a JavaScript Date suitable for MongoDB storage.
 * Mirrors: to-db-object for Instant, LocalDate, LocalDateTime, ZonedDateTime
 * (all normalised to UTC before storage).
 */
export function toDbObject(value: Date | string | number): Date {
  return new Date(value);
}

/**
 * Convert a MongoDB-stored Date back to an ISO UTC string (equivalent to
 * Clojure's from-db-object returning LocalDateTime in UTC).
 */
export function fromDbObject(input: Date): string {
  return input.toISOString();
}

// ---------------------------------------------------------------------------
// ObjectId helpers
// ---------------------------------------------------------------------------

/**
 * Create a new ObjectId, or convert a string to one.
 * Mirrors: ->object-id
 */
export function toObjectId(id?: string | ObjectId | null): ObjectId | undefined {
  if (!id) return undefined;
  if (id instanceof ObjectId) return id;
  return new ObjectId(id as string);
}

/**
 * Create a fresh ObjectId (no-arg variant of ->object-id).
 */
export function createObjectId(): ObjectId {
  return new ObjectId();
}

// ---------------------------------------------------------------------------
// Case-insensitive collation helpers
// ---------------------------------------------------------------------------

/**
 * Build a MongoDB collation option for case-insensitive string matching
 * (locale "en", strength 2).
 */
function createCollation(): { locale: string; strength: number } {
  return { locale: "en", strength: 2 };
}

/**
 * Returns a single document as a plain object from the collection matching
 * the query, using case-insensitive collation.
 *
 * Mirrors: find-one-as-map-case-insensitive
 */
export async function findOneAsMapCaseInsensitive(
  db: Db,
  coll: string,
  query: Document,
): Promise<Document | null> {
  const collection: Collection<Document> = db.collection(coll);
  return collection.findOne(query, { collation: createCollation() });
}

/**
 * Queries for documents in the collection, returning an array of plain
 * objects, using case-insensitive collation.
 *
 * Mirrors: find-maps-case-insensitive
 */
export async function findMapsCaseInsensitive(
  db: Db,
  coll: string,
  query: Document,
): Promise<Document[]> {
  const collection: Collection<Document> = db.collection(coll);
  return collection.find(query, { collation: createCollation() }).toArray();
}
