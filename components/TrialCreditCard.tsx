"use client";

import { issueTrialCreditCode, voidAndRegenerateTrialCreditCode } from "@/app/actions/admin";
import { SubmitButton } from "./SubmitButton";
import { formatDay, formatMoney } from "@/lib/utils";

export default function TrialCreditCard({
  customerId,
  membershipId,
  code,
  amountPaidCents,
  trialClassAt,
}: {
  customerId: number;
  membershipId: number;
  code: string | null;
  amountPaidCents: number;
  trialClassAt: Date | null;
}) {
  const amount = formatMoney(amountPaidCents);
  return (
    <div className="card p-6">
      <h2 className="mb-3 text-sm font-700 uppercase tracking-wide text-ink/50">Trial credit</h2>
      {code ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-ink/70">
            Code <span className="font-mono font-600 text-magenta-deep">{code}</span> — {amount} off
            their next purchase. Share this with the customer.
          </p>
          <form
            action={voidAndRegenerateTrialCreditCode}
            onSubmit={(e) => {
              if (
                !confirm(
                  `Void ${code} and generate a new code?\n\nThe old code stops working immediately — only the new one will be usable.`
                )
              )
                e.preventDefault();
            }}
          >
            <input type="hidden" name="customerId" value={customerId} />
            <input type="hidden" name="membershipId" value={membershipId} />
            <SubmitButton className="btn-subtle whitespace-nowrap text-xs" pendingText="Regenerating…">
              Void &amp; generate new code
            </SubmitButton>
          </form>
        </div>
      ) : (
        <form action={issueTrialCreditCode} className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-ink/60">
            Trial class was {trialClassAt ? formatDay(trialClassAt) : "recent"}. Give them a{" "}
            {amount}-off code (what they paid) toward a real package instead of a refund.
          </p>
          <input type="hidden" name="customerId" value={customerId} />
          <input type="hidden" name="membershipId" value={membershipId} />
          <SubmitButton className="btn-subtle whitespace-nowrap" pendingText="Generating…">
            Give {amount} code
          </SubmitButton>
        </form>
      )}
    </div>
  );
}
