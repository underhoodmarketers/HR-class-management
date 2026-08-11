"use client";

import { instructorBookClass } from "@/app/actions/instructor";
import { SubmitButton } from "./SubmitButton";

export default function InstructorBookForm({
  sessionId,
  bookableCustomers,
  full,
}: {
  sessionId: number;
  bookableCustomers: { id: number; name: string; hasCredits: boolean }[];
  full: boolean;
}) {
  if (full) {
    return <p className="mt-3 border-t border-ink/5 pt-3 text-xs text-ink/40">Class is full.</p>;
  }
  if (bookableCustomers.length === 0) return null;

  return (
    <div className="mt-3 border-t border-ink/5 pt-3">
      <form action={instructorBookClass} className="flex gap-2">
        <input type="hidden" name="sessionId" value={sessionId} />
        <select name="userId" className="input" required defaultValue="">
          <option value="" disabled>
            Book a customer…
          </option>
          {bookableCustomers.map((c) => (
            <option key={c.id} value={c.id} disabled={!c.hasCredits}>
              {c.name}
              {c.hasCredits ? "" : " — no credits, can't book"}
            </option>
          ))}
        </select>
        <SubmitButton className="px-4 text-sm">Book</SubmitButton>
      </form>
      <p className="mt-1.5 text-xs text-ink/40">
        Customers with no package or no remaining credits can&apos;t be booked.
      </p>
    </div>
  );
}
