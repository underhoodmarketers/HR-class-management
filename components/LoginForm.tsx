"use client";

import { useFormState } from "react-dom";
import { loginAction } from "@/app/actions/auth";
import { SubmitButton } from "./SubmitButton";

export function LoginForm({ next }: { next?: string }) {
  const [state, action] = useFormState(loginAction, null as { error?: string } | null);

  return (
    <form action={action} className="space-y-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required className="input" />
      </div>
      <div>
        <label className="label" htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="input" />
      </div>
      {state?.error ? (
        <p className="rounded-lg bg-magenta/10 px-3 py-2 text-sm text-magenta-deep">{state.error}</p>
      ) : null}
      <SubmitButton className="w-full" pendingText="Signing in…">
        Sign in
      </SubmitButton>
    </form>
  );
}
