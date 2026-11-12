# Core AI (Study assistant)

**Core AI** is Campus Core’s study assistant. It is unlocked only by **Site Premium (₦3,000/month)**.

**Seller Premium (₦2,000/month)** does **not** include Core AI. That product only improves seller marketplace limits (listings, images, boosts).

## Launch

Official public launch target: **29 November 2026** (Africa/Lagos).  
Set `public_launch_at` in Admin → Commerce. Seller and Site Premium become eligible **two Lagos calendar months** after that date (existing platform rule).

## What Core AI does

- Explain topics step by step
- Revision: summaries, flashcards, practice questions
- Study plans and coursework help
- JAMB / WAEC-style practice when asked
- Outlines and draft feedback (not full graded exam scripts to submit as unaided work)

## Cost controls

| Control | Default |
|---------|---------|
| Daily messages per user | 40 (env `CORE_AI_DAILY_MESSAGE_LIMIT`) |
| Max output tokens | 1200 (env `CORE_AI_MAX_OUTPUT_TOKENS`) |
| Model | `grok-3-mini` (env `CORE_AI_MODEL`) |

## Environment (Vercel)

```
XAI_API_KEY=xai-...
CORE_AI_DAILY_MESSAGE_LIMIT=40
CORE_AI_MAX_OUTPUT_TOKENS=1200
CORE_AI_MODEL=grok-3-mini
```

## Database

Run `lib/db/drizzle/0008_core_ai.sql` on Supabase (site_premium order kind + usage tables).

## API

- `GET /api/core-ai/status` — entitlement + daily quota
- `POST /api/core-ai/chat` — `{ message, history? }` → `{ reply, usage }`

## UI

- Study board → **Core AI**
- Route: `/study/core-ai`
