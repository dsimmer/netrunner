import type { Db } from 'mongodb';
import { connect, disconnect, type TaskSystem } from './setup';
import * as fs from 'fs';
import * as path from 'path';

function formatYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function monthsAgo(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return formatYMD(d);
}

function csvEscape(value: unknown): string {
  const s = value == null ? '' : String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function csvLine(values: unknown[]): string {
  return values.map(csvEscape).join(',') + '\n';
}

function writeFile(
  headers: string[],
  filename: string,
  data: { _id: string | null; count: number }[]
): void {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const lines: string[] = [csvLine(headers)];
  for (const row of data) {
    lines.push(csvLine([row._id, row.count]));
  }
  fs.writeFileSync(filename, lines.join(''), 'utf-8');
}

async function allUsersFn(
  db: Db,
  date: Date
): Promise<{ _id: string; count: number }[]> {
  return db.collection('users').aggregate([
    {
      $match: {
        registrationDate: { $gte: date },
      },
    },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$registrationDate' } },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]).toArray() as Promise<{ _id: string; count: number }[]>;
}

async function allBackgroundsFn(
  db: Db,
  date: Date
): Promise<{ _id: string | null; count: number }[]> {
  return db.collection('users').aggregate([
    {
      $match: {
        registrationDate: { $gte: date },
      },
    },
    {
      $group: {
        _id: '$options.background',
        count: { $sum: 1 },
      },
    },
  ]).toArray() as Promise<{ _id: string | null; count: number }[]>;
}

async function aggregateShell(
  filename: string,
  startDateStr: string,
  userfn: (db: Db, date: Date) => Promise<{ _id: string | null; count: number }[]>,
  headers: string[]
): Promise<void> {
  const system: TaskSystem = await connect();
  try {
    const db = system.db;
    const startDate = new Date(startDateStr);
    const results = await userfn(db, startDate);
    writeFile(headers, filename, results);
    console.log(`Wrote ${results.length} entries`);
  } catch (e) {
    console.error(e);
    if (e instanceof Error) {
      e.stack?.split('\n').forEach((line) => console.error(line));
    }
  } finally {
    disconnect(system);
  }
}

/**
 * Return user registrations from a specified date (in YYYY-MM-DD format as a string)
 */
export async function allUsers(filename: string): Promise<void>;
export async function allUsers(filename: string, startDateStr: string): Promise<void>;
export async function allUsers(
  filename: string,
  startDateStr?: string
): Promise<void> {
  const effectiveDate = startDateStr ?? monthsAgo(3);
  await aggregateShell(filename, effectiveDate, allUsersFn, ['date', 'count']);
}

/**
 * Return game screen backgrounds from a specified date (in YYYY-MM-DD format as a string)
 */
export async function allBackgrounds(filename: string): Promise<void>;
export async function allBackgrounds(
  filename: string,
  startDateStr: string
): Promise<void>;
export async function allBackgrounds(
  filename: string,
  startDateStr?: string
): Promise<void> {
  const effectiveDate = startDateStr ?? monthsAgo(3);
  await aggregateShell(
    filename,
    effectiveDate,
    allBackgroundsFn,
    ['background', 'count']
  );
}
