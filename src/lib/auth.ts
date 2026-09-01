import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

import { prisma } from "@/lib/prisma";

export const SESSION_COOKIE = "live_game_session";

export class ManagementAccessError extends Error {
  constructor(message = "Enter the management password to access this area.") {
    super(message);
    this.name = "ManagementAccessError";
  }
}

function authSecret() {
  const value = process.env.AUTH_SECRET;
  if (!value && process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET is not configured.");
  return value || "local-development-only-secret";
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

export function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function ensureInitialAdmin() {
  if (await prisma.user.count()) return;
  const legacyEmail = process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase();
  const username = (process.env.INITIAL_ADMIN_USERNAME?.trim() || legacyEmail?.split("@")[0] || "").toLowerCase();
  const password = process.env.INITIAL_ADMIN_PASSWORD;
  if (!username || !password) throw new Error("Initial administrator credentials are not configured.");
  validatePassword(password);
  await prisma.user.create({
    data: {
      name: process.env.INITIAL_ADMIN_NAME?.trim() || "Team Analyst",
      username,
      passwordHash: hashPassword(password),
      mustChangePassword: true,
      role: "admin"
    }
  });
}

export type SessionPayload = {
  userId: string;
  username: string;
  role: string;
  mustChangePassword: boolean;
  needsOnboarding?: boolean;
  managementAccessVersion?: number | null;
  exp: number;
};

export function createSessionToken(payload: Omit<SessionPayload, "exp">) {
  const data = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + 1000 * 60 * 60 * 24 * 7 })).toString("base64url");
  const signature = createHmac("sha256", authSecret()).update(data).digest("base64url");
  return `${data}.${signature}`;
}

export function readSessionToken(token?: string | null): SessionPayload | null {
  if (!token) return null;
  const [data, signature] = token.split(".");
  if (!data || !signature) return null;
  const expected = createHmac("sha256", authSecret()).update(data).digest("base64url");
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, "base64url").toString()) as SessionPayload;
    return payload.exp > Date.now() ? payload : null;
  } catch {
    return null;
  }
}

export async function currentSession() {
  return readSessionToken((await cookies()).get(SESSION_COOKIE)?.value);
}

export async function requireAccount() {
  const session = await currentSession();
  if (!session) throw new Error("Invalid or expired session.");
  const user = await prisma.user.findUnique({ where: { id: session.userId }, include: { workspace: true } });
  if (!user) throw new Error("User account no longer exists.");
  return { session, user, workspace: user.workspace };
}

export async function requireWorkspace() {
  const account = await requireAccount();
  if (!account.workspace) throw new Error("Complete the team setup before continuing.");
  return { ...account, workspace: account.workspace };
}

export async function requireManagementWorkspace() {
  const account = await requireWorkspace();
  if (!account.workspace.managementPasswordHash) {
    throw new ManagementAccessError("Create the management password before accessing this area.");
  }
  if (account.session.managementAccessVersion !== account.workspace.managementPasswordVersion) {
    throw new ManagementAccessError();
  }
  return account;
}

export function validateManagementPassword(password: string) {
  if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw new Error("The password must contain at least 8 characters, one letter and one number.");
  }
}

export function validatePassword(password: string) {
  if (password.length < 10 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) {
    throw new Error("The password must contain at least 10 characters, including uppercase, lowercase and a number.");
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 7
};
