"use client";

import { useState } from "react";
import { adminBookClass } from "@/app/actions/admin";
import { SubmitButton } from "./SubmitButton";

export default function AddCustomerToClass({
  sessionId,
  customers,
  full,
}: {
  sessionId: number;
  customers: { id: number; name: string; hasCredits: boolean; alreadyBooked: boolean }[];
  full: boolean;
}) {
  const [query, setQuery] = useState("");

  if (full) {
    return <p className="text-sm text-ink/40">Class is full.</p>;
  }
  if (customers.length === 0) {
    return <p className="text-sm text-ink/40">No customers yet.</p>;
  }

  const q = query.trim().toLowerCase();
  const filtered = q
    ? customers.filter((c) => c.name.toLowerCase().includes(q))
    : customers;

  return (
    <form
      action={adminBookClass}
      className="space-y-2"
      onSubmit={(e) => {
        const form = e.currentTarget;
        const select = form.elements.namedItem("userId") as HTMLSelectElement | null;
        const overrideInput = form.elements.namedItem("override") as HTMLInputElement | null;
        const alreadyBooked = select?.selectedOptions[0]?.dataset.alreadyBooked === "1";
        if (alreadyBooked) {
          const ok = confirm(
            "This person is already booked into this class.\n\nBook them again anyway?"
          );
          if (!ok) {
            e.preventDefault();
            return;
          }
          if (overrideInput) overrideInput.value = "true";
        }
      }}
    >
      <input type="hidden" name="sessionId" value={sessionId} />
      <input type="hidden" name="override" value="false" />
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search customers by name…"
        className="input"
      />
      <select
        name="userId"
        size={8}
        className="input h-auto"
        required
        defaultValue=""
      >
        <option value="" disabled>
          Select a customer…
        </option>
        {filtered.map((c) => (
          <option
            key={c.id}
            value={c.id}
            disabled={!c.hasCredits}
            data-already-booked={c.alreadyBooked ? "1" : "0"}
          >
            {c.name}
            {!c.hasCredits
              ? " — no credits, can't book"
              : c.alreadyBooked
              ? " — already booked"
              : ""}
          </option>
        ))}
      </select>
      <p className="text-xs text-ink/40">
        Customers with no package or no remaining credits can&apos;t be booked. Booking
        someone already in this class will ask you to confirm first.
      </p>
      <SubmitButton className="w-full py-2 text-sm">Add to class</SubmitButton>
    </form>
  );
}
