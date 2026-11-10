import fs from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

export const loadEnvFileSafely = (filePath: string) => {
  try {
    if (typeof (process as unknown as { loadEnvFile?: (f: string) => void }).loadEnvFile === 'function') {
      process.loadEnvFile(filePath);
      return;
    }
  } catch {}
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const match = line.match(/^([\w.-]+)\s*=\s*(.*)$/);
      if (match) {
        const key = match[1];
        let val = (match[2] ?? '').trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  } catch {}
};

if (!process.env.DATABASE_URL) {
  const envCandidates = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "../.env"),
    path.resolve(process.cwd(), "../../.env"),
    path.resolve(process.cwd(), "../../../.env"),
  ];
  for (const p of envCandidates) {
    if (fs.existsSync(p)) {
      loadEnvFileSafely(p);
      if (process.env.DATABASE_URL) break;
    }
  }
}

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });

export * from "./schema";
