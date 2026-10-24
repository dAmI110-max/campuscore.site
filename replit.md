# Campus Core

Everything students need. One place. A university-agnostic student platform, initially serving Nigeria.

## Run & Operate

- Web: `artifacts/campus-core: web` managed workflow; served at `/`.
- API: `artifacts/api-server: API Server` managed workflow; served at `/api`.
- `pnpm run typecheck` — full workspace typecheck.
- `PORT=26134 BASE_PATH=/ pnpm --filter @workspace/campus-core run build` — frontend production build from shell.
- `pnpm --filter @workspace/api-server run build` — API production build.
- `pnpm --filter @workspace/scripts exec tsx --test ../artifacts/api-server/src/campus-core.test.ts` — regression tests (requires running API).
- `pnpm --filter @workspace/api-spec run codegen` — regenerate hooks and Zod schemas.
- `pnpm --filter @workspace/db run push` — development schema only.
- `pnpm --filter @workspace/db exec drizzle-kit generate --config ./drizzle.config.ts` — SQL schema history.
- `pnpm --filter @workspace/scripts exec tsx src/import-directory.ts` — explicit official reference-data import, not user fixtures.

## Stack & Structure

- TypeScript, React + Vite + Wouter, Express 5, PostgreSQL + Drizzle, managed Clerk authentication, App Storage.
- `lib/api-spec/openapi.yaml` — contract; generated hooks in `lib/api-client-react`.
- `lib/db/src/schema` — normalized schema; generated SQL snapshots in `lib/db/drizzle`.
- `artifacts/api-server/src/routes` — domain routers. Server-only credentials, cookie authentication, ownership checks, audited admin actions.
- `artifacts/campus-core/src/pages` — public discovery, seven boards, listing CRUD, profile, auth, settings, moderation.
- `docs/RELEASE.md` — scope, configuration, acceptance results, blockers and release procedure.

## Product Rules

- No fabricated users, listings, properties, employers, conversations, attendance, analytics, balances or success states. Empty states are intentional.
- Do not make this UNIOSUN-only. Academics must remain database-driven and correctly scoped by parent.
- Do not invent official university/faculty/department data. NUC data is sourced reference information. Academic coverage is explicitly incomplete.
- Lilac/purple accents on neutral surfaces; mobile-first with light, dark and system themes.
- Payments, messaging and AI are disabled until genuinely implemented and verified. No wallet/escrow/stored balance.
- Do not call this first build production-ready. Signed-in journeys and production verification remain launch gates.

## Architecture Decisions

- Kept existing Express/Postgres foundation instead of introducing a parallel Supabase stack. Managed identity and App Storage provide the required companion services.
- Only the backend receives database credentials. RLS is enabled without public policies; the backend owner bypasses RLS and must enforce end-user authorization on every route.
- No automatic first-user admin. Only the server-configured PLATFORM_OWNER_EMAIL can receive the one-time owner grant, after server-side Clerk email verification in the target environment. Production identities must not be copied from development.
- Faculty/department fields can remain unset while verified coverage is incomplete, rather than blocking all students or inventing their departments.
- Staging image objects are never served. Finalization checks size/type/magic bytes, decodes a pinned object generation, strips metadata and writes an immutable resized WebP. Expired staging files are cleaned in bounded batches.
- Ownership privacy and role-governance intent: see `.agents/memory/owner-governance.md`.

## Gotchas

- Browser auth is cookie-based; do not add bearer-token handling.
- Keep Clerk's canonical production proxy and wildcard auth routes.
- Generate API schemas after contract edits. React Query codegen is v5; client TypeScript includes `dom.iterable`.
- Replit Publish manages production schema changes. No startup DDL or custom production migration hooks.
- Non-obvious schema/type-tooling behaviour: see `.agents/memory/workspace-validation.md`.
- The unused mockup sandbox is not the product UI.
