import dayjs from 'dayjs';
import type { Db } from 'mongodb';
import { connect, disconnect } from './setup';
import * as csv from 'csv-stringify';
import * as fs from 'fs';
import * as path from 'path';

const ymdFormatter = 'YYYY-MM-DD';

function monthsAgo(n: number): string {
  return dayjs().subtract(n, 'month').format(ymdFormatter);
}

function writeFile(
  headers: string[],
  filename: string,
  data: { _id: string; count: number }[]
): void {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const lines: string[] = [csv.stringifySync(headers)];
  for (const row of data) {
    lines.push(csv.stringifySync([row._id, row.count]));
  }
  fs.writeFileSync(filename, lines.join(''), 'utf-8');
}

async function allUsersFn(
  db: Db,
  date: dayjs.Dayjs
): Promise<{ _id: string; count: number }[]> {
  return db.collection('users').aggregate([
    {
      $match: {
        registrationDate: { $gte: date.toDate() },
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
  date: dayjs.Dayjs
): Promise<{ _id: string | null; count: number }[]> {
  return db.collection('users').aggregate([
    {
      $match: {
        registrationDate: { $gte: date.toDate() },
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
  userfn: (db: Db, date: dayjs.Dayjs) => Promise<unknown[]>,
  headers: string[]
): Promise<void> {
  const system = await connect();
  try {
    const { db } = system.mongodb;
    const startDate = dayjs(startDateStr);
    const results = await userfn(db, startDate);
    writeFile(headers, filename, results as { _id: string; count: number }[]);
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
