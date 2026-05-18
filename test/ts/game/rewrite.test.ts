// Tests for game/rewrite.ts
// Mirrors: test/clj/game/rewrite.clj (via rewrite.edn)

import { describe, it, expect } from "vitest";
import {
  isDeftest,
  isTesting,
  isBasicTest,
  getNodeSymbol,
  getTestingBranches,
  slugify,
  buildDeftestName,
} from "@/game/rewrite";

describe("rewrite", () => {
  describe("isDeftest", () => {
    it("returns true for deftest forms", () => {
      expect(isDeftest("(deftest foo ...)")).toBe(true);
    });

    it("returns true for deftest with metadata", () => {
      expect(isDeftest('(deftest ^{:foo "bar"} foo ...)')).toBe(true);
    });

    it("returns false for non-deftest forms", () => {
      expect(isDeftest("(testing \"a\" (is ...))")).toBe(false);
      expect(isDeftest("(defn foo [] ...)")).toBe(false);
    });
  });

  describe("isTesting", () => {
    it("returns true for testing forms", () => {
      expect(isTesting('(testing "a" (is ...))')).toBe(true);
    });

    it("returns false for non-testing forms", () => {
      expect(isTesting("(deftest foo ...)")).toBe(false);
    });
  });

  describe("isBasicTest", () => {
    it("returns true for basic test branches", () => {
      expect(isBasicTest('(testing "basic card test" (is ...))')).toBe(true);
    });

    it("returns false for non-basic test branches", () => {
      expect(isBasicTest('(testing "some other test" (is ...))')).toBe(false);
    });

    it("returns false for non-testing forms", () => {
      expect(isBasicTest("(deftest foo ...)")).toBe(false);
    });
  });

  describe("getNodeSymbol", () => {
    it("returns the deftest name", () => {
      expect(getNodeSymbol("(deftest foo ...)")).toBe("foo");
    });

    it("returns the deftest name with metadata", () => {
      expect(getNodeSymbol('(deftest ^{:foo "bar"} foo ...)')).toBe("foo");
    });

    it("handles keyword metadata", () => {
      expect(getNodeSymbol("(deftest ^:qualifier foo ...)")).toBe("foo");
    });

    it("handles complex metadata with nested braces", () => {
      expect(getNodeSymbol('(deftest ^{:a {:b "c"} :d "e"} my-test-name ...)')).toBe(
        "my-test-name",
      );
    });
  });

  describe("getTestingBranches", () => {
    it("returns the correct number of branches", () => {
      const source =
        '(deftest foo (testing "a" (is true)) (testing "b" (is true)))';
      expect(getTestingBranches(source)).toBe(2);
    });

    it("filters out basic test branches", () => {
      const source =
        '(deftest foo (testing "basic card test" (is true)) (testing "a" (is true)) (testing "b" (is true)))';
      // "basic card test" is filtered out, leaving 2
      expect(getTestingBranches(source)).toBe(2);
    });

    it("returns 0 when no testing branches", () => {
      const source = "(deftest foo (is true))";
      expect(getTestingBranches(source)).toBe(0);
    });

    it("handles nested parens inside testing", () => {
      const source =
        '(deftest foo (testing "nested" (is (= (f (g x)) y))) (testing "another" (is true)))';
      expect(getTestingBranches(source)).toBe(2);
    });
  });

  describe("slugify", () => {
    it("lowercases and replaces spaces", () => {
      expect(slugify("Hello World")).toBe("hello-world");
    });

    it("collapses multiple special chars", () => {
      expect(slugify("foo  !!!  bar")).toBe("foo-bar");
    });

    it("trims edge hyphens", () => {
      expect(slugify("!hello!")).toBe("hello");
    });

    it("keeps underscores and hyphens", () => {
      expect(slugify("foo_bar-baz")).toBe("foo_bar-baz");
    });
  });

  describe("buildDeftestName", () => {
    it("builds a slugified test name", () => {
      expect(buildDeftestName("card-test", '"some description"')).toBe(
        "card-test-some-description",
      );
    });

    it("handles quoted strings", () => {
      expect(buildDeftestName("my-test", '"hello world"')).toBe(
        "my-test-hello-world",
      );
    });

    it("handles unquoted strings", () => {
      expect(buildDeftestName("my-test", "hello world")).toBe(
        "my-test-hello-world",
      );
    });
  });
});
