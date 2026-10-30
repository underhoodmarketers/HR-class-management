import { NextRequest, NextResponse } from "next/server";
import { and, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { memberships, users } from "@/db/schema";
import { stripe, stripeConfigured } from "@/lib/stripe";
import { getActiveMembership } from "@/lib/queries";
import { sendMembershipReminderEmail, sendMembershipExpiredEmail } from "@/lib/email";
import { fromStudioTime, addStudioDays, studioDateKey, formatDay, DROP_IN_PACKAGE_NAME } from "@/lib/utils";
import { logError } from "@/lib/logging";

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
  } catch (err) {
    // Treated as "not renewing" on failure, which lets expiry proceed — log
    // it since a transient Stripe API error here would wrongly expire a
    // membership that's actually still auto-renewing fine.
    await logError({
      source: "is_still_auto_renewing",
      message: err instanceof Error ? err.message : String(err),
      context: { stripeSubscriptionId: membership.stripeSubscriptionId },
    });
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

  // endsAt is a specific instant (typically 23:59 studio time on the
  // customer's last valid day) — gate on it having actually passed, not just
  // "falls on today's calendar date". The cron runs once a day (13:00 UTC /
  // 8am studio time); comparing against a calendar-date range instead of the
  // real instant would flip a membership to expired hours before its owner's
  // last paid day was even over, locking them out of booking early.
  const expiredCandidates = await db.query.memberships.findMany({
    where: and(
      eq(memberships.status, "active"),
      lt(memberships.endsAt, now),
      isNull(memberships.expiredEmailSentAt)
    ),
    with: { user: true, package: true },
  });
  for (const m of expiredCandidates) {
    // A still-auto-renewing subscription genuinely hasn't ended yet — Stripe's
    // own invoice.paid webhook rolls over its credits and creates the next
    // cycle's row, so skip entirely here.
    if (await isStillAutoRenewing(m)) continue;

    // Superseded (a newer membership already exists) only means "don't
    // bother emailing them" — it must NOT also skip the expire+sweep below.
    // A customer who renews before their current package runs out (the
    // common, encouraged case) would otherwise have this membership
    // permanently skipped by every future run, since a newer one will
    // always exist from here on — its leftover credits would never be
    // swept and its status would never leave "active".
    const active = await getActiveMembership(m.userId);
    const superseded = active !== null && active.membership.id !== m.id;

    if (!superseded) {
      await sendMembershipExpiredEmail(m.user.email, {
        name: m.user.name,
        packageName: m.package.name,
        portalUrl,
      });
      expiredSent++;
    }

    // Credits left unused on an expiring package become banked makeup
    // credits — mirrors rolloverUnusedCredits, which only fires at the next
    // purchase and explicitly skips whichever membership is still current at
    // that moment, so a package that ran out on its own (like this one) would
    // otherwise never get swept.
    const hasLeftoverCredits =
      m.package.name !== DROP_IN_PACKAGE_NAME && m.creditsRemaining !== null && m.creditsRemaining > 0;
    if (hasLeftoverCredits) {
      await db
        .update(users)
        .set({ makeupCredits: sql`${users.makeupCredits} + ${m.creditsRemaining}` })
        .where(eq(users.id, m.userId));
    }
    await db
      .update(memberships)
      .set({
        status: "expired",
        // Doubles as "this membership has been fully processed by the
        // cron" even when superseded skips the actual email — needed so
        // the WHERE clause above doesn't keep re-selecting it forever.
        expiredEmailSentAt: new Date(),
        ...(hasLeftoverCredits ? { creditsRemaining: 0 } : {}),
      })
      .where(eq(memberships.id, m.id));
  }

  return NextResponse.json({ ok: true, remindersSent, expiredSent });
}
