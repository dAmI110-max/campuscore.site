/**
 * Core AI — study assistant for Campus Core Site Premium (₦3,000) only.
 * Seller Premium (₦2,000) does not unlock this feature.
 */
import { db, commerceOrdersTable as orders } from "@workspace/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { HttpError } from "./errors";
import { addLagosCalendarMonth } from "./commerce";

export const SITE_PREMIUM_PRICE_MINOR = 300_000;
export const SELLER_PREMIUM_PRICE_MINOR = 200_000;

/** Soft cost controls — adjust via env without redeploying product rules. */
export const CORE_AI_DAILY_MESSAGE_LIMIT = Math.max(
  5,
  Number(process.env.CORE_AI_DAILY_MESSAGE_LIMIT || 40) || 40,
);
export const CORE_AI_MAX_OUTPUT_TOKENS = Math.min(
  4096,
  Math.max(256, Number(process.env.CORE_AI_MAX_OUTPUT_TOKENS || 1200) || 1200),
);

const XAI_URL = "https://api.x.ai/v1/chat/completions";
const MODEL = process.env.CORE_AI_MODEL?.trim() || "grok-3-mini";

export const CORE_AI_SYSTEM = `You are Core AI, Campus Core's study assistant for Nigerian and African university and secondary students.

Your job:
- Explain concepts clearly, step by step, at the student's level
- Help with revision: summaries, flashcards, practice questions, study plans
- Support common exams (JAMB, WAEC/WASSCE, university coursework) when asked
- Use simple English first; add technical terms with definitions
- Prefer teaching over dumping full finished assignments

Academic integrity:
- Do not write a full exam script, take-home test, or graded essay intended to be submitted as the student's unaided work
- You may outline, structure, critique drafts, and show worked examples with explanations
- If asked to cheat, refuse briefly and offer a legitimate study approach

Tone: encouraging, precise, campus-friendly. Keep answers focused.`;

function lagosDay(d = new Date()): string {
  return new Date(d.getTime() + 3_600_000).toISOString().slice(0, 10);
}

export async function hasActiveSitePremium(userId: string, now = new Date()): Promise<boolean> {
  const [latest] = await db
    .select({ verifiedAt: orders.verifiedAt })
    .from(orders)
    .where(
      and(
        eq(orders.buyerId, userId),
        eq(orders.kind, "site_premium"),
        eq(orders.status, "paid"),
        eq(orders.provider, "paystack"),
      ),
    )
    .orderBy(desc(orders.verifiedAt))
    .limit(1);
  if (!latest?.verifiedAt) return false;
  return addLagosCalendarMonth(latest.verifiedAt) > now;
}

export async function requireSitePremiumForCoreAi(userId: string): Promise<void> {
  if (!(await hasActiveSitePremium(userId))) {
    throw new HttpError(
      402,
      "Core AI is included with Campus Core Site Premium (₦3,000/month). Seller Premium does not include Core AI.",
    );
  }
}

export async function assertDailyQuota(userId: string): Promise<{ used: number; limit: number }> {
  const day = lagosDay();
  const result = await db.execute(sql`
    select message_count from core_ai_usage
    where user_id = ${userId} and day_lagos = ${day}::date
    limit 1
  `);
  const rows = (result as unknown as { rows?: { message_count: number }[] }).rows
    ?? (Array.isArray(result) ? (result as { message_count: number }[]) : []);
  const used = Number(rows[0]?.message_count ?? 0);
  if (used >= CORE_AI_DAILY_MESSAGE_LIMIT) {
    throw new HttpError(
      429,
      `Daily Core AI limit reached (${CORE_AI_DAILY_MESSAGE_LIMIT} messages). Resets at midnight Lagos time.`,
    );
  }
  return { used, limit: CORE_AI_DAILY_MESSAGE_LIMIT };
}

export async function recordUsage(
  userId: string,
  promptTokens: number,
  completionTokens: number,
): Promise<void> {
  const day = lagosDay();
  await db.execute(sql`
    insert into core_ai_usage (user_id, day_lagos, message_count, prompt_tokens, completion_tokens, updated_at)
    values (${userId}, ${day}::date, 1, ${promptTokens}, ${completionTokens}, now())
    on conflict (user_id, day_lagos) do update set
      message_count = core_ai_usage.message_count + 1,
      prompt_tokens = core_ai_usage.prompt_tokens + excluded.prompt_tokens,
      completion_tokens = core_ai_usage.completion_tokens + excluded.completion_tokens,
      updated_at = now()
  `);
}

export async function callCoreAi(
  userMessage: string,
  history: { role: "user" | "assistant"; content: string }[],
): Promise<{ content: string; promptTokens: number; completionTokens: number }> {
  if (!process.env.XAI_API_KEY?.trim()) {
    throw new HttpError(503, "Core AI is not configured yet. Set XAI_API_KEY on the server.");
  }
  const trimmed = userMessage.trim();
  if (trimmed.length < 2 || trimmed.length > 8000) {
    throw new HttpError(400, "Message must be between 2 and 8000 characters.");
  }

  const messages = [
    { role: "system", content: CORE_AI_SYSTEM },
    ...history.slice(-12).map((m) => ({ role: m.role, content: m.content.slice(0, 6000) })),
    { role: "user", content: trimmed },
  ];

  const res = await fetch(XAI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.XAI_API_KEY.trim()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: 0.5,
      max_tokens: CORE_AI_MAX_OUTPUT_TOKENS,
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new HttpError(
      502,
      res.status === 429
        ? "Core AI is busy. Try again in a moment."
        : "Core AI could not complete that request. Try again shortly.",
    );
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new HttpError(502, "Core AI returned an empty response.");
  return {
    content,
    promptTokens: Number(data.usage?.prompt_tokens ?? 0),
    completionTokens: Number(data.usage?.completion_tokens ?? 0),
  };
}
