import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage, RequestListener, ServerResponse } from "node:http";

export const UPLOAD_MAINTENANCE_PATH = "/api/internal/maintenance/uploads";

/** The only scheduled operation is expired, incomplete upload cleanup. */
export function createVercelHandler(
  api: RequestListener,
  cleanup: () => Promise<void>,
  getCronSecret: () => string | undefined = () => process.env.CRON_SECRET,
) {
  return (req: IncomingMessage, res: ServerResponse) => {
    const pathname = (req.url ?? "/").split("?")[0];
    if (pathname !== UPLOAD_MAINTENANCE_PATH) return api(req, res);

    return (async () => {
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Content-Type", "application/json");
      if (req.method !== "GET") {
        res.setHeader("Allow", "GET");
        res.statusCode = 405;
        res.end(JSON.stringify({ error: "Method not allowed." }));
        return;
      }
      const secret = getCronSecret();
      if (!secret || secret.length < 32) {
        res.statusCode = 503;
        res.end(JSON.stringify({ error: "Upload maintenance is not configured." }));
        return;
      }
      const supplied = req.headers.authorization ?? "";
      const expected = `Bearer ${secret}`;
      if (Buffer.byteLength(supplied) !== Buffer.byteLength(expected)
        || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
        res.statusCode = 401;
        res.end(JSON.stringify({ error: "Unauthorized." }));
        return;
      }
      try {
        await cleanup();
        res.statusCode = 200;
        res.end(JSON.stringify({ completed: true }));
      } catch {
        // Neither object paths, DB errors nor credentials belong in this response.
        res.statusCode = 503;
        res.end(JSON.stringify({ error: "Upload maintenance failed; retry later." }));
      }
    })();
  };
}
