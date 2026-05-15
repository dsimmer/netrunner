// Main entry point for the Jinteki server. Mirrors: src/clj/web/core.clj
// Starts all server components, logs startup information, and registers a shutdown hook.

import { start, stop } from "./system";
import { timbreInit, info } from "./logs";

async function main(): Promise<void> {
  const system = await start();
  const port = system.config["web/server"]?.port;
  const serverMode = system.config["server/mode"];
  const config = system.mongo
    ? await system.mongo.db.collection("config").findOne({})
    : null;
  const frontendVersion = config?.version;

  timbreInit();
  info(`Jinteki server running in ${serverMode} mode on port ${port}`);
  info(`Frontend version ${frontendVersion}`);

  process.on("SIGTERM", async () => {
    await stop(system);
    process.exit(0);
  });

  process.on("SIGINT", async () => {
    await stop(system);
    process.exit(0);
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Failed to start server", err);
  process.exit(1);
});
