# Campus Core on Railway

## Application architecture

Campus Core is one same-origin web application: the React/Vite client and the Express API are built from the same pnpm workspace, and Express serves the generated client files. This preserves the existing `/api` routes, Clerk proxy, and same-origin write protections without adding cross-service CORS or cookie rules.

```text
Railway: Campus Core service (repository root)
  ├── React/Vite static client at /
  ├── Express API at /api
  └── one application process

Railway: PostgreSQL service
  └── DATABASE_URL reference consumed by Campus Core

External services:
  ├── Clerk identity provider
  └── Google Cloud Storage bucket for uploaded files
```

The Express service is the only application service to create. Do **not** deploy `@workspace/api-client-react`, `@workspace/api-zod`, `@workspace/api-spec`, or `@workspace/db` as web services; they are shared build-time packages. Do not deploy `@workspace/mockup-sandbox`; it is a component-preview tool, not part of the product. `@workspace/scripts` contains operator-run scripts, not a server.

This repository change configures the source build and process. It does not create Railway projects/services, provision external providers, copy existing data, or switch production traffic.

## Railway service settings

Create one Railway service from the repository. Set its **Root Directory** to `/` (the repository root); this setting is service-level, not encoded in `railway.json`. Use the checked-in `railway.json` configuration.

| Setting | Value |
|---|---|
| Root directory | `/` |
| Install command | `pnpm install --frozen-lockfile` |
| Builder | Nixpacks |
| Build command | `pnpm run build:railway` |
| Start command | `pnpm run start:railway` |
| Health check | `/api/healthz` |

Railway's automatic package install should use the root `packageManager` declaration and workspace lockfile. If setting a custom install command in Railway, use the frozen command above. The build command typechecks the workspace, then builds only the real web and API applications; the API build fails if the frontend bundle is absent at production startup. The API binds to `0.0.0.0:$PORT`, and the health check also verifies the database connection.

The repository declares Node 24 and pnpm 10.26.1. The build and start scripts run from the repository root, even though pnpm executes each filtered package script in that package's directory.

Provision a Railway PostgreSQL service and reference its `DATABASE_URL` in the Campus Core service. Do not create services for workspace libraries or for the mockup sandbox. The bundled Express process serves both web and API paths on the Railway-provided port.

## Required variables

Configure values in Railway's variable/secret settings, not in Git or chat. `VITE_` values are embedded into the browser bundle at build time and are public; never put a secret in a `VITE_` variable.

| Name | Where | Purpose |
|---|---|---|
| `DATABASE_URL` | Runtime secret/reference | PostgreSQL connection string for the Railway database |
| `CLERK_SECRET_KEY` | Runtime secret | Server-side Clerk verification and first-party Frontend API proxy |
| `CLERK_PUBLISHABLE_KEY` | Runtime variable | Server-side Clerk host/key resolution |
| `VITE_CLERK_PUBLISHABLE_KEY` | Build-time variable | Browser-side Clerk SDK; public key only |
| `PLATFORM_OWNER_EMAIL` | Runtime secret/private variable | Verified account binding for the owner bootstrap; keep server-only |
| `GCS_CREDENTIALS_JSON` | Runtime secret | Google Cloud service-account JSON (`project_id`, `client_email`, `private_key`) for the external storage bucket |
| `PRIVATE_OBJECT_DIR` | Runtime variable | Private GCS bucket/prefix, in the existing `/bucket/prefix` format |
| `PUBLIC_OBJECT_SEARCH_PATHS` | Runtime variable | Comma-separated public GCS bucket/prefix paths |
| `PAYMENTS_ENABLED` | Runtime variable | Master Paystack checkout gate; defaults to `false` |
| `PAYSTACK_MODE` | Runtime variable | `test` or `live`; the secret-key prefix must match |
| `PAYSTACK_SECRET_KEY` | Runtime secret | Server-only Paystack secret key; never expose it to the browser |
| `PAYSTACK_CALLBACK_URL` | Runtime variable | HTTPS URL returning to `/payment/callback` |
| `PAYSTACK_WEBHOOKS_ENABLED` | Runtime variable | Separately enables signed webhook processing; defaults to `false` |
| `PAYSTACK_LIVE_CHECKOUT_ENABLED` | Runtime variable | Explicit production-only gate for live Premium checkout; defaults to `false` |
| `LOG_LEVEL` | Optional runtime variable | Defaults to application logging settings; normally `info` |
| `NODE_ENV` | Runtime variable | Set to `production` |
| `PORT` | Railway-provided | Do not hardcode or override the assigned runtime port |

Build-time browser variables are `VITE_CLERK_PUBLISHABLE_KEY` and, only if required, `VITE_CLERK_PROXY_URL`. They are public and are embedded in the built files. The server-side `CLERK_SECRET_KEY`, `GCS_CREDENTIALS_JSON`, `PAYSTACK_SECRET_KEY`, and `DATABASE_URL` are private runtime secrets. Do not place any of them in a `VITE_` variable, Git, logs, or chat.

`BASE_PATH` now defaults to `/`. The Clerk proxy URL defaults to the current public origin plus `/api/__clerk`; only set `VITE_CLERK_PROXY_URL` as a build-time override if the deployment has a deliberately different proxy URL. `SESSION_SECRET` is not read by the current application source and is not required for this Clerk-based deployment. `.env.example` contains placeholders only; do not fill it with real credentials.

The current identity integration is Replit-managed Clerk, and the development preview reports development keys. Production Clerk readiness and identity continuity have not been established. Railway does not automatically provision that tenant, transfer its user records, or move its production keys and allowed origins. Before cutover, verify the intended production tenant and proxy can serve the Railway hostname. Add the staging and eventual production HTTPS origins in Clerk's allowed-origin/redirect settings, and confirm each OAuth provider's exact callback URL in its Clerk configuration. Keep the same tenant and keys where supported. Do not assume that adding a new hostname transfers identities. If a different tenant is required, first plan a reviewed identity migration that preserves or maps Clerk IDs across every profile, listing, message, report, audit and owner reference. A PostgreSQL restore alone does not migrate Clerk accounts.

For identity-continuity checks, sign in to staging with controlled existing accounts and privately compare the Clerk user ID to the existing `profiles.id`; verify that the same account sees its own saved listings, messages, and role. Do not export or print email addresses, message content, tokens, or full user rows. A changed Clerk user ID is a cutover blocker until every owner reference has a reviewed mapping.

For storage, create a GCS bucket and a service account with a bucket-scoped custom role limited to `storage.objects.create`, `storage.objects.get`, `storage.objects.update` (the app writes object ACL metadata), and `storage.objects.delete`. A separate migration operator may need object-listing permission; the app does not require project-wide Owner or Editor. `GCS_CREDENTIALS_JSON` must be the complete service-account JSON in Railway's private variable store; it is read only by the API server. `PRIVATE_OBJECT_DIR` identifies private uploads and `PUBLIC_OBJECT_SEARCH_PATHS` identifies publicly readable assets, using `/bucket/prefix` paths. Configure bucket CORS for the exact staging/production origins and the signed upload/download methods and headers used by the app. If credentials or bucket paths are missing, uploads and stored-image reads will fail rather than falling back to Replit storage.

The current source files live in Replit App Storage; the Railway/GCS work does not include an automatic bulk-copy utility. Use a supported source export or a reviewed one-way migration job that reads the source through its authorized read/signed-URL path and writes the same object keys to GCS. Copy files separately from database restoration. Keep the source objects intact; copy without a delete/sync-prune option, preserve object names and required metadata, and do not make private objects public. Compare source/destination object counts and sizes, and compare CRC32C/MD5 checksums where available. Then verify a small controlled set of existing profile and listing image paths and perform one staging upload/download/delete with a nonsensitive test image. Do not publish a bucket-wide public ACL. This bulk-copy step remains an operator task; do not assume deployment performs it.

## Database and file migration — separate from code deployment

The build and start commands do not run schema changes or copy data. Do not point the new service at an empty or production database and assume that startup will migrate it.

1. **Confirm the source, then back it up.** The previously inspected Replit development database reported PostgreSQL 16.10 and UTF-8; that is not evidence about the separate production database. Before migration, query the exact source environment and confirm PostgreSQL version, encoding, extensions, custom roles, database size and available backup/export route. Take and retain a tested custom-format `pg_dump` backup. For example, from a trusted shell with source access configured in environment/secrets (not pasted into the command or shell history):

   ```sh
   umask 077
   pg_dump --format=custom --no-owner --no-acl --dbname="$SOURCE_DATABASE_URL" --file=campus-core-source.dump
   pg_restore --list campus-core-source.dump >/dev/null
   ```

   Keep the original database. Never run `DROP`, `--clean`, `--if-exists`, or destructive schema synchronization against it.
2. **Prepare a separate Railway database.** The inspected development source was PostgreSQL 16.10, UTF-8, with only the standard `plpgsql` extension observed. Use a compatible PostgreSQL 16.x UTF-8 staging database unless the exact production source check shows otherwise. Review the schema history under `lib/db/drizzle/`; restore application rows with a reviewed, non-destructive procedure and compare aggregate table counts before cutover.
3. **Restore only to a new empty staging database first.** Recreate the reviewed `campus_core_social` role before restoring policies that reference it; a normal database dump does not include global role definitions or memberships. After reviewing the restore list and confirming the destination is empty, restore without `--clean`:

   ```sh
   pg_restore --exit-on-error --no-owner --no-acl --dbname="$STAGING_DATABASE_URL" campus-core-source.dump
   ```

   Never point this restore command at production. Do not restore source-provider ownership/ACLs blindly; recreate destination grants explicitly.
4. **Preserve the restricted database role.** If it does not exist in the new staging database, create it with the reviewed attributes from `lib/db/drizzle/0004_stiff_phantom_reporter.sql`: `NOLOGIN`, `NOINHERIT`, `NOSUPERUSER`, `NOCREATEDB`, `NOCREATEROLE`, and `NOBYPASSRLS`. Reapply the reviewed object grants and sequences from that migration, then grant membership to the actual Railway application database role required for the app's explicit `SET ROLE`. Verify the role is not an owner and has no elevated privileges. Do not remove or bypass row-level security to make the app start.
5. **Verify security metadata without reading user content.** The following queries inspect only role, grants, RLS flags and policy definitions:

   ```sql
   SELECT rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolbypassrls
   FROM pg_roles WHERE rolname = 'campus_core_social';

   SELECT member.rolname AS member_role, granted.rolname AS granted_role
   FROM pg_auth_members m
   JOIN pg_roles member ON member.oid = m.member
   JOIN pg_roles granted ON granted.oid = m.roleid
   WHERE granted.rolname = 'campus_core_social';

   SELECT pg_has_role('<railway_application_role>', 'campus_core_social', 'MEMBER') AS can_set_social_role;

   SELECT n.nspname, c.relname, c.relrowsecurity, c.relforcerowsecurity
   FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname IN
     ('conversations','direct_messages','user_blocks','notifications','user_reports');

   SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
   FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename IN ('conversations','direct_messages','user_blocks','notifications','user_reports')
   ORDER BY tablename, policyname;

   SELECT has_table_privilege('campus_core_social', 'public.conversations', 'SELECT') AS can_read_conversations,
          has_table_privilege('campus_core_social', 'public.direct_messages', 'SELECT') AS can_read_messages,
          has_table_privilege('campus_core_social', 'public.direct_messages', 'INSERT') AS can_insert_messages;
   ```

   Replace table names only after reviewing the current schema. Confirm the effective membership for the actual Railway application database role. Run the rollback-only social tests and controlled-account tests; never use unrestricted `SELECT *` against messages or profiles to validate RLS.
6. **Copy file objects separately.** Copy finalized uploads and referenced public assets to the new GCS bucket, preserving bucket-prefix/object-name mapping and required metadata. The API does not copy files as part of deployment. Keep the original App Storage objects until counts, checksums, and representative object paths have been verified.
7. **Keep identity IDs consistent.** Profile and content ownership use Clerk IDs. Reuse the same compatible identity tenant or complete an explicit reviewed ID mapping for every related row; never copy development accounts or development owner roles into production.
8. **Verify before directing users to the new service.** In staging, check database readiness, identity continuity, owner/admin/student permissions, RLS-backed messaging, stored images, upload completion and existing content. Keep the old database and storage untouched until those checks pass and rollback is ready.

`pnpm --filter @workspace/db run push` is an interactive schema synchronization tool, not a production migration job. Review its proposed SQL against the target and take a backup before any use. Railway startup never applies it automatically.

## Paystack implementation and safety gates

The API now has server-side transaction initialization and transaction verification, server-derived order amounts, a signed webhook endpoint, order ownership checks, and idempotent paid-order recording. The browser receives only a validated Paystack checkout URL. Webhook signatures are checked against the exact raw request bytes with HMAC-SHA512, then the transaction is fetched from Paystack and checked for matching order reference, amount, NGN currency and test/live environment. Test-mode rows use a separate provider label and are excluded from live financial analytics.

All payment flags in `.env.example` are `false` by default. Test checkout requires `PAYMENTS_ENABLED=true`, `PAYSTACK_MODE=test`, a matching test secret key and an HTTPS callback URL. Enable `PAYSTACK_WEBHOOKS_ENABLED=true` only after configuring the test webhook URL and confirming test events reach staging. No valid Paystack credentials or successful Paystack network transaction have been used by the local automated tests; they use mocked provider responses.

Live Premium checkout additionally requires `NODE_ENV=production`, `PAYSTACK_MODE=live`, a matching live secret key, `PAYMENTS_ENABLED=true`, and the explicit `PAYSTACK_LIVE_CHECKOUT_ENABLED=true` gate. Do not set these until merchant onboarding and withdrawal eligibility are confirmed for the actual account, test-mode initialization/verification/webhooks pass, and the requested benefits and support/refund process are ready. Marketplace live checkout is hard-blocked in code regardless of these flags. Escrow is not implemented, `escrowEnabled` remains false, and there is no seller transfer/release flow. Do not configure live marketplace payments, advertise escrow, or treat a platform balance or delayed settlement as escrow.

The callback route is `PAYSTACK_CALLBACK_URL` (for example, the staging origin plus `/payment/callback`). Configure Paystack's webhook URL as the API origin plus `/api/commerce/webhooks/paystack`; do not register it until the staging endpoint is configured and verified. The callback route verifies with Paystack; visiting it or presenting a browser-supplied success value alone never marks an order paid. Verified Premium periods are one calendar month and renewals are manual. Automatic refunds, chargeback/dispute handling, subscriptions, seller payouts, and compliant escrow remain unimplemented and must not be implied.

## Local and staging verification

Run the local checks against the Replit development app/database:

```sh
pnpm run typecheck
pnpm run build:railway
pnpm --filter @workspace/api-server run test
```

Payment tests use injected/mock HTTP responses and a rollback-only dev-database transaction. They do not contact Paystack. The normal test command defaults to the local proxied API. For remote staging, `API_TEST_BASE_URL` must include `/api`, and the test database URL must point to that same staging database. The extra guard requires an explicit non-production acknowledgement and refuses hostnames marked `prod`:

```sh
CAMPUS_CORE_STAGING_CONFIRMATION=I_CONFIRM_NON_PRODUCTION_STAGING \
API_TEST_BASE_URL=https://<staging-host>/api \
pnpm --filter @workspace/api-server run test:staging
```

`DATABASE_URL` must already be set through a secure environment/secrets mechanism. The suite uses temporary rows inside transactions that it rolls back and performs read-only endpoint checks; do not set staging variables while connected to production. Automated checks cover anonymous-route rejection, role/data constraints, commerce idempotency, and restricted-role RLS behavior. Sign-in continuity, real owner/admin role boundaries, and GCS upload/download require controlled manual staging accounts and a staging bucket. Never use a production user token in the test harness.

Paystack test-mode end-to-end checks require a test key in the staging secret store and explicit flags there. Verify initialization, redirect, callback-side API verification and a signed `charge.success` webhook using Paystack's test dashboard. Confirm a bad signature is rejected, a duplicate webhook creates no second financial change, a test order does not appear in live revenue totals, and no marketplace seller payout or escrow claim is produced.

## Rollback and cutover

No production database, Railway service, Clerk settings, storage bucket, or domain has been changed by this repository work. Keep the source app, database and file storage intact while staging. Before any later cutover, record the current DNS/custom-domain target and take fresh database and object backups. If staging fails, stop staging traffic and discard/recreate only the isolated staging resources; do not modify the source.

For a future cutover, keep the original service/database available and switch traffic only after the staging checklist passes. If the new service fails before accepting writes, route traffic back to the old service. If it has accepted writes, first stop writes and reconcile those records before rollback; switching back to a stale database can lose orders, messages or profile changes. Do not delete the source or overwrite it as part of rollback.

## Ordered next actions

1. Review this working-tree diff and run the local typecheck, Railway build, and API tests; no provider or production service is needed.
2. Create isolated non-production Railway app and PostgreSQL resources; do not add a public production domain.
3. Take and validate a source backup, then restore only into a new empty staging database and verify `campus_core_social`, grants and policies.
4. Configure a staging GCS bucket/service account and copy objects without deleting the source; compare object counts/checksums and test controlled uploads.
5. Configure Clerk for the staging hostname, sign in with controlled existing accounts, and confirm unchanged Clerk/profile IDs and owner/admin permissions.
6. Add Paystack test credentials through staging secrets, enable only test checkout/webhooks there, and verify the full test flow and idempotency.
7. Run the guarded staging suite and manual signed-in tests for messaging RLS, roles, identity continuity and uploads.
8. Separately confirm Nigerian merchant eligibility, Premium benefits/support/refund handling, and any live Premium prerequisites. Marketplace live checkout remains blocked until compliant escrow and delayed release are independently confirmed and implemented.
9. Only after review and a separate authorization should production variables, production resources, or public domains be changed.

## Replit-specific items and remaining launch gates

- The storage client keeps the existing Replit sidecar path when running in Replit and now supports standard Google service-account credentials outside Replit. Existing App Storage content still requires a separate copy.
- Replit-managed Clerk tenants, secrets, production identity records, OAuth settings and allowed origins are not copied by this repository or by Railway.
- `DATABASE_URL` and the source database contents do not automatically follow the Git repository. Back up and migrate database data and custom roles separately.
- Replit secrets and environment variables are not automatically present in Railway. Configure the required variable names above in Railway without committing their values.
- Paystack checkout and webhooks are disabled by default. Live Premium checkout requires explicit production flags; marketplace live checkout and all escrow/seller release remain disabled in code.
- The configured owner account must sign in through the production identity provider before owner access is confirmed in the target environment.
- Rate limiting is process-local. Start with a single application replica; multi-replica abuse protection requires a shared rate-limit store.
