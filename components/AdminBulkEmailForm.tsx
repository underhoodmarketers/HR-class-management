"use client";

import { useState } from "react";
import { sendAdminBulkEmail } from "@/app/actions/admin";
import { SubmitButton } from "./SubmitButton";

export default function AdminBulkEmailForm({
  studios,
  totalCount,
}: {
  studios: { id: number; name: string; customerCount: number }[];
  totalCount: number;
}) {
  const [locationId, setLocationId] = useState("");
  const count = locationId ? studios.find((s) => s.id === Number(locationId))?.customerCount ?? 0 : totalCount;

  return (
    <form
      action={sendAdminBulkEmail}
      onSubmit={(e) => {
        if (!confirm(`Send this email to ${count} customer${count === 1 ? "" : "s"}? This can't be undone.`)) {
          e.preventDefault();
        }
      }}
      className="space-y-3"
    >
      <div>
        <label className="label">Send to</label>
        <select
          name="locationId"
          value={locationId}
          onChange={(e) => setLocationId(e.target.value)}
          className="input"
        >
          <option value="">All customers ({totalCount})</option>
          {studios.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.customerCount})
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Subject</label>
        <input name="subject" required className="input" />
      </div>
      <div>
        <label className="label">Message</label>
        <textarea name="body" rows={6} required className="input" />
      </div>
      <SubmitButton className="w-full" pendingText="Sending…">
        Send to {count} customer{count === 1 ? "" : "s"}
      </SubmitButton>
    </form>
  );
}
