import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getFilteredCustomers } from "@/lib/customerDirectory";
import { toCsv } from "@/lib/csv";
import { formatDay } from "@/lib/utils";

const COLUMNS = [
  "Name",
  "Email",
  "Phone",
  "Date of birth",
  "Preferred studios",
  "Current package",
  "Package status",
  "Start date",
  "End date",
  "Waiver signed",
  "Makeup credits",
  "Credits owed",
];

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const searchParams = Object.fromEntries(req.nextUrl.searchParams);
  const { filtered } = await getFilteredCustomers(searchParams);

  const rows = filtered.map((c) => ({
    Name: c.name,
    Email: c.email,
    Phone: c.phone ?? "",
    "Date of birth": c.dob ?? "",
    "Preferred studios": c.studioNames,
    "Current package": c.current?.package.name ?? "",
    "Package status": c.current ? (c.isActive ? "active" : c.current.status) : "",
    "Start date": c.current ? formatDay(c.current.startsAt) : "",
    "End date": c.current ? formatDay(c.current.endsAt) : "",
    "Waiver signed": c.signatures.length > 0 ? "Yes" : "No",
    "Makeup credits": c.makeupCredits,
    "Credits owed": c.creditsOwed,
  }));

  const csv = toCsv(rows, COLUMNS);
  const dateStamp = new Date().toISOString().slice(0, 10);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="customers-${dateStamp}.csv"`,
    },
  });
}
