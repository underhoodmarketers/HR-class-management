"use client";

import { useState } from "react";
import Link from "next/link";

export default function MobileNav({
  items,
  children,
}: {
  items: { href: string; label: string; newTab?: boolean }[];
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Toggle menu"
        aria-expanded={open}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-xl text-ink/70 hover:bg-blush"
      >
        {open ? "✕" : "☰"}
      </button>

      {open ? (
        <nav className="absolute inset-x-0 top-full z-30 max-h-[calc(100vh-3.5rem)] overflow-y-auto border-b border-ink/5 bg-white px-5 py-3 shadow-card">
          <ul className="flex flex-col gap-1">
            {items.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  target={item.newTab ? "_blank" : undefined}
                  onClick={() => setOpen(false)}
                  className="block rounded-xl px-3 py-2.5 text-sm font-medium text-ink/70 hover:bg-blush hover:text-magenta-deep"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
          {children ? (
            <div className="mt-2 border-t border-ink/5 pt-2">{children}</div>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
