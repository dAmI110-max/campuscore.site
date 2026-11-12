import { Router, type IRouter } from "express";
import { z } from "zod";
import { account } from "../lib/auth";
import {
  assertDailyQuota,
  assertMonthlyTokenBudget,
  callCoreAi,
  hasActiveSitePremium,
  recordUsage,
  requireSitePremiumForCoreAi,
  CORE_AI_DAILY_MESSAGE_LIMIT,
  CORE_AI_MONTHLY_TOKEN_LIMIT,
  SITE_PREMIUM_PRICE_MINOR,
  PREMIUM_BUNDLE_PRICE_MINOR,
  SELLER_PREMIUM_PRICE_MINOR,
} from "../lib/core-ai";
import { HttpError } from "../lib/errors";

const router: IRouter = Router();

const ChatBody = z.object({
  message: z.string().min(2).max(8000),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(8000),
      }),
    )
    .max(20)
    .optional()
    .default([]),
});

router.get("/core-ai/status", async (req, res) => {
  const user = await account(req);
  const active = await hasActiveSitePremium(user.id);
  let dailyUsed = 0;
  let monthlyUsed = 0;
  try {
    const q = await assertDailyQuota(user.id);
    dailyUsed = q.used;
  } catch (e) {
    if (e instanceof HttpError && e.status === 429) dailyUsed = CORE_AI_DAILY_MESSAGE_LIMIT;
  }
  try {
    const m = await assertMonthlyTokenBudget(user.id);
    monthlyUsed = m.used;
  } catch (e) {
    if (e instanceof HttpError && e.status === 429) monthlyUsed = CORE_AI_MONTHLY_TOKEN_LIMIT;
  }
  res.json({
    name: "Core AI",
    enabled: Boolean(process.env.XAI_API_KEY?.trim()),
    sitePremiumActive: active,
    sitePremiumPriceMinor: SITE_PREMIUM_PRICE_MINOR,
    sellerPremiumPriceMinor: SELLER_PREMIUM_PRICE_MINOR,
    bundlePriceMinor: PREMIUM_BUNDLE_PRICE_MINOR,
    dailyLimit: CORE_AI_DAILY_MESSAGE_LIMIT,
    dailyUsed,
    monthlyTokenLimit: CORE_AI_MONTHLY_TOKEN_LIMIT,
    monthlyTokenUsed: monthlyUsed,
    unlockNote:
      "Core AI is included with Site Premium (₦3,000) or the Seller + Site bundle (₦4,500). Seller Premium alone does not include Core AI.",
  });
});

router.post("/core-ai/chat", async (req, res) => {
  const user = await account(req, true);
  if (user.suspended) throw new HttpError(403, "This account is suspended.");
  await requireSitePremiumForCoreAi(user.id);
  await assertDailyQuota(user.id);
  await assertMonthlyTokenBudget(user.id);

  const body = ChatBody.parse(req.body);
  const result = await callCoreAi(body.message, body.history);
  try {
    await recordUsage(user.id, result.promptTokens, result.completionTokens);
  } catch {
    /* usage table may be missing until migrations applied */
  }

  res.json({
    reply: result.content,
    usage: {
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
    },
  });
});

export default router;
