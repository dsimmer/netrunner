// Tests for jinteki/settings.ts
// Mirrors: src/cljc/jinteki/settings.cljc
import { describe, it, expect } from "vitest";
import {
  ALL_SETTINGS, defaultSettings, syncKeys, localOnlyKeys, settingKeys,
  filterValidSettings, getSetting,
} from "../../../src/ts/jinteki/settings";
import * as S from "../../../src/ts/jinteki/settings";

describe("ALL_SETTINGS", () => {
  it("contains all expected settings", () => {
    const keys = ALL_SETTINGS.map(s => s.key);
    expect(keys).toContain("language");
    expect(keys).toContain("sounds");
    expect(keys).toContain("background");
    expect(keys).toContain("pronouns");
    expect(keys).toContain("alt-arts");
  });

  it("has 40+ settings", () => {
    expect(ALL_SETTINGS.length).toBeGreaterThanOrEqual(40);
  });
});

describe("defaultSettings", () => {
  it("returns an object with a value for every setting key", () => {
    const defaults = defaultSettings();
    for (const s of ALL_SETTINGS) {
      expect(defaults).toHaveProperty(s.key);
    }
  });

  it("background default is worlds2020", () => {
    expect(defaultSettings()["background"]).toBe("worlds2020");
  });
});

describe("syncKeys", () => {
  it("includes language", () => {
    expect(syncKeys()).toContain("language");
  });

  it("does not include sounds (device-local)", () => {
    expect(syncKeys()).not.toContain("sounds");
  });

  it("does not include labeled-cards (device-local)", () => {
    expect(syncKeys()).not.toContain("labeled-cards");
  });
});

describe("localOnlyKeys", () => {
  it("includes sounds", () => {
    expect(localOnlyKeys()).toContain("sounds");
  });

  it("does not include language (synced)", () => {
    expect(localOnlyKeys()).not.toContain("language");
  });
});

describe("settingKeys + sync/local partition", () => {
  it("sync + local = all", () => {
    const all = new Set(settingKeys());
    const sync = new Set(syncKeys());
    const local = new Set(localOnlyKeys());
    for (const key of all) {
      expect(sync.has(key) || local.has(key)).toBe(true);
    }
  });

  it("sync and local are disjoint", () => {
    const sync = new Set(syncKeys());
    for (const key of localOnlyKeys()) {
      expect(sync.has(key)).toBe(false);
    }
  });
});

describe("filterValidSettings", () => {
  it("keeps valid values", () => {
    const result = filterValidSettings({ "language": "en", "sounds": true });
    expect(result["language"]).toBe("en");
    expect(result["sounds"]).toBe(true);
  });

  it("removes invalid values", () => {
    const result = filterValidSettings({ "language": "invalid-lang-code" });
    expect(result["language"]).toBeUndefined();
  });

  it("removes unknown keys", () => {
    const result = filterValidSettings({ "not-a-real-setting": true });
    expect(result["not-a-real-setting"]).toBeUndefined();
  });

  it("accepts valid background slug", () => {
    const result = filterValidSettings({ "background": "apex-bg" });
    expect(result["background"]).toBe("apex-bg");
  });

  it("rejects invalid background slug", () => {
    const result = filterValidSettings({ "background": "not-a-bg" });
    expect(result["background"]).toBeUndefined();
  });
});

describe("getSetting", () => {
  it("returns the setting def for a valid key", () => {
    const def = getSetting("language");
    expect(def).toBeDefined();
    expect(def?.key).toBe("language");
    expect(def?.sync).toBe(true);
  });

  it("returns undefined for unknown key", () => {
    expect(getSetting("this-key-does-not-exist")).toBeUndefined();
  });
});

describe("VALID_LANGUAGES", () => {
  it("includes en", () => expect(S.VALID_LANGUAGES.has("en")).toBe(true));
  it("does not include xx", () => expect(S.VALID_LANGUAGES.has("xx")).toBe(false));
});

describe("VALID_PRONOUNS", () => {
  it("includes they", () => expect(S.VALID_PRONOUNS.has("they")).toBe(true));
  it("does not include invalid value", () => expect(S.VALID_PRONOUNS.has("invalid")).toBe(false));
});
