import { Router, type IRouter } from "express";
import { clerkClient } from "@clerk/express";
import { createHash, randomUUID } from "node:crypto";
import { db, profilesTable as p, platformCommerceTable, auditTable, listingsTable as l, commerceOrdersTable as orders } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import {
  GetCommerceAccountResponse, ChooseCommerceAccountBody, ChooseCommerceAccountResponse,
  ManageCommerceAccountBody, ManageCommerceAccountParams, ManageCommerceAccountResponse,
  SetCommerceLaunchBody, SetCommerceLaunchResponse, StartCommerceCheckoutBody, StartCommerceCheckoutResponse,
  VerifyCommerceCheckoutBody, VerifyCommerceCheckoutResponse,
} from "@workspace/api-zod";
import { account, administrator } from "../lib/auth";
import { addLagosCalendarMonth, commerceAccount, commerceLaunch, commerceUser, setCommerceRole, requirePremiumEligibility, PREMIUM_PRICE_MINOR, PAYMENT_UNAVAILABLE } from "../lib/commerce";
import { staffTransaction } from "../lib/staff-access";
import { HttpError } from "../lib/errors";
import { z } from "zod";
import { applyVerifiedPaystackPayment } from "../lib/payment-processing";
import { assertPaymentMatches } from "../lib/payment-boundary";
import { getPaystackRuntime, hasValidPaystackSignature, parsePaystackEvidence, PaystackClient, providerForMode } from "../lib/paystack";

const router: IRouter = Router();
router.get("/commerce/account", async (req, res): Promise<void> => {
  res.json(GetCommerceAccountResponse.parse(await commerceAccount(await account(req))));
});
router.put("/commerce/account", async (req, res): Promise<void> => {
  const user = await account(req, true);
  const body = ChooseCommerceAccountBody.strict().parse(req.body);
  const saved = await db.transaction(async tx => {
    // The locked profile is re-read so suspended/stale sessions cannot change modes.
    return setCommerceRole(tx, user.id, user.id, body.accountType, "User explicitly selected their own marketplace account mode; staff authority unchanged.");
  });
  res.json(ChooseCommerceAccountResponse.parse(await commerceAccount(saved)));
});
router.put("/admin/commerce/accounts/:id", async (req, res): Promise<void> => {
  const actor = await administrator(req);
  const { id } = ManageCommerceAccountParams.parse(req.params);
  const body = ManageCommerceAccountBody.strict().parse(req.body);
  if (body.reason.trim().length < 10) throw new HttpError(400, "Provide a meaningful reason of at least 10 characters.");
  const saved = await staffTransaction(actor.id, false, tx => setCommerceRole(tx, actor.id, id, body.accountType, body.reason.trim()));
  res.json(ManageCommerceAccountResponse.parse(await commerceUser(saved)));
});
router.put("/admin/commerce/launch", async (req, res): Promise<void> => {
  const actor = await administrator(req);
  const body = SetCommerceLaunchBody.extend({ publicLaunchAt: z.iso.datetime({ offset: true }).nullable() }).strict().parse(req.body);
  if (body.reason.trim().length < 10) throw new HttpError(400, "Provide a meaningful reason of at least 10 characters.");
  const publicLaunchAt = body.publicLaunchAt ? new Date(body.publicLaunchAt) : null;
  if (publicLaunchAt && !Number.isFinite(publicLaunchAt.getTime())) throw new HttpError(400, "Provide a valid official public launch timestamp.");
  await staffTransaction(actor.id, true, async tx => {
    const [old] = await tx.select().from(platformCommerceTable).where(eq(platformCommerceTable.id, 1)).for("update");
    await tx.insert(platformCommerceTable).values({ id: 1, publicLaunchAt, updatedBy: actor.id })
      .onConflictDoUpdate({ target: platformCommerceTable.id, set: { publicLaunchAt, updatedBy: actor.id, updatedAt: new Date() } });
    await tx.insert(auditTable).values({ actorId: actor.id, action: "official-public-launch-change", targetId: "platform", reason: `${body.reason.trim()} | previous=${old?.publicLaunchAt?.toISOString() ?? "unset"}; new=${publicLaunchAt?.toISOString() ?? "unset"}` });
  });
  res.json(SetCommerceLaunchResponse.parse(await commerceLaunch()));
});

router.post("/commerce/checkout", async (req, res): Promise<void> => {
  const user = await account(req, true);
  const input = StartCommerceCheckoutBody.strict().parse(req.body);
  const runtime = getPaystackRuntime();
  if (!runtime.config) {
    res.status(503).json({ error: PAYMENT_UNAVAILABLE });
    return;
  }
  if (input.kind === "marketplace" && runtime.config.mode === "live") {
    res.status(503).json({ error: "Marketplace checkout remains disabled until compliant escrow and delayed seller release are implemented." });
    return;
  }

  if (input.kind === "premium") {
    requirePremiumEligibility(user.commerceRole, (await commerceLaunch()).premiumEligibleAt);
    if ((await commerceAccount(user)).premium?.status === "active") {
      res.status(409).json({ error: "Seller Premium is already active on this account." });
      return;
    }
  } else if (input.listingId === undefined) {
    throw new HttpError(400, "Choose a marketplace listing to purchase.");
  }

  const identity = await clerkClient.users.getUser(user.id);
  const primaryEmail = identity.emailAddresses.find(email =>
    email.id === identity.primaryEmailAddressId && email.verification?.status === "verified");
  if (!primaryEmail) throw new HttpError(403, "A verified primary email is required for checkout.");

  const orderId = randomUUID();
  const provider = providerForMode(runtime.config.mode);
  const order = await db.transaction(async tx => {
    let amountMinor = PREMIUM_PRICE_MINOR;
    let sellerId: string | null = null;
    let listingId: number | null = null;

    if (input.kind === "marketplace") {
      const [listing] = await tx.select({
        id: l.id, ownerId: l.ownerId, kind: l.kind, price: l.price,
        status: l.status, hidden: l.hidden, deletedAt: l.deletedAt,
      }).from(l).where(eq(l.id, input.listingId!)).for("update");
      if (!listing || listing.kind !== "marketplace" || listing.status !== "published" || listing.hidden || listing.deletedAt) {
        throw new HttpError(404, "This marketplace listing is not available for checkout.");
      }
      if (listing.ownerId === user.id) throw new HttpError(409, "You cannot purchase your own listing.");
      const [seller] = await tx.select({ suspended: p.suspended }).from(p).where(eq(p.id, listing.ownerId));
      if (!seller || seller.suspended) throw new HttpError(404, "This marketplace listing is not available for checkout.");
      if (listing.price === null || !Number.isFinite(listing.price) || listing.price <= 0) {
        throw new HttpError(400, "This listing does not have a valid price.");
      }
      amountMinor = Math.round(listing.price * 100);
      if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) throw new HttpError(400, "This listing does not have a valid price.");
      sellerId = listing.ownerId;
      listingId = listing.id;
    }

    const [created] = await tx.insert(orders).values({
      id: orderId,
      buyerId: user.id,
      sellerId,
      listingId,
      kind: input.kind,
      amountMinor,
      currency: "NGN",
      status: "pending",
      provider,
      providerReference: orderId,
    }).returning();
    return created;
  });

  const checkout = await new PaystackClient(runtime.config).initializeTransaction({
    email: primaryEmail.emailAddress,
    amountMinor: order.amountMinor,
    reference: order.providerReference!,
    orderId: order.id,
    kind: input.kind,
  });
  res.status(201).json(StartCommerceCheckoutResponse.parse({
    orderId: order.id,
    reference: checkout.reference,
    authorizationUrl: checkout.authorizationUrl,
    mode: runtime.config.mode,
  }));
});

router.post("/commerce/checkout/verify", async (req, res): Promise<void> => {
  const user = await account(req, true);
  const input = VerifyCommerceCheckoutBody.strict().parse(req.body);
  const runtime = getPaystackRuntime();
  if (!runtime.config) {
    res.status(503).json({ error: PAYMENT_UNAVAILABLE });
    return;
  }

  const provider = providerForMode(runtime.config.mode);
  const [order] = await db.select().from(orders).where(and(
    eq(orders.provider, provider),
    eq(orders.providerReference, input.reference),
    eq(orders.buyerId, user.id),
  )).limit(1);
  if (!order || !order.providerReference) throw new HttpError(404, "The payment order was not found.");
  if (order.kind === "marketplace" && runtime.config.mode === "live") {
    throw new HttpError(409, "Marketplace payments are disabled until compliant escrow is implemented.");
  }

  const providerData = await new PaystackClient(runtime.config).verifyTransaction(input.reference);
  const evidence = parsePaystackEvidence(providerData);
  const expected = {
    orderId: order.id,
    reference: order.providerReference,
    amountMinor: order.amountMinor,
    currency: "NGN" as const,
    environment: runtime.config.mode,
  };
  assertPaymentMatches(expected, evidence);

  let savedOrder = order;
  if (evidence.status === "success") {
    const digest = createHash("sha256").update(JSON.stringify(evidence)).digest("hex");
    const saved = await db.transaction(tx => applyVerifiedPaystackPayment(tx, {
      orderId: order.id,
      provider,
      eventId: `verify:${order.id}:success`,
      digest,
      evidence,
    }));
    savedOrder = saved.order;
  } else if (order.status === "paid") {
    throw new HttpError(409, "Paystack no longer reports a successful transaction. No fulfillment was started.");
  }

  const premiumUntil = savedOrder.kind === "premium" && savedOrder.provider === "paystack" && savedOrder.verifiedAt
    ? addLagosCalendarMonth(savedOrder.verifiedAt).toISOString()
    : null;
  res.json(VerifyCommerceCheckoutResponse.parse({
    orderId: savedOrder.id,
    kind: savedOrder.kind,
    status: savedOrder.status === "paid" ? "paid" : "pending",
    amountMinor: savedOrder.amountMinor,
    currency: savedOrder.currency,
    mode: runtime.config.mode,
    verifiedAt: savedOrder.verifiedAt?.toISOString() ?? null,
    premiumUntil,
  }));
});

router.post("/commerce/webhooks/paystack", async (req, res): Promise<void> => {
  const runtime = getPaystackRuntime();
  if (!runtime.config || !runtime.webhooksEnabled) {
    res.status(503).json({ error: "Paystack webhook processing is disabled." });
    return;
  }

  const rawBody = (req as typeof req & { rawBody?: Buffer }).rawBody;
  const signature = req.get("x-paystack-signature");
  if (!rawBody || !hasValidPaystackSignature(rawBody, signature, runtime.config.secretKey)) {
    req.log.warn("Rejected Paystack webhook signature.");
    res.status(401).json({ error: "Invalid webhook signature." });
    return;
  }

  const payload: unknown = req.body;
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    res.status(400).json({ error: "Invalid webhook event." });
    return;
  }
  const event = payload as Record<string, unknown>;
  if (typeof event.event !== "string" || typeof event.data !== "object" || event.data === null || Array.isArray(event.data)) {
    res.status(400).json({ error: "Invalid webhook event." });
    return;
  }
  if (event.event !== "charge.success") {
    res.status(200).json({ received: true });
    return;
  }

  const data = event.data as Record<string, unknown>;
  if (typeof data.reference !== "string") {
    res.status(400).json({ error: "Invalid transaction reference." });
    return;
  }
  const provider = providerForMode(runtime.config.mode);
  const [order] = await db.select().from(orders).where(and(
    eq(orders.provider, provider),
    eq(orders.providerReference, data.reference),
  )).limit(1);
  if (!order || !order.providerReference) {
    // A signed but unrelated event is acknowledged to prevent pointless retries.
    res.status(200).json({ received: true });
    return;
  }
  if (order.kind === "marketplace" && runtime.config.mode === "live") {
    throw new HttpError(409, "Marketplace payment cannot be processed without compliant escrow.");
  }

  const providerData = await new PaystackClient(runtime.config).verifyTransaction(order.providerReference);
  const evidence = parsePaystackEvidence(providerData);
  const expected = {
    orderId: order.id,
    reference: order.providerReference,
    amountMinor: order.amountMinor,
    currency: "NGN" as const,
    environment: runtime.config.mode,
  };
  assertPaymentMatches(expected, evidence);
  if (evidence.status !== "success") throw new HttpError(409, "Paystack has not confirmed a successful transaction.");

  await db.transaction(tx => applyVerifiedPaystackPayment(tx, {
    orderId: order.id,
    provider,
    eventId: `charge.success:${order.providerReference}`,
    digest: createHash("sha256").update(rawBody).digest("hex"),
    evidence,
  }));
  res.status(200).json({ received: true });
});
export default router;
