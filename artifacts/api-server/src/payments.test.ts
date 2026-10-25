import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { assertPaymentMatches, reconcilePayment, type ExpectedPayment } from "./lib/payment-boundary";
import {
  getPaystackRuntime, hasValidPaystackSignature, parsePaystackEvidence, PaystackClient,
  type PaystackConfig,
} from "./lib/paystack";

const config: PaystackConfig = {
  mode: "test",
  secretKey: "sk_test_unit_test_key",
  callbackUrl: "https://campus-core.example.invalid/payment/callback",
};

test("Paystack readiness fails closed unless explicitly enabled with a matching key and HTTPS callback", () => {
  assert.deepEqual(getPaystackRuntime({}), { config: null, mode: "disabled", webhooksEnabled: false });
  const enabled = getPaystackRuntime({
    PAYMENTS_ENABLED: "true",
    PAYSTACK_MODE: "test",
    PAYSTACK_SECRET_KEY: config.secretKey,
    PAYSTACK_CALLBACK_URL: config.callbackUrl,
    PAYSTACK_WEBHOOKS_ENABLED: "true",
  });
  assert.equal(enabled.mode, "test");
  assert.equal(enabled.webhooksEnabled, true);
  assert.equal(getPaystackRuntime({
    PAYMENTS_ENABLED: "true", PAYSTACK_MODE: "live", PAYSTACK_SECRET_KEY: "sk_live_unit_test_key",
    PAYSTACK_CALLBACK_URL: config.callbackUrl, NODE_ENV: "production",
  }).mode, "disabled");
  assert.equal(getPaystackRuntime({
    PAYMENTS_ENABLED: "true", PAYSTACK_MODE: "live", PAYSTACK_SECRET_KEY: "sk_live_unit_test_key",
    PAYSTACK_CALLBACK_URL: config.callbackUrl, NODE_ENV: "production", PAYSTACK_LIVE_CHECKOUT_ENABLED: "true",
  }).mode, "live");
  assert.equal(getPaystackRuntime({
    PAYMENTS_ENABLED: "true", PAYSTACK_MODE: "test", PAYSTACK_SECRET_KEY: "sk_live_wrong_mode",
    PAYSTACK_CALLBACK_URL: config.callbackUrl,
  }).mode, "disabled");
  assert.equal(getPaystackRuntime({
    PAYMENTS_ENABLED: "true", PAYSTACK_MODE: "test", PAYSTACK_SECRET_KEY: config.secretKey,
    PAYSTACK_CALLBACK_URL: "http://campus-core.example.invalid/callback",
  }).mode, "disabled");
});

test("Paystack initialization sends only server-provided amount, email, reference and metadata", async () => {
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    capturedUrl = String(input);
    capturedInit = init;
    return new Response(JSON.stringify({
      status: true,
      data: {
        reference: "order-12345678",
        authorization_url: "https://checkout.paystack.com/test-session",
      },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  const client = new PaystackClient(config, fetcher);
  const result = await client.initializeTransaction({
    email: "verified@example.invalid",
    amountMinor: 200000,
    reference: "order-12345678",
    orderId: "order-12345678",
    kind: "premium",
  });

  assert.equal(capturedUrl, "https://api.paystack.co/transaction/initialize");
  assert.equal(capturedInit?.method, "POST");
  const headers = capturedInit?.headers as Record<string, string>;
  assert.equal(headers.Authorization, `Bearer ${config.secretKey}`);
  const body = JSON.parse(String(capturedInit?.body)) as Record<string, unknown>;
  assert.equal(body.amount, "200000");
  assert.equal(body.currency, "NGN");
  assert.equal(body.email, "verified@example.invalid");
  assert.equal(body.reference, "order-12345678");
  assert.deepEqual(JSON.parse(String(body.metadata)), { orderId: "order-12345678", kind: "premium" });
  assert.equal(result.authorizationUrl, "https://checkout.paystack.com/test-session");
});

test("Paystack initialization rejects provider references and redirect URLs that do not match the order", async () => {
  const badReference = new PaystackClient(config, (async () => new Response(JSON.stringify({
    status: true, data: { reference: "different-reference", authorization_url: "https://checkout.paystack.com/test" },
  }), { status: 200 })) as typeof fetch);
  await assert.rejects(badReference.initializeTransaction({
    email: "verified@example.invalid", amountMinor: 200000, reference: "order-12345678",
    orderId: "order-12345678", kind: "premium",
  }), /valid checkout link/);

  const badRedirect = new PaystackClient(config, (async () => new Response(JSON.stringify({
    status: true, data: { reference: "order-12345678", authorization_url: "https://attacker.example/checkout" },
  }), { status: 200 })) as typeof fetch);
  await assert.rejects(badRedirect.initializeTransaction({
    email: "verified@example.invalid", amountMinor: 200000, reference: "order-12345678",
    orderId: "order-12345678", kind: "premium",
  }), /valid checkout link/);
});

test("Provider verification reads transaction data from the authenticated Paystack API response", async () => {
  let requestUrl = "";
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    requestUrl = String(input);
    assert.equal(init?.method, "GET");
    return new Response(JSON.stringify({
      status: true,
      data: {
        status: "success", reference: "order-12345678", amount: 200000,
        currency: "NGN", domain: "test", metadata: JSON.stringify({ orderId: "order-12345678" }), fees: 1500,
      },
    }), { status: 200 });
  }) as typeof fetch;
  const data = await new PaystackClient(config, fetcher).verifyTransaction("order-12345678");
  assert.equal(requestUrl, "https://api.paystack.co/transaction/verify/order-12345678");
  const evidence = parsePaystackEvidence(data);
  assert.equal(evidence.orderId, "order-12345678");
  assert.equal(evidence.status, "success");
  assert.equal(evidence.feeMinor, 1500);
});

test("Payment reconciliation requires exact order, reference, amount, currency, mode and success", () => {
  const expected: ExpectedPayment = {
    reference: "order-12345678", orderId: "order-12345678",
    amountMinor: 200000, currency: "NGN", environment: "test",
  };
  const evidence = {
    ...expected, status: "success",
  };
  assert.doesNotThrow(() => assertPaymentMatches(expected, evidence));
  assert.doesNotThrow(() => reconcilePayment(expected, evidence));
  for (const change of [
    { orderId: "another-order" }, { reference: "another-reference" }, { amountMinor: 1 },
    { currency: "USD" }, { environment: "live" }, { amountMinor: Number.MAX_SAFE_INTEGER + 1 },
  ]) assert.throws(() => assertPaymentMatches(expected, { ...evidence, ...change } as typeof evidence));
  assert.throws(() => reconcilePayment(expected, { ...evidence, status: "pending" }), /not confirmed/);
});

test("Paystack webhook HMAC covers the exact raw request bytes and rejects malformed signatures", () => {
  const body = Buffer.from('{"event":"charge.success","data":{"reference":"order-12345678"}}');
  const signature = createHmac("sha512", config.secretKey).update(body).digest("hex");
  assert.equal(hasValidPaystackSignature(body, signature, config.secretKey), true);
  assert.equal(hasValidPaystackSignature(Buffer.from(`${body.toString()} `), signature, config.secretKey), false);
  assert.equal(hasValidPaystackSignature(body, "forged", config.secretKey), false);
  assert.equal(hasValidPaystackSignature(body, undefined, config.secretKey), false);
});

test("Paystack transport errors are generic and do not return provider response contents", async () => {
  const client = new PaystackClient(config, (async () => new Response(JSON.stringify({
    status: false, message: "sensitive provider error",
  }), { status: 401 })) as typeof fetch);
  await assert.rejects(client.verifyTransaction("order-12345678"), error => {
    assert.match((error as Error).message, /Paystack could not complete/);
    assert.doesNotMatch((error as Error).message, /sensitive|sk_test/);
    return true;
  });
});
