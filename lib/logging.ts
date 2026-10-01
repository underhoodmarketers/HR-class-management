import "server-only";
import { db } from "@/db";
import { auditLogs, errorLogs } from "@/db/schema";

/**
 * Records an admin action that changed real state. Swallows its own
 * failures — a logging bug must never be the thing that breaks the actual
 * request.
 */
export async function logAudit(entry: {
  actorId: number;
  actorName: string;
  action: string;
  targetType?: string;
  targetId?: number;
  details?: Record<string, unknown>;
}): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      actorId: entry.actorId,
      actorName: entry.actorName,
      action: entry.action,
      targetType: entry.targetType ?? null,
      targetId: entry.targetId ?? null,
      details: entry.details ? JSON.stringify(entry.details) : null,
    });
  } catch {
    // Never let a logging failure surface as a user-facing error.
  }
}

/**
 * Records a caught failure that would otherwise disappear silently (e.g. a
 * Stripe call inside a try/catch). Call from the catch block, not instead
 * of it — this is additive visibility, not error handling.
 */
export async function logError(entry: {
  source: string;
  message: string;
  context?: Record<string, unknown>;
}): Promise<void> {
  try {
    await db.insert(errorLogs).values({
      source: entry.source,
      message: entry.message,
      context: entry.context ? JSON.stringify(entry.context) : null,
    });
  } catch {
    // Never let a logging failure surface as a user-facing error.
  }
}
