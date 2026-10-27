# Campus Core readiness review — 27 October 2026

## Release decision

**Not yet approved for a public launch.** Local builds and regression tests
pass, but the existing hosted app has a database connectivity failure and uses
development Clerk keys. New Roommate Finder persistence remains intentionally
disabled until its schema and privacy tests are approved. No production change,
deployment, commit, DNS change, database migration or payment activation was made.

## Confirmed causes and limits of evidence

| Symptom | Evidence and conclusion |
| --- | --- |
| Signup development watermark | The public production JavaScript contains actual embedded `pk_test` publishable-key literals. Only their environment classification was inspected/reported, not their values. This explains development Clerk behavior. Do not hide it with CSS. |
| Missing student names | The existing `account()` created an empty application profile using the Clerk subject but did not initialize its name from authenticated provider metadata. Safe blank-only initialization is now implemented; Campus Core edits win. |
| Missing own avatar/email | Campus Core's uploaded avatar/name was the only header source; private account UI now falls back to its own Clerk user, and profile editing shows the private sign-in email. Provider pictures are not stored as owned upload paths. |
| Marketplace cannot load | Live `GET /api/listings?kind=marketplace` returns 500. Live `/api/healthz` returns 503; its implementation fails only when `pool.query('select 1')` fails. Thus the hosted API cannot establish a successful database query. The exact connection/credential/network/provider error is NOT available without Vercel function logs/configuration. Do not claim a schema migration or code fix has repaired the live database. |
| Marketplace error feedback | Browser fault injection exposed an empty previous-query result during a failed/retrying request. Removed previous-filter placeholders and silent retries, prioritized the error, and added an explicit listing error/retry action. A focused browser recheck passed persistent-500 feedback and successful real-API recovery. |
| Mobile sign-in clipping | The auth frame's implicit grid min-content sizing and fixed-width Clerk card could exceed a phone viewport. Explicit zero-minimum grid tracks and bounded full-width Clerk containers now fit the 390px screenshot. |
| Routing | Apex redirects to `https://www.campuscore.site`; the resulting `/api/profile` returns application JSON 401 and API health/listings return application JSON errors, not SPA HTML. API ingress is present; this is not simply an API URL pointing to the frontend. |
| Optional storage could crash API | Eager initialization parsed external credentials while importing the API. Malformed optional GCS configuration could take down unrelated pages. Storage initialization is now lazy and reports a storage-specific 503 when used. This is a code finding, not the proven cause of the current hosted database failure. |
| Roommate Finder | Previously absent. New UI/API/schema draft are implemented, gated off pending approved schema and privacy/persistence verification. |

The working development database is PostgreSQL 16.10 and was inspected using
aggregate/catalog queries only: 4 profiles, 0 listings, 337 directory entries.
This does **not** establish that the deployed app uses that database or has
those records. Existing social tables have enabled/forced RLS and the restricted
role exists locally. Hosted rows, role membership/grants and production
backups were not inspected.

Clerk management status is Replit-managed. The management callback reports that
dashboard access requires a personal Pro subscription. No new tenant was
created and no keys were replaced. Production and development Clerk user stores
are separate: switching keys is not a user migration. Before changing production
keys, confirm which existing provider IDs own the database profiles and establish
an approved identity-continuity plan. Never relink accounts by unverified email
or assume matching emails imply matching Clerk subjects.

## Changes in this work

### Authentication, operational safety and existing experiences

| File | Purpose |
| --- | --- |
| `.env.example` | Documents disabled roommate flag and explicit optional Clerk proxy. Contains placeholders only. |
| `artifacts/api-server/src/lib/profile-sync.ts` | Pure bounded initial-name selection, no email-based identity merging. |
| `artifacts/api-server/src/lib/auth.ts` | Reads metadata only for the verified session subject, fills only blank names with concurrent-edit protection, retains profile editing when optional metadata is unavailable. Existing suspension/owner checks remain. |
| `artifacts/api-server/src/lib/objectStorage.ts` | Lazy storage setup; invalid optional credentials do not crash unrelated API imports. |
| `artifacts/api-server/src/routes/health.ts` | Logs only a sanitized database error code, not connection details or data. HTTP failure remains honest 503. |
| `artifacts/api-server/src/app.ts` | Sanitized code-only error logging for profile and roommate requests, matching existing private social treatment. |
| `artifacts/campus-core/src/App.tsx` | Explicit configured Clerk proxy only; authenticated roommate route. |
| `artifacts/campus-core/src/components/app-shell.tsx` | Roommate navigation and private own-account name/photo fallback. No public owner designation. |
| `artifacts/campus-core/src/components/image-picker.tsx` | Supports an own-account provider-image preview without treating it as an owned upload. |
| `artifacts/campus-core/src/components/listing-browser.tsx` | Does not show an old empty-filter result while a failed request retries; explicit error/retry feedback and correct loading state. |
| `artifacts/campus-core/src/pages/auth.tsx` | Responsive grid sizing prevents the Clerk sign-in/sign-up card from widening the page. |
| `artifacts/campus-core/src/pages/profile.tsx` | Own-account avatar preview and private sign-in email display. |
| `artifacts/campus-core/src/lib/kinds.ts` | Study board includes textbook resources; physical used textbooks remain legitimate marketplace goods. No existing category/data removal. |

### Roommate feature and contracts

| File | Purpose |
| --- | --- |
| `artifacts/api-server/src/lib/roommates.ts` | Calendar/budget validation, field visibility, transparent matching, allowed request state transitions. |
| `artifacts/api-server/src/routes/roommates.ts` | Authenticated discovery/CRUD, privacy-aware filters, request handling, accepted-interest messaging, gated setup, restricted actor transactions and audited staff moderation. |
| `artifacts/api-server/src/routes/index.ts` | Registers the router under existing `/api` ingress. |
| `artifacts/campus-core/src/pages/roommates.tsx` | Authenticated page and three tabs. |
| `artifacts/campus-core/src/components/roommates/browse.tsx` | Discovery, university/search/budget/preferences filtering, cards, block/report actions. |
| `artifacts/campus-core/src/components/roommates/profile-form.tsx` | Owned profile editing, preferences, privacy and pause controls. |
| `artifacts/campus-core/src/components/roommates/requests.tsx` | Incoming/outgoing status, accepted-only contact, withdrawal and polling. |
| `artifacts/campus-core/src/components/roommates/moderate-dialog.tsx` | Staff hide/restore with reason, including username entry for already-hidden profiles. |
| `artifacts/campus-core/src/components/roommates/shared.tsx` | Shared controls, pagination, cache refresh, explicit unavailable state. |
| `lib/db/src/schema/roommates.ts` | New profile/interest tables, constraints, indexes and RLS declarations. |
| `lib/db/src/schema/directory.ts` | Restricted-role university lookup policy declaration needed by roommate discovery. |
| `lib/db/src/schema/index.ts` | Exports new schema. |
| `lib/db/drizzle/0006_roommate-finder.sql` | Unexecuted, unjournaled review draft with grants, forced RLS and trigger protections; see rollout guide before approval. |
| `lib/api-spec/roommates.openapi.yaml` | Request/response contract for all new endpoints. |
| `lib/api-spec/openapi.yaml` | References new paths. |
| `lib/api-spec/orval.config.ts` | Permits the new contract reference for generation. |
| `lib/api-client-react/src/generated/api.ts` | Generated browser requests/hooks; existing same-origin `/api` access preserved. |
| `lib/api-client-react/src/generated/api.schemas.ts` | Generated frontend types. |
| `lib/api-zod/src/generated/api.ts` | Generated server request/response validators. |
| `lib/api-zod/src/generated/types/index.ts` | Generated type exports. |
| `lib/api-zod/src/index.ts` | Resolves generated validator/type name collisions explicitly. |
| `lib/api-zod/src/generated/types/{getMyRoommate200,getRoommateInterests200,getRoommateInterests200ItemsItem,getRoommateInterests200ItemsItemStatus,getRoommateInterestsParams,listRoommates200,listRoommatesAccommodationType,listRoommatesParams,listRoommatesSharing,listRoommatesSmoking,moderateRoommateBody,openRoommateConversation200,respondRoommateInterestBody,respondRoommateInterestBodyAction,roommateCard,roommateInput,roommateInputAccommodationType,roommateInputCleanliness,roommateInputSharing,roommateInputSleep,roommateInputSmoking,roommateInputStudy,roommateInputVisibleFieldsItem,roommateMessage,sendRoommateInterestBody}.ts` | Generated individual contract types; not hand-maintained. |

### Tests and documentation

| File | Purpose |
| --- | --- |
| `artifacts/api-server/src/roommates.test.ts` | Initial-name, date/budget validation, visibility, compatibility, transition authorization and migration static checks. These do not substitute for post-migration database tests. |
| `artifacts/api-server/test.mjs` | Includes new regression tests. |
| `artifacts/api-server/vercel-smoke.mjs` | Adds marketplace loading/filter rejection, anonymous roommate rejection, and startup with intentionally invalid optional GCS credentials. Synthetic webhook fixture stays process-local and no Paystack provider call is allowed. |
| `docs/ROOMMATE-FINDER-ROLLOUT.md` | Approval, backup, restricted-role test and activation gates; reversal/data-loss warning. |
| `docs/PRODUCTION-READINESS-REVIEW.md` | This report. |

`vercel.json`, root build scripts and service ownership were preserved. There
are still three services, one domain, public frontend `/`, API `/api/*`, and no
public sandbox ingress or guessed bindings.

## Vercel environment checklist

Scope Preview and Production separately. Configure names in the Vercel project;
all secret values belong only in encrypted settings, never source/chat.
Vercel Services project environment settings are not a secret-isolation boundary
between services.

| Name | Stage | Purpose / requirement |
| --- | --- | --- |
| `ENABLE_EXPERIMENTAL_COREPACK` | Build | `1`, existing package-manager pin setup. |
| `VITE_CLERK_PUBLISHABLE_KEY` | Frontend build | Intended tenant/environment's public key. Live app must use approved production identity configuration, not just a different arbitrary key. |
| `VITE_CLERK_PROXY_URL` | Frontend build, optional | Use only the proxy URL actually configured for that tenant. Otherwise leave unset; direct Clerk FAPI is supported. |
| `DATABASE_URL` | API runtime, secret | Reachable PostgreSQL with current schema, TLS requirements, correct grants and compatible pooling. No automatic database copy. |
| `CLERK_SECRET_KEY` | API runtime, secret | Same Clerk tenant/environment as frontend. |
| `CLERK_PUBLISHABLE_KEY` | API runtime | Matching public key for middleware. |
| `PLATFORM_OWNER_EMAIL` | API runtime, private configuration | Legitimate verified owner binding; server-side only, never a public owner label. |
| `GCS_CREDENTIALS_JSON` | API runtime, secret | External Google credentials with intended bucket access and URL-signing capability. Replit's localhost credential sidecar is not available on Vercel. |
| `PRIVATE_OBJECT_DIR` | API runtime | Existing private `/bucket/prefix`, preserving stored object paths and ownership. |
| `PUBLIC_OBJECT_SEARCH_PATHS` | API runtime | Comma-separated public asset search roots; never use private upload roots as public paths. |
| `CRON_SECRET` | API runtime, secret | At least 32 random characters for authorized scheduled expired-upload cleanup. No startup cleanup. |
| `ROOMMATE_FINDER_ENABLED` | API runtime | Keep `false` until reviewed migration and privacy/persistence verification pass. |
| `LOG_LEVEL` | API runtime, optional | Normally `info`. Do not enable sensitive payload logging. |
| `PAYMENTS_ENABLED` | API runtime | Keep `false`. |
| `PAYSTACK_MODE` | API runtime | Keep `test` during preparation. |
| `PAYSTACK_SECRET_KEY` | API runtime, secret | Not needed while disabled; legitimate test credential only in approved staging tests. |
| `PAYSTACK_CALLBACK_URL` | API runtime | Exact approved HTTPS origin plus `/payment/callback`, when test checkout is configured. |
| `PAYSTACK_WEBHOOKS_ENABLED` | API runtime | Keep `false`. |
| `PAYSTACK_LIVE_CHECKOUT_ENABLED` | API runtime | Keep `false`. |
| `VERCEL`, `NODE_ENV` | Platform supplied | Vercel/server runtime behavior. No function port listener is required. |

Do not copy `REPL_ID`, Replit sidecar credentials or localhost endpoints into
Vercel. `SESSION_SECRET` is not used by current Clerk authentication.
`BASE_PATH=/` is already pinned by service build scripts. Testing-only
`API_TEST_BASE_URL` and `CAMPUS_CORE_STAGING_CONFIRMATION` are not production
runtime settings. No `VITE_` variable may contain server credentials.

External configuration also includes Clerk's approved domains/redirects and
matching provider callbacks for the actual `www` canonical hostname, and GCS
CORS for exact approved browser origins. Neither DNS nor domain settings were
changed. See existing deployment guide for private file copy and checksum checks.

## Verification actually executed

- `CI=1 pnpm run build:vercel`: all three service builds passed.
- `pnpm run typecheck`: shared libraries, frontend, API, sandbox and scripts passed.
- `pnpm --filter @workspace/api-server run test`: **96 passed**, no failures/skips.
  Existing fixtures use rollback/isolated fixture cleanup; no real-user edits.
- `pnpm run test:vercel`: local Vercel adapter imports without listener,
  real development-database health and marketplace request pass, invalid range
  is rejected, API route precedence and anonymous checks pass, synthetic
  exact-byte HMAC passes and tampering fails, cron is not executed. No real
  Paystack request occurs.
- API workflow restarted and logs show clean startup. All three workflows run.
- Public hosted read-only probes: homepage 200 after canonical redirect, API
  health 503, marketplace 500, private profile 401. These describe the existing
  deployment, not a deployment of this working tree.
- Build warnings remain: large frontend chunk and existing source-map/PURE
  annotation warnings. These did not fail the build.
- A pattern scan of the three built frontend JS/HTML/CSS files found no
  server-key-shaped literals, private-key headers or credential-bearing
  PostgreSQL URLs. This is a limited pattern scan, not proof against every
  possible secret format.
- Git status/diff summary was emitted, followed by the workspace `.git/index.lock`
  protection error. No bypass, index repair, commit or push was attempted.

### Targeted browser verification

The initial pass confirmed provider-name initialization, private own email
display, real directory selection, profile save/reload/navigation persistence,
same-origin marketplace filtering and legitimate empty results, plus signed-out
roommate route protection. It found the failed-request feedback issue.

A focused follow-up against that fix confirmed persistent HTTP 500 displays
`Listings could not be loaded` with `Try again`, then successful 200 recovery
after removing the interceptor. It confirmed public mobile Roommates navigation
and sign-in protection, but found sign-in card overflow. That layout was fixed
and the 390×844 sign-in screenshot now fits. The final frontend build/typecheck
also passed after those fixes.

The signed-in Roommate Finder setup notice and final signed-in initials were
**not** browser verified: the original testing sign-in URL was single-use, and
the tester avoided risking another identity. This is a verification gap, not a
passing flow. Roommate CRUD/persistence/SQL privacy remains blocked on schema
approval; no enabled-feature browser test was attempted.

All test browser contexts were closed. The exact disposable Clerk identity was
verified by its ID, expected test email and first name; its student-only profile
and identity were then removed. The final aggregate check returned the original
4 profiles, 1 owner, and zero rows for that fixture. No genuine account was
changed or deleted. Rollback-scoped API test fixtures were also removed.

No claim is made that new roommate persistence, the SQL draft, hosted identity
continuity, external GCS or real payment tests have passed.

## Remaining blockers and ordered next actions

1. Review the uncommitted files and this report. No deployment authorization is
   inferred from asking for reliability fixes.
2. Obtain Vercel's sanitized function error code for the existing `/api/healthz`
   failure and privately inspect the deployed `DATABASE_URL`/pooler/TLS/access
   requirements. Resolve connectivity without replacing/resetting the database.
3. Verify destination schema and aggregate record counts, restricted role/grants,
   RLS and real ownership against a verified backup. Production records were
   not accessible in this review.
4. Establish Clerk identity continuity, then configure the approved production
   instance, matching frontend/backend keys, canonical domain and redirects.
   Test the actual original account before cutover.
5. Configure external GCS access/CORS and safely verify object copy/checksums
   and private-file authorization in staging.
6. Approve and apply the roommate draft in isolated staging; run every rollout
   privacy/persistence check before considering activation.
7. Authorize a deployment explicitly, then verify hosted buyer, seller,
   profile-edit, moderation and messaging journeys on desktop/mobile. A local
   pass is not proof of hosted behavior.
8. Keep payments, webhooks, live checkout and seller payouts disabled. Real
   Paystack test credentials, provider verification tests, merchant readiness
   and a compliant escrow arrangement are separate gates. No escrow claim.

Study resources/opportunities/community remain persisted listing-based boards.
AI tutoring remains honestly unavailable, not a canned-response feature.
Premium remains seller-only, NGN 2,000/month, eligible two Lagos calendar months
after the explicit platform public-launch timestamp, never individual signup.
The live platform launch date must be configured deliberately by authorized
staff; a deployment must not set it automatically.
