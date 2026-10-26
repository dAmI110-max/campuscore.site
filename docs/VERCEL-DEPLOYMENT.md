# Campus Core on Vercel

## Architecture and project settings

Use **one Vercel project**, Root Directory **repository root (`.`)**, not either artifact directory. Set Framework Preset **Other** (`framework: null` in `vercel.json`) and Node.js **24.x**, matching the existing root engine. Keep the pnpm lockfile and pinned `packageManager: pnpm@10.26.1`. Do not deploy `lib/*`, scripts, or the mockup sandbox as separate projects.

| Setting | Value |
| --- | --- |
| Install command | `pnpm install --frozen-lockfile --prod=false` (includes build tooling) |
| Build command | `pnpm run build:vercel` |
| Output directory | `artifacts/campus-core/dist/public` |
| API entry | `api/index.mjs` → bundled `artifacts/api-server/dist/vercel.mjs` |
| API runtime | Vercel Node Function; Fluid compute recommended |
| Health check | `/api/healthz` (checks PostgreSQL) |
| Start command | None: Vercel invokes the function; do not use `pnpm start` |

The build type-checks shared packages and artifacts, builds the unchanged Vite frontend, then bundles the API's separate serverless entry with the existing esbuild/Pino setup. Workspace TypeScript and project references are resolved before Vercel traces the function. Native Sharp and Google Cloud dependencies remain external and must be included by Vercel's dependency tracing; a hosted preview must verify image finalization and storage access.

`vercel.json` routes all `/api` paths to the function **before** the filesystem/CDN and SPA fallback. This includes nested Clerk `/api/__clerk/...`, webhooks, and unknown API paths (which must return API 404, not HTML). Existing static assets are served from the Vite output, then non-API deep links fall back to `index.html`. The client already uses same-origin `/api`; no separate API origin, frontend proxy, or CORS expansion is needed.

The Vercel entry does not import `src/index.ts`, bind a port, start upload cleanup on cold start, or install a persistent interval. The normal entry and `railway.json` are preserved. `pnpm run build:railway` / `pnpm run start:railway` still support Railway.

## Environment variables

Use Vercel's encrypted environment settings, separately scoped to Preview and Production. Do not paste values into Git, chat, build logs, or `vercel.json`. `.env.example` is placeholders only.

### Public build-time variables

- `VITE_CLERK_PUBLISHABLE_KEY`: the publishable key for the intended Clerk environment.
- `VITE_CLERK_PROXY_URL`: optional override; normally leave unset because the existing frontend uses the current origin plus `/api/__clerk`.

Build output contains `VITE_` values. Never put a secret in a `VITE_` variable. Frontend base path must remain `/` (leave `BASE_PATH` unset or set `/`).

### Server runtime secrets

- `DATABASE_URL`: external PostgreSQL, reachable from Vercel over the provider-required TLS connection. Prefer a serverless-compatible pooled endpoint. Do not disable certificate verification to make a connection work.
- `CLERK_SECRET_KEY`: correct identity tenant/environment.
- `GCS_CREDENTIALS_JSON`: complete service-account JSON, including signing credentials.
- `PAYSTACK_SECRET_KEY`: only when deliberately testing Paystack; never expose it to the frontend.
- `CRON_SECRET`: random secret at least 32 characters, required only for scheduled expired-upload cleanup. Vercel sends `Authorization: Bearer <CRON_SECRET>` to its cron route.

### Other runtime settings

- `CLERK_PUBLISHABLE_KEY`, matching the frontend tenant/environment.
- `PLATFORM_OWNER_EMAIL`, the authorized owner's verified identity address.
- `PRIVATE_OBJECT_DIR`, `PUBLIC_OBJECT_SEARCH_PATHS`, using existing `/bucket/prefix` mappings.
- Optional `LOG_LEVEL` (normally `info`).
- `PAYMENTS_ENABLED=false`, `PAYSTACK_MODE=test`, `PAYSTACK_WEBHOOKS_ENABLED=false`, `PAYSTACK_LIVE_CHECKOUT_ENABLED=false`.
- `PAYSTACK_CALLBACK_URL`, if testing, must be the actual reachable HTTPS preview origin plus `/payment/callback`.

Vercel supplies `VERCEL=1` and production `NODE_ENV`. `PORT` is not used by the function. Do not copy Replit-only environment values such as `REPL_ID` or sidecar endpoints into Vercel; external GCS must be selected there. `SESSION_SECRET` is not required by this Clerk implementation.

## Database, identities and storage: no automatic migration

Vercel hosts compute/static files, not this app's PostgreSQL or file bucket. Provision or reuse external resources only with explicit authorization. Do not replace the current database, run schema push/migrations, or copy development owner grants into production as part of a deployment.

Use the backup/empty-staging-restore procedure and metadata-only role/RLS checks in [RAILWAY-DEPLOYMENT.md](RAILWAY-DEPLOYMENT.md); those PostgreSQL and file-copy requirements also apply here. The previously inspected development database was PostgreSQL 16.10, UTF-8; production was not inspected. `campus_core_social`, membership, grants, sequences and forced RLS policies must be present. The app's social `SET LOCAL ROLE` and identity settings must remain transaction-local; confirm the external pooler supports that behavior. Do not use statement pooling or session state that can leak between users.

The function shares a pool within a warm instance, caps it at three connections, uses a short idle timeout/connection timeout, and registers the pool with `attachDatabasePool`. Scaling still creates multiple instances; configure the provider pooler's total connection budget and place the function near the database.

Preserve Clerk authentication. The current project uses Replit-managed Clerk: confirm authorized access to the intended tenant, keys, proxy support and Vercel hostname configuration before cutover. Do not assume Replit will automatically transfer or swap identity keys on Vercel. Configure approved origins/redirects/provider callbacks using the appropriate managed settings. Check existing account IDs privately against stored profile ownership; a database restore alone does not migrate Clerk users. Do not create a new tenant or rewrite user IDs silently.

GCS needs bucket-scoped object create/get/update/delete permissions, private service-account signing credentials, and CORS for the exact allowed application origin(s). Upload bytes already go to signed GCS URLs, avoiding Vercel's request-body limit. Keep object keys and ACL metadata when copying storage; deployment does not copy files. Verify counts, checksums and controlled existing images. Existing file-download responses and image finalization are still subject to Vercel function size/duration limits.

## Scheduled upload cleanup

The existing hourly timer is suitable for a persistent server, not a serverless function. Vercel instead schedules `GET /api/internal/maintenance/uploads` daily at **03:00 UTC**, configured in `vercel.json`. The route:

- requires the exact server-side bearer secret and fails closed if unset/short;
- runs a small batch of up to ten uploads that are incomplete and over two hours old;
- never deliberately removes finalized content; the existing selection and deletion guards remain;
- reports a generic failure without exposing storage paths or DB details.

Cron is not an exactly-once queue. Multiple instances may overlap, and a slow batch may time out; deletion is retryable. Daily ten-item cleanup is a conservative baseline, not guaranteed sufficient throughput. Configure more frequent scheduling within the chosen Vercel plan or a separate authenticated scheduler if volume requires it. The hourly Railway loop remains unchanged. The scheduled operation deletes expired staging files only; do not call it against production during preparation/testing.

## Payment safeguards and Premium

The Paystack code remains present. Students cannot pay for Premium without an eligible/configured provider. After test-mode verification and merchant readiness, Paystack hosted checkout can collect the seller's ₦2,000 Premium fee; the server verifies reference, exact NGN amount, environment and successful status before live Premium activation. Premium remains seller-only and gated until two Lagos calendar months after an explicitly configured public launch.

This preparation does **not** enable checkout or webhooks in Preview/Production. Keep the flags above false. If testing is separately approved, use a real Paystack **test** key and explicit test flags only. The webhook path is `/api/commerce/webhooks/paystack`; raw request bytes must pass unchanged through the Node adapter. Visiting a callback is not proof of payment.

Premium is payment for the platform's own service, not marketplace escrow. Live marketplace checkout is hard-blocked independently of flags. Escrow and seller release remain unimplemented/disabled; ordinary split payments are not escrow. No live credentials, charges, payouts or webhook-dashboard changes are part of this preparation.

## Verification before release

Locally, against the current development database:

```sh
pnpm run build:vercel
pnpm run test:vercel
pnpm --filter @workspace/api-server run test
```

`test:vercel` imports the actual production function on an ephemeral local server. It checks API precedence/config, built frontend assets, DB health, unknown API 404, anonymous authorization, maintenance fail-closed behavior and exact-byte webhook HMAC. It uses a synthetic test key only in its own process, rejects any Paystack API call, does not execute cleanup, and does not write database fixtures. This is not Vercel-hosted routing, deployment tracing, or a real payment test.

The normal API suite also tests cron authentication using injected cleanup stubs, plus existing rollback-only DB constraints/RLS and payment safeguards. It requires the normal local API workflow to be running.

Vercel-hosted Preview verification still requires a Vercel project/environment. Do not deploy or link/pull secrets without permission. Once authorized, verify:

1. Root/static JS/CSS, deep links such as `/account`, and missing `/api/...` returning JSON 404.
2. `/api/healthz` and DB TLS/pool availability; metadata-only grants/RLS checks.
3. Login, Clerk proxy paths and cookies; private existing-ID continuity checks.
4. Controlled student/admin/owner permissions and anonymous rejection.
5. GCS signed upload/finalization/download using a nonsensitive file; no private bucket public ACL.
6. Payment gates remain off; test-only provider flow only after separate configuration.
7. Cron authorization rejection; exercise actual cleanup only against approved staging fixtures.

Use `test:staging` only with the explicit non-production guard described in the existing guide. Vercel deployment protection may block external smoke tests, Clerk callbacks or webhooks; resolve approved access rather than disabling safeguards silently.

## Limits and remaining launch checks

- No permanent port listener, hourly timer, persistent local disk or WebSocket server is provided by this architecture. Current messaging uses HTTP; any future WebSocket or durable worker needs a separate supported service.
- Function duration/body/response/bundle limits apply. Signed direct uploads avoid large incoming file bodies, but image processing, proxied downloads/Clerk assets and bulk directory operations need hosted-preview checks. Long-running jobs may need a queue/worker rather than increasing timeouts indefinitely.
- Express's in-memory rate limiter is instance-local, not a globally shared security quota. Use Vercel edge protection or a distributed limiter if global throttling is required; authorization and database isolation remain mandatory.
- Native Sharp/Google dependencies are traced from the API package installation. Only an actual Vercel build/preview can confirm the hosted artifact and platform behavior.
- Vercel plan/commercial-use eligibility, chosen function limits, externally reachable PostgreSQL/GCS, Clerk host approval and Paystack merchant readiness are operator prerequisites, not established by a passing local build.

No Vercel project was provisioned, hosted deployment run, domain/DNS changed, production resource accessed, migration executed, or secrets published by adding these files. Keep Railway as a fallback. Roll back code to a reviewed checkpoint only with approval; do not restore/drop a database merely to undo a deployment. If a future cutover has accepted writes, stop writes and reconcile them before routing back to an older data source.

### Official references

- [Node.js Functions](https://vercel.com/docs/functions/runtimes/node-js)
- [Express on Vercel](https://vercel.com/docs/frameworks/backend/express)
- [Project configuration](https://vercel.com/docs/project-configuration/vercel-json)
- [PostgreSQL pool lifecycle](https://vercel.com/guides/connection-pooling-with-functions)
