---
name: Workspace validation tooling
description: Schema push and incremental typecheck caveats that can report misleading results.
---

Drizzle push may report successful synchronization without changing an existing CHECK constraint's expression, even when generated migration SQL correctly includes the change.

**Why:** Expanding an allowed role set generated valid SQL, but the development database retained its old CHECK expression after a successful push and rejected the new role.

**How to apply:** Verify the actual constraint expression when changing an enum-like CHECK. Apply the reviewed change explicitly in development when necessary; review managed production schema changes rather than adding startup DDL.

Composite TypeScript build outputs can retain dependency-specific declaration shapes after a dependency major-version change.

**Why:** A schema-library upgrade left previously generated declaration types stale; ordinary incremental checks reported downstream values as any until referenced libraries were forcibly rebuilt.

**How to apply:** After such dependency upgrades, force one rebuild of the referenced libraries before diagnosing downstream inference failures or adding type casts.
