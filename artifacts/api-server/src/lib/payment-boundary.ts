import { HttpError } from "./errors";
import { PAYMENT_UNAVAILABLE } from "./commerce";

export interface ExpectedPayment {
  reference: string;
  orderId: string;
  amountMinor: number;
  currency: "NGN";
  environment: "test" | "live";
}
export interface VerifiedPaymentEvidence extends ExpectedPayment {
  status: string;
}
export interface PaymentVerifier {
  /** Must obtain evidence directly from the provider, never from browser/webhook payload alone. */
  verify(reference: string): Promise<VerifiedPaymentEvidence>;
}
/** Pure reconciliation guard for a future authenticated provider adapter; not provider verification. */
export function reconcilePayment(expected: ExpectedPayment, actual: VerifiedPaymentEvidence) {
  if (!Number.isSafeInteger(expected.amountMinor) || expected.amountMinor <= 0
    || !Number.isSafeInteger(actual.amountMinor) || actual.amountMinor <= 0
    || actual.status !== "success" || actual.orderId !== expected.orderId
    || actual.reference !== expected.reference || actual.amountMinor !== expected.amountMinor
    || actual.currency !== expected.currency || actual.environment !== expected.environment) {
    throw new HttpError(409, "Payment evidence does not match the server-owned order.");
  }
}
export const unavailableVerifier: PaymentVerifier = {
  async verify() { throw new HttpError(503, PAYMENT_UNAVAILABLE); },
};
