// Vite build config for the TypeScript+React frontend.
// Replaces shadow-cljs.edn for the new TS stack.
/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  root: "src/ts",
  publicDir: "../../resources/public",
  build: {
    outDir: "../../resources/public/js",
    emptyOutDir: false,
    rollupOptions: {
      input: resolve(__dirname, "src/ts/main.tsx"),
    },
  },
  server: {
    port: 3000,
    proxy: {
      // Proxy API and WebSocket requests to Go backend during development
      "/chsk": { target: "http://localhost:1042", ws: true },
      "/data": "http://localhost:1042",
      "/register": "http://localhost:1042",
      "/login": "http://localhost:1042",
      "/logout": "http://localhost:1042",
      "/forgot": "http://localhost:1042",
      "/profile": "http://localhost:1042",
      "/admin": "http://localhost:1042",
      "/game": "http://localhost:1042",
      "/messages": "http://localhost:1042",
      "/chat": "http://localhost:1042",
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src/ts"),
    },
  },
});
