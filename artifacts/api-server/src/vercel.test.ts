import test from "node:test";
import assert from "node:assert/strict";
import { createServer, type RequestListener } from "node:http";
import { createVercelHandler, UPLOAD_MAINTENANCE_PATH } from "./lib/vercel-handler";

const secret = "synthetic-cron-secret-for-tests-only-123456";

async function withServer(handler: RequestListener, check: (base: string) => Promise<void>) {
  const server = createServer(handler);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try {
    await check(`http://127.0.0.1:${address.port}`);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

test("Vercel adapter preserves the complete API URL, query and raw request body", async () => {
  const raw = '{ "event": "fixture", "spacing":  true }\n';
  const handler = createVercelHandler((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", chunk => chunks.push(Buffer.from(chunk)));
    req.on("end", () => res.end(JSON.stringify({ url: req.url, raw: Buffer.concat(chunks).toString() })));
  }, async () => { assert.fail("Ordinary requests must not invoke cleanup"); });
  await withServer(handler, async base => {
    const result = await fetch(`${base}/api/commerce/webhooks/paystack?fixture=1`, { method: "POST", body: raw });
    assert.deepEqual(await result.json(), { url: "/api/commerce/webhooks/paystack?fixture=1", raw });
  });
});

test("Vercel maintenance rejects missing/wrong authorization and unsupported methods before cleanup", async () => {
  let calls = 0;
  const handler = createVercelHandler(() => assert.fail("Maintenance must not enter public routing"),
    async () => { calls++; }, () => secret);
  await withServer(handler, async base => {
    const endpoint = `${base}${UPLOAD_MAINTENANCE_PATH}`;
    assert.equal((await fetch(endpoint)).status, 401);
    assert.equal((await fetch(endpoint, { headers: { Authorization: "Bearer forged" } })).status, 401);
    const wrongMethod = await fetch(endpoint, { method: "POST", headers: { Authorization: `Bearer ${secret}` } });
    assert.equal(wrongMethod.status, 405);
    assert.equal(wrongMethod.headers.get("allow"), "GET");
    assert.equal(calls, 0);
    const accepted = await fetch(endpoint, { headers: { Authorization: `Bearer ${secret}` } });
    assert.equal(accepted.status, 200);
    assert.equal(accepted.headers.get("cache-control"), "no-store");
    assert.equal(calls, 1);
  });
});

test("Vercel maintenance fails closed when its server-only secret is unconfigured", async () => {
  for (const value of [undefined, "", "too-short"]) {
    const handler = createVercelHandler(() => assert.fail("Unexpected public routing"),
      async () => assert.fail("Unconfigured cleanup must never execute"), () => value);
    await withServer(handler, async base => {
      assert.equal((await fetch(`${base}${UPLOAD_MAINTENANCE_PATH}`)).status, 503);
    });
  }
});

test("Vercel maintenance failures do not expose internal error contents", async () => {
  const handler = createVercelHandler(() => assert.fail("Unexpected public routing"),
    async () => { throw new Error("private object path and database details"); }, () => secret);
  await withServer(handler, async base => {
    const result = await fetch(`${base}${UPLOAD_MAINTENANCE_PATH}`, { headers: { Authorization: `Bearer ${secret}` } });
    assert.equal(result.status, 503);
    assert.doesNotMatch(await result.text(), /private|database details/);
  });
});
