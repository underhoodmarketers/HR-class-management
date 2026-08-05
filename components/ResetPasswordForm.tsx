"use client";

import { useFormState } from "react-dom";
import { resetPasswordAction } from "@/app/actions/auth";
import { SubmitButton } from "./SubmitButton";

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action] = useFormState(
    resetPasswordAction,
    null as { error?: string } | null
  );

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <div>
        <label className="label" htmlFor="password">New password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          className="input"
        />
      </div>
      <div>
        <label className="label" htmlFor="confirmPassword">Confirm new password</label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          className="input"
        />
      </div>
      {state?.error ? (
        <p className="rounded-lg bg-magenta/10 px-3 py-2 text-sm text-magenta-deep">{state.error}</p>
      ) : null}
      <SubmitButton className="w-full" pendingText="Saving…">
        Set new password
      </SubmitButton>
    </form>
  );
}
