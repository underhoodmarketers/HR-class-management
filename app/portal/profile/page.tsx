import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { locations, users } from "@/db/schema";
import { requireUser } from "@/lib/guards";
import { formatDay, studioDateKey } from "@/lib/utils";
import EditProfileCard from "@/components/EditProfileCard";
import ChangePasswordCard from "@/components/ChangePasswordCard";

export const dynamic = "force-dynamic";

const errorMessages: Record<string, string> = {
  invalid: "Fill in name, email, phone, date of birth, and preferred studio.",
  exists: "Another account already uses that email.",
};

const pwErrorMessages: Record<string, string> = {
  current: "Your current password is incorrect.",
  weak: "New password must be at least 8 characters.",
  confirm: "New password and confirmation don't match.",
};

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: { updated?: string; error?: string; pwerror?: string; pwupdated?: string };
}) {
  const session = await requireUser();

  const [profile, studios] = await Promise.all([
    db.query.users.findFirst({ where: eq(users.id, session.userId) }),
    db
      .select()
      .from(locations)
      .where(and(eq(locations.active, true), isNull(locations.archivedAt))),
  ]);
  if (!profile) return null;

  const banner =
    searchParams.error && errorMessages[searchParams.error]
      ? { tone: "error" as const, text: errorMessages[searchParams.error] }
      : searchParams.updated
      ? { tone: "ok" as const, text: "Profile updated." }
      : null;

  const pwBanner =
    searchParams.pwerror && pwErrorMessages[searchParams.pwerror]
      ? { tone: "error" as const, text: pwErrorMessages[searchParams.pwerror] }
      : searchParams.pwupdated
      ? { tone: "ok" as const, text: "Password updated." }
      : null;

  const isBirthday = profile.dob ? isBirthdayToday(profile.dob) : false;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-600">Profile</h1>
        <p className="text-sm text-ink/50">Member since {formatDay(profile.createdAt)}</p>
      </div>

      {isBirthday ? (
        <div className="rounded-2xl border border-magenta/20 bg-gradient-to-r from-blush to-cream p-5 text-center">
          <p className="font-display text-xl font-600 text-magenta-deep">
            🎉 Happy Birthday, {profile.name.split(" ")[0]}! 🎉
          </p>
          <p className="mt-1 text-sm text-ink/60">Wishing you a wonderful day from all of us.</p>
        </div>
      ) : null}

      {banner ? (
        <div
          className={
            banner.tone === "error"
              ? "rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
              : "rounded-2xl border border-magenta/20 bg-blush/40 p-4 text-sm text-magenta-deep"
          }
        >
          {banner.text}
        </div>
      ) : null}

      {pwBanner ? (
        <div
          className={
            pwBanner.tone === "error"
              ? "rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
              : "rounded-2xl border border-magenta/20 bg-blush/40 p-4 text-sm text-magenta-deep"
          }
        >
          {pwBanner.text}
        </div>
      ) : null}

      <EditProfileCard
        profile={{
          name: profile.name,
          email: profile.email,
          phone: profile.phone,
          dob: profile.dob,
          instagram: profile.instagram,
          locationId: profile.locationId,
        }}
        studios={studios}
      />

      <ChangePasswordCard redirectTo="/portal/profile" />
    </div>
  );
}

/** True if a "yyyy-mm-dd" dob's month+day match today, in studio time. */
function isBirthdayToday(dob: string) {
  const [, m, d] = dob.split("-").map(Number);
  const today = studioDateKey(new Date());
  const [, tm, td] = today.split("-").map(Number);
  return m === tm && d === td;
}
