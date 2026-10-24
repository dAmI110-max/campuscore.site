/**
 * Explicit operator action after the owner has confirmed the intended account.
 * Does not accept a browser request and never auto-promotes the first signup.
 * Resolve the account separately in each environment.
 */
import { clerkClient } from "@clerk/express";
import { pool } from "@workspace/db";
async function main() {
  const email = process.argv[2];
  if (!email || !email.includes("@")) throw new Error("Usage: pnpm --filter @workspace/scripts exec tsx src/grant-admin.ts verified-owner-email");
  const users = await clerkClient.users.getUserList({ emailAddress: [email], limit: 2 });
  if (users.data.length !== 1) throw new Error("Exactly one existing account with this email is required. Sign up first.");
  const user = users.data[0];
  if (!user.emailAddresses.some(e => e.emailAddress.toLowerCase() === email.toLowerCase() && e.verification?.status === "verified")) throw new Error("Owner email must be verified before granting access.");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: prior } = await client.query("select id from audit_log where action='initial-admin-grant' and target_id=$1", [user.id]);
    if (prior.length) throw new Error("An initial grant already exists; refusing to restore potentially revoked access.");
    await client.query("insert into profiles(id,role) values ($1,'admin') on conflict(id) do update set role='admin'", [user.id]);
    await client.query("insert into audit_log(actor_id,action,target_id,reason) values ('operator','initial-admin-grant',$1,'Operator confirmed ownership of verified account')", [user.id]);
    await client.query("COMMIT");
    process.stdout.write("Administrator access granted to the verified account in the current environment.\n");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); await pool.end(); }
}
main().catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
