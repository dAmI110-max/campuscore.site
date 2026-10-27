# Roommate Finder: approval and verification gates

## Current state

The implementation is present, but **disabled by default**. No migration was
executed. Authenticated requests return 503 with a setup explanation until
`ROOMMATE_FINDER_ENABLED=true`. Signed-out requests return 401. This switch must
not be enabled merely because the build passes.

The feature includes authenticated discovery, one owned profile per account,
coarse campus/location, monthly NGN budget, accommodation and lifestyle
preferences, selectable field visibility, transparent match reasons,
incoming/outgoing interest requests, accepted-request conversation creation,
existing block/report integration, and audited staff hide/restore controls.
It does not provide safety certification, identity verification, lease
verification, rent collection, or escrow.

## Migration approval

`lib/db/drizzle/0006_roommate-finder.sql` is a **standalone review draft**,
intentionally not registered in the Drizzle journal. It is not called during
build, startup, requests, or deployment. Do not run `db push` as a substitute:
the draft also defines restricted grants and trigger protections that schema
push alone does not supply.

The draft adds only two tables, their indexes/policies, two guard functions and
triggers, plus a SELECT grant/policy for active university directory entries.
It does not update existing students, listings, directory rows, staff roles, or
payments. It assumes the previously reviewed `campus_core_social` role, runtime
role membership, schema/sequence grants, and social policies are already present.

Before execution:

1. Confirm the exact destination database and runtime login privately. Do not
   infer that Vercel and Replit use the same database.
2. Take a protected PostgreSQL custom-format backup. Test restoration into an
   empty isolated database, following the existing deployment guide.
3. Review the SQL against that database, including role membership and the
   ability to `SET LOCAL ROLE campus_core_social`.
4. Obtain explicit approval for the schema change. Apply the draft first to an
   isolated staging database, not a database containing genuine users.
5. Register a reviewed migration/journal/snapshot approach before general
   automatic migration tooling is adopted; this draft deliberately is not an
   automatic production migration.

Failure before COMMIT can be rolled back transactionally. After students have
created roommate data, dropping the new tables would destroy that new data:
disable the feature instead and prepare a reviewed recovery/migration plan.
There is no automatic destructive down migration.

## Required staging verification before enabling

Use exact disposable identities; close all browser contexts before cleanup.
Never print profile contents, messages, emails, object URLs, or credentials.

- Inspect catalog metadata for both tables: RLS enabled/forced, expected
  indexes, policies, triggers, column grants and sequence usage.
- Confirm the runtime account can switch to the restricted role but that role
  cannot log in, bypass RLS, or create roles.
- Within each test transaction bind the verified actor with transaction-local
  `app.user_id`, then `SET LOCAL ROLE campus_core_social`. Never test isolation
  only through a privileged owner pool.
- Student A can create/edit/pause only A's profile. Forged IDs/roles/hidden
  properties cannot transfer ownership or change moderation.
- A stranger cannot see inactive/hidden/suspended/blocked profiles. Check both
  directions of blocking, including when the browsing actor is staff.
- Hide each optional field; assert it is absent in HTTP responses. Search,
  filters and match reasons must not infer hidden fields. University,
  accommodation type, display name and username are intentionally visible.
- Exercise valid dates/budget ranges and malformed input, including reversed
  ranges, overlong text, invalid enums and duplicate visibility selections.
- Test request deduplication and concurrent inverse requests; only the
  recipient can accept/decline pending requests. Only the sender can withdraw
  pending/accepted requests. Verify the SQL trigger also rejects invalid
  transitions under the restricted role.
- Only accepted and still-active, unblocked pairs can open the feature's
  conversation endpoint. Existing conversation and message privacy applies;
  existing ordinary Campus Core messaging is not globally restricted to
  roommate matches.
- Reports go to the existing persisted user-report queue. Staff can hide and
  restore by username with a reason and audit record. Students cannot undo a
  staff-hidden flag, even with direct restricted-role UPDATE.
- Confirm data after navigation/reload and in a second student session. Verify
  request polling, pagination (24 discovery / 25 requests), staff demotion,
  mobile interaction, and query/state reset after identity changes.
- Ensure optional service failures do not affect other boards.

Only after these pass should an operator explicitly enable the runtime flag in
the approved environment. Repeat essential authenticated checks against the
actual hosted Vercel deployment before public launch.
