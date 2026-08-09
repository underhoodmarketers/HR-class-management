"use client";

import { useState } from "react";
import { updateCustomerNotes } from "@/app/actions/admin";
import { SubmitButton } from "./SubmitButton";

export default function NotesCard({
  customerId,
  notes,
}: {
  customerId: number;
  notes: string | null;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <div className="card p-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-700 uppercase tracking-wide text-ink/50">Notes</h2>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="text-xs text-ink/40 hover:text-ink/60"
          >
            Cancel
          </button>
        </div>
        <form action={updateCustomerNotes} className="space-y-3">
          <input type="hidden" name="id" value={customerId} />
          <textarea
            name="notes"
            defaultValue={notes ?? ""}
            rows={5}
            placeholder="Anything worth remembering about this customer…"
            className="input"
          />
          <SubmitButton className="w-full">Save</SubmitButton>
        </form>
      </div>
    );
  }

  return (
    <div className="card p-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-700 uppercase tracking-wide text-ink/50">Notes</h2>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-xs text-magenta hover:underline"
        >
          {notes ? "Edit" : "Add"}
        </button>
      </div>
      {notes ? (
        <p className="whitespace-pre-wrap text-sm text-ink/70">{notes}</p>
      ) : (
        <p className="text-sm text-ink/40">No notes yet.</p>
      )}
    </div>
  );
}
