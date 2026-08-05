"use client";

import { useState } from "react";
import { changePasswordAction } from "@/app/actions/auth";
import { SubmitButton } from "./SubmitButton";

export default function ChangePasswordCard({ redirectTo }: { redirectTo: string }) {
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <div className="card p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-600">Password</h2>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-xs text-magenta hover:underline"
          >
            Change password
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card p-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-600">Change password</h2>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="text-xs text-ink/40 hover:text-ink/60"
        >
          Cancel
        </button>
      </div>
      <form action={changePasswordAction} className="space-y-3">
        <input type="hidden" name="redirectTo" value={redirectTo} />
        <div>
          <label className="label">Current password</label>
          <input
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
            className="input"
          />
        </div>
        <div>
          <label className="label">New password</label>
          <input
            name="newPassword"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            className="input"
          />
        </div>
        <div>
          <label className="label">Confirm new password</label>
          <input
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            className="input"
          />
        </div>
        <SubmitButton className="w-full">Update password</SubmitButton>
      </form>
    </div>
  );
}
