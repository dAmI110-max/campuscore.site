// Local-only production-function smoke; never deploys or changes workspace env.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createHmac } from "node:crypto";
import { readFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const settings = JSON.parse(await readFile(path.join(root, "vercel.json"), "utf8"));
for (const forbidden of ["framework", "buildCommand", "installCommand", "functions", "outputDirectory", "routes"]) {
  assert.equal(settings[forbidden], undefined, `No ambiguous top-level ${forbidden} in Services mode`);
}
assert.deepEqual(Object.keys(settings.services).sort(), ["api-server", "campus-core", "mockup-sandbox"]);
const selectService = pathname => settings.rewrites.find(rule =>
  new RegExp(`^(?:${rule.source})$`).test(pathname))?.destination.service;
for (const url of ["/api", "/api/healthz", "/api/__clerk/v1/client", "/api/commerce/webhooks/paystack", "/api/not-found"]) {
  assert.equal(selectService(url), "api-server", `API routing must take precedence for ${url}`);
}
for (const url of ["/", "/apiary", "/account", "/__mockup/preview/Component", "/mockup-sandbox"]) {
  assert.equal(selectService(url), "campus-core");
}
assert.ok(settings.rewrites.every(rule => rule.destination.service !== "mockup-sandbox"));
for (const service of Object.values(settings.services)) assert.equal(service.bindings?.length ?? 0, 0);
assert.equal(settings.services["api-server"].entrypoint, "vercel.mjs");
assert.equal(settings.services["api-server"].framework, "express");
assert.deepEqual(settings.crons, [{ path: "/api/internal/maintenance/uploads", schedule: "0 3 * * *" }]);
const frontend = settings.services["campus-core"];
assert.equal(frontend.rewrites[0].destination, "/index.html");
const web = path.join(root, frontend.root, frontend.outputDirectory);
const html = await readFile(path.join(web, "index.html"), "utf8");
const asset = html.match(/src="([^"]+\.js)"/)?.[1];
assert.ok(asset, "Frontend build must contain an actual built JavaScript asset");
await access(path.join(web, asset.replace(/^\//, "")));
const sandbox = settings.services["mockup-sandbox"];
await access(path.join(root, sandbox.root, sandbox.outputDirectory, "index.html"));

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

const backend = settings.services["api-server"];
const adapter = await import(path.join(root, backend.root, backend.entrypoint));
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
