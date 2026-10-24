import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { pool } from "@workspace/db";

const router: IRouter = Router();

router.get("/healthz", async (_req, res) => {
  try {
    await pool.query("select 1");
  } catch {
    res.status(503).json({ error: "Service temporarily unavailable." });
    return;
  }
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

export default router;
