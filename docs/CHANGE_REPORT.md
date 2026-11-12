
---

# Addendum 2 — owner bulk directory upload (faculties/departments)

Based on the repository state in `campuscore_site-main__1__1.zip` (not on the earlier B6/D5/D6 branch).

| File | Change |
|---|---|
| `artifacts/api-server/src/lib/directory-bulk-core.ts` (new) | Pure CSV parsing, validation and planning (no database) |
| `artifacts/api-server/src/lib/directory-bulk.ts` (new) | Loads directory, previews, and commits in one owner-only serialized transaction with an audit entry |
| `artifacts/api-server/src/routes/admin.ts` | New `POST /api/admin/directory/bulk` (owner only; `{ csv, commit }`) |
| `artifacts/campus-core/src/pages/admin.tsx` | New owner card on the Directory tab: file/paste, Check upload, Import |
| `artifacts/api-server/src/directory-bulk.test.ts` (new), `test.mjs` | 10 unit tests |
| `docs/DIRECTORY-DATA.md`, `docs/directory-batches/batch-01-unilag-ui-science.csv` (new) | Guide and first verified data batch |

No database migration, no schema change, no OpenAPI change. The endpoint is not in the OpenAPI spec and the page calls it with plain `fetch`; add it to the spec on the next codegen pass if you want a generated hook.

Tests: the 10 unit tests for parsing and planning pass locally under Node (run directly, outside the repo's build). **Not run:** `pnpm typecheck`, the repo test runner, a build, or any browser test. The database part (`directory-bulk.ts`) and the UI have not been executed.

Rollback: `git revert` the commit. Data added by an import can be deactivated in Admin → Directory (entries are never deleted by the tool).
