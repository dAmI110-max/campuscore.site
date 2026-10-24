import { Router, type IRouter } from "express";
import { rateLimit } from "express-rate-limit";
import { blocksTable as b, userReportsTable as r, profilesTable as p, messagesTable as m, conversationsTable as c, auditTable } from "@workspace/db";
import { alias } from "drizzle-orm/pg-core";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { CreateUserReportBody, ReviewUserReportBody } from "@workspace/api-zod";
import { identity } from "../lib/auth";
import { HttpError } from "../lib/errors";
import { socialRequest, positiveId, pageNumber, usernameInput, findPeer, lockPair, person, isParticipant, notify, type SocialTx } from "../lib/social";

const router: IRouter = Router();
const reportLimit = rateLimit({ windowMs: 3600000, limit: 10, keyGenerator: req => identity(req) ?? "anonymous", standardHeaders: "draft-8", legacyHeaders: false, message: { error: "Report limit reached. Please try again later." } });
const blockLimit = rateLimit({ windowMs: 60000, limit: 30, keyGenerator: req => identity(req) ?? "anonymous", standardHeaders: "draft-8", legacyHeaders: false, message: { error: "Too many safety changes. Wait a minute and retry." } });
const reporter = alias(p, "reporter");
const target = alias(p, "reported_user");
function reportsQuery(tx: SocialTx) {
  return tx.select({
    report: r, reporter: { username: reporter.username, displayName: reporter.displayName, avatarPath: reporter.avatarPath },
    target: { username: target.username, displayName: target.displayName, avatarPath: target.avatarPath },
    targetId: target.id, targetRole: target.role,
  }).from(r).innerJoin(reporter, eq(reporter.id, r.reporterId)).innerJoin(target, eq(target.id, r.targetId));
}
type ReportRow = Awaited<ReturnType<typeof reportsQuery>>[number];
function reportWire(row: ReportRow, staff = false) {
  return {
    id: row.report.id, target: person(row.target), reason: row.report.reason, status: row.report.status,
    snapshot: row.report.snapshot, snapshotAt: row.report.snapshotAt, createdAt: row.report.createdAt,
    decisionReason: row.report.decisionReason, decidedAt: row.report.decidedAt,
    ...(staff ? { reporter: person(row.reporter), targetId: row.targetId, targetRole: row.targetRole } : {}),
  };
}
router.get("/safety/blocks", async (req, res) => {
  const page = pageNumber.parse(req.query.page);
  res.json(await socialRequest(req, async (tx, actorId) => {
    const items = await tx.select({ person: { username: p.username, displayName: p.displayName, avatarPath: p.avatarPath }, createdAt: b.createdAt })
      .from(b).innerJoin(p, eq(p.id, b.blockedId)).where(eq(b.blockerId, actorId)).orderBy(desc(b.createdAt), desc(b.blockedId)).limit(25).offset((page - 1) * 25);
    const [total] = await tx.select({ count: count() }).from(b).where(eq(b.blockerId, actorId));
    return { items: items.map(row => ({ person: person(row.person), createdAt: row.createdAt })), total: total.count, page, pageSize: 25 };
  }));
});
router.post("/safety/blocks/:username", blockLimit, async (req, res) => {
  const username = usernameInput.parse(req.params.username);
  await socialRequest(req, async (tx, actorId) => {
    const peer = await findPeer(tx, username, actorId, false);
    await lockPair(tx, actorId, peer.id);
    await tx.insert(b).values({ blockerId: actorId, blockedId: peer.id }).onConflictDoNothing();
  });
  res.json({ message: "Account blocked. New messages are prevented in both directions." });
});
router.delete("/safety/blocks/:username", blockLimit, async (req, res) => {
  const username = usernameInput.parse(req.params.username);
  await socialRequest(req, async (tx, actorId) => {
    const peer = await findPeer(tx, username, actorId, false);
    await lockPair(tx, actorId, peer.id);
    await tx.delete(b).where(and(eq(b.blockerId, actorId), eq(b.blockedId, peer.id)));
  });
  res.json({ message: "Your block was removed. The other account's safety settings still apply." });
});
router.get("/safety/reports", async (req, res) => {
  const page = pageNumber.parse(req.query.page);
  res.json(await socialRequest(req, async (tx, actorId) => {
    const rows = await reportsQuery(tx).where(eq(r.reporterId, actorId)).orderBy(desc(r.id)).limit(25).offset((page - 1) * 25);
    const [total] = await tx.select({ count: count() }).from(r).where(eq(r.reporterId, actorId));
    return { items: rows.map(row => reportWire(row)), total: total.count, page, pageSize: 25 };
  }));
});
router.post("/safety/reports", reportLimit, async (req, res) => {
  const input = CreateUserReportBody.parse(req.body);
  const username = usernameInput.parse(input.username);
  const reason = z.string().trim().min(10).max(1000).parse(input.reason);
  res.json(await socialRequest(req, async (tx, actorId) => {
    const peer = await findPeer(tx, username, actorId, false);
    await lockPair(tx, actorId, peer.id);
    const [pending] = await tx.select({ id: r.id }).from(r).where(and(eq(r.reporterId, actorId), eq(r.targetId, peer.id), eq(r.status, "pending")));
    if (pending) throw new HttpError(409, "You already have a pending report for this account. Check Safety for its status.");
    let evidence: typeof m.$inferSelect | undefined;
    if (input.messageId !== undefined) {
      [evidence] = await tx.select({ message: m }).from(m).innerJoin(c, eq(c.id, m.conversationId))
        .where(and(eq(m.id, input.messageId), eq(m.senderId, peer.id), isParticipant(actorId))).then(rows => rows.map(row => row.message));
      if (!evidence) throw new HttpError(404, "Report evidence not found in your conversation with this account.");
    }
    const [saved] = await tx.insert(r).values({ reporterId: actorId, targetId: peer.id, reason, messageId: evidence?.id, snapshot: evidence?.body, snapshotAt: evidence?.createdAt }).returning();
    if (input.blockUser) await tx.insert(b).values({ blockerId: actorId, blockedId: peer.id }).onConflictDoNothing();
    const [row] = await reportsQuery(tx).where(eq(r.id, saved.id));
    return reportWire(row);
  }, true));
});
router.get("/admin/user-reports", async (req, res) => {
  const { page, status } = z.object({ page: pageNumber, status: z.enum(["pending", "resolved", "dismissed", "all"]).default("pending") }).parse(req.query);
  res.json(await socialRequest(req, async tx => {
    const where = status === "all" ? undefined : eq(r.status, status);
    const rows = await reportsQuery(tx).where(where).orderBy(desc(r.createdAt), desc(r.id)).limit(25).offset((page - 1) * 25);
    const [total] = await tx.select({ count: count() }).from(r).where(where);
    return { items: rows.map(row => reportWire(row, true)), total: total.count, page, pageSize: 25 };
  }, false, true));
});
router.post("/admin/user-reports/:id/review", async (req, res) => {
  const id = positiveId.parse(req.params.id);
  const input = ReviewUserReportBody.parse(req.body);
  const reason = z.string().trim().min(5).max(1000).parse(input.reason);
  await socialRequest(req, async (tx, actorId) => {
    const [report] = await tx.select().from(r).where(eq(r.id, id)).for("update");
    if (!report) throw new HttpError(404, "Report not found.");
    if (report.status !== "pending") throw new HttpError(409, "This report has already been reviewed.");
    await tx.update(r).set({ status: input.status, decisionReason: reason, decidedBy: actorId, decidedAt: new Date() }).where(eq(r.id, id));
    await tx.insert(auditTable).values({ actorId, action: `${input.status}-user-report`, targetId: String(id), reason });
    await notify(tx, { userId: report.reporterId, eventKey: `user-report-reviewed:${id}`, kind: "report-reviewed", title: "Your safety report has been reviewed", href: "/safety" });
  }, false, true);
  res.json({ message: "Report reviewed. The reporter has been notified privately." });
});
export default router;
