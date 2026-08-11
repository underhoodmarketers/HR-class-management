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
  customers: { id: number; name: string; hasCredits: boolean }[];
  full: boolean;
}) {
  const [query, setQuery] = useState("");

  if (full) {
    return <p className="text-sm text-ink/40">Class is full.</p>;
  }
  if (customers.length === 0) {
    return (
      <p className="text-sm text-ink/40">
        Everyone is already booked into this class.
      </p>
    );
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
        const select = e.currentTarget.elements.namedItem(
          "userId"
        ) as HTMLSelectElement | null;
        const warn = select?.selectedOptions[0]?.dataset.warn === "1";
        if (
          warn &&
          !confirm(
            "This customer doesn't have an active package or remaining credits.\n\nBook them anyway? A class will be added to what they owe, and automatically subtracted from their next package purchase."
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="sessionId" value={sessionId} />
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
          <option key={c.id} value={c.id} data-warn={c.hasCredits ? "0" : "1"}>
            {c.name}
            {c.hasCredits ? "" : " — no credits"}
          </option>
        ))}
      </select>
      <SubmitButton className="w-full py-2 text-sm">Add to class</SubmitButton>
    </form>
  );
}
