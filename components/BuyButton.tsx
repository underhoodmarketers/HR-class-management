"use client";

import { useCallback, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  EmbeddedCheckoutProvider,
  EmbeddedCheckout,
} from "@stripe/react-stripe-js";
import { createEmbeddedCheckout, type BillingType } from "@/app/actions/checkout";

const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : null;

export default function BuyButton({
  packageId,
  billingType,
  label,
  className,
  autoOpen,
}: {
  packageId: number;
  billingType: BillingType;
  label: string;
  className: string;
  autoOpen?: boolean;
}) {
  const [open, setOpen] = useState(Boolean(autoOpen));
  const [error, setError] = useState<string | null>(null);

  const fetchClientSecret = useCallback(async () => {
    const result = await createEmbeddedCheckout(packageId, billingType);
    if ("error" in result) {
      setError(result.error);
      throw new Error(result.error);
    }
    return result.clientSecret;
  }, [packageId, billingType]);

  const handleClick = () => {
    setError(null);
    setOpen(true);
  };

  if (!stripePromise) {
    return (
      <p className="text-xs text-ink/40">Payments aren&apos;t set up yet.</p>
    );
  }

  return (
    <>
      <button type="button" onClick={handleClick} className={className}>
        {label}
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-4 shadow-card">
            <div className="mb-2 flex items-center justify-between">
              <p className="font-600">Checkout</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full px-2 py-1 text-sm text-ink/40 hover:bg-ink/5"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {error ? (
              <p className="mb-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
                {error}
              </p>
            ) : (
              <EmbeddedCheckoutProvider
                stripe={stripePromise}
                options={{ fetchClientSecret }}
              >
                <EmbeddedCheckout />
              </EmbeddedCheckoutProvider>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
