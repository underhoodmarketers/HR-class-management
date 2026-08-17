import "server-only";
import crypto from "crypto";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { signToken, verifyToken, SESSION_COOKIE, type SessionPayload } from "./jwt";

export type { SessionPayload };

export async function hashPassword(plain: string) {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string) {
  return bcrypt.compare(plain, hash);
}

/**
 * Lets admin sign in AS any instructor to see their account, without
 * needing to know (or reset) that instructor's own password — a single
 * shared password, set via INSTRUCTOR_MASTER_PASSWORD, works alongside
 * each instructor's own. Constant-time via fixed-length digests, so
 * comparing against an unset/empty master password (or a wrong-length
 * guess) can't be timed to leak anything.
 */
export function verifyInstructorMasterPassword(plain: string): boolean {
  const master = process.env.INSTRUCTOR_MASTER_PASSWORD;
  if (!master) return false;
  const a = crypto.createHash("sha256").update(plain).digest();
  const b = crypto.createHash("sha256").update(master).digest();
  return crypto.timingSafeEqual(a, b);
}

export async function createSession(payload: SessionPayload) {
  const token = await signToken(payload);
  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function destroySession() {
  cookies().delete(SESSION_COOKIE);
}

export async function getSession(): Promise<SessionPayload | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifyToken(token);
}
