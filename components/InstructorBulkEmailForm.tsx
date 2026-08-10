"use client";

import { sendInstructorBulkEmail } from "@/app/actions/instructor";
import { SubmitButton } from "./SubmitButton";

export default function InstructorBulkEmailForm({ recipientCount }: { recipientCount: number }) {
  return (
    <form
      action={sendInstructorBulkEmail}
      onSubmit={(e) => {
        if (
          !confirm(
            `Send this email to ${recipientCount} customer${recipientCount === 1 ? "" : "s"} at your studio? This can't be undone.`
          )
        ) {
          e.preventDefault();
        }
      }}
      className="space-y-3"
    >
      <div>
        <label className="label">Subject</label>
        <input name="subject" required className="input" />
      </div>
      <div>
        <label className="label">Message</label>
        <textarea name="body" rows={6} required className="input" />
      </div>
      <SubmitButton className="w-full" pendingText="Sending…">
        Send to {recipientCount} customer{recipientCount === 1 ? "" : "s"}
      </SubmitButton>
    </form>
  );
}
