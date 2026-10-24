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
| `GCS_CREDENTIALS_JSON` | Runtime secret | Google Cloud service-account JSON for the external storage bucket |
| `PRIVATE_OBJECT_DIR` | Runtime variable | Private GCS bucket/prefix, in the existing `/bucket/prefix` format |
| `PUBLIC_OBJECT_SEARCH_PATHS` | Runtime variable | Comma-separated public GCS bucket/prefix paths |
| `NODE_ENV` | Runtime variable | Set to `production` |
| `PORT` | Railway-provided | Do not hardcode or override the assigned runtime port |

`BASE_PATH` now defaults to `/`. The Clerk proxy URL defaults to the current public origin plus `/api/__clerk`; only set `VITE_CLERK_PROXY_URL` as a build-time override if the deployment has a deliberately different proxy URL.

The current identity integration is Replit-managed Clerk. Railway does not automatically provision that tenant, transfer its user records, or move its production keys and allowed origins. Before cutover, verify that the same production tenant and proxy can serve the Railway hostname and configure its allowed origins/OAuth callbacks. If moving to another Clerk tenant, first plan a reviewed identity migration that preserves or maps Clerk IDs across every profile, listing, message, report, audit and owner reference. A PostgreSQL restore alone does not migrate Clerk accounts.

For storage, create a GCS bucket and a service account with only the access needed for the configured prefixes (read/write objects and signing uploads). Configure the bucket's CORS policy to allow the deployed Campus Core origin to `PUT` uploads. If `GCS_CREDENTIALS_JSON` is not configured, uploads and stored-image reads cannot work on Railway; the application reports storage failures rather than relying on Replit's local sidecar.

## Database and file migration — separate from code deployment

The build and start commands do not run schema changes or copy data. Do not point the new service at an empty or production database and assume that startup will migrate it.

1. **Back up the source first.** Take and retain a tested PostgreSQL backup using the source provider's supported export/`pg_dump` procedure. Preserve the original database; do not run `DROP`, `--clean`, `--if-exists`, or destructive schema synchronization against it.
2. **Prepare a separate Railway database.** Review the schema history under `lib/db/drizzle/` and the current Drizzle schema. Restore application rows with a reviewed, non-destructive procedure; compare table counts and important owner/role, directory, listing, audit and notification records before cutover.
3. **Preserve the restricted database role.** The social API relies on forced row-level security and the `campus_core_social` role. A normal data dump does not by itself guarantee that provider roles, ownership, grants and role membership are preserved. Recreate the constrained `NOLOGIN`, non-superuser role before restoring policies that reference it, then verify the exact grants and grant the Railway application database user membership needed to `SET ROLE`. Do not remove or bypass row-level security to make the app start. Confirm the restricted-role messaging tests against the Railway database before opening traffic.
4. **Copy file objects separately.** Copy finalized uploads and any referenced public assets to the new GCS bucket, preserving the configured bucket-prefix/object-name mapping, ACL metadata and every object path stored in PostgreSQL. The API does not copy files as part of deployment. Keep the original App Storage objects until the copied object counts and representative profile/listing images have been checked.
5. **Keep identity IDs consistent.** Profile and content ownership use Clerk IDs. Reuse the same compatible production Clerk tenant or complete an explicit old-ID-to-new-ID migration for every related row; never copy development accounts or development owner roles into production.
6. **Verify before directing users to the new service.** Check the database health endpoint, login with a genuine production identity, owner-only access, RLS-backed messaging, stored images, upload completion and existing data. Keep the old database and storage untouched until those checks pass and a rollback plan is ready.

`pnpm --filter @workspace/db run push` is an interactive schema synchronization tool, not a production migration job. Review its proposed SQL against the target and take a backup before any use. Railway startup never applies it automatically.

## Replit-specific items and remaining launch gates

- The storage client keeps the existing Replit sidecar path when running in Replit and now supports standard Google service-account credentials outside Replit. Existing App Storage content still requires a separate copy.
- Replit-managed Clerk tenants, secrets, production identity records, OAuth settings and allowed origins are not copied by this repository or by Railway.
- `DATABASE_URL` and the source database contents do not automatically follow the Git repository. Back up and migrate database data and custom roles separately.
- Replit secrets and environment variables are not automatically present in Railway. Configure the required variable names above in Railway without committing their values.
- Paystack checkout and payment webhooks remain disabled. No genuine escrow/custody arrangement has been confirmed or implemented; Railway deployment does not change that.
- The configured owner account must sign in through the production identity provider before owner access is confirmed in the target environment.
- Rate limiting is process-local. Start with a single application replica; multi-replica abuse protection requires a shared rate-limit store.
