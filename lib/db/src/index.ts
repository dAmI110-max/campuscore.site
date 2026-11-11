import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const connectionString = process.env.DATABASE_URL.trim();
const isVercel = process.env.VERCEL === "1";
// Supabase and most hosted Postgres require TLS. node-pg does not always
// enable it from the URI alone on serverless runtimes.
const needsSsl =
  isVercel ||
  /supabase\.(co|com)/i.test(connectionString) ||
  /pooler\.supabase/i.test(connectionString) ||
  /[?&]sslmode=require/i.test(connectionString);

export const pool = new Pool({
  connectionString,
  ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
  ...(isVercel
    ? {
        max: 3,
        idleTimeoutMillis: 5_000,
        connectionTimeoutMillis: 10_000,
        allowExitOnIdle: true,
      }
    : {}),
});
export const db = drizzle(pool, { schema });

export * from "./schema";
