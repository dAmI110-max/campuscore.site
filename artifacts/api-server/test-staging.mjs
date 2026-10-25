import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const confirmation = "I_CONFIRM_NON_PRODUCTION_STAGING";
if (process.env.CAMPUS_CORE_STAGING_CONFIRMATION !== confirmation) {
  throw new Error(`Set CAMPUS_CORE_STAGING_CONFIRMATION=${confirmation} only after confirming both targets are non-production staging resources.`);
}
if (!process.env.API_TEST_BASE_URL || !process.env.DATABASE_URL) {
  throw new Error("Staging tests require API_TEST_BASE_URL and DATABASE_URL for the same staging environment.");
}

const api = new URL(process.env.API_TEST_BASE_URL);
const database = new URL(process.env.DATABASE_URL);
const productionHost = /(^|[.-])prod(?:uction)?([.-]|$)/i;
if (productionHost.test(api.hostname) || productionHost.test(database.hostname)) {
  throw new Error("The staging test harness refuses hostnames marked as production.");
}
if (api.protocol !== "https:" && !["localhost", "127.0.0.1", "::1"].includes(api.hostname)) {
  throw new Error("Remote staging API tests require HTTPS.");
}

const here = path.dirname(fileURLToPath(import.meta.url));
const result = spawnSync(process.execPath, [path.join(here, "test.mjs")], { stdio: "inherit" });
process.exit(result.status ?? 1);
