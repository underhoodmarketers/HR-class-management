"use client";

import { useState } from "react";
import {
  editSession,
  cancelSession,
  deleteSession,
  deleteSeries,
  adminBookClass,
} from "@/app/actions/admin";
import { SubmitButton } from "./SubmitButton";

type Session = {
  id: number;
  startsAt: Date;
  endsAt: Date;
  capacity: number;
  instructor: string | null;
  assignedInstructorId: number | null;
  canceled: boolean;
  seriesId: string | null;
  locationId: number;
};

type RosterEntry = { bookingId: number; userId: number; name: string; contact: string };
type InstructorOption = { id: number; name: string; studioNames: string };

export default function SessionRow({
  session,
  className,
  locationName,
  locations,
  instructors,
  assignedInstructorName,
  booked,
  dayLabel,
  timeLabel,
  startValue,
  seriesRemaining,
  roster,
  customers,
}: {
  session: Session;
  className: string;
  locationName: string;
  locations: { id: number; name: string }[];
  instructors: InstructorOption[];
  assignedInstructorName: string | null;
  booked: number;
  dayLabel: string;
  timeLabel: string;
  startValue: string;
  seriesRemaining: number;
  roster: RosterEntry[];
  customers: { id: number; name: string }[];
}) {
  const [editing, setEditing] = useState<null | "one" | "series" | "roster">(null);
  const bookableCustomers = customers.filter(
    (c) => !roster.some((r) => r.userId === c.id)
  );

  const durationMin = Math.round(
    (session.endsAt.getTime() - session.startsAt.getTime()) / 60000
  );

  if (editing === "roster") {
    return (
      <div className="bg-blush/20 p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs font-medium text-magenta-deep">
            Who&apos;s booked into {className} · {dayLabel} {timeLabel}
          </p>
          <button
            type="button"
            onClick={() => setEditing(null)}
            className="text-xs text-ink/40 hover:text-ink/60"
          >
            Close
          </button>
        </div>

        {roster.length > 0 ? (
          <ul className="mb-3 divide-y divide-ink/10 rounded-xl bg-white text-sm">
            {roster.map((r) => (
              <li key={r.bookingId} className="flex items-center justify-between px-3 py-2">
                <span>{r.name}</span>
                <span className="text-xs text-ink/40">{r.contact}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-3 text-sm text-ink/50">Nobody booked yet.</p>
        )}

        {booked < session.capacity && bookableCustomers.length > 0 ? (
          <form action={adminBookClass} className="flex gap-2">
            <input type="hidden" name="sessionId" value={session.id} />
            <select name="userId" className="input" required defaultValue="">
              <option value="" disabled>
                Book a customer…
              </option>
              {bookableCustomers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <SubmitButton className="btn-primary px-4 text-sm">Book</SubmitButton>
          </form>
        ) : booked >= session.capacity ? (
          <p className="text-xs text-ink/40">Class is full.</p>
        ) : null}
      </div>
    );
  }

  if (editing === "one" || editing === "series") {
    return (
      <div className="bg-blush/20 p-4">
        <p className="mb-3 text-xs font-medium text-magenta-deep">
          {editing === "series"
            ? `Editing this and ${seriesRemaining - 1} later class${
                seriesRemaining - 1 === 1 ? "" : "es"
              } in the series`
            : "Editing this class only"}
        </p>
        <form action={editSession} className="space-y-3">
          <input type="hidden" name="id" value={session.id} />
          <input type="hidden" name="scope" value={editing} />

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Studio</label>
              <select
                name="locationId"
                className="input"
                defaultValue={session.locationId}
              >
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">
                {editing === "series" ? "Time (applies to all)" : "Starts at"}
              </label>
              <input
                type="datetime-local"
                name="startsAt"
                className="input"
                defaultValue={startValue}
                required
              />
            </div>
            <div>
              <label className="label">Minutes</label>
              <input
                type="number"
                name="durationMin"
                className="input"
                defaultValue={durationMin}
                min={15}
                step={5}
              />
            </div>
            <div>
              <label className="label">Capacity</label>
              <input
                type="number"
                name="capacity"
                className="input"
                defaultValue={session.capacity}
                min={1}
              />
            </div>
          </div>

          <div>
            <label className="label">Instructor</label>
            <select
              name="instructorId"
              className="input"
              defaultValue={session.assignedInstructorId ?? ""}
            >
              <option value="">No specific instructor</option>
              {instructors.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                  {i.studioNames ? ` (${i.studioNames})` : ""}
                </option>
              ))}
            </select>
          </div>

          {editing === "series" ? (
            <p className="text-xs text-ink/50">
              Each class keeps its own date; only the time of day and details
              change.
            </p>
          ) : null}

          <div className="flex gap-2">
            <SubmitButton className="btn-primary flex-1 py-2 text-sm">
              Save
            </SubmitButton>
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="btn-ghost px-4 py-2 text-sm"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    );
  }

  const bookedNote =
    booked > 0
      ? `${booked} booked — credits will be refunded`
      : "nobody booked";

  return (
    <div className="flex items-start justify-between gap-3 p-4">
      <div className="flex min-w-0 gap-3">
        <span className="mt-0.5 h-9 w-1.5 shrink-0 rounded-full bg-magenta" />
        <div className="min-w-0">
          <p className="font-medium">
            {className}
            {session.canceled ? (
              <span className="ml-2 rounded-full bg-ink/10 px-2 py-0.5 text-xs text-ink/50">
                Canceled
              </span>
            ) : null}
            {session.seriesId ? (
              <span className="ml-2 rounded-full bg-blush px-2 py-0.5 text-xs text-magenta-deep">
                Series
              </span>
            ) : null}
          </p>
          <p className="text-xs text-ink/50">
            {locationName} · {dayLabel} {timeLabel} · {booked}/
            {session.capacity}
            {assignedInstructorName ? ` · Assigned: ${assignedInstructorName}` : ""}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
        <button
          type="button"
          onClick={() => setEditing("roster")}
          className="btn-ghost px-3 py-1.5 text-xs"
        >
          Roster
        </button>

        <button
          type="button"
          onClick={() => setEditing("one")}
          className="btn-ghost px-3 py-1.5 text-xs"
        >
          Edit
        </button>

        {session.seriesId && seriesRemaining > 1 ? (
          <button
            type="button"
            onClick={() => setEditing("series")}
            className="btn-ghost px-3 py-1.5 text-xs"
          >
            Edit series
          </button>
        ) : null}

        {!session.canceled ? (
          <form
            action={cancelSession}
            onSubmit={(e) => {
              if (
                !confirm(
                  `Cancel this class?\n\nIt stays on your records as canceled (${bookedNote}).`
                )
              )
                e.preventDefault();
            }}
          >
            <input type="hidden" name="id" value={session.id} />
            <button className="btn-ghost px-3 py-1.5 text-xs">Cancel</button>
          </form>
        ) : null}

        <form
          action={deleteSession}
          onSubmit={(e) => {
            if (
              !confirm(
                `Delete this class?\n\nIt will be removed entirely (${bookedNote}).\n\nThis can't be undone.`
              )
            )
              e.preventDefault();
          }}
        >
          <input type="hidden" name="id" value={session.id} />
          <button className="rounded-full px-3 py-1.5 text-xs text-red-600 hover:bg-red-50">
            Delete
          </button>
        </form>

        {session.seriesId && seriesRemaining > 1 ? (
          <form
            action={deleteSeries}
            onSubmit={(e) => {
              if (
                !confirm(
                  `Delete this class and all ${
                    seriesRemaining - 1
                  } later classes in the series?\n\nEarlier classes in the series are kept. Any affected credits are refunded.\n\nThis can't be undone.`
                )
              )
                e.preventDefault();
            }}
          >
            <input type="hidden" name="id" value={session.id} />
            <button className="rounded-full px-3 py-1.5 text-xs text-red-600 hover:bg-red-50">
              Delete series
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
