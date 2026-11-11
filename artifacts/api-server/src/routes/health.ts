import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { pool } from "@workspace/db";

const router: IRouter = Router();

router.get("/healthz", async (req, res) => {
  try {
    await pool.query("select 1");
  } catch (error) {
    const err = error as { code?: string; message?: string };
    const code = typeof err.code === "string" ? err.code : "DATABASE_UNAVAILABLE";
    // Safe, non-secret hints only (never host, user, password, or full message with URIs).
    const hint =
      code === "28P01" || code === "28000"
        ? "auth_failed"
        : code === "ENOTFOUND" || code === "EAI_AGAIN"
          ? "host_not_found"
          : code === "ETIMEDOUT" || code === "ECONNREFUSED"
            ? "network"
            : code === "SELF_SIGNED_CERT_IN_CHAIN" || code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE"
              ? "tls"
              : code === "XX000" || code === "57P03"
                ? "server_unavailable"
                : "query_failed";
    req.log?.error({ code, hint }, "Database readiness check failed");
    res.status(503).json({
      error: "Service temporarily unavailable.",
      code,
      hint,
    });
    return;
  }
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

export default router;
