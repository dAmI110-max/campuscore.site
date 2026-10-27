import { attachDatabasePool } from "@vercel/functions";
import express from "express";
import { pool } from "@workspace/db";
import app from "./app";
import { cleanExpiredStagingUploads } from "./lib/upload-maintenance";
import { createVercelHandler } from "./lib/vercel-handler";

// Register once per warm instance. No port listener, process-signal handlers,
// initial cleanup run, or hourly interval is started by importing this entry.
attachDatabasePool(pool);

// Export a real Express application for the service's Express framework.
// The outer app has no body parser: the existing app owns exact-byte parsing.
const serverlessApp = express();
serverlessApp.disable("x-powered-by");
serverlessApp.use(createVercelHandler(app, () => cleanExpiredStagingUploads(10)));
export default serverlessApp;
