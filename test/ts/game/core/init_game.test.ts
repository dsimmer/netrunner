import { describe, test, is } from "vitest";
import { doGame } from "../test_framework";
import { newGame } from "../test_framework";

describe("init game - default identity", () => {
  test("both identities are specified", () => {
    doGame((state) => {
      newGame(state, {
        corp: { id: "Jinteki: Personal Evolution" },
        runner: { id: "Khan: Savvy Skiptracer" },
      });
      is(state.corp.identity.title === "Jinteki: Personal Evolution");
      is(state.runner.identity.title === "Khan: Savvy Skiptracer");
    });

    doGame((state) => {
      newGame({
        corp: { id: "Jinteki: Personal Evolution" },
        runner: { id: "Khan: Savvy Skiptracer" },
      });
      is(state.corp.identity.title === "Jinteki: Personal Evolution");
      is(state.runner.identity.title === "Khan: Savvy Skiptracer");
    });
  });

  test("only corp identity is specified", () => {
    doGame((state) => {
      newGame(state, { corp: { id: "Jinteki: Personal Evolution" } });
      is(state.corp.identity.title === "Jinteki: Personal Evolution");
      is(state.runner.identity.title === "The Professor: Keeper of Knowledge");
    });

    doGame((state) => {
      newGame({ corp: { id: "Jinteki: Personal Evolution" } });
      is(state.corp.identity.title === "Jinteki: Personal Evolution");
      is(state.runner.identity.title === "The Professor: Keeper of Knowledge");
    });
  });

  test("only runner identity is specified", () => {
    doGame((state) => {
      newGame(state, { runner: { id: "Khan: Savvy Skiptracer" } });
      is(
        state.corp.identity.title === "Custom Biotics: Engineered for Success"
      );
      is(state.runner.identity.title === "Khan: Savvy Skiptracer");
    });

    doGame((state) => {
      newGame({ runner: { id: "Khan: Savvy Skiptracer" } });
      is(
        state.corp.identity.title === "Custom Biotics: Engineered for Success"
      );
      is(state.runner.identity.title === "Khan: Savvy Skiptracer");
    });
  });

  test("no identities specified (defaults)", () => {
    doGame((state) => {
      newGame(state);
      is(
        state.corp.identity.title === "Custom Biotics: Engineered for Success"
      );
      is(state.runner.identity.title === "The Professor: Keeper of Knowledge");
    });

    doGame((state) => {
      newGame({});
      is(
        state.corp.identity.title === "Custom Biotics: Engineered for Success"
      );
      is(state.runner.identity.title === "The Professor: Keeper of Knowledge");
    });
  });
});
