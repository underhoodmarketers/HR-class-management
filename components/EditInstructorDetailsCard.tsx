"use client";

import { useState } from "react";
import { updateInstructorProfile } from "@/app/actions/instructor";
import { formatDob } from "@/lib/utils";
import { SubmitButton } from "./SubmitButton";

export default function EditInstructorDetailsCard({
  phone,
  dob,
}: {
  phone: string | null;
  dob: string | null;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <div className="card p-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-600">Contact details</h2>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="text-xs text-ink/40 hover:text-ink/60"
          >
            Cancel
          </button>
        </div>
        <form action={updateInstructorProfile} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Phone</label>
              <input name="phone" type="tel" defaultValue={phone ?? ""} required className="input" />
            </div>
            <div>
              <label className="label">Date of birth</label>
              <input name="dob" type="date" defaultValue={dob ?? ""} required className="input" />
            </div>
          </div>
          <SubmitButton className="w-full">Save changes</SubmitButton>
        </form>
      </div>
    );
  }

  return (
    <div className="card p-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-600">Contact details</h2>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-xs text-magenta hover:underline"
        >
          Edit
        </button>
      </div>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div><dt className="text-ink/40">Phone</dt><dd>{phone || "—"}</dd></div>
        <div><dt className="text-ink/40">Date of birth</dt><dd>{formatDob(dob)}</dd></div>
      </dl>
    </div>
  );
}
