"use client";

import { useFormState } from "react-dom";
import { signupAction } from "@/app/actions/auth";
import { SubmitButton } from "./SubmitButton";

export function SignupForm({
  waiverTitle,
  waiverBody,
  next,
}: {
  waiverTitle: string;
  waiverBody: string;
  next?: string;
}) {
  const [state, action] = useFormState(signupAction, null as { error?: string } | null);

  return (
    <form action={action} className="space-y-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="name">Full name</label>
          <input id="name" name="name" required className="input" />
        </div>
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" name="email" type="email" required className="input" />
        </div>
        <div>
          <label className="label" htmlFor="phone">Phone</label>
          <input id="phone" name="phone" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input id="password" name="password" type="password" required className="input" />
        </div>
        <div>
          <label className="label" htmlFor="dob">Date of birth</label>
          <input id="dob" name="dob" type="date" required className="input" />
        </div>
        <div>
          <label className="label" htmlFor="instagram">Instagram <span className="font-400 text-ink/40">(optional)</span></label>
          <input id="instagram" name="instagram" placeholder="@yourhandle" className="input" />
        </div>
      </div>

      <div className="rounded-2xl border border-magenta/15 bg-blush/40 p-4">
        <p className="mb-1 text-sm font-700 text-magenta-deep">{waiverTitle}</p>
        <div className="max-h-40 overflow-y-auto whitespace-pre-line pr-2 text-xs leading-relaxed text-ink/70">
          {waiverBody}
        </div>
        <div className="mt-3">
          <label className="label" htmlFor="signedName">Type your name to sign</label>
          <input id="signedName" name="signedName" placeholder="Your legal name" className="input" required />
        </div>
        <label className="mt-3 flex items-start gap-2 text-sm text-ink/70">
          <input type="checkbox" name="agree" className="mt-0.5 h-4 w-4 accent-magenta" required />
          I have read and agree to the liability waiver above.
        </label>
      </div>

      {state?.error ? (
        <p className="rounded-lg bg-magenta/10 px-3 py-2 text-sm text-magenta-deep">{state.error}</p>
      ) : null}

      <SubmitButton className="w-full" pendingText="Creating profile…">
        Join Holistic Rhythm
      </SubmitButton>
    </form>
  );
}
