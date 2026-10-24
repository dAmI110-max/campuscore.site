import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import { db, uploadsTable as u, profilesTable as p, listingsTable as l } from "@workspace/db";
import { and, count, eq, gte, isNull, or, sql } from "drizzle-orm";
import { RequestUploadUrlBody, RequestUploadUrlResponse, CompleteUploadBody, CompleteUploadResponse } from "@workspace/api-zod";
import { account, identity } from "../lib/auth";
import { HttpError } from "../lib/errors";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { sanitizeImage } from "../lib/image-safety";

const router: IRouter = Router();
const storage = new ObjectStorageService();
const validPath = /^\/objects\/uploads\/[a-f0-9-]{36}$/;
function detectedMime(bytes: Buffer): string | null {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  if (bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}
router.post("/storage/uploads/request-url", async (req, res): Promise<void> => {
  const user = await account(req);
  const body = RequestUploadUrlBody.parse(req.body);
  if (!process.env.PRIVATE_OBJECT_DIR) throw new HttpError(503, "File storage is not configured. Your changes have not been saved.");
  const ticket = await db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`upload-ticket:${user.id}`}))`);
    const [recent] = await tx.select({ count: count() }).from(u).where(and(eq(u.ownerId, user.id), eq(u.complete, false), gte(u.createdAt, new Date(Date.now() - 3600000))));
    if (recent.count >= 60) throw new HttpError(429, "Upload limit reached. Please try again in an hour.");
    const uploadURL = await storage.getObjectEntityUploadURL();
    const objectPath = storage.normalizeObjectEntityPath(uploadURL);
    if (!validPath.test(objectPath)) throw new HttpError(500, "Storage returned an invalid upload path.");
    await tx.insert(u).values({ objectPath, ownerId: user.id, contentType: body.contentType, size: body.size });
    return { uploadURL, objectPath };
  });
  res.json(RequestUploadUrlResponse.parse(ticket));
});
router.post("/storage/uploads/complete", async (req, res): Promise<void> => {
  const user = await account(req);
  const { objectPath } = CompleteUploadBody.parse(req.body);
  if (!validPath.test(objectPath)) throw new HttpError(400, "Invalid upload path.");
  const finalizedPath = await db.transaction(async tx => {
    const [ticket] = await tx.select().from(u).where(and(eq(u.objectPath, objectPath), eq(u.ownerId, user.id))).for("update");
    if (!ticket) throw new HttpError(404, "Upload ticket not found.");
    if (ticket.finalizedPath) return ticket.finalizedPath;
    if (ticket.complete) return ticket.objectPath;
    if (ticket.createdAt.getTime() < Date.now() - 3600000) throw new HttpError(400, "Upload ticket expired. Please upload the file again.");
    const file = await storage.getObjectEntityFile(objectPath);
    const [metadata] = await file.getMetadata();
    if (Number(metadata.size) !== ticket.size || Number(metadata.size) > 5242880 || metadata.contentType !== ticket.contentType) {
      throw new HttpError(400, "The uploaded file does not match its declared type or size (5 MB maximum).");
    }
    // Pin the generation to avoid validating one object then copying an overwritten upload.
    const version = file.bucket.file(file.name, { generation: metadata.generation });
    const chunks: Buffer[] = [];
    for await (const chunk of version.createReadStream({ start: 0, end: 31 })) chunks.push(Buffer.from(chunk));
    if (detectedMime(Buffer.concat(chunks)) !== ticket.contentType) throw new HttpError(400, "The uploaded file is not a supported image.");
    const [source] = await version.download();
    const sanitized = await sanitizeImage(source);
    // Strip metadata and malicious trailing content; the signed staging object is never served.
    const destinationPath = `/objects/uploads/${randomUUID()}`;
    const destinationName = `${storage.getPrivateObjectDir().split("/").filter(Boolean).slice(1).join("/")}/uploads/${destinationPath.split("/").at(-1)}`;
    await file.bucket.file(destinationName).save(sanitized, {
      resumable: false, preconditionOpts: { ifGenerationMatch: 0 },
      metadata: { contentType: "image/webp", cacheControl: "private, max-age=60" },
    });
    await tx.insert(u).values({ objectPath: destinationPath, ownerId: user.id, contentType: "image/webp", size: sanitized.length, complete: true });
    await tx.update(u).set({ finalizedPath: destinationPath }).where(eq(u.objectPath, objectPath));
    return destinationPath;
  });
  res.json(CompleteUploadResponse.parse({ objectPath: finalizedPath, url: `/api/storage${finalizedPath}` }));
});
router.get("/storage/objects/uploads/:objectId", async (req, res): Promise<void> => {
  const objectPath = `/objects/uploads/${req.params.objectId}`;
  if (!validPath.test(objectPath)) throw new HttpError(404, "File not found.");
  const [upload] = await db.select().from(u).where(and(eq(u.objectPath, objectPath), eq(u.complete, true)));
  if (!upload) throw new HttpError(404, "File not found.");
  const userId = identity(req);
  let allowed = upload.ownerId === userId;
  if (!allowed) {
    const [avatar] = await db.select({ id: p.id }).from(p).where(and(eq(p.avatarPath, objectPath), eq(p.suspended, false))).limit(1);
    const [listing] = await db.select({ id: l.id }).from(l).innerJoin(p, eq(l.ownerId, p.id)).where(and(
      sql`${objectPath} = any(${l.images})`, eq(l.status, "published"), eq(l.hidden, false), isNull(l.deletedAt), eq(p.suspended, false),
    )).limit(1);
    allowed = !!avatar || !!listing;
  }
  if (!allowed) throw new HttpError(404, "File not found.");
  const file = await storage.getObjectEntityFile(objectPath);
  res.set({ "Content-Type": upload.contentType, "X-Content-Type-Options": "nosniff", "Cache-Control": "private, max-age=60", "Content-Length": String(upload.size) });
  const stream = file.createReadStream();
  stream.on("error", err => { req.log.error({ err }, "File download failed"); if (!res.headersSent) res.status(502).end(); else res.destroy(); });
  stream.pipe(res);
});
export default router;
