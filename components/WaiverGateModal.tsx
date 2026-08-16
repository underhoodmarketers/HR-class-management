"use client";

import { useFormState } from "react-dom";
import { signWaiverAction } from "@/app/actions/auth";
import { SubmitButton } from "./SubmitButton";

// Deliberately no close button and no backdrop-click-to-dismiss — signing
// is required before the rest of the portal is usable.
export default function WaiverGateModal({
  waiverTitle,
  waiverBody,
}: {
  waiverTitle: string;
  waiverBody: string;
}) {
  const [state, action] = useFormState(signWaiverAction, null as { error?: string } | null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-card">
        <h2 className="mb-1 text-lg font-700">One more thing before you continue</h2>
        <p className="mb-4 text-sm text-ink/50">
          Please review and sign our liability waiver to keep using your account.
        </p>
        <form action={action} className="space-y-4">
          <div className="rounded-2xl border border-magenta/15 bg-blush/40 p-4">
            <p className="mb-1 text-sm font-700 text-magenta-deep">{waiverTitle}</p>
            <div className="max-h-40 overflow-y-auto whitespace-pre-line pr-2 text-xs leading-relaxed text-ink/70">
              {waiverBody}
            </div>
            <div className="mt-3">
              <label className="label" htmlFor="signedName">Type your name to sign</label>
              <input
                id="signedName"
                name="signedName"
                placeholder="Your legal name"
                className="input"
                autoFocus
                required
              />
            </div>
            <label className="mt-3 flex items-start gap-2 text-sm text-ink/70">
              <input type="checkbox" name="agree" className="mt-0.5 h-4 w-4 accent-magenta" required />
              I have read and agree to the liability waiver above.
            </label>
          </div>

          {state?.error ? (
            <p className="rounded-lg bg-magenta/10 px-3 py-2 text-sm text-magenta-deep">{state.error}</p>
          ) : null}

          <SubmitButton className="w-full" pendingText="Signing…">
            Sign &amp; continue
          </SubmitButton>
        </form>
      </div>
    </div>
  );
}
