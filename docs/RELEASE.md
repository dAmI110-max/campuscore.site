# Campus Core — core release and launch gates

## Status

The core release has been hardened with owner-governed administrator access and safe image re-encoding, and extended with private messaging, persistent notifications and user safety.
No production deployment exists; production approval is still pending publication and live verification.
No fabricated user activity or listings were seeded.

## Architecture and features actually implemented

- React/Vite web app at `/`, Express API at `/api`, TypeScript throughout.
- PostgreSQL/Drizzle persistent profiles, directory, institution requests, listings, saves, reports, audit records and upload metadata.
- Clerk-managed email/password, verification, recovery and social-provider components. Identity configuration is external to the app; no custom passwords, sessions or account-linking implementation.
- Case-normalized usernames, reserved-name validation, availability endpoint and database unique/check constraints.
- Database-driven searchable country → university → faculty → department selection, missing-entry requests and editable profiles.
- Profile image upload/change/removal; JPEG, PNG, WebP, 5 MB maximum. Presigned direct upload, owner-bound tickets, metadata/magic-byte verification and immutable finalized objects.
- Unified genuine-content boards: marketplace, accommodation, services, opportunities, study, communities and events. Create/edit/publish/draft/unavailable/remove, search, university/location/category/price/condition filters, sort and pagination. Combined filters persist in the URL across refresh/back/forward; reversed or invalid prices fail explicitly.
- Listing-owner-only writes; hidden/deleted content excluded from discovery. Contact details omitted from anonymous API responses.
- Saved listings, report submission, public profile with optional university visibility.
- Protected administration: sourced directory add/edit/deactivation, report review, institution requests, suspend/restore non-admin accounts, hide/verify listings, audit log. No browser-controlled role escalation.
- Light/dark/system theme stored per device, responsive public and authenticated page implementations, loading/error/empty states.
- Registered-user discovery by public name/username with university filtering that respects hidden academics.
- Private one-to-one conversations, persisted text messages, timestamps, older-history pagination, idempotent send retries, unread counts and visible-tab polling. No attachment/group-chat/read-receipt delivery guarantees are implied.
- Persistent recipient-only notifications for messages, user-report reviews and listing moderation. Message notification payloads contain no message text.
- Blocking in either direction prevents new contact; prior conversation history remains accessible to its participants. Unblocking removes only the current user's own block.
- User reports optionally share exactly one selected received message with staff; staff cannot browse unrelated private conversations. Report reviews are audited and notify the reporter privately.

Communities/events are discoverable postings, not membership/chat/RSVP systems. Study resources support descriptions and external links, not document hosting or an AI tutor.

## Phases and acceptance criteria

### Phase 1 — secure shared foundation

Acceptance: application builds; public discovery renders; real sourced directory is searchable; profile saves use validated dependent IDs; usernames cannot collide in the database; anonymous private access is rejected; no fake records.

Implemented. Type/build/public rendering/anonymous access/DB constraints verified. Signed-in bio persistence and avatar upload/change/removal were verified with programmatic Clerk sessions. Actual account creation, verification/recovery email delivery and real OAuth round trips remain unverified.

### Phase 2 — publishing and moderation

Acceptance: each board persists valid user-owned content; another student cannot edit it; saves/reporting work; moderators cannot be impersonated; sensitive actions audit atomically; suspended users cannot mutate content.

Private draft create/edit/delete and cross-account GET/PUT/DELETE denial were checked with two separate temporary development identities. Owner/admin role requests, direct role changes and resulting audit/request states were exercised. Public publishing, saves and reporting on a genuine public listing still require live verification; no fabricated public listing was created just to claim that test passed.

### Phase 3 — launch hardening

Acceptance: full identity provider testing, signed-in journeys, upload interruption and recovery tests, mature directory import coverage, accessibility/device checks, first-admin setup, production schema/data verification, custom domain/HTTPS, logging review, real deployment smoke tests.

Not complete; these are launch gates, not implied by a successful build.

### Later features

AI study assistant, document storage with permissions and rights checks, actual community memberships/RSVP, admin-managed categories/settings, richer campus-specific accommodation fields, and Paystack payments are separate work. They must not be represented as implemented.

### Private communication and safety phase

Implemented using the existing database, authentication, generated API clients and design system. Backend regression verification passes 64 checks, including anonymous denials, combined/invalid filters and real restricted-role database isolation. Signed-in browser verification passed the core messaging, notification, safety, staff-privacy and filtering flows.

Messaging uses text only (4,000-character maximum). Client-generated UUID retry keys are unique per sender/conversation. A transaction serializes pair contact/block decisions and saves the message, conversation state and notification atomically. Reusing a successful retry key does not create another message/notification; reusing it with different text rejects explicitly.

Notification counts and conversation read checkpoints are persisted, scoped to their recipient/participant and monotonic. A read acknowledgement specifies the last displayed message, so a concurrently arriving later message is not implicitly marked read.

API request limits are authenticated-user scoped, avoiding one shared university IP exhausting the quota for all students. Separate send/start/report/safety limits constrain abuse.

#### Communication verification — development

- Two fresh Clerk QA identities completed real onboarding UI; form values survived a normal authentication refresh.
- Two-way messages persisted. A new browser/session for the same identity retrieved the original history from the database.
- Same-key send retry returned the original message and created no duplicate notification.
- Unread delivery was observed in both directions. Reading a notification did not incorrectly mark its message read; reloading preserved notification history/read status.
- Optional report-and-block saved only the selected received message. Duplicate pending reports rejected with 409; attaching one's own message as evidence against another user rejected with 404.
- Blocking prevented sends in both directions without creating messages/notifications. One user could not remove the other's block; the blocker could unblock successfully.
- A student was denied staff report access. The genuine owner, as an unrelated nonparticipant, received 404 for conversation read/send/read-marker and another recipient's notification-read attempt.
- Owner staff UI displayed only submitted evidence, resolved the report and delivered exactly one private review notification to the reporter. Repeated review rejected with 409 and created no duplicate notification.
- Combined marketplace filters, URL synchronization, Back/Forward, Clear all and reversed-price validation passed. No fake public listing was created to claim a positive-result test.
- Mobile conversation layout passed at 320px, 390px and 768px, including a long unbroken message; bubble text, composer and action controls stayed within document width.
- Type checks and frontend/API builds passed. Static security and privacy-dataflow scans reported no findings. Existing build-tool dependency caveats below still apply.
- The pass exposed protected-route form resets and mobile implicit-grid overflow. Both were fixed and the affected flows passed rechecks.
- Temporary QA identities and their private conversation, messages, notifications, report and audit activity were removed; genuine owner access was preserved.

Still unverified: actual Google/email verification/recovery round trips, production role/policy provisioning and live owner binding. Optional 50+ message browser pagination/stress coverage was skipped; history paging is implemented, but that larger browser dataset was not exercised. Existing live-listing and production launch gates below remain in force.

## Database and schema history

Fourteen application tables:

| Table | Purpose and principal protections |
|---|---|
| academic_directory | Typed parent-linked country/university/faculty/department records, provenance URL, active state |
| institution_requests | Authenticated requests, pending/reviewed status; not auto-promoted into verified reference data |
| profiles | Clerk ID primary key; normalized unique username; student/admin/owner role check; academic foreign keys; suspension and privacy |
| listings | Owner/university foreign keys; constrained kinds/status/prices; images metadata; soft deletion and moderation state |
| saved_listings | Composite unique user/listing key; serialized toggle |
| reports | Reporter/listing foreign keys; pending/resolved state |
| audit_log | Server-written actor/action/target/reason/time |
| uploads | Owner-bound declared metadata, staged/finalized paths; only finalized owned images may be attached |
| access_requests | Admin promotion/demotion requests; requester/target/decider foreign keys; constrained action/status and unique pending requests |
| conversations | Unique sorted participant pair, per-participant read checkpoints and latest-message state |
| direct_messages | Participant-only history, sender ownership, bounded text and unique per-sender UUID retry key |
| user_blocks | Blocker-owned changes, no self-block, both directions consulted before contact |
| notifications | Recipient-only reads/updates, unique recipient/event key; message text excluded |
| user_reports | Reporter-only history plus staff review; only explicitly submitted message evidence; one pending report per reporter/target |

Drizzle source is the schema authority. `lib/db/drizzle/` contains generated SQL migration history and snapshots. Development schema was applied using Drizzle push. No application startup migrations exist.

RLS is enabled on all application tables. Existing core routes authorize end users in server code. Private communication adds enforced database policies: each social transaction binds the authenticated actor locally and switches to the restricted `campus_core_social` NOLOGIN role before touching private data. Five social tables also FORCE RLS. This role cannot log in, bypass RLS, change staff access, or read unrelated private messages. Its profile lookup is read-only, and audit insertion is restricted to actual staff.

The development service account was found to bypass RLS despite FORCE; isolation tests now run under the same restricted role used by requests, not merely under the privileged pool account. Sender notification creation intentionally uses plain INSERT after idempotently checking/serializing its source event: conflict upserts would require SELECT access to another recipient's notification. A unique event constraint independently prevents duplicates.

`0003_shallow_lilandra.sql` adds the social tables/policies/forced-RLS settings. `0004_stiff_phantom_reporter.sql` provisions the restricted role, membership, exact table/sequence grants, read-only profile lookup and staff audit policy. Both were applied transactionally in development; there is no startup DDL or silent privileged fallback. Keep these reviewed role permissions with the schema. Replit's documented publishing migration copies custom roles/permissions, but the deployment preview must verify role membership, grants, policies and restricted-role API requests; table synchronization alone is not proof of working RLS. The role has no password to copy or configure.

## Reference data

328 university records were imported from the NUC official HTML tables:

- https://www.nuc.edu.ng/nigerian-univerisities/federal-univeristies/
- https://www.nuc.edu.ng/nigerian-univerisities/state-univerisity/
- https://www.nuc.edu.ng/nigerian-univerisities/private-univeristies/

One deliberately partial academic tree was added from:
https://uniosun.edu.ng/academics/colleges/college-of-science-engineering-technology/faculty-of-computing-and-information-technology

Only the enumerated computing departments from that official page are included. The source has inconsistent historical count wording; no claims of complete university/faculty/department coverage are made. Polytechnics/colleges and international institutions need additional verified sources and imports. Reference names stay scoped to their actual institution.

The explicit import script fails if the official table format changes; it does not generate a fallback list. Do not run reference imports automatically on application startup. In a new environment the verified owner can use **Admin → Directory → Import from NUC**. This audited action fetches only the three fixed official sources, adds missing universities and never deletes, changes or reactivates existing entries. It was checked against all 328 current source records and correctly added zero duplicates. University import does not imply complete faculty/department coverage.

## Environment variables (names only)

Provisioned:

- `DATABASE_URL`: server-only PostgreSQL connection.
- `CLERK_SECRET_KEY`: server-only identity credential.
- `CLERK_PUBLISHABLE_KEY`, `VITE_CLERK_PUBLISHABLE_KEY`: managed identity configuration.
- `DEFAULT_OBJECT_STORAGE_BUCKET_ID`, `PRIVATE_OBJECT_DIR`, `PUBLIC_OBJECT_SEARCH_PATHS`: App Storage.
- `PORT`, `BASE_PATH`: supplied by the managed service workflows/build environment.
- `LOG_LEVEL`: optional structured server log level.
- `PLATFORM_OWNER_EMAIL`: server-only configured owner identifier; never use a VITE-prefixed variable for this.

`VITE_CLERK_PROXY_URL` / production Clerk proxy settings are platform-managed on publishing. Do not hardcode development URLs or invent production callback values.

No Paystack secret is configured or required for this phase. No payment, order, wallet, escrow or transaction endpoint is enabled. Implement and test amount/reference verification, signature validation, replay/idempotency, failure/cancellation states and authorization before enabling any real-money feature.

## Identity-provider configuration

The application uses the real Clerk SDK, with local `/sign-in` and `/sign-up` pages and wildcard callback subroutes; production Frontend API proxy is `/api/__clerk`.

1. In **Users & Auth → Configure**, inspect enabled providers separately for Development and Production. Verify email/password, email verification and recovery using real accounts. Enable Google if it is not already enabled.
2. Managed shared OAuth credentials are supported. Google OAuth is **not marked tested** merely because the SDK is installed.
3. For branded Google production credentials, publish first. In **Configure → SSO providers → Production → Google → Edit → Custom credentials**, copy **every exact Authorized JavaScript origin and redirect URI shown under Provider setup** into a Google Cloud **Web application** OAuth client. Enter the Client ID and secret only into that secure provider configuration.
4. Set the Google consent-screen branding/audience and complete any required Google verification. Add the exact custom-domain entries shown by Provider setup after connecting a domain.
5. Recheck complete sign-in/sign-out/recovery, Google callback and linking behaviour in a normal browser. Google may not work inside embedded/in-app browsers.

Exact production provider URLs cannot yet be listed: the app is unpublished and those environment-specific values must be read from Provider setup. Do not use a generic Replit connector callback URL for application sign-in.

Official instructions: https://docs.replit.com/features/auth-and-identity/sign-in-providers

## Owner, administrators and anonymity

The user's designated existing verified account now has the single **owner** role in development. Its email is configured server-side only, not embedded in public source or browser bundles.

The one-time owner binding checks the real Clerk account's verified email against `PLATFORM_OWNER_EMAIL`, then serializes the grant, enforces the database's single-owner index and writes an audit record. It is not a first-signup promotion and does not trust client claims or public metadata. A prior deliberately removed grant is never silently restored.

In production, the same configured owner must register/verify/sign in against production's separate Clerk instance. The first authenticated account request performs the verified binding using production's own identity/database. No development ID is copied. An operator can also execute the same binding explicitly in a trusted target environment:

`pnpm --filter @workspace/scripts exec tsx ../artifacts/api-server/src/ops/grant-owner.ts`

`/admin/access` provides the private staff interface:

| Actor | May change roles | May submit requests | May decide requests |
|---|---|---|---|
| Owner | Promote student → admin, demote admin → student | Uses direct controls | Approve/reject |
| Admin | No | Promotion and demotion requests | No |
| Student or anonymous | No | No | No |

Owner cannot be suspended, demoted, replaced or created through these endpoints. Admin accounts cannot be suspended as a substitute for role removal. All role changes/decisions are server-authorized, serialized, transactional, reason-required and audited. Decisions are replay-protected; changed targets cancel conflicting pending requests. Role revocation is checked on the next API call, not only after sign-out.

Staff can see which account is the owner. Public profiles and listings have no role/badge/account email; the owner appears as an ordinary member using their chosen public name/username. This does not conceal personal information the owner voluntarily writes in their public bio, display name or listing contact.

Do not hardcode the designated account's email/ID in source, public configuration, documentation, saved memory, test fixtures or public API responses.

## Actual checks executed

- Workspace TypeScript typecheck: passed.
- Frontend Vite production build: passed.
- API production bundle build: passed.
- Automated regression suite: **64 passed, 0 failed**.
  - Username normalization/validation and reserved identities.
  - Safe external-link schemes.
  - Genuine counts compared with database records.
  - Sourced directory search and parent-scoped departments.
  - Unknown records yield genuine empty results.
  - Boolean filter parsing and invalid inputs.
  - Missing listing/file 404s.
  - Fifteen anonymous private/admin/write endpoint authorization checks.
  - Cross-origin write rejection.
  - Database unique and normalization checks, default student role, and RLS enablement.
  - Private owner binding and single-owner uniqueness; role-target protection; transactional role/audit/request consistency.
  - Invalid/oversized image rejection and safe metadata-stripped resizing/re-encoding.
- Constraint-test fixtures are uncommitted and always rolled back; they cannot appear in discovery.
- Desktop public home screenshot: rendered successfully.
- Narrow 390 px marketplace screenshot: rendered successfully.
- Branded sign-up screenshot: real Clerk email/password form and Google option rendered; no account registration or OAuth round trip was performed.
- Workflow logs: API and frontend running without application startup errors.
- Compressed request bodies reject with HTTP 415; malformed JSON rejects with HTTP 400.
- Dependency security updates removed all critical/high findings. Latest dependency audit: **0 critical, 0 high, 1 moderate**.
- Static code scan completed with no findings; privacy/dataflow scan returned no findings. These are automated checks, not a penetration-test guarantee.

### Dependency audit notes

Updated Zod and the form adapter together; pinned patched body-parser, Undici, fast-uri and PostCSS selector parser versions while upstream parents still resolve affected versions. The remaining moderate finding is a transitive esbuild 0.18 development-server advisory via database development tooling. That development server is not used or exposed by the product; the application's Vite/build tooling uses a newer version. No runtime production endpoint is provided by the affected development tool.

No compressed API request bodies are needed, so parser inflation is disabled as an additional safeguard. JSON/form size limits are explicit.

No configured lint step exists. Builds emit non-fatal source-map reporting notices for scaffold UI components and a client chunk-size advisory. These are not test failures.

### Signed-in development verification

- Existing configured owner remained owner, with its original public profile unchanged.
- Separate QA identities completed sourced-university onboarding.
- Owner promotions/demotions and admin request/owner decision states produced the expected audit history: promotion approved, demotion rejected without changing role, later demotion approved.
- A student's profile PUT containing an injected owner role did not grant privileges; private staff access was denied.
- Profile bio persisted across refresh.
- Real PNG avatar upload/change/remove worked; saved resources returned HTTP 200 WebP, changed image paths persisted and removal saved null.
- Save buttons were disabled during upload; a corrupt PNG with genuine magic bytes was rejected without changing saved data.
- Private Marketplace draft creation/edit/deletion worked; another account's GET/PUT/DELETE returned 404 and public listings stayed empty.
- Owner directly promoted one QA account; its promotion request for a second account was approved, a demotion request was rejected without changing access, and a later demotion request was approved. Owner directly demoted the requester; its next staff request returned HTTP 403 and the refreshed UI showed Staff only.
- The owner access page and role dialogs were usable at 390 × 844 without horizontal overflow.
- Owner-only official directory import succeeded idempotently; a student received HTTP 403.
- Public owner profile screenshot contained no owner role or account email.

The first browser pass found an edit hydration bug in category/visibility controls. The editor now mounts only after saved data is loaded and ignores empty native select bubble events. **Focused regression recheck passed:** a cold load and full reload displayed Textbooks / Good / Draft correctly; editing only title and description preserved those fields in API readback, and public listings remained empty.

After verification, both temporary Clerk identities, their application profiles, access-request/audit fixtures, private drafts and all five temporary upload objects were removed. The real owner account/profile were preserved. No fake public listing or permanent QA activity remains.

### Not executed / not verified

- Actual email/password registration, recovery email or email verification delivery in this verification pass.
- Google authorization/callback/account-linking with a real account.
- A deliberately interrupted network upload and profile persistence across a real provider sign-out/sign-in round trip (refresh persistence and successful uploads were checked).
- Full accessibility audit or real iOS/Android/Safari device tests.
- Public posting/saves/reporting using a genuine consenting student's listing.
- Paystack verification/webhook replay tests (no payment implementation).
- Load, concurrency, malicious image decoding or penetration tests.
- Any production user journey (not published).

## Defects found and fixed while building

- Updated generated-client configuration for React Query v5 and iterable browser headers so generated types compile.
- Preserved closing/event dates as calendar strings rather than coercing them to Date objects.
- Parsed boolean query strings explicitly rather than treating `"false"` as truthy.
- Corrected React ref initialization and aligned React patch version with authentication SDK requirements.
- Finalized uploads are copied from a pinned generation to a new unsigned path, preventing a still-valid staging PUT URL from replacing a served image.
- Matched server/client username rules, added truly searchable institution selectors and removed anonymous contact-field exposure.

## Known limitations / launch blockers

- The above remaining live-provider and production checks have not run; these are the remaining release gates. Programmatic development sessions do not substitute for real Google/email verification.
- Development owner is established. Production owner binding still requires that account's verified production sign-in.
- Directory is not complete beyond the imported NUC universities and one academic tree. Unlisted students can request additions; they cannot choose a nonexistent university.
- Fac/department are temporarily optional to avoid inventing data. Decide whether complete academic coverage must block registration before commercial launch.
- Moderation requires human source verification; directory source URLs are provenance, not automatic evidence that every administrator-entered value is legitimate.
- Categories are static reference choices; admin category/settings CRUD is not implemented.
- Payments and AI remain disabled. Private messaging, in-app notifications and safety are implemented; push/email notification delivery, attachments and group chat are not included.
- Uploads now validate declared metadata/magic bytes, fully decode with a pixel limit, strip metadata, resize and re-encode into immutable WebP. Per-user issuance is serialized, processing concurrency/memory are bounded, and expired staging objects are cleaned hourly in batches of 100 (also at startup). Full antivirus scanning and unreferenced-final-image retention policies are separate operational enhancements.
- Rate limiting is process-local and is not a distributed multi-instance abuse-prevention system.
- Admin overview is bounded to recent queues/users; advanced moderation pagination and listing restoration remain future work.
- Institution-scoped content works; separate campus entities, community memberships and event attendance are not implemented.
- Profile academic relationships are validated server-side; composite relationship constraints and TOCTOU review are recommended before broad administrative imports.

## Production publishing procedure

For the Railway architecture, service configuration, environment variables, data migration and cutover gates, see [Railway deployment](RAILWAY-DEPLOYMENT.md). The procedure below remains specific to publishing through Replit.

1. Complete the launch-blocker checklist above; verify the owner's real development account and administrator access.
2. Run the documented typecheck, tests and production builds; review diff and generated SQL schema history.
3. Open Publish and select a server-capable deployment for the API plus the static web service. Existing artifact production definitions provide build/run settings. Do not deploy only the static frontend. **Do not populate production with development user data:** Clerk accounts are separate, and copying development role/profile rows would copy invalid development identities and the owner binding.
4. Review production secrets securely in the publishing flow. Managed production Clerk keys are distinct from development keys.
5. Replit Publish manages the managed production database schema diff. Review rename/destructive-change prompts; do not add startup DDL or custom production migration commands.
6. Register/verify/sign in using the configured owner email in production. The server binds the verified production identity to the single owner role. Confirm role constraints include owner and the single-owner index exists.
7. Open Admin → Directory → Import from NUC to populate a fresh production university directory; then confirm dependent selectors. Add verified faculty/department records using the directory editor as coverage expands.
8. Configure Google and all exact Provider setup origins/callbacks for the published domain. If using a custom domain, attach it in Publishing and follow its DNS/HTTPS checks; a custom domain is optional for a first release.
9. Execute the production verification checklist below and inspect structured logs. Keep payment flags off.
10. Announce commercial availability only after these checks pass.

### Production journey checklist — all pending

- [ ] Public homepage and each board on desktop and phone.
- [ ] Email/password registration, verification, recovery and logout.
- [ ] Google OAuth round trip and safe account linking.
- [ ] Multi-university onboarding and a missing-institution request.
- [ ] Username uniqueness, including competing registrations.
- [ ] Profile edits and avatar add/change/remove after refresh and re-login.
- [ ] Listings create/edit/draft/publish/unavailable/remove across all boards.
- [ ] Cross-user write rejection and private upload access denial.
- [ ] Search/filter/pagination/saves/reporting.
- [ ] Admin reports, directories, suspension/restoration and audit.
- [ ] Correct production database/reference data and storage persistence.
- [ ] Accessible focus/keyboard forms, no narrow-layout overflow, iOS Safari and Android Chrome.

## Rollback

Keep source changes checkpointed/version-controlled. If a release fails, stop rollout and restore the last known working application through the project's checkpoints/publishing controls. Review schema compatibility before restoring old code. Never blindly drop production tables or copy development identities into production to repair access. Payment-related rollbacks must preserve transaction evidence; payments remain absent in this release.
