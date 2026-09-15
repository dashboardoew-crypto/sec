import { createHash } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { and, eq, gt } from "drizzle-orm";
import { db, authSessionsTable, authUsersTable, type AuthUser } from "@workspace/db";

export const SESSION_COOKIE = "watchroom_session";

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      isAuthenticated(): this is Request & { user: AuthUser };
    }
  }
}

export const hashSessionToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export async function authMiddleware(req: Request, _res: Response, next: NextFunction) {
  req.isAuthenticated = function (this: Request): this is Request & { user: AuthUser } {
    return Boolean(this.user);
  };
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return next();

  try {
    const session = await db
      .select({ user: authUsersTable })
      .from(authSessionsTable)
      .innerJoin(authUsersTable, eq(authSessionsTable.userId, authUsersTable.id))
      .where(and(eq(authSessionsTable.tokenHash, hashSessionToken(token)), gt(authSessionsTable.expiresAt, new Date())))
      .limit(1);
    if (session[0]) req.user = session[0].user;
  } catch (error) {
    return next(error);
  }
  return next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated()) return res.status(401).json({ error: "Authentication required" });
  return next();
}

export const requireRole = (...roles: string[]) =>
  (req: Request, res: Response, next: NextFunction) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Authentication required" });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: "You do not have permission for this action" });
    return next();
  };