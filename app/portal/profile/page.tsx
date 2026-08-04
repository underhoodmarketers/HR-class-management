import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { locations, users } from "@/db/schema";
import { requireUser } from "@/lib/guards";
import { formatDay } from "@/lib/utils";
import EditProfileCard from "@/components/EditProfileCard";

export const dynamic = "force-dynamic";

const errorMessages: Record<string, string> = {
  invalid: "Fill in name, email, phone, date of birth, and preferred studio.",
  exists: "Another account already uses that email.",
};

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: { updated?: string; error?: string };
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-600">Profile</h1>
        <p className="text-sm text-ink/50">Member since {formatDay(profile.createdAt)}</p>
      </div>

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
    </div>
  );
}
