import { Router, type IRouter } from "express";
import { notificationsTable as n } from "@workspace/db";
import { and, count, desc, eq, lt, lte } from "drizzle-orm";
import { z } from "zod";
import { socialRequest, positiveId, notificationWire, unreadNotifications } from "../lib/social";
import { HttpError } from "../lib/errors";

const router: IRouter = Router();
router.get("/notifications", async (req, res) => {
  const { before, unreadOnly } = z.object({ before: positiveId.optional(), unreadOnly: z.enum(["true", "false"]).optional() }).parse(req.query);
  res.json(await socialRequest(req, async (tx, actorId) => {
    const where = and(eq(n.userId, actorId), before ? lt(n.id, before) : undefined, unreadOnly === "true" ? unreadNotifications(actorId) : undefined);
    const rows = await tx.select().from(n).where(where).orderBy(desc(n.id)).limit(31);
    const [unread] = await tx.select({ count: count() }).from(n).where(unreadNotifications(actorId));
    return { items: rows.slice(0, 30).map(notificationWire), unreadCount: unread.count, nextBefore: rows.length > 30 ? rows[29].id : null };
  }));
});
router.post("/notifications/:id/read", async (req, res) => {
  const id = positiveId.parse(req.params.id);
  await socialRequest(req, async (tx, actorId) => {
    const [row] = await tx.update(n).set({ readAt: new Date() }).where(and(eq(n.id, id), eq(n.userId, actorId))).returning({ id: n.id });
    if (!row) throw new HttpError(404, "Notification not found.");
  });
  res.json({ message: "Notification marked read." });
});
router.post("/notifications/read-all", async (req, res) => {
  const { throughId } = z.object({ throughId: positiveId }).parse(req.body);
  await socialRequest(req, async (tx, actorId) => {
    await tx.update(n).set({ readAt: new Date() }).where(and(unreadNotifications(actorId), lte(n.id, throughId)));
  });
  res.json({ message: "Notifications marked read." });
});
export default router;
