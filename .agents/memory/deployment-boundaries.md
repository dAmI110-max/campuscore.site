---
name: Confirmed deployment boundaries
description: User-confirmed public and internal Campus Core services on one domain.
---

The user confirmed one shared domain: `campus-core` is public at `/`, `api-server` is public through `/api/*`, and `mockup-sandbox` is internal only.

**Why:** The user explicitly selected these visibility boundaries and requested Vercel Services rather than separate projects.

**How to apply:** Keep the sandbox out of public ingress. An internal service is not automatically a staff-accessible browser page. Add server-to-server bindings only after confirming actual calls; shared package imports and browser API requests are not bindings. Do not treat approval to finish configuration as approval to deploy, change DNS, modify production data, or enable live payments.
