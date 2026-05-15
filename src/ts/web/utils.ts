import * as crypto from 'crypto';

export interface HttpResponse {
  status: number;
  body: any;
  headers: Record<string, string>;
}

/**
 * Call callback every ms milliseconds. First call will be after ms.
 * Timeout is applied to each call and defaults to 5 minutes (300000ms).
 * Calls which timeout or error 3 times in a row will be cancelled.
 * Returns a function to stop the tick.
 */
export function tick(callback: () => void, ms: number, timeout: number = 300000): () => void {
  let failures = 0;
  const intervalId = setInterval(() => {
    if (failures > 3) {
      clearInterval(intervalId);
      console.log("Tick task failed.");
      return;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    Promise.resolve(callback())
      .then(() => {
        clearTimeout(timeoutId);
        failures = 0;
      })
      .catch((e: any) => {
        clearTimeout(timeoutId);
        console.log("Caught an error in tick");
        console.error(e);
        failures++;
      });
  }, ms);

  return () => clearInterval(intervalId);
}

/**
 * Create an HTTP response with the given status code and body.
 */
export function response(statusCode: number, msg: any): HttpResponse {
  return { status: statusCode, body: msg, headers: {} };
}

/**
 * Create an HTML HTTP response with the given status code and body.
 */
export function htmlResponse(statusCode: number, msg: any): HttpResponse {
  return { status: statusCode, body: msg, headers: { 'Content-Type': 'text/html' } };
}

/**
 * Create a JSON HTTP response with the given status code and body.
 */
export function jsonResponse(statusCode: number, msg: any): HttpResponse {
  return { status: statusCode, body: msg, headers: { 'Content-Type': 'application/json' } };
}

/**
 * Compute the MD5 hash of a string, returning a 32-character hex string.
 */
export function md5(s: string): string {
  return crypto.createHash('md5').update(s).digest('hex');
}

/**
 * Calculate the average of an array of numbers. Returns 0 for empty arrays.
 */
export function average(numbers: number[]): number {
  if (numbers.length === 0) {
    return 0;
  }
  return numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
}

/**
 * Convert a MongoDB date (Date object or string) to a UTC ISO string.
 * Returns empty string for null/undefined values.
 */
export function mongoTimeToUtcString(s: Date | string | null | undefined): string {
  if (!s) {
    return '';
  }
  const date = s instanceof Date ? s : new Date(s);
  return date.toISOString();
}
