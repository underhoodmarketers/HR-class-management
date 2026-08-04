import "server-only";
import { redirect } from "next/navigation";
import { getSession, type SessionPayload } from "./auth";

export async function requireUser(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

export async function requireAdmin(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/portal");
  return session;
}
