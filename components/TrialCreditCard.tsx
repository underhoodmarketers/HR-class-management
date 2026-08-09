import { issueTrialCreditCode } from "@/app/actions/admin";
import { SubmitButton } from "./SubmitButton";
import { formatDay } from "@/lib/utils";

export default function TrialCreditCard({
  customerId,
  membershipId,
  code,
  trialClassAt,
}: {
  customerId: number;
  membershipId: number;
  code: string | null;
  trialClassAt: Date | null;
}) {
  return (
    <div className="card p-6">
      <h2 className="mb-3 text-sm font-700 uppercase tracking-wide text-ink/50">Trial credit</h2>
      {code ? (
        <p className="text-sm text-ink/70">
          Code <span className="font-mono font-600 text-magenta-deep">{code}</span> — $20 off their
          next purchase. Share this with the customer.
        </p>
      ) : (
        <form action={issueTrialCreditCode} className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-ink/60">
            Trial class was {trialClassAt ? formatDay(trialClassAt) : "recent"}. Give them a $20-off
            code toward a real package instead of a refund.
          </p>
          <input type="hidden" name="customerId" value={customerId} />
          <input type="hidden" name="membershipId" value={membershipId} />
          <SubmitButton className="btn-subtle whitespace-nowrap" pendingText="Generating…">
            Give $20 code
          </SubmitButton>
        </form>
      )}
    </div>
  );
}
