"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { packages, zellePayments } from "@/db/schema";
import { requireUser } from "@/lib/guards";
import { resolveAttendanceSlots, resolveStartDate, type AttendanceSlot } from "@/lib/queries";

export async function requestZellePayment(formData: FormData) {
  const session = await requireUser();
  const packageId = Number(formData.get("packageId"));
  const confirmationNumber = String(formData.get("confirmationNumber") || "").trim() || null;

  if (!confirmationNumber) {
    redirect("/portal/packages?error=zelle_confirmation_required");
  }

  const pkg = await db.query.packages.findFirst({
    where: eq(packages.id, packageId),
    with: { locations: true },
  });
  if (!pkg || !pkg.active) redirect("/portal/packages?error=unavailable");

  let rawSlots: AttendanceSlot[] = [];
  try {
    const raw = String(formData.get("slots") || "");
    if (raw) rawSlots = JSON.parse(raw);
  } catch {
    rawSlots = [];
  }
  const resolvedSlots = await resolveAttendanceSlots(pkg, rawSlots);
  const resolvedStartDate = resolveStartDate(resolvedSlots, String(formData.get("startDate") || ""));

  await db.insert(zellePayments).values({
    userId: session.userId,
    packageId: pkg.id,
    amountCents: pkg.priceCents,
    confirmationNumber,
    status: "pending",
    requestedSlots: resolvedSlots.length > 0 ? JSON.stringify(resolvedSlots) : null,
    requestedStartDate: resolvedStartDate,
  });

  revalidatePath("/portal/packages");
  redirect("/portal/packages?zelleRequested=1");
}
