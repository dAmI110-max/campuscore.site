import { attachDatabasePool } from "@vercel/functions";
import { pool } from "@workspace/db";
import app from "./app";
import { cleanExpiredStagingUploads } from "./lib/upload-maintenance";
import { createVercelHandler } from "./lib/vercel-handler";

// Register once per warm instance. No port listener, process-signal handlers,
// initial cleanup run, or hourly interval is started by importing this entry.
attachDatabasePool(pool);

export default createVercelHandler(app, () => cleanExpiredStagingUploads(10));
