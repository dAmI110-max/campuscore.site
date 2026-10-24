---
name: Social privacy constraints
description: Enforced database isolation, write-only notification production and identity-scoped private UI state.
---

Do not treat enabled or forced RLS as proof of isolation when the service database role is privileged. Private communication transactions must bind the verified actor and downgrade to a restricted NOLOGIN role, with transaction-local identity/role restoration and no privileged fallback.

**Why:** The development service account bypassed even forced RLS, allowing a sender to read another recipient's notification during the first isolation check. Testing under the restricted runtime role exposed the true policy behaviour.

**How to apply:** Preserve the reviewed role, membership, policies and grants in every environment. Test participant and unrelated-staff reads under the actual restricted transaction role, not the owner pool. Production publication must verify these permissions as well as table schemas.

Notification creation must not gain recipient read access simply to make a conflict upsert succeed. Serialize and idempotently check the originating event before writing; retain a unique recipient/event constraint.

**Why:** PostgreSQL conflict handling can require SELECT permission on a row that its producer is intentionally not allowed to read. Widening notification SELECT to senders would expose another user's private activity/read state.

**How to apply:** New notification producers must maintain write-only cross-recipient delivery, safe source retries and atomic source-event/notification persistence.

Private local UI state must be scoped to the authenticated identity, in addition to clearing/cancelling user-specific query caches.

**Why:** Clearing a query cache does not clear loaded history arrays, composer text or dialogs when an active account changes. Also, per-render route component factories remount forms during ordinary auth refreshes and can erase unsaved work.

**How to apply:** Remount private screens on actual identity changes, but retain stable route component identities across token refreshes. Avoid creating protected-route component functions during render.

Close all QA browser contexts before removing test identities and data, then check for late fixture rows after pending requests finish.

**Why:** Deleting Clerk test identities did not immediately stop their open browser pollers. Authenticated/in-flight requests recreated empty application profiles after an initially clean database teardown.

**How to apply:** Verify exact fixture identity ownership and refuse any owner account. Stop test pollers, remove only those fixtures and their associated activity, revoke/remove their test identities, and perform a final exact-ID sweep with an owner-preservation check. Never delete broad username matches or genuine users.
