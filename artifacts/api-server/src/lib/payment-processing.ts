import { and, eq } from "drizzle-orm";
import { db, commerceEventsTable as events, commerceOrdersTable as orders } from "@workspace/db";
import { HttpError } from "./errors";
import { reconcilePayment, type ExpectedPayment } from "./payment-boundary";
import type { PaystackProvider, PaystackTransactionEvidence } from "./paystack";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function applyVerifiedPaystackPayment(tx: Transaction, input: {
  orderId: string;
  provider: PaystackProvider;
  eventId: string;
  digest: string;
  evidence: PaystackTransactionEvidence;
}) {
  const [order] = await tx.select().from(orders).where(eq(orders.id, input.orderId)).for("update");
  if (!order || order.provider !== input.provider || !order.providerReference) {
    throw new HttpError(404, "The payment order was not found.");
  }

  const expected: ExpectedPayment = {
    orderId: order.id,
    reference: order.providerReference,
    amountMinor: order.amountMinor,
    currency: "NGN",
    environment: input.provider === "paystack" ? "live" : "test",
  };
  reconcilePayment(expected, input.evidence);

  const [existingEvent] = await tx.select().from(events)
    .where(and(eq(events.provider, input.provider), eq(events.eventId, input.eventId)))
    .for("update");
  if (existingEvent) {
    if (existingEvent.orderId !== order.id || existingEvent.digest !== input.digest) {
      throw new HttpError(409, "A conflicting payment event was rejected.");
    }
    return { order, duplicate: true };
  }

  await tx.insert(events).values({
    orderId: order.id,
    provider: input.provider,
    eventId: input.eventId,
    digest: input.digest,
  });

  if (order.status !== "pending") return { order, duplicate: false };
  const feeMinor = input.evidence.feeMinor;
  const safeFee = Number.isSafeInteger(feeMinor) && feeMinor! >= 0 && feeMinor! <= order.amountMinor
    ? feeMinor!
    : null;
  const [updated] = await tx.update(orders).set({
    status: "paid",
    verifiedAt: new Date(),
    processingFeeMinor: safeFee,
  }).where(and(eq(orders.id, order.id), eq(orders.status, "pending"))).returning();

  return { order: updated ?? order, duplicate: false };
}
