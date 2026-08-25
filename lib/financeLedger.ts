import "server-only";
import { and, eq, inArray, lt } from "drizzle-orm";
import { db } from "@/db";
import { classSessions, locationExpenses, locationRevenueHistory, locations, memberships, zellePayments } from "@/db/schema";
import { fromStudioTime, studioDateKey, monthLabel, INSTRUCTOR_RATE_CENTS } from "./utils";

export type LedgerRow = {
  date: Date;
  type: "Revenue" | "Expense";
  description: string;
  amountCents: number; // signed: positive for revenue, negative for expense
  expenseId?: number; // present only for deletable manual expense rows
  revenueId?: number; // present only for deletable manual revenue rows
  customerId?: number; // present only for rows tied to a real customer account
  category?: string; // present only on Expense rows — the manual category, or "Instructor" for live-computed pay
};

// Some imported sheet comments have embedded newlines — collapse to a
// single line so table rows stay one line tall.
const clean = (s: string) => s.replace(/\s*\n+\s*/g, " ").trim();

// Splits a purchase's revenue evenly across a customer's studios (rounded to
// the cent, remainder distributed to the first few so the shares always sum
// back to the original total exactly).
function splitEvenly(totalCents: number, n: number): number[] {
  const base = Math.floor(totalCents / n);
  const remainder = totalCents - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < remainder ? 1 : 0));
}

/**
 * Builds each studio's full revenue/expense ledger — shared by the admin
 * finances page and its CSV export, so both always agree on what counts.
 */
export async function getLocationLedgers() {
  const now = new Date();

  const [allLocations, sessions, expenses, revenueHistory, candidateMemberships, approvedZellePayments] = await Promise.all([
    db.select().from(locations),
    db.query.classSessions.findMany({
      where: and(lt(classSessions.startsAt, now), eq(classSessions.canceled, false)),
    }),
    db.query.locationExpenses.findMany(),
    db.query.locationRevenueHistory.findMany(),
    db.query.memberships.findMany({
      where: and(lt(memberships.createdAt, now), inArray(memberships.billingType, ["one_time", "recurring", "zelle"])),
      with: {
        package: true,
        user: { columns: { name: true }, with: { locations: true } },
      },
    }),
    db.query.zellePayments.findMany({
      where: eq(zellePayments.status, "approved"),
      columns: { membershipId: true, amountCents: true },
    }),
  ]);

  // A membership only represents real, already-collected revenue if it went
  // through actual payment processing (Stripe or an approved Zelle) — an
  // admin can type "one_time"/"recurring"/"zelle" as the billing type when
  // manually backfilling a customer's pre-existing package (e.g. onboarding
  // them from paper records), which isn't a new sale. Those customers'
  // real historical payment already lives in locationRevenueHistory, so
  // counting the backfilled membership here too would double it.
  const zelleApprovedMembershipIds = new Set(
    approvedZellePayments.map((z) => z.membershipId).filter((id): id is number => id !== null)
  );
  // A Zelle payment can differ from the package's list price (a discount, a
  // partial/negotiated amount, etc.), and unlike Stripe that exact amount is
  // stored locally — use it instead of assuming list price. Stripe purchases
  // still fall back to list price, since a promo-discounted Stripe charge
  // isn't stored locally (see getAmountPaidCents).
  const zelleAmountByMembershipId = new Map(
    approvedZellePayments
      .filter((z): z is typeof z & { membershipId: number } => z.membershipId !== null)
      .map((z) => [z.membershipId, z.amountCents])
  );
  const liveMemberships = candidateMemberships.filter(
    (m) => m.stripeSessionId !== null || zelleApprovedMembershipIds.has(m.id)
  );

  const rows = allLocations
    .map((location) => {
      const ledger: LedgerRow[] = [];

      for (const r of revenueHistory.filter((r) => r.locationId === location.id)) {
        ledger.push({
          date: fromStudioTime(`${r.date}T12:00`),
          type: "Revenue",
          description: clean(
            r.customerName ? r.customerName + (r.comment ? ` (${r.comment})` : "") : r.comment || "Registration"
          ),
          amountCents: r.amountCents,
          revenueId: r.id,
        });
      }
      for (const m of liveMemberships) {
        const locIds = [...new Set(m.user.locations.map((l) => l.locationId))].sort((a, b) => a - b);
        const idx = locIds.indexOf(location.id);
        if (idx === -1) continue; // this customer's studios don't include this one

        const paidCents = m.billingType === "zelle" ? zelleAmountByMembershipId.get(m.id) ?? m.package.priceCents : m.package.priceCents;
        const shares = splitEvenly(paidCents, locIds.length);
        ledger.push({
          date: m.createdAt,
          type: "Revenue",
          description:
            locIds.length > 1
              ? `${m.user.name} — ${m.package.name} (split across ${locIds.length} studios)`
              : `${m.user.name} — ${m.package.name}`,
          amountCents: shares[idx],
          customerId: m.userId,
        });
      }
      for (const e of expenses.filter((e) => e.locationId === location.id)) {
        ledger.push({
          date: fromStudioTime(`${e.date}T12:00`),
          type: "Expense",
          description: clean(e.category + (e.comment ? ` — ${e.comment}` : "")),
          amountCents: -e.amountCents,
          expenseId: e.id,
          category: e.category,
        });
      }

      // Instructor pay, computed live from completed classes — one line per
      // month so a year of activity doesn't collapse into a single row.
      const classesByMonth = new Map<string, number>();
      for (const s of sessions.filter((s) => s.locationId === location.id)) {
        const key = studioDateKey(s.startsAt).slice(0, 7);
        classesByMonth.set(key, (classesByMonth.get(key) ?? 0) + 1);
      }
      for (const [monthKey, count] of classesByMonth) {
        ledger.push({
          date: fromStudioTime(`${monthKey}-01T12:00`),
          type: "Expense",
          description: `Instructor pay — ${monthLabel(monthKey)} (${count} class${count === 1 ? "" : "es"})`,
          amountCents: -(count * INSTRUCTOR_RATE_CENTS),
          category: "Instructor",
        });
      }

      // Drop $0 rows (trials, comps, unpaid marketplace signups) — not real
      // studio revenue for this ledger. Actual ClassPass/Wellhub earnings
      // (non-zero, imported separately from their payout reports) still show.
      const cleaned = ledger.filter((row) => row.amountCents !== 0);
      cleaned.sort((a, b) => a.date.getTime() - b.date.getTime());

      const totalRevenueCents = cleaned.filter((r) => r.type === "Revenue").reduce((sum, r) => sum + r.amountCents, 0);
      const totalExpenseCents = -cleaned.filter((r) => r.type === "Expense").reduce((sum, r) => sum + r.amountCents, 0);
      const netCents = totalRevenueCents - totalExpenseCents;

      return { location, ledger: cleaned, totalRevenueCents, totalExpenseCents, netCents };
    })
    .filter((r) => r.ledger.length > 0);

  return rows;
}
