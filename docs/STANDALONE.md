# Campus Core — Standalone deployment

This repository is self-contained for **Vercel + Supabase (PostgreSQL) + Google Cloud Storage + Clerk + Paystack**.

Replit-specific configuration, sidecar storage, and project metadata have been removed. The app no longer depends on `REPL_ID`, the Replit object-storage sidecar, or Replit-managed secrets.

## Required external services

| Concern | Provider | How it is configured |
|---------|----------|----------------------|
| Database | Supabase (or any PostgreSQL) | `DATABASE_URL` |
| Auth | Clerk (your own instance) | `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `VITE_CLERK_PUBLISHABLE_KEY` |
| File storage | Google Cloud Storage | `GCS_CREDENTIALS_JSON`, `PRIVATE_OBJECT_DIR`, `PUBLIC_OBJECT_SEARCH_PATHS` |
| Payments | Paystack (Premium only) | See [PAYMENTS-ENABLE.md](./PAYMENTS-ENABLE.md) |
| Hosting | Vercel | See [VERCEL-DEPLOYMENT.md](./VERCEL-DEPLOYMENT.md) |

## What was removed

- `.replit`, `.replitignore`, `replit.md`
- Per-package `.replit-artifact` metadata
- Replit sidecar credential and signed-URL paths in `objectStorage.ts` (standard GCS only)

Railway remains documented as an optional alternate host; it is not required.
