import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { pool } from "@workspace/db";

const router: IRouter = Router();

router.get("/healthz", async (req, res) => {
  try {
    await pool.query("select 1");
  } catch (error) {
    const code = (error as { code?: string }).code;
    // Never include connection strings, hosts, credentials or SQL parameters.
    req.log?.error({ code: typeof code === "string" ? code : "DATABASE_UNAVAILABLE" }, "Database readiness check failed");
    res.status(503).json({ error: "Service temporarily unavailable." });
    return;
  }
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

export default router;
