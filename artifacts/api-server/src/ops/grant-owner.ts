import { clerkClient } from "@clerk/express";
import { pool } from "@workspace/db";
import { bootstrapConfiguredOwner } from "../lib/owner-bootstrap";

try {
  const email = process.env.PLATFORM_OWNER_EMAIL;
  if (!email) throw new Error("Set PLATFORM_OWNER_EMAIL securely before running this command.");
  const users = await clerkClient.users.getUserList({ emailAddress: [email], limit: 2 });
  if (users.data.length !== 1) throw new Error("Exactly one existing verified owner account is required in this environment.");
  if (!await bootstrapConfiguredOwner(users.data[0].id)) throw new Error("Owner binding refused. Check verification, suspension and any existing owner or prior grant.");
  process.stdout.write("Configured verified account has owner access in this environment. No public role or email was added.\n");
} finally {
  await pool.end();
}
