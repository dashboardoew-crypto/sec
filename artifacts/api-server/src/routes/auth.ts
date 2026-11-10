import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { db, authSessionsTable, authUsersTable, type AuthUser } from "@workspace/db";
import { hashSessionToken, requireRole, SESSION_COOKIE } from "../middlewares/authMiddleware";

type UserRole = "admin" | "manager" | "hr" | "security";
const USER_ROLES: UserRole[] = ["admin", "manager", "hr", "security"];
const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7;

const bootstrapUsers = [
  {
    email: "yashgr2818@gmail.com",
    displayName: "Yash",
    role: "admin" as const,
    passwordHash: "scrypt$21c609dec44ad9b4da7050a556164b05$42517737f3aeb49d8488a4f35dd39962b370e634769d7ad55aa5690860eeaa57a0810a8f5cfb9edebbdd5af17c11229db328cfefa66ca69c6670afe82eb0de6b",
  },
  {
    email: "manager@gmail.com",
    displayName: "Manager",
    role: "manager" as const,
    passwordHash: "scrypt$988f3ae3beb15ff25cda24a643ef42ca$67bfb54d16584eff4e436b2aaa3c3239caed56a696d8ff6bbc7798c498baf212c14d142b8d8b11786c3b182279986ae19c0e800b7b5ab06aac8a0ed1e9c17fd0",
  },
  {
    email: "hr@gmail.com",
    displayName: "HR",
    role: "hr" as const,
    passwordHash: "scrypt$3c124eb750c0c57595dd5218429d9332$68ce8c39d285e7753e91ea2d8fadc2b0908b89cd847195f5d080da62b58aad59cbb26e20b5f984f3f803b12634e60f1fae4b655ae09eeafabb1ef09c32a09f11",
  },
  {
    email: "security@gmail.com",
    displayName: "Security",
    role: "security" as const,
    passwordHash: "scrypt$26cba84808b990131f878cf568d0382c$d538ae9552f7ea7201489580855b9bd25f2caad4e44b1bfcd2ed49296de1f43557648e8e458d18487fc9f9b91d1f557b4ee213a6b0d73acbb65906e7d997421a",
  },
];

let seedPromise: Promise<void> | undefined;

const publicUser = (user: AuthUser) => ({
  id: user.id,
  email: user.email,
  displayName: user.displayName,
  role: user.role as UserRole,
  createdAt: user.createdAt.toISOString(),
});

const passwordHash = (password: string) => {
  const salt = randomBytes(16).toString("hex");
  return `scrypt$${salt}$${scryptSync(password, salt, 64).toString("hex")}`;
};

const verifyPassword = (password: string, stored: string) => {
  const [algorithm, salt, encodedHash] = stored.split("$");
  if (algorithm !== "scrypt" || !salt || !encodedHash) return false;
  const expected = Buffer.from(encodedHash, "hex");
  const actual = scryptSync(password, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
};

const normalizeEmail = (email: unknown) => typeof email === "string" ? email.trim().toLowerCase() : "";

async function ensureBootstrapUsers() {
  if (!seedPromise) {
    seedPromise = Promise.all(
      bootstrapUsers.map((user) =>
        db.insert(authUsersTable).values({ id: randomUUID(), ...user }).onConflictDoNothing({ target: authUsersTable.email }),
      ),
    ).then(() => undefined).catch((error) => {
      seedPromise = undefined;
      throw error;
    });
  }
  await seedPromise;
}

const router: IRouter = Router();

router.post("/auth/login", async (req: Request, res: Response) => {
  await ensureBootstrapUsers();
  const email = normalizeEmail(req.body?.email);
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!email || !password) return res.status(400).json({ error: "Enter your ID and password" });

  const rows = await db.select().from(authUsersTable).where(eq(authUsersTable.email, email)).limit(1);
  const user = rows[0];
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return res.status(401).json({ error: "Invalid ID or password" });
  }

  const token = randomBytes(32).toString("base64url");
  await db.insert(authSessionsTable).values({
    id: randomUUID(),
    userId: user.id,
    tokenHash: hashSessionToken(token),
    expiresAt: new Date(Date.now() + SESSION_MAX_AGE_MS),
  });
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_MAX_AGE_MS,
    path: "/",
  });
  return res.json({ user: publicUser(user) });
});

router.get("/auth/me", async (req: Request, res: Response) => {
  await ensureBootstrapUsers();
  if (!req.isAuthenticated()) return res.status(401).json({ error: "Authentication required" });
  return res.json({ user: publicUser(req.user) });
});

router.post("/auth/logout", async (req: Request, res: Response) => {
  const token = req.cookies?.[SESSION_COOKIE];
  if (token) await db.delete(authSessionsTable).where(eq(authSessionsTable.tokenHash, hashSessionToken(token)));
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" });
  return res.json({ success: true });
});

router.get("/auth/users", requireRole("admin"), async (_req: Request, res: Response) => {
  await ensureBootstrapUsers();
  const users = await db.select().from(authUsersTable).orderBy(authUsersTable.createdAt);
  return res.json({ users: users.map(publicUser) });
});

router.post("/auth/users", requireRole("admin"), async (req: Request, res: Response) => {
  const email = normalizeEmail(req.body?.email);
  const displayName = typeof req.body?.displayName === "string" ? req.body.displayName.trim() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  const role = req.body?.role as UserRole;
  if (!email || !displayName || password.length < 8 || !USER_ROLES.includes(role)) {
    return res.status(400).json({ error: "Enter a name, valid email, password of at least 8 characters, and role" });
  }
  const existing = await db.select({ id: authUsersTable.id }).from(authUsersTable).where(eq(authUsersTable.email, email)).limit(1);
  if (existing[0]) return res.status(409).json({ error: "That ID is already in use" });
  const [user] = await db.insert(authUsersTable).values({
    id: randomUUID(),
    email,
    displayName,
    passwordHash: passwordHash(password),
    role,
  }).returning();
  return res.status(201).json({ user: publicUser(user) });
});

router.patch("/auth/users/:id/role", requireRole("admin"), async (req: Request, res: Response) => {
  const actor = req.user;
  if (!actor) return res.status(401).json({ error: "Authentication required" });
  const role = req.body?.role as UserRole;
  if (!USER_ROLES.includes(role)) return res.status(400).json({ error: "Choose admin, manager, HR, or Security" });
  const targetId = String(req.params.id);
  if (targetId === actor.id && role !== "admin") {
    return res.status(400).json({ error: "You cannot remove your own admin access" });
  }
  if (role !== "admin") {
    const admins = await db.select({ id: authUsersTable.id }).from(authUsersTable).where(eq(authUsersTable.role, "admin"));
    if (admins.length === 1 && admins[0].id === targetId) {
      return res.status(400).json({ error: "The workspace must keep at least one admin" });
    }
  }
  const [user] = await db.update(authUsersTable).set({ role, updatedAt: new Date() }).where(eq(authUsersTable.id, targetId)).returning();
  if (!user) return res.status(404).json({ error: "User not found" });
  return res.json({ user: publicUser(user) });
});

router.patch("/auth/users/:id", requireRole("admin"), async (req: Request, res: Response) => {
  const actor = req.user;
  if (!actor) return res.status(401).json({ error: "Authentication required" });

  const targetId = String(req.params.id);
  const existing = await db.select().from(authUsersTable).where(eq(authUsersTable.id, targetId)).limit(1);
  if (!existing[0]) return res.status(404).json({ error: "User not found" });

  const input = req.body ?? {};
  const displayName = typeof input.displayName === "string" ? input.displayName.trim() : existing[0].displayName;
  const email = input.email === undefined ? existing[0].email : normalizeEmail(input.email);
  const password = input.password === undefined ? "" : typeof input.password === "string" ? input.password : "";
  const role = input.role === undefined ? existing[0].role as UserRole : input.role as UserRole;

  if (!displayName || !email || !email.includes("@") || !USER_ROLES.includes(role)) {
    return res.status(400).json({ error: "Enter a name, valid email, and role" });
  }
  if (input.password !== undefined && password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }
  if (targetId === actor.id && role !== "admin") {
    return res.status(400).json({ error: "You cannot remove your own admin access" });
  }
  if (role !== "admin") {
    const admins = await db.select({ id: authUsersTable.id }).from(authUsersTable).where(eq(authUsersTable.role, "admin"));
    if (admins.length === 1 && admins[0].id === targetId) {
      return res.status(400).json({ error: "The workspace must keep at least one admin" });
    }
  }
  const duplicate = await db.select({ id: authUsersTable.id }).from(authUsersTable)
    .where(eq(authUsersTable.email, email)).limit(1);
  if (duplicate[0] && duplicate[0].id !== targetId) {
    return res.status(409).json({ error: "That ID is already in use" });
  }

  const [user] = await db.update(authUsersTable).set({
    displayName,
    email,
    role,
    ...(input.password !== undefined ? { passwordHash: passwordHash(password) } : {}),
    updatedAt: new Date(),
  }).where(eq(authUsersTable.id, targetId)).returning();
  return res.json({ user: publicUser(user) });
});

router.delete("/auth/users/:id", requireRole("admin"), async (req: Request, res: Response) => {
  const actor = req.user;
  if (!actor) return res.status(401).json({ error: "Authentication required" });
  const targetId = String(req.params.id);
  if (targetId === actor.id) return res.status(400).json({ error: "You cannot delete your own account" });

  const target = await db.select().from(authUsersTable).where(eq(authUsersTable.id, targetId)).limit(1);
  if (!target[0]) return res.status(404).json({ error: "User not found" });
  if (target[0].role === "admin") {
    const admins = await db.select({ id: authUsersTable.id }).from(authUsersTable).where(eq(authUsersTable.role, "admin"));
    if (admins.length === 1) return res.status(400).json({ error: "The workspace must keep at least one admin" });
  }

  await db.delete(authUsersTable).where(eq(authUsersTable.id, targetId));
  return res.json({ success: true });
});

export default router;