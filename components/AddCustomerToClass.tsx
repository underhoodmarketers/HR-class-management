"use client";

import { useState } from "react";
import { adminBookClass } from "@/app/actions/admin";
import { SubmitButton } from "./SubmitButton";

type Customer = {
  id: number;
  name: string;
  hasCredits: boolean;
  hasRegularCredit: boolean;
  hasMakeupCredit: boolean;
  makeupCredits: number;
  alreadyBooked: boolean;
};

export default function AddCustomerToClass({
  sessionId,
  customers,
  full,
}: {
  sessionId: number;
  customers: Customer[];
  full: boolean;
}) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);

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

  const selected = customers.find((c) => c.id === selectedId) ?? null;
  const showCreditChoice = Boolean(selected?.hasRegularCredit && selected?.hasMakeupCredit);

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
        onChange={(e) => setSelectedId(e.target.value ? Number(e.target.value) : null)}
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
              : c.hasMakeupCredit
              ? ` — ${c.makeupCredits} makeup credit${c.makeupCredits === 1 ? "" : "s"} banked`
              : ""}
          </option>
        ))}
      </select>

      {showCreditChoice ? (
        <div className="rounded-xl border border-ink/10 p-3">
          <p className="mb-2 text-xs font-medium text-ink/60">
            {selected!.name} has both a package credit and{" "}
            {selected!.makeupCredits} banked makeup credit{selected!.makeupCredits === 1 ? "" : "s"}
            . Which should this class use?
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

      <p className="text-xs text-ink/40">
        Customers with no package or no remaining credits can&apos;t be booked. Booking
        someone already in this class will ask you to confirm first.
      </p>
      <SubmitButton className="w-full py-2 text-sm">Add to class</SubmitButton>
    </form>
  );
}
