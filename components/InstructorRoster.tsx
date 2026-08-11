"use client";

import { instructorCancelBooking } from "@/app/actions/instructor";

type RosterEntry = { id: number; name: string; contact: string };

export default function InstructorRoster({ roster }: { roster: RosterEntry[] }) {
  if (roster.length === 0) {
    return (
      <p className="mt-3 border-t border-ink/5 pt-2 text-xs text-ink/40">Nobody booked yet.</p>
    );
  }
  return (
    <ul className="mt-3 divide-y divide-ink/5 border-t border-ink/5 pt-2 text-sm">
      {roster.map((r) => (
        <li key={r.id} className="flex items-center justify-between gap-2 py-1.5">
          <span>{r.name}</span>
          <span className="flex items-center gap-2">
            <span className="text-xs text-ink/40">{r.contact}</span>
            <form
              action={instructorCancelBooking}
              onSubmit={(e) => {
                if (
                  !confirm(
                    `Cancel ${r.name}'s booking for this class?\n\nTheir credit will be refunded.`
                  )
                ) {
                  e.preventDefault();
                }
              }}
            >
              <input type="hidden" name="bookingId" value={r.id} />
              <button className="text-xs text-red-600 hover:underline">Cancel</button>
            </form>
          </span>
        </li>
      ))}
    </ul>
  );
}
