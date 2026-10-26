import { db, uploadsTable as u } from "@workspace/db";
import { and, eq, lt } from "drizzle-orm";
import { ObjectStorageService } from "./objectStorage";
import { logger } from "./logger";

const storage = new ObjectStorageService();
let running = false;
/** Expired staging files only; never remove finalized user content or its metadata. */
export async function cleanExpiredStagingUploads(batchSize = 100) {
  if (running || !process.env.PRIVATE_OBJECT_DIR) return;
  running = true;
  try {
    const cutoff = new Date(Date.now() - 2 * 3600000);
    const rows = await db.select({ objectPath: u.objectPath }).from(u)
      .where(and(eq(u.complete, false), lt(u.createdAt, cutoff))).limit(batchSize);
    for (const row of rows) {
      try {
        const file = await storage.getObjectEntityFile(row.objectPath);
        await file.delete({ ignoreNotFound: true });
      } catch (error) {
        if ((error as { name?: string }).name !== "ObjectNotFoundError") {
          logger.warn({ err: error }, "Expired staging-object cleanup will retry");
          continue;
        }
      }
      await db.delete(u).where(and(eq(u.objectPath, row.objectPath), eq(u.complete, false), lt(u.createdAt, cutoff)));
    }
  } finally { running = false; }
}
export function startUploadMaintenance() {
  const run = () => { void cleanExpiredStagingUploads().catch(error => logger.warn({ err: error }, "Upload maintenance failed")); };
  run();
  setInterval(run, 60 * 60_000).unref();
}
