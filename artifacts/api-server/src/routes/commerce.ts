import { Router, type IRouter } from "express";
import { db, profilesTable as p, platformCommerceTable, auditTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  GetCommerceAccountResponse, ChooseCommerceAccountBody, ChooseCommerceAccountResponse,
  ManageCommerceAccountBody, ManageCommerceAccountParams, ManageCommerceAccountResponse,
  SetCommerceLaunchBody, SetCommerceLaunchResponse, StartCommerceCheckoutBody,
} from "@workspace/api-zod";
import { account, administrator } from "../lib/auth";
import { commerceAccount, commerceLaunch, commerceUser, setCommerceRole, requirePremiumEligibility, PAYMENT_UNAVAILABLE } from "../lib/commerce";
import { staffTransaction } from "../lib/staff-access";
import { HttpError } from "../lib/errors";
import { z } from "zod";

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

// All payment endpoints are deliberately non-operational. No payload may grant access.
router.post("/commerce/checkout", async (req, res): Promise<void> => {
  const user = await account(req, true);
  const input = StartCommerceCheckoutBody.strict().parse(req.body);
  if (input.kind === "premium") requirePremiumEligibility(user.commerceRole, (await commerceLaunch()).premiumEligibleAt);
  res.status(503).json({ error: PAYMENT_UNAVAILABLE });
});
router.post("/commerce/webhooks/payment", (_req, res): void => {
  // Never acknowledge or process unverified events, even if they claim success.
  res.status(503).json({ error: "Payment webhook processing is unavailable; no event was accepted." });
});
export default router;
