import Link from "next/link";
import { requireAdmin } from "@/lib/guards";
import { logoutAction } from "@/app/actions/auth";

export const dynamic = "force-dynamic";

const nav = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/calendar", label: "Calendar" },
  { href: "/admin/customers", label: "Customers" },
  { href: "/admin/packages", label: "Packages" },
  { href: "/admin/promo-codes", label: "Promo codes" },
  { href: "/admin/locations", label: "Studios & classes" },
  { href: "/admin/waiver", label: "Waiver" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireAdmin();

  return (
    <div className="min-h-screen bg-cream lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="hidden flex-col border-r border-ink/5 bg-white p-5 lg:flex">
        <Link href="/admin" className="mb-8 font-display text-xl font-600">
          Holistic <span className="text-magenta">Rhythm</span>
        </Link>
        <nav className="flex flex-1 flex-col gap-1">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-xl px-3 py-2 text-sm font-medium text-ink/70 hover:bg-blush hover:text-magenta-deep"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-4 border-t border-ink/5 pt-4">
          <p className="mb-2 text-xs text-ink/40">{session.email}</p>
          <form action={logoutAction}>
            <button className="text-sm font-semibold text-magenta">Sign out</button>
          </form>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="flex items-center justify-between border-b border-ink/5 bg-white px-5 py-3 lg:hidden">
        <span className="font-display text-lg font-600">Holistic Rhythm</span>
        <form action={logoutAction}>
          <button className="text-sm font-semibold text-magenta">Sign out</button>
        </form>
      </header>

      <main className="p-6 lg:p-10">{children}</main>
    </div>
  );
}
