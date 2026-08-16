import Link from "next/link";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { dropInInvites, locations, waiverTemplate } from "@/db/schema";
import { AcceptInviteForm } from "@/components/AcceptInviteForm";

export const dynamic = "force-dynamic";

export default async function InvitePage({ params }: { params: { token: string } }) {
  const [invite, waiver, studios] = await Promise.all([
    db.query.dropInInvites.findFirst({
      where: eq(dropInInvites.token, params.token),
      with: { inviter: true },
    }),
    db.query.waiverTemplate.findFirst({ orderBy: [desc(waiverTemplate.version)] }),
    db
      .select()
      .from(locations)
      .where(and(eq(locations.active, true), isNull(locations.archivedAt))),
  ]);

  const invalid = !invite || invite.status !== "pending";

  return (
    <main className="grid min-h-screen place-items-center bg-cream px-6 py-12">
      <div className="w-full max-w-lg">
        <Link href="/" className="mb-8 block text-center font-display text-2xl font-600">
          Holistic <span className="text-magenta">Rhythm</span>
        </Link>
        <div className="card p-7">
          {invalid ? (
            <>
              <h1 className="mb-1 text-lg font-700">This invite isn&apos;t available</h1>
              <p className="text-sm text-ink/50">
                It&apos;s either already been used or the link isn&apos;t valid. If you think that&apos;s
                wrong, ask whoever sent it to check with the studio.
              </p>
            </>
          ) : (
            <>
              <h1 className="mb-1 text-lg font-700">
                {invite.inviter.name} got you a Drop-In class!
              </h1>
              <p className="mb-6 text-sm text-ink/50">
                Set up your own profile to sign our liability waiver and book your class —
                this is separate from {invite.inviter.name}&apos;s account.
              </p>
              <AcceptInviteForm
                token={invite.token}
                friendName={invite.friendName}
                friendPhone={invite.friendPhone}
                friendEmail={invite.friendEmail}
                waiverTitle={waiver?.title ?? "Liability Waiver"}
                waiverBody={
                  waiver?.body ??
                  "By joining Holistic Rhythm you acknowledge the physical nature of dance fitness and participate at your own risk."
                }
                studios={studios}
              />
            </>
          )}
        </div>
        {!invalid ? (
          <p className="mt-6 text-center text-sm text-ink/60">
            Already have an account?{" "}
            <Link href="/login" className="font-semibold text-magenta">
              Sign in
            </Link>
          </p>
        ) : null}
      </div>
    </main>
  );
}
