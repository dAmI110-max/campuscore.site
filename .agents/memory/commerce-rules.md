---
name: Commerce and Seller Premium rules
description: Requested provider, buyer/seller separation, official launch gating and accurate financial reporting.
---

The requested payment provider is Paystack for marketplace purchases and Seller Premium. The user specifically requested its API directly rather than requiring a Replit connector, with legitimate credentials configured securely through deployment secrets. Do not silently replace it with another provider.

**Why:** The user's commerce specification explicitly names Paystack.

**How to apply:** Agree any provider change with the user before integrating it, respecting the available payment workflow's provider restrictions. Start in test mode and leave live charges disabled until credentials, verification and webhooks are configured and tested. Do not pretend an inert endpoint or generic reconciliation check is an implemented provider integration.

Campus Core requires genuine escrow, not immediate seller payouts or ordinary split payments.

**Why:** The user explicitly requires a compliant funds-holding and delayed-release arrangement before live payments, rather than merely qualifying escrow claims.

**How to apply:** Keep live payments disabled until compliant custody and delayed release are confirmed and implemented. Do not advertise or activate escrow based on a platform balance, delayed payout, split payment, internal held flag or configured API key. Test-mode preparation is allowed only with honest limits and no claims of successful real-provider tests without valid credentials and actual successful tests.

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

Supported checkout currency or a ready integration does not establish merchant-country or payout eligibility.

**Why:** Provider evaluation showed that documented NGN pricing was not sufficient to confirm Nigerian merchant onboarding or withdrawals. Whop auto-provisioning produced a US-marked store for the intended Nigerian merchant, and an authenticated Nigerian payout-method lookup returned no methods.

**How to apply:** Establish the actual payment-account country and business-registration status, then verify official provider requirements, the provisioned account's country, and account-level payout eligibility before enabling live payments. Do not infer business jurisdiction from the app's currency or the user's timezone. Do not treat auto-provisioned defaults as verified legal information, change financial identity during a read-only evaluation, or generalize an account-level empty payout result into a permanent worldwide provider restriction.
