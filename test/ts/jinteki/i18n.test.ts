// Tests for jinteki/i18n.ts
// Mirrors: test/cljc/jinteki/i18n_test.clj
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadDictionary, insertLang, getContent, getBundle, getTranslation, format } from "../../../src/ts/jinteki/i18n";
import * as i18n from "../../../src/ts/jinteki/i18n";

// Re-access the internal dictionary via the module's exported functions
// insertLang mutates module-level state; we test with it directly.

describe("loadDictionary", () => {
  it("loads all language files without errors", () => {
    const errors = loadDictionary("resources/public/i18n");
    expect(errors).toEqual([]);
  });
});

describe("insertLang / getContent / getBundle", () => {
  beforeEach(() => {
    // Insert a minimal test bundle so tests are self-contained
    insertLang("test", "hello = Hello World\n");
  });

  afterEach(() => {
    // Clean up by re-inserting (we have no public clear API; tests are isolated via vitest threads)
  });

  it("stores and retrieves content", () => {
    const content = getContent("test");
    expect(content).toBeDefined();
    expect(content).toContain("hello = Hello World");
  });

  it("returns bundle for inserted language", () => {
    const bundle = getBundle("test");
    expect(bundle).toBeDefined();
  });

  it("returns undefined for unknown language", () => {
    expect(getContent("zz")).toBeUndefined();
    expect(getBundle("zz")).toBeUndefined();
  });
});

describe("getTranslation", () => {
  it("returns null for undefined bundle", () => {
    expect(getTranslation(undefined, "hello")).toBeNull();
  });

  it("returns the translation for a known key", () => {
    insertLang("test2", "greeting = Hello { $name }\n");
    const bundle = getBundle("test2");
    const result = getTranslation(bundle, "greeting", { name: "World" });
    expect(result).toContain("Hello");
    expect(result).toContain("World");
  });

  it("returns null for unknown key", () => {
    insertLang("test3", "known-key = value\n");
    const bundle = getBundle("test3");
    expect(getTranslation(bundle, "unknown-key")).toBeNull();
  });
});

describe("format", () => {
  it("returns translation for known key", () => {
    insertLang("fmt-test", "test-msg = Formatted Message\n");
    const cursor = () => "fmt-test";
    const result = format(cursor, "test-msg");
    expect(result.translation).toBe("Formatted Message");
    expect(result.targetLanguage).toBe(true);
  });

  it("returns fallback when key not found", () => {
    const cursor = () => "en";
    const result = format(cursor, ["nonexistent-key", "Fallback text"]);
    expect(result.translation).toBe("Fallback text");
    expect(result.targetLanguage).toBeNull();
  });

  it("falls back to en when target not found and no fallback provided", () => {
    // "about_about" should exist in en.ftl after loadDictionary
    loadDictionary("resources/public/i18n");
    // Use a language that exists but won't have every key
    // "fmt-test" was inserted earlier and only has "test-msg"
    insertLang("fmt-test", "test-msg = Formatted Message\n");
    const cursor = () => "fmt-test";
    const result = format(cursor, "about_about");
    expect(result.translation).toBeDefined();
    // Key not in fmt-test, falls back to en, so targetLanguage is null
    expect(result.targetLanguage).toBeNull();
  });

  it("uses default language 'en' when cursor returns null", () => {
    loadDictionary("resources/public/i18n");
    const cursor = () => null;
    const result = format(cursor, "about_about");
    expect(result.translation).toBeDefined();
    expect(result.translation).toContain("About");
  });
});
