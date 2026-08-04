"use client";

import { useState } from "react";
import { updateLocation, deleteLocation, toggleLocation } from "@/app/actions/admin";
import { SubmitButton } from "./SubmitButton";

type Studio = {
  id: number;
  name: string;
  address: string | null;
  active: boolean;
};

export default function StudioRow({
  studio,
  futureClasses,
  pastClasses,
  futureBookings,
}: {
  studio: Studio;
  futureClasses: number;
  pastClasses: number;
  futureBookings: number;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <div className="bg-blush/20 p-4">
        <form action={updateLocation} className="space-y-3">
          <input type="hidden" name="id" value={studio.id} />
          <div>
            <label className="label">Name</label>
            <input
              name="name"
              className="input"
              defaultValue={studio.name}
              required
              autoFocus
            />
          </div>
          <div>
            <label className="label">Address</label>
            <input
              name="address"
              className="input"
              defaultValue={studio.address ?? ""}
              placeholder="Street, City, TX"
            />
          </div>
          <div className="flex gap-2">
            <SubmitButton className="btn-primary flex-1 py-2 text-sm">
              Save
            </SubmitButton>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="btn-ghost px-4 py-2 text-sm"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    );
  }

  const parts: string[] = [];
  if (futureClasses > 0) {
    parts.push(
      `${futureClasses} upcoming class${futureClasses === 1 ? "" : "es"}`
    );
  }
  if (futureBookings > 0) {
    parts.push(
      `${futureBookings} student booking${
        futureBookings === 1 ? "" : "s"
      } (credits will be refunded)`
    );
  }

  const confirmMessage =
    parts.length > 0
      ? `Delete ${studio.name}?\n\nThis will remove ${parts.join(
          " and "
        )}.\n\n${
          pastClasses > 0
            ? `Your ${pastClasses} past class${
                pastClasses === 1 ? "" : "es"
              } and their attendance records will be kept.`
            : "Nothing else will be affected."
        }\n\nThis can't be undone.`
      : `Delete ${studio.name}?\n\n${
          pastClasses > 0
            ? `Your ${pastClasses} past class${
                pastClasses === 1 ? "" : "es"
              } and their attendance records will be kept.`
            : "It has no classes scheduled."
        }\n\nThis can't be undone.`;

  return (
    <div className="flex items-center justify-between gap-3 p-4">
      <div className="min-w-0">
        <p className="font-medium">{studio.name}</p>
        <p className="truncate text-xs text-ink/50">{studio.address || "—"}</p>
        <p className="mt-0.5 text-xs text-ink/35">
          {futureClasses === 0
            ? "No upcoming classes"
            : `${futureClasses} upcoming${
                futureBookings > 0 ? ` · ${futureBookings} booked` : ""
              }`}
          {pastClasses > 0 ? ` · ${pastClasses} past` : ""}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="btn-ghost px-3 py-1.5 text-xs"
        >
          Edit
        </button>

        <form action={toggleLocation}>
          <input type="hidden" name="id" value={studio.id} />
          <button className="btn-ghost px-3 py-1.5 text-xs">
            {studio.active ? "Active" : "Inactive"}
          </button>
        </form>

        <form
          action={deleteLocation}
          onSubmit={(e) => {
            if (!confirm(confirmMessage)) e.preventDefault();
          }}
        >
          <input type="hidden" name="id" value={studio.id} />
          <button className="rounded-full px-3 py-1.5 text-xs text-red-600 hover:bg-red-50">
            Delete
          </button>
        </form>
      </div>
    </div>
  );
}
