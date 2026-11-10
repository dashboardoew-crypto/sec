import fs from "node:fs";
import path from "node:path";
import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { authMiddleware } from "./middlewares/authMiddleware";
import { startDailyBackupScheduler } from "./routes/admin-data";
import { ensureBreakdownsTable } from "./routes/breakdowns";

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
app.use(cors({ credentials: true, origin: true }));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(authMiddleware);

app.use("/api", router);
startDailyBackupScheduler();
void ensureBreakdownsTable();

// API 404 handler - ensures API routes never return HTML
app.use("/api", (req, res) => {
  res.status(404).json({ error: `API route not found: ${req.method} ${req.originalUrl}` });
});

// API Error handler - ensures unhandled errors return JSON
app.use("/api", (err: any, _req: any, res: any, _next: any) => {
  console.error("API Error:", err);
  const status = typeof err?.status === "number" ? err.status : 500;
  res.status(status).json({ error: err?.message || "Internal server error" });
});

// Serve built frontend assets if present (production / Linux deployment mode / local mode)
const publicDirCandidates = [
  path.resolve(process.cwd(), "artifacts/security-operations/dist/public"),
  path.resolve(process.cwd(), "../security-operations/dist/public"),
  path.resolve(process.cwd(), "dist/public"),
  path.resolve(import.meta.dirname, "../../security-operations/dist/public"),
  path.resolve(import.meta.dirname, "../security-operations/dist/public"),
  path.resolve(import.meta.dirname, "./public"),
];

for (const dir of publicDirCandidates) {
  if (fs.existsSync(dir) && fs.existsSync(path.join(dir, "index.html"))) {
    app.use(
      express.static(dir, {
        maxAge: "1d",
        setHeaders(res, filePath) {
          if (filePath.endsWith("index.html")) {
            res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
          } else if (filePath.includes("assets")) {
            res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
          }
        },
      }),
    );
    app.use((req, res, next) => {
      if (req.method !== "GET" && req.method !== "HEAD") return next();
      if (req.path.startsWith("/api")) return next();
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.sendFile(path.join(dir, "index.html"));
    });
    break;
  }
}

export default app;
