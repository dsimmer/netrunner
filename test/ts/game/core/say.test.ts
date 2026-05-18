import { describe, expect, it } from "vitest";
import { say, systemSay } from "@/game/core/say";
import { newGame, type GameState } from "../test_framework";
import { lastLogContains } from "../test_framework/index";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createState(): GameState {
  return newGame();
}

function publicLogTexts(state: GameState): string[] {
  return state.log.public.map((e: any) => e.text ?? "");
}

function runnerLogTexts(state: GameState): string[] {
  return state.log.runner.map((e: any) => e.text ?? "");
}

function corpLogTexts(state: GameState): string[] {
  return state.log.corp.map((e: any) => e.text ?? "");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("game.core.say", () => {
  describe("say (basic)", () => {
    it("logs a public message by default", () => {
      const state = createState();
      say(state, "corp", { text: "Hello, world!" });
      expect(lastLogContains(state, "Hello, world!")).toBe(true);
    });
  });

  describe("say-someone", () => {
    it("logs a message using a custom user object", () => {
      const state = createState();
      say(state, "corp", {
        user: { username: "CustomUser", emailhash: "abc123" },
        text: "CustomUser speaks",
      });
      expect(lastLogContains(state, "CustomUser speaks")).toBe(true);
    });
  });

  describe("say-someone-to", () => {
    it("logs a message from a custom user to a specific side", () => {
      const state = createState();
      say(
        state,
        "corp",
        {
          user: { username: "CustomUser", emailhash: "abc123" },
          text: "Secret message to runner",
        },
        "runner",
      );
      // Should NOT appear in public log
      expect(lastLogContains(state, "Secret message to runner")).toBe(false);
      // Should appear in runner-only log
      expect(lastLogContains(state, "Secret message to runner", "runner")).toBe(
        true,
      );
    });
  });

  describe("say-someone-with-params", () => {
    it("substitutes pronouns based on the speaking side", () => {
      const state = createState();
      // Pronouns are selected from state.corp.user, not the custom user
      (state.corp.user as any).options = { pronouns: "she" };
      say(state, "corp", {
        user: {
          username: "SheUser",
          emailhash: "abc123",
        },
        text: "[pronoun] keys are missing",
      });
      expect(lastLogContains(state, "her keys are missing")).toBe(true);
    });
  });

  describe("say-to", () => {
    it("systemSay logs to a specific side", () => {
      const state = createState();
      systemSay(state, "corp", "Corp sees this", { logSide: "corp" });
      // Should NOT appear in public log
      expect(lastLogContains(state, "Corp sees this")).toBe(false);
      // Should appear in corp-only log
      expect(lastLogContains(state, "Corp sees this", "corp")).toBe(true);
    });
  });

  describe("say-with-params", () => {
    it("systemSay substitutes pronouns based on the side", () => {
      const state = createState();
      // Set corp pronoun to "she"
      (state.corp.user as any).options = { pronouns: "she" };
      systemSay(state, "corp", "[pronoun] agenda is scored");
      expect(lastLogContains(state, "her agenda is scored")).toBe(true);
    });
  });

  describe("say-no-tags", () => {
    it("systemSay messages appear without user tags in the log", () => {
      const state = createState();
      systemSay(state, "corp", "System message here");
      const lastEntry = state.log.public[state.log.public.length - 1];
      // System messages have user set to "__system__"
      expect(lastEntry?.user).toBe("__system__");
      expect(lastEntry?.text).toContain("System message here");
    });
  });

  describe("pronoun substitution", () => {
    it("uses corp pronoun when side is corp", () => {
      const state = createState();
      (state.corp.user as any).options = { pronouns: "he" };
      say(state, "corp", { text: "[pronoun] score is high" });
      expect(lastLogContains(state, "his score is high")).toBe(true);
    });

    it("uses runner pronoun when side is runner", () => {
      const state = createState();
      (state.runner.user as any).options = { pronouns: "she" };
      say(state, "runner", { text: "[pronoun] run is successful" });
      expect(lastLogContains(state, "her run is successful")).toBe(true);
    });

    it("uses default 'their' when no pronouns set", () => {
      const state = createState();
      // Default user has no options.pronouns
      say(state, "corp", { text: "[pronoun] turn" });
      expect(lastLogContains(state, "their turn")).toBe(true);
    });

    it("supports [corp-pronoun] and [runner-pronoun] placeholders", () => {
      const state = createState();
      (state.corp.user as any).options = { pronouns: "he" };
      (state.runner.user as any).options = { pronouns: "she" };
      say(state, "corp", {
        text: "[corp-pronoun] vs [runner-pronoun]",
      });
      expect(lastLogContains(state, "his vs her")).toBe(true);
    });

    it("supports [their] placeholder as alias for [pronoun]", () => {
      const state = createState();
      (state.corp.user as any).options = { pronouns: "heit" };
      say(state, "corp", { text: "[their] credits" });
      expect(lastLogContains(state, "its credits")).toBe(true);
    });
  });

  describe("log sides", () => {
    it("default log side is public", () => {
      const state = createState();
      say(state, "corp", { text: "public message" });
      expect(publicLogTexts(state).pop()).toContain("public message");
    });

    it("can log to runner side only", () => {
      const state = createState();
      say(state, "corp", { text: "runner only" }, "runner");
      expect(runnerLogTexts(state).pop()).toContain("runner only");
      expect(publicLogTexts(state).some((t) => t.includes("runner only"))).toBe(
        false,
      );
    });

    it("can log to corp side only", () => {
      const state = createState();
      say(state, "runner", { text: "corp only" }, "corp");
      expect(corpLogTexts(state).pop()).toContain("corp only");
      expect(publicLogTexts(state).some((t) => t.includes("corp only"))).toBe(
        false,
      );
    });

    it("can log to multiple sides", () => {
      const state = createState();
      say(state, "corp", { text: "multi side" }, ["corp", "runner"]);
      expect(corpLogTexts(state).pop()).toContain("multi side");
      expect(runnerLogTexts(state).pop()).toContain("multi side");
      expect(publicLogTexts(state).some((t) => t.includes("multi side"))).toBe(
        false,
      );
    });
  });

  describe("systemSay", () => {
    it("creates a system message", () => {
      const state = createState();
      systemSay(state, "corp", "System alert");
      expect(lastLogContains(state, "System alert")).toBe(true);
      const lastEntry = state.log.public[state.log.public.length - 1];
      expect(lastEntry?.user).toBe("__system__");
    });

    it("appends [hr] when hr option is true", () => {
      const state = createState();
      systemSay(state, "corp", "Divider message", { hr: true });
      expect(lastLogContains(state, "Divider message [hr]")).toBe(true);
    });

    it("uses default public log side when no logSide specified", () => {
      const state = createState();
      systemSay(state, "runner", "Default public");
      expect(lastLogContains(state, "Default public")).toBe(true);
    });
  });
});
