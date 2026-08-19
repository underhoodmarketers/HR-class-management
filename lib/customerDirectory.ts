import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { locations, users } from "@/db/schema";

export type SortField = "name" | "contact" | "studio" | "membership" | "start" | "end";

export type CustomerFilters = {
  q?: string;
  studio?: string;
  membership?: string;
  waiver?: string;
  sort?: string;
  dir?: string;
};

/**
 * The customer directory's full filter/sort logic — shared by the admin
 * customers page and its CSV export, so "what you're looking at" and "what
 * you export" always stay identical.
 */
export async function getFilteredCustomers(filters: CustomerFilters) {
  const now = new Date();

  const [customers, studios] = await Promise.all([
    db.query.users.findMany({
      where: eq(users.role, "customer"),
      with: {
        memberships: {
          with: { package: true },
          orderBy: (m, { desc }) => [desc(m.createdAt)],
        },
        signatures: true,
        locations: { with: { location: true } },
      },
    }),
    db
      .select()
      .from(locations)
      .where(and(eq(locations.active, true), isNull(locations.archivedAt))),
  ]);

  const q = (filters.q ?? "").trim().toLowerCase();
  const studioFilter = filters.studio ?? "";
  const membershipFilter = filters.membership ?? "";
  const waiverFilter = filters.waiver ?? "";
  const sort: SortField = (
    ["name", "contact", "studio", "membership", "start", "end"].includes(filters.sort ?? "")
      ? filters.sort
      : "name"
  ) as SortField;
  const dir: "asc" | "desc" = filters.dir === "asc" ? "asc" : "desc";

  // The most recent membership regardless of status, so a pending or
  // expired one still shows its dates — "active" tracks whether it's
  // actually in effect right now, for the badge and the filter.
  const withCurrent = customers.map((c) => {
    const current = c.memberships[0] ?? null;
    const isActive = current?.status === "active" && current.endsAt > now;
    const studioNames = c.locations.map((l) => l.location.name).join(", ");
    return { ...c, current, isActive, studioNames };
  });

  let filtered = withCurrent.filter((c) => {
    if (q) {
      const haystack = `${c.name} ${c.email} ${c.phone ?? ""}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    if (studioFilter === "none" && c.locations.length > 0) return false;
    if (
      studioFilter &&
      studioFilter !== "none" &&
      !c.locations.some((l) => l.locationId === Number(studioFilter))
    ) {
      return false;
    }
    if (membershipFilter === "active" && !c.isActive) return false;
    if (membershipFilter === "none" && c.isActive) return false;
    if (waiverFilter === "signed" && c.signatures.length === 0) return false;
    if (waiverFilter === "missing" && c.signatures.length > 0) return false;
    return true;
  });

  const cmp: Record<SortField, (a: (typeof withCurrent)[number], b: (typeof withCurrent)[number]) => number> = {
    name: (a, b) => a.name.localeCompare(b.name),
    contact: (a, b) => a.email.localeCompare(b.email),
    studio: (a, b) => a.studioNames.localeCompare(b.studioNames),
    membership: (a, b) => (a.current?.package.name ?? "").localeCompare(b.current?.package.name ?? ""),
    start: (a, b) => (a.current?.startsAt.getTime() ?? 0) - (b.current?.startsAt.getTime() ?? 0),
    end: (a, b) => (a.current?.endsAt.getTime() ?? 0) - (b.current?.endsAt.getTime() ?? 0),
  };
  filtered = [...filtered].sort((a, b) => (dir === "asc" ? cmp[sort](a, b) : -cmp[sort](a, b)));

  return { customers, studios, filtered, sort, dir };
}
