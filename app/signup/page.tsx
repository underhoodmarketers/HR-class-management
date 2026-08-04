import Link from "next/link";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { locations, waiverTemplate } from "@/db/schema";
import { SignupForm } from "@/components/SignupForm";

export const dynamic = "force-dynamic";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: { next?: string };
}) {
  const [waiver, studios] = await Promise.all([
    db.query.waiverTemplate.findFirst({ orderBy: [desc(waiverTemplate.version)] }),
    db
      .select()
      .from(locations)
      .where(and(eq(locations.active, true), isNull(locations.archivedAt))),
  ]);

  return (
    <main className="grid min-h-screen place-items-center bg-cream px-6 py-12">
      <div className="w-full max-w-lg">
        <Link href="/" className="mb-8 block text-center font-display text-2xl font-600">
          Holistic <span className="text-magenta">Rhythm</span>
        </Link>
        <div className="card p-7">
          <h1 className="mb-1 text-lg font-700">Create your profile</h1>
          <p className="mb-6 text-sm text-ink/50">
            One profile unlocks classes at every studio. You&apos;ll sign our liability
            waiver as part of joining.
          </p>
          <SignupForm
            waiverTitle={waiver?.title ?? "Liability Waiver"}
            waiverBody={
              waiver?.body ??
              "By joining Holistic Rhythm you acknowledge the physical nature of dance fitness and participate at your own risk."
            }
            studios={studios}
            next={searchParams.next}
          />
        </div>
        <p className="mt-6 text-center text-sm text-ink/60">
          Already a member?{" "}
          <Link
            href={
              searchParams.next
                ? `/login?next=${encodeURIComponent(searchParams.next)}`
                : "/login"
            }
            className="font-semibold text-magenta"
          >
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
