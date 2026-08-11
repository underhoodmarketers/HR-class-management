"use client";

import { cancelSubscription } from "@/app/actions/checkout";

export default function CancelSubscriptionButton({ membershipId }: { membershipId: number }) {
  return (
    <form
      action={cancelSubscription}
      onSubmit={(e) => {
        if (
          !confirm(
            "Cancel your autopay subscription?\n\nBy studio policy, cancellations require 4 weeks' notice — you'll keep your access and may be charged one more time before it stops, but you won't be charged after 4 weeks from today."
          )
        ) {
          e.preventDefault();
        }
      }}
      className="mt-4"
    >
      <input type="hidden" name="membershipId" value={membershipId} />
      <button type="submit" className="text-xs font-semibold text-white/80 underline hover:text-white">
        Cancel autopay
      </button>
    </form>
  );
}
