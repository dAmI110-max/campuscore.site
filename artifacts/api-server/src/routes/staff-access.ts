import { Router, type IRouter } from "express";
import { db, profilesTable as p, accessRequestsTable as r, auditTable } from "@workspace/db";
import { count, desc, eq, ilike, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { GetStaffAccessQueryParams, GetStaffAccessResponse, ChangeStaffRoleBody, RequestStaffChangeBody, DecideStaffRequestParams, DecideStaffRequestBody } from "@workspace/api-zod";
import { administrator } from "../lib/auth";
import { staffTransaction, validateStaffTarget, applyStaffRole } from "../lib/staff-access";
import { HttpError } from "../lib/errors";

const router: IRouter = Router();
router.get("/admin/access", async (req, res): Promise<void> => {
  await administrator(req);
  const { q, page = 1 } = GetStaffAccessQueryParams.parse(req.query);
  const search = q?.trim().replace(/[%_\\]/g, "\\$&");
  const filter = search ? or(ilike(p.username, `%${search}%`), ilike(p.displayName, `%${search}%`)) : undefined;
  const requester = alias(p, "requester");
  const target = alias(p, "target");
  const [users, [total], requests] = await Promise.all([
    db.select({ id: p.id, displayName: p.displayName, username: p.username, role: p.role, suspended: p.suspended, createdAt: p.createdAt })
      .from(p).where(filter).orderBy(desc(p.createdAt), p.id).limit(25).offset((page - 1) * 25),
    db.select({ count: count() }).from(p).where(filter),
    db.select({
      id: r.id, requesterId: r.requesterId, requesterName: requester.displayName,
      targetId: r.targetId, targetName: target.displayName, targetUsername: target.username,
      action: r.action, reason: r.reason, status: r.status, decisionReason: r.decisionReason,
      decidedBy: r.decidedBy, createdAt: r.createdAt, decidedAt: r.decidedAt,
    }).from(r).innerJoin(requester, eq(r.requesterId, requester.id)).innerJoin(target, eq(r.targetId, target.id))
      .orderBy(sql`case when ${r.status} = 'pending' then 0 else 1 end`, desc(r.createdAt), desc(r.id)).limit(200),
  ]);
  res.json(GetStaffAccessResponse.parse({
    users: users.map(user => ({ ...user, createdAt: user.createdAt.toISOString() })), total: total.count, page,
    requests: requests.map(request => ({ ...request, createdAt: request.createdAt.toISOString(), decidedAt: request.decidedAt?.toISOString() ?? null })),
  }));
});
router.post("/admin/access/roles", async (req, res): Promise<void> => {
  const actor = await administrator(req);
  const body = ChangeStaffRoleBody.parse(req.body);
  if (body.reason.trim().length < 5) throw new HttpError(400, "Give a meaningful reason.");
  await staffTransaction(actor.id, true, tx => applyStaffRole(tx, actor.id, body.targetId, body.role, body.reason.trim()));
  res.json({ message: "Administrator access updated and recorded. The new permission applies to the account's next request." });
});
router.post("/admin/access/requests", async (req, res): Promise<void> => {
  const actor = await administrator(req);
  const body = RequestStaffChangeBody.parse(req.body);
  if (body.reason.trim().length < 5) throw new HttpError(400, "Give a meaningful reason.");
  await staffTransaction(actor.id, false, async (tx, current) => {
    if (current.role === "owner") throw new HttpError(400, "Use your direct owner controls instead of submitting a request.");
    await validateStaffTarget(tx, body.targetId, body.action === "promote" ? "admin" : "student");
    const [request] = await tx.insert(r).values({ requesterId: actor.id, targetId: body.targetId, action: body.action, reason: body.reason.trim() }).onConflictDoNothing().returning();
    if (!request) throw new HttpError(409, "You already have a pending request for this account and action.");
    await tx.insert(auditTable).values({ actorId: actor.id, action: `request-${body.action}-admin`, targetId: body.targetId, reason: `Request #${request.id}: ${body.reason.trim()}` });
  });
  res.status(201).json({ message: "Request sent to the owner. No permissions have changed." });
});
router.post("/admin/access/requests/:id/decision", async (req, res): Promise<void> => {
  const actor = await administrator(req);
  const { id } = DecideStaffRequestParams.parse(req.params);
  const body = DecideStaffRequestBody.parse(req.body);
  if (body.reason.trim().length < 5) throw new HttpError(400, "Give a meaningful decision reason.");
  await staffTransaction(actor.id, true, async tx => {
    const [request] = await tx.select().from(r).where(eq(r.id, id)).for("update");
    if (!request) throw new HttpError(404, "Access request not found.");
    if (request.status !== "pending") throw new HttpError(409, "This request has already been decided or superseded.");
    // Set this request's final state before cancelling other outstanding requests for the target.
    await tx.update(r).set({ status: body.decision === "approve" ? "approved" : "rejected", decisionReason: body.reason.trim(), decidedBy: actor.id, decidedAt: new Date() }).where(eq(r.id, id));
    if (body.decision === "approve") await applyStaffRole(tx, actor.id, request.targetId, request.action === "promote" ? "admin" : "student", `Approved request #${id}: ${body.reason.trim()}`);
    await tx.insert(auditTable).values({ actorId: actor.id, action: `${body.decision}-access-request`, targetId: String(id), reason: body.reason.trim() });
  });
  res.json({ message: body.decision === "approve" ? "Request approved and permissions updated." : "Request rejected. Permissions were not changed." });
});
export default router;
