import { Router, type IRouter } from "express";
import { z } from "zod";
import { account } from "../lib/auth";
import {
  assertDailyQuota,
  callCoreAi,
  hasActiveSitePremium,
  recordUsage,
  requireSitePremiumForCoreAi,
  CORE_AI_DAILY_MESSAGE_LIMIT,
  SITE_PREMIUM_PRICE_MINOR,
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
  let used = 0;
  try {
    const q = await assertDailyQuota(user.id);
    used = q.used;
  } catch (e) {
    if (e instanceof HttpError && e.status === 429) used = CORE_AI_DAILY_MESSAGE_LIMIT;
    else if (!(e instanceof HttpError && e.status === 402)) {
      /* ignore missing table until migration applied */
    }
  }
  res.json({
    name: "Core AI",
    enabled: Boolean(process.env.XAI_API_KEY?.trim()),
    sitePremiumActive: active,
    sitePremiumPriceMinor: SITE_PREMIUM_PRICE_MINOR,
    dailyLimit: CORE_AI_DAILY_MESSAGE_LIMIT,
    dailyUsed: used,
    unlockNote:
      "Core AI is part of Campus Core Site Premium (₦3,000/month). Seller Premium (₦2,000) does not include Core AI.",
  });
});

router.post("/core-ai/chat", async (req, res) => {
  const user = await account(req, true);
  if (user.suspended) throw new HttpError(403, "This account is suspended.");
  await requireSitePremiumForCoreAi(user.id);
  await assertDailyQuota(user.id);

  const body = ChatBody.parse(req.body);
  const result = await callCoreAi(body.message, body.history);
  try {
    await recordUsage(user.id, result.promptTokens, result.completionTokens);
  } catch {
    // Usage table may not exist until migration 0008 is applied; still return the answer.
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
