"use client";

import { useState } from "react";
import { SubmitButton } from "./SubmitButton";

export default function EmailCustomerButton({
  customerId,
  customerName,
  action,
  redirectQuery,
}: {
  customerId: number;
  customerName: string;
  action: (formData: FormData) => void | Promise<void>;
  redirectQuery?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full p-1.5 text-ink/40 hover:bg-blush hover:text-magenta-deep"
        aria-label={`Email ${customerName}`}
        title={`Email ${customerName}`}
      >
        ✉
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-5 shadow-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="font-600">Email {customerName}</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full px-2 py-1 text-sm text-ink/40 hover:bg-ink/5"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <form action={action} className="space-y-3">
              <input type="hidden" name="customerId" value={customerId} />
              {redirectQuery ? <input type="hidden" name="redirectQuery" value={redirectQuery} /> : null}
              <div>
                <label className="label">Subject</label>
                <input name="subject" required className="input" />
              </div>
              <div>
                <label className="label">Message</label>
                <textarea name="body" rows={5} required className="input" />
              </div>
              <SubmitButton className="w-full" pendingText="Sending…">
                Send
              </SubmitButton>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
