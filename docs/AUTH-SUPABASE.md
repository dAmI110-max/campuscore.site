# Switching from Clerk to Supabase Auth

Campus Core now defaults to **Supabase Auth** (`AUTH_PROVIDER=supabase`).

Clerk remains available only if you set `AUTH_PROVIDER=clerk` (legacy). New deployments should use Supabase Auth.

## Why Supabase Auth

- Same provider as your database (one dashboard, one billing relationship)
- Email + password, magic link, and Google OAuth
- University-domain rules are enforced in **our** server code (not a paid Clerk feature)
- No separate Clerk tenant or proxy middleware required

## Vercel / environment variables

```
AUTH_PROVIDER=supabase
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_ANON_KEY=eyJ...          # public anon key (also used by the browser)
SUPABASE_SERVICE_ROLE_KEY=eyJ...  # server only — never expose to the browser
```

You can remove the Clerk variables once the frontend no longer imports `@clerk/react`:

```
# CLERK_SECRET_KEY=
# CLERK_PUBLISHABLE_KEY=
# VITE_CLERK_PUBLISHABLE_KEY=
# VITE_CLERK_PROXY_URL=
```

## Frontend (still in progress)

The API accepts `Authorization: Bearer <supabase_access_token>`.

The campus-core UI still ships Clerk sign-in components on this branch until the React pages are switched to `@supabase/supabase-js`. Until that UI cutover is merged:

1. Use Supabase Auth for API testing (curl / mobile / temporary script), or
2. Keep `AUTH_PROVIDER=clerk` for the existing UI.

## University email eligibility

After migration `0007_eligibility_and_settings.sql`:

- New accounts start as **pending** (read-only for write routes once enforcement is attached)
- Verified emails whose domain is in `institution_domains` become **verified**
- Admins/owners are **exempt**
- Manual verification requests go to `eligibility_requests`

## Premium limits

Configurable on `platform_commerce` (defaults):

| Setting | Default |
|---------|---------|
| Free active listings | 5 |
| Free images / listing | 2 |
| Premium active listings | 20 |
| Premium images / listing | 5 |
| Boosts / month | 2 |
| Boost duration | 48 hours |
| Premium price | ₦2,000 (200000 kobo) |

## Apply the migration

On your Supabase SQL editor (or `psql`):

```bash
# run the contents of
lib/db/drizzle/0007_eligibility_and_settings.sql
```

Do not run destructive migrations against production without a backup.
