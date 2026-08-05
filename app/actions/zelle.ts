"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { packages, zellePayments } from "@/db/schema";
import { requireUser } from "@/lib/guards";

export async function requestZellePayment(formData: FormData) {
  const session = await requireUser();
  const packageId = Number(formData.get("packageId"));
  const confirmationNumber = String(formData.get("confirmationNumber") || "").trim() || null;

  if (!confirmationNumber) {
    redirect("/portal/packages?error=zelle_confirmation_required");
  }

  const pkg = await db.query.packages.findFirst({
    where: eq(packages.id, packageId),
  });
  if (!pkg || !pkg.active) redirect("/portal/packages?error=unavailable");

  await db.insert(zellePayments).values({
    userId: session.userId,
    packageId: pkg.id,
    amountCents: pkg.priceCents,
    confirmationNumber,
    status: "pending",
  });

  revalidatePath("/portal/packages");
  redirect("/portal/packages?zelleRequested=1");
}
