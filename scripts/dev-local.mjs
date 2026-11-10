import { execSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

// Load .env from root if present
const envPath = path.join(rootDir, ".env");
if (fs.existsSync(envPath)) {
  try {
    const raw = fs.readFileSync(envPath, "utf8");
    for (const rawLine of raw.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const match = line.match(/^([\w.-]+)\s*=\s*(.*)$/);
      if (match) {
        const key = match[1];
        let val = (match[2] ?? "").trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  } catch {}
}

const apiPort = process.env.PORT || "5000";
const isFullDev = process.argv.includes("--dev") || process.argv.includes("-d");

// Helper to kill old zombie processes holding our ports on Windows
const freePortIfOccupied = (port) => {
  if (process.platform !== "win32") return;
  try {
    const output = execSync(`netstat -ano | findstr :${port}`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const pids = new Set();
    for (const line of output.split(/\r?\n/)) {
      if (line.includes("LISTENING")) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && Number(pid) > 0 && Number(pid) !== process.pid) {
          pids.add(pid);
        }
      }
    }
    for (const pid of pids) {
      console.log(`🧹 Releasing port ${port} from old process (PID ${pid})...`);
      try {
        execSync(`taskkill /F /T /PID ${pid}`, { stdio: "ignore" });
      } catch {}
    }
  } catch {}
};

freePortIfOccupied(apiPort);
if (isFullDev) freePortIfOccupied("3000");

console.log("\n========================================================");
console.log(" 🚀 WATCHROOM SECURITY OPERATIONS ERP (LOCAL RUNNER)");
console.log("========================================================");
console.log(` 📍 Environment: ${process.env.NODE_ENV || "development"}`);
console.log(
  ` 🔌 Database:    ${process.env.DATABASE_URL ? "Configured in .env" : "⚠️  DATABASE_URL missing!"}`,
);
console.log(` 🌐 Server URL:  http://localhost:${apiPort}`);
if (isFullDev) {
  console.log(` ⚡ Vite HotDev: http://localhost:3000`);
}
console.log("========================================================\n");

// 1. Compile backend to ensure latest code is running
const apiDist = path.join(rootDir, "artifacts/api-server/dist/index.mjs");
const webDist = path.join(
  rootDir,
  "artifacts/security-operations/dist/public/index.html",
);

console.log("📦 Compiling API server...");
const buildResult = spawn("node", ["artifacts/api-server/build.mjs"], {
  cwd: rootDir,
  stdio: "inherit",
  shell: true,
});
await new Promise((resolve) => buildResult.on("close", resolve));

// 2. Start API Server
const apiProcess = spawn("node", ["artifacts/api-server/dist/index.mjs"], {
  cwd: rootDir,
  stdio: "inherit",
  shell: true,
  env: {
    ...process.env,
    PORT: apiPort,
    HOST: "0.0.0.0",
  },
});

// Locate Vite binary across workspaces
const findViteBin = () => {
  const candidates = [
    path.join(
      rootDir,
      "artifacts/security-operations/node_modules/vite/bin/vite.js",
    ),
    path.join(rootDir, "node_modules/vite/bin/vite.js"),
    path.join(
      rootDir,
      "artifacts/security-operations/node_modules/.bin/vite.cmd",
    ),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  // Search .pnpm store as fallback
  const pnpmDir = path.join(rootDir, "node_modules/.pnpm");
  if (fs.existsSync(pnpmDir)) {
    try {
      const entries = fs.readdirSync(pnpmDir);
      for (const entry of entries) {
        if (entry.startsWith("vite@")) {
          const p = path.join(pnpmDir, entry, "node_modules/vite/bin/vite.js");
          if (fs.existsSync(p)) return p;
        }
      }
    } catch {}
  }
  return null;
};

const viteBin = findViteBin();
let webProcess = null;

if (isFullDev) {
  if (viteBin) {
    webProcess = spawn(
      "node",
      [
        viteBin,
        "--config",
        "artifacts/security-operations/vite.config.ts",
        "--host",
        "0.0.0.0",
        "--port",
        "3000",
      ],
      {
        cwd: rootDir,
        stdio: "inherit",
        shell: true,
        env: {
          ...process.env,
          VITE_PORT: "3000",
        },
      },
    );
  } else {
    console.warn(
      "⚠️ Could not find Vite binary to launch frontend dev server.",
    );
  }
} else if (!fs.existsSync(webDist)) {
  console.log(
    "⚠️ Frontend dist not found. Building web app once for static serving...",
  );
  if (viteBin) {
    const buildWeb = spawn(
      "node",
      [
        viteBin,
        "build",
        "--config",
        "artifacts/security-operations/vite.config.ts",
      ],
      {
        cwd: rootDir,
        stdio: "inherit",
        shell: true,
      },
    );
    await new Promise((resolve) => buildWeb.on("close", resolve));
  }
}

const killProcessTree = (child) => {
  if (!child || !child.pid) return;
  if (process.platform === "win32") {
    try {
      execSync(`taskkill /F /T /PID ${child.pid}`, { stdio: "ignore" });
    } catch {}
  } else {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      try {
        child.kill("SIGTERM");
      } catch {}
    }
  }
};

const cleanExit = () => {
  console.log("\n🛑 Stopping servers...");
  killProcessTree(apiProcess);
  killProcessTree(webProcess);
  process.exit(0);
};

process.on("SIGINT", cleanExit);
process.on("SIGTERM", cleanExit);
