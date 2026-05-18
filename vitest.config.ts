/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    include: ["test/ts/**/*.test.ts", "test/ts/**/*.test.tsx"],
    environment: "jsdom",
    globals: true,
    setupFiles: ["test/ts/setup.ts"],
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src/ts"),
    },
  },
});
