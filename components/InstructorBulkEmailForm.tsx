"use client";

import { useState } from "react";
import { sendInstructorBulkEmail } from "@/app/actions/instructor";
import { SubmitButton } from "./SubmitButton";
import CustomerMultiSelect from "./CustomerMultiSelect";

export default function InstructorBulkEmailForm({
  customers,
}: {
  customers: { id: number; name: string; email: string }[];
}) {
  const [mode, setMode] = useState<"all" | "select">("all");
  const [selectedCount, setSelectedCount] = useState(0);
  const count = mode === "all" ? customers.length : selectedCount;

  return (
    <form
      action={sendInstructorBulkEmail}
      onSubmit={(e) => {
        if (count === 0) {
          e.preventDefault();
          return;
        }
        if (
          !confirm(
            `Send this email to ${count} customer${count === 1 ? "" : "s"}? This can't be undone.`
          )
        ) {
          e.preventDefault();
        }
      }}
      className="space-y-3"
    >
      <div>
        <label className="label">Send to</label>
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as "all" | "select")}
          className="input"
        >
          <option value="all">All customers at my studio ({customers.length})</option>
          <option value="select">Select specific customers…</option>
        </select>
      </div>

      {mode === "select" ? (
        <CustomerMultiSelect customers={customers} onSelectionChange={setSelectedCount} />
      ) : null}

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
