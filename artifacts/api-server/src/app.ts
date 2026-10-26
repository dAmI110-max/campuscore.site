import express, { type Express, type ErrorRequestHandler } from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pinoHttp from "pino-http";
import helmet from "helmet";
import { ipKeyGenerator, rateLimit } from "express-rate-limit";
import { clerkMiddleware, getAuth } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import { CLERK_PROXY_PATH, clerkProxyMiddleware, getClerkProxyHost } from "./middlewares/clerkProxyMiddleware";
import { HttpError } from "./lib/errors";
import { ObjectNotFoundError } from "./lib/objectStorage";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: "same-site" } }));
app.use(express.json({
  limit: "128kb",
  inflate: false,
  verify(req, _res, buf) {
    if (req.url?.split("?")[0] === "/api/commerce/webhooks/paystack") {
      (req as typeof req & { rawBody?: Buffer }).rawBody = Buffer.from(buf);
    }
  },
}));
app.use(express.urlencoded({ extended: false, limit: "128kb", inflate: false, parameterLimit: 50 }));
app.use(clerkMiddleware((req) => ({
  publishableKey: publishableKeyFromHost(getClerkProxyHost(req) ?? "", process.env.CLERK_PUBLISHABLE_KEY),
})));
app.use("/api", rateLimit({ windowMs: 60_000, limit: 240,
  keyGenerator: req => getAuth(req).userId ? `user:${getAuth(req).userId}` : ipKeyGenerator(req.ip ?? "unknown"),
  standardHeaders: "draft-8", legacyHeaders: false }));
app.use("/api", (req, res, next) => {
  res.set("Cache-Control", "no-store");
  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    const origin = req.get("origin");
    if (origin) {
      let hostname: string;
      try { hostname = new URL(origin).hostname; } catch { res.status(403).json({ error: "Invalid request origin." }); return; }
      const host = getClerkProxyHost(req);
      if (!host || hostname !== host.split(":")[0]) { res.status(403).json({ error: "Cross-origin requests are not allowed." }); return; }
    }
  }
  next();
});

app.use("/api", router);
app.use("/api", (_req, res) => { res.status(404).json({ error: "Endpoint not found." }); });

const webRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../campus-core/dist/public",
);
const webIndex = path.join(webRoot, "index.html");

// Vercel serves the Vite output from its CDN, not from the API function.
if (process.env.VERCEL !== "1" && process.env.NODE_ENV === "production" && !existsSync(webIndex)) {
  throw new Error("Campus Core web build is missing. Run the repository Railway build before starting the API.");
}

if (process.env.VERCEL !== "1" && existsSync(webIndex)) {
  app.use(express.static(webRoot, { index: false }));
  app.get(/^(?!\/api(?:\/|$)).*/, (req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      next();
      return;
    }
    res.sendFile(webIndex, (err) => {
      if (err) next(err);
    });
  });
}

const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof HttpError) { res.status(err.status).json({ error: err.message }); return; }
  if (err instanceof ObjectNotFoundError) { res.status(404).json({ error: "Uploaded file not found. Try uploading again." }); return; }
  if (err?.name === "ZodError") { res.status(400).json({ error: "Please check your form fields.", fields: err.issues?.map((i: { path: unknown[]; message: string }) => ({ field: i.path.join("."), message: i.message })) }); return; }
  const code = err?.code ?? err?.cause?.code;
  if (code === "23505") { res.status(409).json({ error: "That username or record is already in use. Please choose another." }); return; }
  if (code === "23503" || code === "23514") { res.status(400).json({ error: "The selected record or value is invalid. Refresh and try again." }); return; }
  if (err?.type === "entity.too.large") { res.status(413).json({ error: "Request too large." }); return; }
  if (err?.type === "encoding.unsupported") { res.status(415).json({ error: "Compressed request bodies are not supported." }); return; }
  if (err?.type === "entity.parse.failed") { res.status(400).json({ error: "Invalid JSON request body." }); return; }
  if (/^\/api\/(conversations|safety|notifications|admin\/user-reports)(\/|$)/.test(req.path)) {
    // Drizzle errors may contain query parameters: never log chat/report contents.
    req.log.error({ code: typeof code === "string" ? code : "UNKNOWN" }, "Private request failed");
  } else req.log.error({ err }, "Request failed");
  res.status(500).json({ error: "Something went wrong. Your request could not be completed. Please try again." });
};
app.use(errorHandler);

export default app;
