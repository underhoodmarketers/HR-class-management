import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { waiverSignatures, waiverTemplate } from "@/db/schema";
import { requireUser } from "@/lib/guards";
import { logoutAction } from "@/app/actions/auth";
import MobileNav from "@/components/MobileNav";
import WaiverGateModal from "@/components/WaiverGateModal";

export const dynamic = "force-dynamic";

const nav = [
  { href: "/portal", label: "Home" },
  { href: "/portal/schedule", label: "Schedule" },
  { href: "/portal/packages", label: "Packages" },
  { href: "/portal/bookings", label: "My classes" },
  { href: "/portal/leaderboard", label: "Leaderboard" },
  { href: "/portal/profile", label: "Profile" },
];

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireUser();

  // Waiver is a customer-only requirement (not applicable to staff who
  // happen to browse into /portal). Missing entirely, or signed against an
  // older template version than what's current, both count as "not signed."
  let waiverGate: { title: string; body: string } | null = null;
  if (session.role === "customer") {
    const [latestSignature, template] = await Promise.all([
      db.query.waiverSignatures.findFirst({
        where: eq(waiverSignatures.userId, session.userId),
        orderBy: [desc(waiverSignatures.version)],
      }),
      db.query.waiverTemplate.findFirst({ orderBy: [desc(waiverTemplate.version)] }),
    ]);
    const needsWaiver = !latestSignature || (template ? latestSignature.version < template.version : false);
    if (needsWaiver) {
      waiverGate = {
        title: template?.title ?? "Liability Waiver",
        body:
          template?.body ??
          "By joining Holistic Rhythm you acknowledge the physical nature of dance fitness and participate at your own risk.",
      };
    }
  }

  return (
    <div className="min-h-screen bg-cream">
      <header className="sticky top-0 z-20 border-b border-ink/5 bg-white/90 backdrop-blur">
        <div className="relative mx-auto flex max-w-4xl items-center justify-between px-5 py-3">
          <div className="flex items-center gap-2">
            <MobileNav items={nav}>
              <form action={logoutAction}>
                <button className="block w-full rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-magenta hover:bg-blush">
                  Sign out
                </button>
              </form>
            </MobileNav>
            <Link href="/portal" className="font-display text-lg font-600">
              Holistic <span className="text-magenta">Rhythm</span>
            </Link>
          </div>
          <nav className="hidden items-center gap-1 lg:flex">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-full px-3 py-1.5 text-sm font-medium text-ink/60 hover:bg-blush hover:text-magenta-deep"
              >
                {item.label}
              </Link>
            ))}
            <form action={logoutAction} className="ml-1">
              <button className="rounded-full px-3 py-1.5 text-sm font-semibold text-magenta">
                Sign out
              </button>
            </form>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-5 py-8">
        <p className="mb-6 text-sm text-ink/40">Hi, {session.name.split(" ")[0]} 👋</p>
        {children}
      </main>
      {waiverGate ? <WaiverGateModal waiverTitle={waiverGate.title} waiverBody={waiverGate.body} /> : null}
    </div>
  );
}
