import { NextRequest, NextResponse } from "next/server";
import { lt } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, errorLogs } from "@/db/schema";
import { addStudioDays } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RETENTION_DAYS = 90; // ~3 months

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = addStudioDays(new Date(), -RETENTION_DAYS);

  const deletedAudit = await db.delete(auditLogs).where(lt(auditLogs.createdAt, cutoff)).returning({ id: auditLogs.id });
  const deletedErrors = await db.delete(errorLogs).where(lt(errorLogs.createdAt, cutoff)).returning({ id: errorLogs.id });

  return NextResponse.json({
    ok: true,
    deletedAuditLogs: deletedAudit.length,
    deletedErrorLogs: deletedErrors.length,
  });
}
