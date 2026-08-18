"use client";

import { useCallback, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  EmbeddedCheckoutProvider,
  EmbeddedCheckout,
} from "@stripe/react-stripe-js";
import { createEmbeddedCheckout, validatePromoCode, type BillingType } from "@/app/actions/checkout";
import SchedulePicker from "@/components/SchedulePicker";

type Slot = { locationId: number; weekday: number };

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
  const [stage, setStage] = useState<"schedule" | "promo" | "checkout">("schedule");
  const [error, setError] = useState<string | null>(null);
  const [showPromoInput, setShowPromoInput] = useState(false);
  const [promoInput, setPromoInput] = useState("");
  const [promoStatus, setPromoStatus] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [checkingPromo, setCheckingPromo] = useState(false);
  const [appliedCode, setAppliedCode] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<{ slots: Slot[]; startDate: string | null }>({
    slots: [],
    startDate: null,
  });

  const fetchClientSecret = useCallback(async () => {
    const result = await createEmbeddedCheckout(
      packageId,
      billingType,
      appliedCode ?? undefined,
      1,
      [],
      schedule.slots,
      schedule.startDate ?? undefined
    );
    if ("error" in result) {
      setError(result.error);
      throw new Error(result.error);
    }
    return result.clientSecret;
  }, [packageId, billingType, appliedCode, schedule]);

  const handleClick = () => {
    setError(null);
    setStage("schedule");
    setShowPromoInput(false);
    setPromoInput("");
    setPromoStatus(null);
    setAppliedCode(null);
    setOpen(true);
  };

  const handleApplyPromo = async () => {
    if (!promoInput.trim()) return;
    setCheckingPromo(true);
    setPromoStatus(null);
    const result = await validatePromoCode(promoInput, packageId);
    setCheckingPromo(false);
    if (result.ok) {
      setAppliedCode(promoInput.trim().toUpperCase());
      setPromoStatus({ tone: "ok", text: `Applied — ${result.label}` });
    } else {
      setAppliedCode(null);
      setPromoStatus({ tone: "error", text: result.error });
    }
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
            ) : stage === "schedule" ? (
              <div className="space-y-4 p-2">
                <SchedulePicker packageId={packageId} onChange={setSchedule} />
                <button type="button" onClick={() => setStage("promo")} className="btn-primary w-full">
                  Continue
                </button>
              </div>
            ) : stage === "promo" ? (
              <div className="space-y-4 p-2">
                <div>
                  {showPromoInput ? (
                    <>
                      <label className="label">Promo code</label>
                      <div className="flex gap-2">
                        <input
                          value={promoInput}
                          onChange={(e) => {
                            setPromoInput(e.target.value);
                            if (appliedCode) setAppliedCode(null);
                            setPromoStatus(null);
                          }}
                          placeholder="Enter code"
                          autoFocus
                          className="input flex-1"
                        />
                        <button
                          type="button"
                          onClick={handleApplyPromo}
                          disabled={checkingPromo || !promoInput.trim()}
                          className="btn-subtle whitespace-nowrap px-4"
                        >
                          {checkingPromo ? "Checking…" : "Apply"}
                        </button>
                      </div>
                      {promoStatus ? (
                        <p className={`mt-2 text-sm ${promoStatus.tone === "ok" ? "text-emerald-600" : "text-red-600"}`}>
                          {promoStatus.text}
                        </p>
                      ) : null}
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowPromoInput(true)}
                      className="text-sm font-semibold text-magenta hover:underline"
                    >
                      Have a promo code?
                    </button>
                  )}
                </div>
                <button type="button" onClick={() => setStage("checkout")} className="btn-primary w-full">
                  Continue to payment
                </button>
              </div>
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
