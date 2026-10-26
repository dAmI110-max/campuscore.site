// Local-only production-function smoke; never deploys or changes workspace env.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createHmac } from "node:crypto";
import { readFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const settings = JSON.parse(await readFile(path.join(root, "vercel.json"), "utf8"));
assert.equal(settings.framework, null);
assert.equal(settings.buildCommand, "pnpm run build:vercel");
assert.equal(settings.routes[0].dest, "/api/index.mjs");
const apiRoute = new RegExp(`^(?:${settings.routes[0].src})$`);
for (const url of ["/api", "/api/healthz", "/api/__clerk/v1/client", "/api/commerce/webhooks/paystack", "/api/not-found"]) {
  assert.ok(apiRoute.test(url), `API routing must take precedence for ${url}`);
}
assert.equal(apiRoute.test("/apiary"), false);
assert.equal(settings.routes[1].handle, "filesystem");
assert.equal(settings.routes[2].dest, "/index.html");
const web = path.join(root, settings.outputDirectory);
const html = await readFile(path.join(web, "index.html"), "utf8");
const asset = html.match(/src="([^"]+\.js)"/)?.[1];
assert.ok(asset, "Frontend build must contain an actual built JavaScript asset");
await access(path.join(web, asset.replace(/^\//, "")));

process.env.NODE_ENV = "production";
process.env.VERCEL = "1";
process.env.CRON_SECRET = ""; // No actual cleanup is permitted in this smoke.
// Synthetic test fixtures in this process only; no provider request is allowed.
process.env.PAYMENTS_ENABLED = "true";
process.env.PAYSTACK_MODE = "test";
process.env.PAYSTACK_SECRET_KEY = "sk_test_local_smoke_fixture_not_a_credential";
process.env.PAYSTACK_CALLBACK_URL = "https://smoke.example.invalid/payment/callback";
process.env.PAYSTACK_WEBHOOKS_ENABLED = "true";
process.env.PAYSTACK_LIVE_CHECKOUT_ENABLED = "false";
const realFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  assert.notEqual(url.hostname, "api.paystack.co", "Smoke must not contact Paystack");
  return realFetch(input, init);
};

const adapter = await import(path.join(root, "api/index.mjs"));
assert.equal(adapter.config.api.bodyParser, false);
const server = createServer(adapter.default);
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
try {
  assert.equal((await fetch(`${base}/api/healthz`)).status, 200);
  assert.equal((await fetch(`${base}/api/not-found`)).status, 404);
  assert.equal((await fetch(`${base}/account`)).status, 404, "SPA is served by CDN, not the function");
  assert.equal((await fetch(`${base}/api/internal/maintenance/uploads`)).status, 503);
  assert.equal((await fetch(`${base}/api/commerce/checkout/verify`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reference: "nonexistent-smoke-reference" }),
  })).status, 401);

  const raw = '{ "event": "local-smoke.ignored", "data": {} }\n';
  const signature = createHmac("sha512", process.env.PAYSTACK_SECRET_KEY).update(raw).digest("hex");
  const sendWebhook = body => fetch(`${base}/api/commerce/webhooks/paystack`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-paystack-signature": signature }, body,
  });
  assert.equal((await sendWebhook(raw)).status, 200, "Exact signed raw bytes reach Express");
  assert.equal((await sendWebhook(`${raw} `)).status, 401, "Byte changes invalidate the HMAC");
  console.log("PASS: Vercel config/API precedence, built SPA/assets, function import without listener, database health, API 404, auth rejection, disabled maintenance, and exact-byte webhook HMAC.");
  console.log("This is a local function smoke, not a Vercel-hosted deployment or real Paystack transaction.");
} finally {
  server.closeAllConnections();
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  globalThis.fetch = realFetch;
}
