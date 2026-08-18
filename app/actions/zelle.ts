"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { packages, zellePayments } from "@/db/schema";
import { requireUser } from "@/lib/guards";
import { studioDateKey, studioWeekday, fromStudioTime, DROP_IN_PACKAGE_NAME } from "@/lib/utils";
import { getLocationClassWeekdays } from "@/lib/queries";

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

  // A chosen studio + start date is only meaningful for a real package, not
  // a Drop-In (which starts immediately regardless).
  let locationId: number | null = null;
  let requestedStartDate: string | null = null;
  if (pkg.name !== DROP_IN_PACKAGE_NAME) {
    const rawLocationId = Number(formData.get("locationId")) || null;
    if (rawLocationId) {
      const allowedLocationIds = pkg.locations.map((l) => l.locationId);
      if (allowedLocationIds.length === 0 || allowedLocationIds.includes(rawLocationId)) {
        locationId = rawLocationId;
        const rawStartDate = String(formData.get("startDate") || "");
        if (/^\d{4}-\d{2}-\d{2}$/.test(rawStartDate)) {
          const parsed = fromStudioTime(`${rawStartDate}T00:00`);
          const weekdays = await getLocationClassWeekdays(rawLocationId);
          const isFuture = studioDateKey(parsed) >= studioDateKey(new Date());
          const matchesSchedule = weekdays.length === 0 || weekdays.includes(studioWeekday(parsed));
          if (isFuture && matchesSchedule) {
            requestedStartDate = rawStartDate;
          }
        }
      }
    }
  }

  await db.insert(zellePayments).values({
    userId: session.userId,
    packageId: pkg.id,
    amountCents: pkg.priceCents,
    confirmationNumber,
    status: "pending",
    locationId,
    requestedStartDate,
  });

  revalidatePath("/portal/packages");
  redirect("/portal/packages?zelleRequested=1");
}
