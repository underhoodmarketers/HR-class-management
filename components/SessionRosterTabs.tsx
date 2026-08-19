"use client";

import { useState } from "react";
import Link from "next/link";
import { adminCancelBooking } from "@/app/actions/admin";

type RosterEntry = {
  bookingId: number;
  userId: number;
  name: string;
  contact: string;
  packageName: string | null;
  signedUpAt: Date;
  owesCredit: boolean;
};

function formatSignedUpAt(d: Date) {
  return new Date(d).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function SessionRosterTabs({
  roster,
  cancelledRoster,
}: {
  roster: RosterEntry[];
  cancelledRoster: RosterEntry[];
}) {
  const [tab, setTab] = useState<"signups" | "cancelled">("signups");
  const [search, setSearch] = useState("");

  const list = tab === "signups" ? roster : cancelledRoster;
  const q = search.trim().toLowerCase();
  const filtered = q
    ? list.filter(
        (r) =>
          r.name.toLowerCase().includes(q) || r.contact.toLowerCase().includes(q)
      )
    : list;

  return (
    <div>
      <div className="mb-4 flex items-center gap-1 border-b border-ink/10">
        <button
          type="button"
          onClick={() => setTab("signups")}
          className={`px-4 py-2 text-sm font-medium ${
            tab === "signups"
              ? "border-b-2 border-magenta text-magenta-deep"
              : "text-ink/40"
          }`}
        >
          Signups ({roster.length})
        </button>
        <button
          type="button"
          onClick={() => setTab("cancelled")}
          className={`px-4 py-2 text-sm font-medium ${
            tab === "cancelled"
              ? "border-b-2 border-magenta text-magenta-deep"
              : "text-ink/40"
          }`}
        >
          Cancelled ({cancelledRoster.length})
        </button>
      </div>

      {list.length > 3 ? (
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search this list…"
          className="input mb-3 text-sm"
        />
      ) : null}

      {filtered.length > 0 ? (
        <ul className="divide-y divide-ink/10 rounded-xl border border-ink/10 text-sm">
          {filtered.map((r) => (
            <li key={r.bookingId} className="px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <Link href={`/admin/customers/${r.userId}`} className="font-medium hover:text-magenta-deep hover:underline">
                  {r.name}
                </Link>
                <span className="text-xs text-ink/40">
                  {formatSignedUpAt(r.signedUpAt)}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center justify-between gap-1.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-ink/40">{r.contact}</span>
                  {r.packageName ? (
                    <span className="rounded-full bg-blush px-2 py-0.5 text-[11px] text-magenta-deep">
                      {r.packageName}
                    </span>
                  ) : null}
                  {r.owesCredit ? (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] text-red-700">
                      Owes 1 credit
                    </span>
                  ) : null}
                </div>
                {tab === "signups" ? (
                  <form
                    action={adminCancelBooking}
                    onSubmit={(e) => {
                      if (
                        !confirm(
                          `Cancel ${r.name}'s booking for this class?\n\nTheir credit will be refunded.`
                        )
                      )
                        e.preventDefault();
                    }}
                  >
                    <input type="hidden" name="bookingId" value={r.bookingId} />
                    <button className="text-xs text-red-600 hover:underline">
                      Cancel booking
                    </button>
                  </form>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink/50">
          {tab === "signups" ? "Nobody booked yet." : "No cancellations."}
        </p>
      )}
    </div>
  );
}
