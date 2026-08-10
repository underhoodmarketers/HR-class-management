import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireAdmin } from "@/lib/guards";
import ChangePasswordCard from "@/components/ChangePasswordCard";

export const dynamic = "force-dynamic";

const pwErrorMessages: Record<string, string> = {
  current: "Your current password is incorrect.",
  weak: "New password must be at least 8 characters.",
  confirm: "New password and confirmation don't match.",
};

export default async function AdminProfilePage({
  searchParams,
}: {
  searchParams: { pwerror?: string; pwupdated?: string };
}) {
  const session = await requireAdmin();
  const profile = await db.query.users.findFirst({ where: eq(users.id, session.userId) });
  if (!profile) return null;

  const pwBanner =
    searchParams.pwerror && pwErrorMessages[searchParams.pwerror]
      ? { tone: "error" as const, text: pwErrorMessages[searchParams.pwerror] }
      : searchParams.pwupdated
      ? { tone: "ok" as const, text: "Password updated." }
      : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-600">Profile</h1>
        <p className="text-sm text-ink/50">Your admin account.</p>
      </div>

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

      <div className="card p-6">
        <h2 className="mb-3 font-600">Account</h2>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-ink/40">Name</dt><dd>{profile.name}</dd></div>
          <div><dt className="text-ink/40">Email</dt><dd>{profile.email}</dd></div>
        </dl>
      </div>

      <ChangePasswordCard redirectTo="/admin/profile" />
    </div>
  );
}
