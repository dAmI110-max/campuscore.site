import { createHmac, timingSafeEqual } from "node:crypto";
import { HttpError } from "./errors";

export type PaystackMode = "test" | "live";
export type CheckoutMode = PaystackMode | "disabled";
export type PaystackProvider = "paystack" | "paystack_test";

export interface PaystackConfig {
  mode: PaystackMode;
  secretKey: string;
  callbackUrl: string;
}

export interface PaystackRuntime {
  config: PaystackConfig | null;
  mode: CheckoutMode;
  webhooksEnabled: boolean;
}

export interface PaystackTransactionEvidence {
  reference: string;
  orderId: string;
  amountMinor: number;
  currency: string;
  environment: PaystackMode;
  status: string;
  feeMinor?: number;
}

type Fetcher = typeof fetch;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function providerForMode(mode: PaystackMode): PaystackProvider {
  return mode === "live" ? "paystack" : "paystack_test";
}

export function getPaystackRuntime(env: NodeJS.ProcessEnv = process.env): PaystackRuntime {
  if (env.PAYMENTS_ENABLED !== "true") {
    return { config: null, mode: "disabled", webhooksEnabled: false };
  }

  const mode = env.PAYSTACK_MODE;
  const secretKey = env.PAYSTACK_SECRET_KEY?.trim();
  const callbackValue = env.PAYSTACK_CALLBACK_URL?.trim();
  if ((mode !== "test" && mode !== "live") || !secretKey || !callbackValue) {
    return { config: null, mode: "disabled", webhooksEnabled: false };
  }

  const expectedPrefix = mode === "test" ? "sk_test_" : "sk_live_";
  if (!secretKey.startsWith(expectedPrefix)) {
    return { config: null, mode: "disabled", webhooksEnabled: false };
  }

  let callbackUrl: URL;
  try {
    callbackUrl = new URL(callbackValue);
  } catch {
    return { config: null, mode: "disabled", webhooksEnabled: false };
  }
  if (callbackUrl.protocol !== "https:") {
    return { config: null, mode: "disabled", webhooksEnabled: false };
  }

  // Live checkout is an explicit production-only opt-in. Marketplace live
  // checkout is separately blocked in the route until escrow is implemented.
  if (mode === "live" && (env.NODE_ENV !== "production" || env.PAYSTACK_LIVE_CHECKOUT_ENABLED !== "true")) {
    return { config: null, mode: "disabled", webhooksEnabled: false };
  }

  return {
    config: { mode, secretKey, callbackUrl: callbackUrl.toString() },
    mode,
    webhooksEnabled: env.PAYSTACK_WEBHOOKS_ENABLED === "true",
  };
}

export class PaystackClient {
  constructor(
    private readonly config: PaystackConfig,
    private readonly fetcher: Fetcher = globalThis.fetch,
  ) {}

  async initializeTransaction(input: {
    email: string;
    amountMinor: number;
    reference: string;
    orderId: string;
    kind: "marketplace" | "premium";
  }): Promise<{ reference: string; authorizationUrl: string }> {
    if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0
      || !/^[A-Za-z0-9.=-]{1,100}$/.test(input.reference)) {
      throw new HttpError(400, "The server could not prepare this checkout.");
    }

    const data = await this.request("/transaction/initialize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: input.email,
        amount: String(input.amountMinor),
        currency: "NGN",
        reference: input.reference,
        callback_url: this.config.callbackUrl,
        metadata: JSON.stringify({ orderId: input.orderId, kind: input.kind }),
      }),
    });

    const reference = data.reference;
    const authorizationUrl = data.authorization_url;
    let checkoutUrl: URL;
    try {
      checkoutUrl = new URL(String(authorizationUrl));
    } catch {
      throw new HttpError(503, "Paystack did not return a valid checkout link.");
    }
    if (reference !== input.reference || checkoutUrl.protocol !== "https:"
      || checkoutUrl.hostname !== "checkout.paystack.com") {
      throw new HttpError(503, "Paystack did not return a valid checkout link.");
    }
    return { reference, authorizationUrl: checkoutUrl.toString() };
  }

  async verifyTransaction(reference: string): Promise<unknown> {
    if (!/^[A-Za-z0-9.=-]{1,100}$/.test(reference)) {
      throw new HttpError(400, "The payment reference is invalid.");
    }
    return this.request(`/transaction/verify/${encodeURIComponent(reference)}`, { method: "GET" });
  }

  private async request(path: string, init: RequestInit): Promise<Record<string, unknown>> {
    let response: Response;
    try {
      response = await this.fetcher(`https://api.paystack.co${path}`, {
        ...init,
        headers: { ...init.headers, Authorization: `Bearer ${this.config.secretKey}` },
        redirect: "error",
        signal: AbortSignal.timeout(12_000),
      });
    } catch {
      throw new HttpError(503, "Paystack is temporarily unavailable. No payment was confirmed.");
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new HttpError(503, "Paystack returned an unreadable response. No payment was confirmed.");
    }
    if (!response.ok || !isRecord(payload) || payload.status !== true || !isRecord(payload.data)) {
      throw new HttpError(503, "Paystack could not complete the request. No payment was confirmed.");
    }
    return payload.data;
  }
}

export function parsePaystackEvidence(value: unknown): PaystackTransactionEvidence {
  if (!isRecord(value)) throw new HttpError(502, "Paystack returned invalid transaction evidence.");
  const { reference, amount, currency, domain, status } = value;
  if (typeof reference !== "string" || !Number.isSafeInteger(amount)
    || typeof currency !== "string" || typeof domain !== "string"
    || typeof status !== "string" || (domain !== "test" && domain !== "live")) {
    throw new HttpError(502, "Paystack returned invalid transaction evidence.");
  }

  let metadata: Record<string, unknown> = {};
  if (typeof value.metadata === "string" && value.metadata.trim() !== "") {
    try {
      const parsed: unknown = JSON.parse(value.metadata);
      if (!isRecord(parsed)) throw new Error("invalid");
      metadata = parsed;
    } catch {
      throw new HttpError(502, "Paystack returned invalid transaction metadata.");
    }
  } else if (isRecord(value.metadata)) {
    metadata = value.metadata;
  }

  const orderId = typeof metadata.orderId === "string" ? metadata.orderId : reference;
  const feeMinor = Number.isSafeInteger(value.fees) ? value.fees as number : undefined;
  return {
    reference,
    orderId,
    amountMinor: amount as number,
    currency,
    environment: domain,
    status,
    ...(feeMinor === undefined ? {} : { feeMinor }),
  };
}

export function hasValidPaystackSignature(rawBody: Buffer, signature: string | undefined, secretKey: string): boolean {
  if (!signature || !/^[0-9a-f]{128}$/i.test(signature)) return false;
  const expected = createHmac("sha512", secretKey).update(rawBody).digest();
  const supplied = Buffer.from(signature, "hex");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
