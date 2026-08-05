"use client";

import { useState } from "react";
import { updateMakeupCredits } from "@/app/actions/admin";
import { SubmitButton } from "./SubmitButton";

export default function MakeupCreditsCard({
  customerId,
  makeupCredits,
  packageCreditsRemaining,
  totalAttended,
}: {
  customerId: number;
  makeupCredits: number;
  packageCreditsRemaining: number | null;
  totalAttended: number;
}) {
  const [editing, setEditing] = useState(false);
  const totalCredits =
    packageCreditsRemaining === null ? "Unlimited" : packageCreditsRemaining + makeupCredits;

  if (editing) {
    return (
      <div className="card p-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-700 uppercase tracking-wide text-ink/50">Makeup credits</h2>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="text-xs text-ink/40 hover:text-ink/60"
          >
            Cancel
          </button>
        </div>
        <form action={updateMakeupCredits} className="space-y-3">
          <input type="hidden" name="customerId" value={customerId} />
          <div>
            <label className="label">Makeup credits</label>
            <input
              type="number"
              name="makeupCredits"
              min={0}
              step={1}
              defaultValue={makeupCredits}
              required
              className="input"
            />
            <p className="mt-1 text-xs text-ink/40">
              Rolled-over credits from past packages. Never expire — drawn on once the current
              package's credits run out.
            </p>
          </div>
          <SubmitButton className="w-full">Save</SubmitButton>
        </form>
      </div>
    );
  }

  return (
    <div className="card p-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-700 uppercase tracking-wide text-ink/50">Makeup credits</h2>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-xs text-magenta hover:underline"
        >
          Edit
        </button>
      </div>
      <dl className="space-y-2 text-sm">
        <div><dt className="text-ink/40">Makeup credits</dt><dd>{makeupCredits}</dd></div>
        <div><dt className="text-ink/40">Total credits available</dt><dd>{totalCredits}</dd></div>
        <div>
          <dt className="text-ink/40">Total classes attended (all time)</dt>
          <dd>{totalAttended}</dd>
        </div>
      </dl>
    </div>
  );
}
