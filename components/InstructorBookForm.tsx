"use client";

import { useState } from "react";
import { instructorBookClass } from "@/app/actions/instructor";
import { SubmitButton } from "./SubmitButton";

type Customer = {
  id: number;
  name: string;
  hasCredits: boolean;
  hasRegularCredit: boolean;
  hasMakeupCredit: boolean;
  makeupCredits: number;
};

export default function InstructorBookForm({
  sessionId,
  bookableCustomers,
  full,
}: {
  sessionId: number;
  bookableCustomers: Customer[];
  full: boolean;
}) {
  const [selectedId, setSelectedId] = useState<number | null>(null);

  if (full) {
    return <p className="mt-3 border-t border-ink/5 pt-3 text-xs text-ink/40">Class is full.</p>;
  }
  if (bookableCustomers.length === 0) return null;

  const selected = bookableCustomers.find((c) => c.id === selectedId) ?? null;
  const showCreditChoice = Boolean(selected?.hasRegularCredit && selected?.hasMakeupCredit);

  return (
    <div className="mt-3 border-t border-ink/5 pt-3">
      <form action={instructorBookClass} className="space-y-2">
        <input type="hidden" name="sessionId" value={sessionId} />
        <div className="flex gap-2">
          <select
            name="userId"
            className="input"
            required
            defaultValue=""
            onChange={(e) => setSelectedId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="" disabled>
              Book a customer…
            </option>
            {bookableCustomers.map((c) => (
              <option key={c.id} value={c.id} disabled={!c.hasCredits}>
                {c.name}
                {!c.hasCredits
                  ? " — no credits, can't book"
                  : c.hasMakeupCredit
                  ? ` — ${c.makeupCredits} makeup credit${c.makeupCredits === 1 ? "" : "s"} banked`
                  : ""}
              </option>
            ))}
          </select>
          <SubmitButton className="px-4 text-sm">Book</SubmitButton>
        </div>

        {showCreditChoice ? (
          <div className="rounded-xl border border-ink/10 p-3">
            <p className="mb-2 text-xs font-medium text-ink/60">
              {selected!.name} has both a package credit and {selected!.makeupCredits} banked
              makeup credit{selected!.makeupCredits === 1 ? "" : "s"}. Which should this class use?
            </p>
            <div className="flex flex-col gap-1.5 text-sm">
              <label className="flex items-center gap-2">
                <input type="radio" name="creditSource" value="regular" defaultChecked />
                Regular package credit
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="creditSource" value="makeup" />
                Makeup credit
              </label>
            </div>
          </div>
        ) : null}
      </form>
      <p className="mt-1.5 text-xs text-ink/40">
        Customers with no package or no remaining credits can&apos;t be booked.
      </p>
    </div>
  );
}
