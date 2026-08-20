"use client";

import { useState } from "react";
import { bookClass, cancelBooking } from "@/app/actions/booking";
import { formatDay, formatTime } from "@/lib/utils";

type SessionRow = {
  id: number;
  classTypeName: string;
  classTypeColor: string;
  locationName: string;
  startsAt: Date;
  instructor: string | null;
  bookedCount: number;
  capacity: number;
  isBooked: boolean;
  bookingId: number | null;
  bookable: boolean;
};

export default function PortalScheduleList({
  sessions,
  hasRegularCredit,
  hasMakeupCredit,
  makeupCredits,
}: {
  sessions: SessionRow[];
  hasRegularCredit: boolean;
  hasMakeupCredit: boolean;
  makeupCredits: number;
}) {
  const [creditSource, setCreditSource] = useState<"regular" | "makeup">("regular");
  const showChoice = hasRegularCredit && hasMakeupCredit;

  return (
    <div className="space-y-4">
      {showChoice ? (
        <div className="card flex flex-wrap items-center gap-3 p-4">
          <p className="text-sm font-medium text-ink/60">Book classes using:</p>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setCreditSource("regular")}
              className={
                creditSource === "regular"
                  ? "rounded-full bg-magenta px-3 py-1.5 text-xs font-medium text-white"
                  : "rounded-full border border-ink/15 px-3 py-1.5 text-xs text-ink/60"
              }
            >
              Regular package credit
            </button>
            <button
              type="button"
              onClick={() => setCreditSource("makeup")}
              className={
                creditSource === "makeup"
                  ? "rounded-full bg-magenta px-3 py-1.5 text-xs font-medium text-white"
                  : "rounded-full border border-ink/15 px-3 py-1.5 text-xs text-ink/60"
              }
            >
              Makeup credit ({makeupCredits} available)
            </button>
          </div>
        </div>
      ) : null}

      {sessions.length === 0 ? (
        <div className="card p-8 text-center text-ink/50">No upcoming classes scheduled.</div>
      ) : (
        <ul className="space-y-3">
          {sessions.map((s) => {
            const full = s.bookedCount >= s.capacity;
            return (
              <li key={s.id} className="card flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <span
                    className="h-10 w-1.5 rounded-full"
                    style={{ background: s.classTypeColor }}
                  />
                  <div>
                    <p className="font-600">{s.classTypeName}</p>
                    <p className="text-sm text-ink/50">
                      {s.locationName} · {formatDay(s.startsAt)} {formatTime(s.startsAt)}
                    </p>
                    <p className="text-xs text-ink/40">
                      {s.bookedCount}/{s.capacity} booked
                      {s.instructor ? ` · ${s.instructor}` : ""}
                    </p>
                  </div>
                </div>
                {s.isBooked ? (
                  <div className="flex items-center gap-2">
                    <span className="badge bg-emerald-100 text-emerald-700">Booked</span>
                    {s.bookingId ? (
                      <form
                        action={cancelBooking}
                        onSubmit={(e) => {
                          if (!confirm(`Cancel your spot in ${s.classTypeName}?\n\nYour credit will be refunded.`)) {
                            e.preventDefault();
                          }
                        }}
                      >
                        <input type="hidden" name="bookingId" value={s.bookingId} />
                        <button className="text-xs text-red-600 hover:underline">Cancel</button>
                      </form>
                    ) : null}
                  </div>
                ) : full ? (
                  <span className="badge bg-ink/10 text-ink/50">Full</span>
                ) : (
                  <form action={bookClass}>
                    <input type="hidden" name="sessionId" value={s.id} />
                    <input
                      type="hidden"
                      name="creditSource"
                      value={showChoice ? creditSource : "auto"}
                    />
                    <button className="btn-primary px-4 py-2 text-sm" disabled={!s.bookable}>
                      Book
                    </button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
