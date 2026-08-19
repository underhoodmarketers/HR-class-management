import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { users, waiverSignatures, waiverTemplate } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { formatDay } from "@/lib/utils";

function escapeHtml(s: string): string {
  const map: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return s.replace(/[&<>"']/g, (c) => map[c]);
}

/**
 * Downloads a customer's signed waiver as a standalone HTML file — the
 * current waiver template's text (the exact historical wording isn't kept
 * once it's edited, so this is the best available record) plus their typed
 * signature, version, and signed date.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string; signatureId: string } }
) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const customerId = Number(params.id);
  const signatureId = Number(params.signatureId);
  if (!customerId || !signatureId) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const [customer, signature, template] = await Promise.all([
    db.query.users.findFirst({ where: eq(users.id, customerId) }),
    db.query.waiverSignatures.findFirst({
      where: and(eq(waiverSignatures.id, signatureId), eq(waiverSignatures.userId, customerId)),
    }),
    db.query.waiverTemplate.findFirst({ orderBy: [desc(waiverTemplate.version)] }),
  ]);

  if (!customer || !signature) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const title = template?.title ?? "Liability Waiver";
  const body = template?.body ?? "";

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)} — ${escapeHtml(customer.name)}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; max-width: 700px; margin: 40px auto; padding: 0 20px; color: #1a1a1a; }
  h1 { font-size: 22px; margin-bottom: 4px; }
  .meta { color: #555; font-size: 14px; margin-bottom: 24px; }
  .body { white-space: pre-line; line-height: 1.6; font-size: 14px; border-top: 1px solid #ddd; padding-top: 20px; }
  .signature { margin-top: 32px; padding-top: 16px; border-top: 1px solid #ddd; font-size: 14px; }
  .signature p { margin: 4px 0; }
</style>
</head>
<body>
  <h1>Holistic Rhythm — ${escapeHtml(title)}</h1>
  <p class="meta">Customer: ${escapeHtml(customer.name)} (${escapeHtml(customer.email)})</p>
  <div class="body">${escapeHtml(body)}</div>
  <div class="signature">
    <p><strong>Signed by:</strong> ${escapeHtml(signature.signedName)}</p>
    <p><strong>Date signed:</strong> ${formatDay(signature.signedAt)}</p>
    <p><strong>Waiver version:</strong> ${signature.version}</p>
  </div>
</body>
</html>`;

  const safeName = customer.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  const filename = `waiver-${safeName}-v${signature.version}.html`;

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
