import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ...(process.env.VERCEL === "1" ? {
    // Shared within a warm function instance; use an external pooled database
    // endpoint as well, since Vercel may create multiple instances.
    max: 3,
    idleTimeoutMillis: 5_000,
    connectionTimeoutMillis: 10_000,
    allowExitOnIdle: true,
  } : {}),
});
export const db = drizzle(pool, { schema });

export * from "./schema";
