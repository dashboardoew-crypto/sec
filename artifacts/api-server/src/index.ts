import fs from "node:fs";
import path from "node:path";
import { loadEnvFileSafely } from "@workspace/db";

if (!process.env.DATABASE_URL) {
  const envCandidates = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "../.env"),
    path.resolve(process.cwd(), "../../.env"),
    path.resolve(import.meta.dirname, ".env"),
    path.resolve(import.meta.dirname, "../.env"),
    path.resolve(import.meta.dirname, "../../.env"),
  ];
  for (const p of envCandidates) {
    if (fs.existsSync(p)) {
      loadEnvFileSafely(p);
      if (process.env.DATABASE_URL) break;
    }
  }
}

process.env.NODE_ENV = process.env.NODE_ENV || "development";

import app from "./app";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"] || "5000";
const port = Number(rawPort);
const host = process.env["HOST"] || "0.0.0.0";

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, host, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port, host }, `Server listening on http://${host}:${port}`);
});
