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
  customers: { id: number; name: string }[];
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
    <form action={adminBookClass} className="space-y-2">
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
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <SubmitButton className="w-full py-2 text-sm">Add to class</SubmitButton>
    </form>
  );
}
