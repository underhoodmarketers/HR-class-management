"use client";

import { useState } from "react";
import { requestZellePayment } from "@/app/actions/zelle";
import { SubmitButton } from "./SubmitButton";
import { formatMoney } from "@/lib/utils";

export default function ZelleButton({
  packageId,
  priceCents,
  recipient,
  instructions,
  className,
}: {
  packageId: number;
  priceCents: number;
  recipient: string | null;
  instructions: string | null;
  className: string;
}) {
  const [open, setOpen] = useState(false);

  if (!recipient) return null;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        Pay via Zelle
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-card">
            <div className="mb-3 flex items-center justify-between">
              <p className="font-600">Pay via Zelle</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full px-2 py-1 text-sm text-ink/40 hover:bg-ink/5"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="mb-4 rounded-xl bg-blush/40 p-4 text-sm">
              <p>
                Send <span className="font-700">{formatMoney(priceCents)}</span> via Zelle to:
              </p>
              <p className="mt-1 font-600 text-magenta-deep">{recipient}</p>
              {instructions ? <p className="mt-2 text-ink/60">{instructions}</p> : null}
            </div>

            <form action={requestZellePayment} className="space-y-3">
              <input type="hidden" name="packageId" value={packageId} />
              <div>
                <label className="label">
                  Zelle confirmation number{" "}
                  <span className="font-400 text-ink/40">(if you have it)</span>
                </label>
                <input
                  name="confirmationNumber"
                  className="input"
                  placeholder="e.g. 30284130028"
                />
              </div>
              <p className="text-xs text-ink/40">
                We&apos;ll verify this against our bank activity and activate your membership
                once confirmed.
              </p>
              <SubmitButton className="btn-primary w-full">Submit for review</SubmitButton>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
