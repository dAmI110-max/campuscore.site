---
name: Commerce and Seller Premium rules
description: Requested provider, buyer/seller separation, official launch gating and accurate financial reporting.
---

The requested payment provider is Paystack for marketplace purchases and Seller Premium. Do not silently replace it with another provider.

**Why:** The user's commerce specification explicitly names Paystack.

**How to apply:** Agree any provider change with the user before integrating it. Start in test mode and leave live charges disabled until credentials, verification and webhooks are configured and tested.

Campus Core's intended payment-account country is Nigeria, operating as an individual / not registered as a business yet.

**Why:** The user explicitly supplied this merchant eligibility information.

**How to apply:** Evaluate providers for that actual status. Do not assume an overseas entity or registered company, and keep live payments disabled until merchant and withdrawal eligibility are verified.

Buyer/seller permissions are separate from staff authority. Preserve existing accounts, data and owner governance when introducing commerce experiences.

**Why:** The user requires distinct buyer/seller dashboards without letting ordinary commerce roles grant administrator access.

**How to apply:** Preserve the owner-only staff appointment/demotion rules in the separate owner-governance note; commerce-role administration must not bypass them.

Seller Premium costs exactly ₦2,000 per month and becomes eligible platform-wide two calendar months after an explicitly configured official public launch timestamp, with correct month-end handling.

**Why:** The user's countdown is tied to the platform's official public launch, not seller registration, previews, deployments or restarts.

**How to apply:** Keep Premium disabled if the launch timestamp is unset. Authorized staff configure/correct the timestamp and can view activation timing. Hide the purchase option from buyers and deny early subscriptions server-side. Ordinary seller functionality remains available without Premium unless a configured feature explicitly requires it. Activate/extend privileges only after verified payment, expire them when no longer paid, and clearly explain manual renewal if recurring billing is not used.

Financial analytics must separate verified marketplace volume, platform fees/actual earnings and Premium revenue. Unknown processing fees are not zero.

**Why:** The user explicitly forbids fabricated revenue, counting pending/failed payments as income, double-counting events, or treating all seller purchase proceeds as platform earnings.

**How to apply:** Reconcile figures with persistent verified records and account correctly for refunds/reversals. Do not claim escrow, automatic seller payouts or automatic refunds unless independently configured, implemented and tested.

Supported checkout currency does not establish merchant-country or payout eligibility.

**Why:** Provider evaluation showed that documented NGN pricing was not sufficient to confirm Nigerian merchant onboarding or withdrawals.

**How to apply:** Establish the actual payment-account country and business-registration status, then verify official provider requirements and account-level eligibility before recommending or enabling live payments. Do not infer business jurisdiction from the app's currency or the user's timezone.
