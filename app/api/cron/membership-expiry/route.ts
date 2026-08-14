import { NextRequest, NextResponse } from "next/server";
import { and, eq, gte, isNull, lt } from "drizzle-orm";
import { db } from "@/db";
import { memberships } from "@/db/schema";
import { stripe, stripeConfigured } from "@/lib/stripe";
import { getActiveMembership } from "@/lib/queries";
import { sendMembershipReminderEmail, sendMembershipExpiredEmail } from "@/lib/email";
import { fromStudioTime, addStudioDays, studioDateKey, formatDay } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A still-auto-renewing autopay subscription isn't really "expiring" — Stripe
 * will bill it again and a new membership row will appear before this one's
 * endsAt. Only treat it as expiring once it's been canceled (whether via the
 * customer's own 4-week-notice cancellation, or from Stripe directly).
 */
async function isStillAutoRenewing(membership: {
  billingType: string;
  stripeSubscriptionId: string | null;
}): Promise<boolean> {
  if (membership.billingType !== "recurring" || !membership.stripeSubscriptionId || !stripeConfigured()) {
    return false;
  }
  try {
    const subscription = await stripe.subscriptions.retrieve(membership.stripeSubscriptionId);
    return subscription.status === "active" && !subscription.cancel_at && !subscription.cancel_at_period_end;
  } catch {
    return false;
  }
}

function dayRange(dateKey: string) {
  const start = fromStudioTime(`${dateKey}T00:00`);
  return { start, end: addStudioDays(start, 1) };
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const today = dayRange(studioDateKey(now));
  const reminderDay = dayRange(studioDateKey(addStudioDays(now, 7)));

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const portalUrl = `${baseUrl}/portal/packages`;

  let remindersSent = 0;
  let expiredSent = 0;

  const reminderCandidates = await db.query.memberships.findMany({
    where: and(
      eq(memberships.status, "active"),
      gte(memberships.endsAt, reminderDay.start),
      lt(memberships.endsAt, reminderDay.end),
      isNull(memberships.expiryReminderSentAt)
    ),
    with: { user: true, package: true },
  });
  for (const m of reminderCandidates) {
    // Skip if a later membership already supersedes this one, or it's an
    // autopay subscription that'll just renew on its own.
    const active = await getActiveMembership(m.userId);
    if (!active || active.membership.id !== m.id) continue;
    if (await isStillAutoRenewing(m)) continue;

    await sendMembershipReminderEmail(m.user.email, {
      name: m.user.name,
      packageName: m.package.name,
      endsAt: formatDay(m.endsAt),
      portalUrl,
    });
    await db
      .update(memberships)
      .set({ expiryReminderSentAt: new Date() })
      .where(eq(memberships.id, m.id));
    remindersSent++;
  }

  const expiredCandidates = await db.query.memberships.findMany({
    where: and(
      eq(memberships.status, "active"),
      gte(memberships.endsAt, today.start),
      lt(memberships.endsAt, today.end),
      isNull(memberships.expiredEmailSentAt)
    ),
    with: { user: true, package: true },
  });
  for (const m of expiredCandidates) {
    const active = await getActiveMembership(m.userId);
    if (active && active.membership.id !== m.id) continue;
    if (await isStillAutoRenewing(m)) continue;

    await sendMembershipExpiredEmail(m.user.email, {
      name: m.user.name,
      packageName: m.package.name,
      portalUrl,
    });
    await db
      .update(memberships)
      .set({ expiredEmailSentAt: new Date() })
      .where(eq(memberships.id, m.id));
    expiredSent++;
  }

  return NextResponse.json({ ok: true, remindersSent, expiredSent });
}
