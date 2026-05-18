// Centralized localStorage management with proper serialization.
// Mirrors: src/cljs/nr/local_storage.cljs

import { ALL_SETTINGS } from "../jinteki/settings";

/**
 * Serialize a value for localStorage storage.
 * Handles primitive types as-is, complex types as JSON.
 * Note: Sets are converted to arrays due to JSON limitations.
 */
function serializeValue(v: unknown): string | null {
  if (v === null || v === undefined) {
    return null;
  }
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
    return String(v);
  }
  // Convert Sets to arrays for JSON serialization (mirrors clj->js behavior)
  if (v instanceof Set) {
    return JSON.stringify([...v]);
  }
  return JSON.stringify(v);
}

/**
 * Deserialize a value from localStorage.
 * Uses the default-value to determine expected type.
 */
function deserializeValue<T>(storedValue: string | null, defaultValue: T): T {
  // No value stored
  if (storedValue === null) {
    return defaultValue;
  }

  // Simple types
  if (typeof defaultValue === "string") {
    return storedValue as unknown as T;
  }
  if (typeof defaultValue === "number") {
    return parseFloat(storedValue) as unknown as T;
  }
  if (typeof defaultValue === "boolean") {
    return (storedValue === "true") as unknown as T;
  }

  // Complex types - parse as JSON
  try {
    const parsed = JSON.parse(storedValue);
    // Special handling for sets
    if (defaultValue instanceof Set) {
      return new Set(parsed) as unknown as T;
    }
    return parsed as unknown as T;
  } catch {
    return defaultValue;
  }
}

/**
 * Save a value to localStorage with proper serialization.
 */
export function save(key: string, value: unknown): void {
  if (value === null || value === undefined) {
    localStorage.removeItem(key);
  } else {
    localStorage.setItem(key, serializeValue(value) as string);
  }
}

/**
 * Load a value from localStorage with proper deserialization.
 */
export function load<T>(key: string, defaultValue: T): T {
  return deserializeValue(localStorage.getItem(key), defaultValue);
}

/**
 * Remove a key from localStorage.
 */
export function remove(key: string): void {
  localStorage.removeItem(key);
}

/**
 * Migrate old key names to new ones.
 */
export function migrateKeys(migrations: [string, string][]): void {
  for (const [oldKey, newKey] of migrations) {
    const value = localStorage.getItem(oldKey);
    if (value !== null) {
      localStorage.setItem(newKey, value);
      localStorage.removeItem(oldKey);
    }
  }
}

/**
 * Update localStorage settings based on sync preferences.
 * - Removes all sync settings (they belong in database only)
 * - Optionally saves local-only settings from provided settings-map
 * - Handles localStorage unavailability gracefully
 */
export function updateLocalStorageSettings(
  settingsMap?: Record<string, unknown>,
): void {
  try {
    for (const setting of ALL_SETTINGS) {
      const storageKey = setting.key;
      if (setting.sync) {
        // Remove database-sourced settings from localStorage
        localStorage.removeItem(storageKey);
      } else {
        // Save local-only settings to localStorage (if provided)
        if (settingsMap && storageKey in settingsMap) {
          save(storageKey, settingsMap[storageKey]);
        }
      }
    }
  } catch (e) {
    console.warn("localStorage not available for settings update:", e);
  }
}

/**
 * Remove all sync settings from localStorage.
 * These should only persist in the database, not localStorage after logout.
 */
export function removeSyncSettings(): void {
  updateLocalStorageSettings();
}
