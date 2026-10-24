import app from "./app";
import { logger } from "./lib/logger";
import { startUploadMaintenance } from "./lib/upload-maintenance";
import { pool } from "@workspace/db";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = app.listen(port, "0.0.0.0", () => {
  logger.info({ port }, "Server listening");
  startUploadMaintenance();
});

server.on("error", (err) => {
  logger.error({ err }, "Error listening on port");
  process.exitCode = 1;
});

let shuttingDown = false;
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "Shutting down");
    const forcedExit = setTimeout(() => process.exit(1), 15_000);
    forcedExit.unref();
    server.close(async (error) => {
      if (error) logger.error({ err: error }, "HTTP server shutdown failed");
      try {
        await pool.end();
      } catch (poolError) {
        logger.error({ err: poolError }, "Database pool shutdown failed");
        process.exitCode = 1;
      }
      clearTimeout(forcedExit);
    });
  });
}
