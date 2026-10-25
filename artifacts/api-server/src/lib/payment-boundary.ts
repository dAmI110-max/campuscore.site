import { HttpError } from "./errors";
import { PAYMENT_UNAVAILABLE } from "./commerce";

export interface ExpectedPayment {
  reference: string;
  orderId: string;
  amountMinor: number;
  currency: string;
  environment: "test" | "live";
}
export interface VerifiedPaymentEvidence extends ExpectedPayment {
  status: string;
  feeMinor?: number;
}
export interface PaymentVerifier {
  /** Must obtain evidence directly from the provider, never from browser/webhook payload alone. */
  verify(reference: string): Promise<VerifiedPaymentEvidence>;
}
export function assertPaymentMatches(expected: ExpectedPayment, actual: VerifiedPaymentEvidence) {
  if (!Number.isSafeInteger(expected.amountMinor) || expected.amountMinor <= 0
    || !Number.isSafeInteger(actual.amountMinor) || actual.amountMinor <= 0
    || actual.orderId !== expected.orderId
    || actual.reference !== expected.reference || actual.amountMinor !== expected.amountMinor
    || actual.currency !== expected.currency || actual.environment !== expected.environment) {
    throw new HttpError(409, "Payment evidence does not match the server-owned order.");
  }
}

export function reconcilePayment(expected: ExpectedPayment, actual: VerifiedPaymentEvidence) {
  assertPaymentMatches(expected, actual);
  if (actual.status !== "success") {
    throw new HttpError(409, "The provider has not confirmed a successful payment.");
  }
}

export const unavailableVerifier: PaymentVerifier = {
  async verify() { throw new HttpError(503, PAYMENT_UNAVAILABLE); },
};
