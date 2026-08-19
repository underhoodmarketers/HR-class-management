import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getLocationLedgers } from "@/lib/financeLedger";
import { toCsv } from "@/lib/csv";
import { formatDay } from "@/lib/utils";

const COLUMNS = ["Studio", "Date", "Type", "Description", "Amount"];

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const ledgers = await getLocationLedgers();

  const rows = ledgers.flatMap((l) =>
    l.ledger.map((row) => ({
      Studio: l.location.name,
      Date: formatDay(row.date),
      Type: row.type,
      Description: row.description,
      Amount: (row.amountCents / 100).toFixed(2),
    }))
  );

  const csv = toCsv(rows, COLUMNS);
  const dateStamp = new Date().toISOString().slice(0, 10);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="finances-${dateStamp}.csv"`,
    },
  });
}
