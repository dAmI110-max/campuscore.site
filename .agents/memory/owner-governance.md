---
name: Owner governance
description: Private ownership and owner-only administrator appointment/removal rules.
---

The user wants the owner/superadmin account anonymous to ordinary users, except fellow admins. Only the owner may appoint or demote administrators. Other admins may request appointments or demotions but may not perform or approve them.

**Why:** The user explicitly does not want users to know they own the project, and requires owner control over staff access.

**How to apply:** Keep account roles and owner identity in staff-only surfaces. Never expose owner badges, account emails or ownership markers on public profiles/listings. Preserve server-side owner-only role changes; do not add admin-to-admin delegation. Store no owner email or personal identifier in memory.
