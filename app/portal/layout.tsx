import Link from "next/link";
import { requireUser } from "@/lib/guards";
import { logoutAction } from "@/app/actions/auth";

export const dynamic = "force-dynamic";

const nav = [
  { href: "/portal", label: "Home" },
  { href: "/portal/schedule", label: "Schedule" },
  { href: "/portal/packages", label: "Packages" },
  { href: "/portal/bookings", label: "My classes" },
  { href: "/portal/profile", label: "Profile" },
];

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireUser();

  return (
    <div className="min-h-screen bg-cream">
      <header className="sticky top-0 z-20 border-b border-ink/5 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-3">
          <Link href="/portal" className="font-display text-lg font-600">
            Holistic <span className="text-magenta">Rhythm</span>
          </Link>
          <nav className="flex items-center gap-1">
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
    </div>
  );
}
