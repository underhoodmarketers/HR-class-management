"use client";

import { useFormState } from "react-dom";
import { requestPasswordResetAction } from "@/app/actions/auth";
import { SubmitButton } from "./SubmitButton";

export function ForgotPasswordForm() {
  const [state, action] = useFormState(
    requestPasswordResetAction,
    null as { error?: string; success?: boolean } | null
  );

  if (state?.success) {
    return (
      <p className="rounded-lg bg-magenta/10 px-3 py-3 text-sm text-magenta-deep">
        If an account exists for that email, we&apos;ve sent a link to reset your password.
        It expires in 1 hour.
      </p>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required className="input" />
      </div>
      {state?.error ? (
        <p className="rounded-lg bg-magenta/10 px-3 py-2 text-sm text-magenta-deep">{state.error}</p>
      ) : null}
      <SubmitButton className="w-full" pendingText="Sending…">
        Send reset link
      </SubmitButton>
    </form>
  );
}
