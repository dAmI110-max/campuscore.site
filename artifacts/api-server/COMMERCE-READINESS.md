# Campus Core commerce readiness

## Implemented without taking payments

- Separate buyer/seller marketplace modes, independent of student/admin/owner authority.
  Users explicitly choose their own marketplace mode after completing their profile.
  Sellers may still buy. Staff can change commerce modes with an audited reason.
  This does not grant staff privileges or bypass owner-only staff appointments.
- Marketplace creation/editing requires seller mode, checked against the locked
  current profile. Other student boards remain open in either mode.
  Active/draft marketplace listings must be marked unavailable or deleted before
  switching to buyer mode. Historical records are preserved.
- Private account dashboard and server-scoped order history (latest 100 records).
- Seller-only Premium information: exactly NGN 200,000 minor units (₦2,000) per
  month. No buyer promotional/purchase UI. No paid entitlement is granted.
- One nullable official public launch instant. Only the owner can configure or
  correct it, with an audit reason. It is never inferred from signup, deployments
  or restarts. Premium eligibility is derived two calendar months later in
  Africa/Lagos, clamping the day at month end. Eligibility alone cannot enable checkout.
- Staff analytics query actual persisted profiles with search, university,
  buyer/seller, suspension and join-date filters, pagination and current-page CSV.
  Today/week/month use Lagos calendar boundaries (week starts Monday).
  Registration trends show actual records for the last 30 calendar days.
- Database finance summaries keep verified marketplace gross volume, marketplace
  refunds and Premium revenue separate. Processing fees remain unknown if missing.
  Platform net earnings remain unavailable: fee allocation and refund accounting
  are not implemented, and gross seller receipts must never be labeled profit.

## Payment preparation, not a payment integration

The additive migration creates order and minimal event-ledger tables with foreign
keys, currency/amount/status constraints, a fixed Premium price, unique provider
references and unique event IDs. It does not seed orders, revenue or subscriptions.
The server-scoped history never accepts a client-selected owner ID.

`src/lib/payment-boundary.ts` defines a future provider verifier interface and
checks server-owned reference, order ID, integer amount, currency, success status
and test/live environment against evidence. This is only a reconciliation guard:
**it does not call Paystack, authenticate webhook signatures, verify a real
transaction, create receipts, or activate paid access.** The unavailable adapter
always fails.

`POST /api/commerce/checkout` validates input and authenticates the user.
Premium additionally enforces seller mode and the launch waiting period.
The endpoint then returns 503 without creating a checkout or charge.
`POST /api/commerce/webhooks/payment` always returns 503 and accepts no events.
Do not register this inert endpoint as a working production webhook.

## Required escrow and provider work — not complete

The product requires **genuine escrow**, with a compliant funds-holding and
delayed-release arrangement confirmed for this Nigerian individual merchant and
marketplace. Ordinary split payments, immediate seller payouts, a platform
balance, or an internal “held” database flag do not establish escrow.
No escrow service, release, refund, dispute resolution or seller-payout flow is
implemented or advertised as available. There is deliberately no environment
variable that can bypass this gate.

Paystack was requested directly. It is not available through the current supported
payment-provider setup, so **no direct Paystack integration was implemented**.
No Paystack credentials are consumed by this version. Whop was connected only for
eligibility evaluation, not checkout: the provisioned account reported US and its
authenticated Nigeria payout-method query returned no methods. This is not a
permanent claim about every Whop account.

Before any payment implementation may go live:
1. Resolve a supported provider and actual Nigerian individual-merchant eligibility.
2. Confirm compliant genuine escrow/funds custody, seller onboarding, release
   conditions, dispute handling, refunds and payout responsibilities.
3. Implement authenticated provider API verification and signed raw-body webhooks,
   amount/currency/reference/identity matching, transactional event idempotency,
   reconciliation, receipts and identity-scoped histories.
4. Implement paid Premium periods, renewal/expiry/cancellation and refund effects.
   Manual renewal is acceptable only if clearly described; it is not implemented.
5. Configure legitimate test credentials through secure environment/deployment
   tooling, then run real provider sandbox success/failure/cancel/replay/refund tests.
   Unit evidence fixtures are not sandbox payments.
6. Separately approve and configure production credentials, compliant custody and
   production webhook secrets. Merely adding credentials must not enable checkout.

## Migration and deployment

`lib/db/drizzle/0005_commerce-foundation.sql` is additive, with no table drops,
listing deletes, staff role replacements or payment-history rewrites. It backfills
seller mode once for existing nondeleted marketplace creators, preserving their
management access. It leaves the official launch timestamp unset.

The migration was applied to development only. Production must receive the schema
and reviewed one-time seller backfill before serving the new code. If deployment
schema synchronization already creates the new tables/column, do not rerun the full
CREATE statements: apply only the reviewed seller backfill once. Do not put this
backfill in startup hooks or repeat it after users deliberately change modes.
No production data, payment secrets, launch timestamp or deployment is changed by
this work.

## Verification

Run `pnpm --filter @workspace/api-server test` against the running development API,
plus workspace and frontend typechecks and frontend production build.
Tests use rollback-only fixture records; they are not genuine financial activity.
The browser pass verifies the changed account/listing/administration journey with
temporary QA identities. It does not prove external provider sign-in, escrow,
production sign-in, live payments or merchant payout eligibility.
