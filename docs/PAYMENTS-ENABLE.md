# Enabling Seller Premium Payments (Paystack)

This document describes how to turn on **live Seller Premium checkout** after the repository is deployed to Vercel and Supabase is connected.

Marketplace (student-to-student) live checkout remains **disabled** until compliant escrow is implemented. Only Premium is supported for live payments.

## Prerequisites

1. Vercel project linked to this repository (production domain `www.campuscore.site`).
2. Supabase (or other PostgreSQL) connected via `DATABASE_URL`.
3. Clerk keys configured for the production domain.
4. A Paystack **live** secret key (`sk_live_...`) and a registered webhook URL (optional but recommended).
5. Official public launch date set in the admin console (Premium becomes eligible two Lagos calendar months after that date).

## Vercel Environment Variables (Production)

Set these in the Vercel dashboard → Project → Settings → Environment Variables → **Production**:

```
PAYMENTS_ENABLED=true
PAYSTACK_MODE=live
PAYSTACK_SECRET_KEY=sk_live_xxxxxxxxxxxxxxxx
PAYSTACK_CALLBACK_URL=https://www.campuscore.site/payment/callback
PAYSTACK_LIVE_CHECKOUT_ENABLED=true
PAYSTACK_WEBHOOKS_ENABLED=true
```

Also ensure the standard runtime variables are present:

```
DATABASE_URL=...
CLERK_SECRET_KEY=...
CLERK_PUBLISHABLE_KEY=...
VITE_CLERK_PUBLISHABLE_KEY=...
PLATFORM_OWNER_EMAIL=...
```

Redeploy after changing environment variables.

## Safety behaviour already in the code

- Live mode only activates when `NODE_ENV=production` **and** `PAYSTACK_LIVE_CHECKOUT_ENABLED=true`.
- Marketplace `kind: "marketplace"` is hard-blocked in live mode.
- Payment verification always re-checks the transaction with Paystack (never trusts the browser alone).
- Webhook signature is validated with HMAC-SHA512.

## Recommended first step

Test with `PAYSTACK_MODE=test` and a `sk_test_...` key on a Preview deployment before switching Production to live.

## Refund policy

See [REFUND-AND-CANCELLATION-POLICY.md](./REFUND-AND-CANCELLATION-POLICY.md).
