"use client";

import { useCallback, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  EmbeddedCheckoutProvider,
  EmbeddedCheckout,
} from "@stripe/react-stripe-js";
import { createEmbeddedCheckout, validatePromoCode, type FriendInvite } from "@/app/actions/checkout";

const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : null;

// Keep in sync with MAX_DROP_IN_QUANTITY in app/actions/checkout.ts, which
// is the actual server-side enforced cap.
const MAX_QUANTITY = 6;

const emptyFriend: FriendInvite = { name: "", phone: "", email: "" };

export default function DropInBuyButton({
  packageId,
  label,
  className,
}: {
  packageId: number;
  label: string;
  className: string;
}) {
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<"details" | "promo" | "checkout">("details");
  const [error, setError] = useState<string | null>(null);
  const [detailsError, setDetailsError] = useState<string | null>(null);

  const [quantity, setQuantity] = useState(1);
  const [splitChoice, setSplitChoice] = useState<"self" | "friends" | null>(null);
  const [friends, setFriends] = useState<FriendInvite[]>([]);

  const [showPromoInput, setShowPromoInput] = useState(false);
  const [promoInput, setPromoInput] = useState("");
  const [promoStatus, setPromoStatus] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [checkingPromo, setCheckingPromo] = useState(false);
  const [appliedCode, setAppliedCode] = useState<string | null>(null);

  const friendSlots = Math.max(quantity - 1, 0);

  const resizeFriends = (slots: number) => {
    setFriends((prev) => {
      const next = prev.slice(0, slots);
      while (next.length < slots) next.push({ ...emptyFriend });
      return next;
    });
  };

  const handleQuantityChange = (n: number) => {
    setQuantity(n);
    setDetailsError(null);
    if (n === 1) {
      setSplitChoice(null);
      setFriends([]);
    } else {
      resizeFriends(splitChoice === "friends" ? n - 1 : 0);
    }
  };

  const handleSplitChoice = (choice: "self" | "friends") => {
    setSplitChoice(choice);
    setDetailsError(null);
    resizeFriends(choice === "friends" ? friendSlots : 0);
  };

  const updateFriend = (i: number, field: keyof FriendInvite, value: string) => {
    setFriends((prev) => prev.map((f, idx) => (idx === i ? { ...f, [field]: value } : f)));
  };

  const handleContinueFromDetails = () => {
    if (quantity > 1 && !splitChoice) {
      setDetailsError("Let us know who these classes are for.");
      return;
    }
    if (splitChoice === "friends") {
      const incomplete = friends.some((f) => !f.name.trim() || !f.phone.trim() || !f.email.trim());
      if (incomplete) {
        setDetailsError("Fill in each friend's name, phone, and email.");
        return;
      }
    }
    setDetailsError(null);
    setStage("promo");
  };

  const fetchClientSecret = useCallback(async () => {
    const result = await createEmbeddedCheckout(
      packageId,
      "one_time",
      appliedCode ?? undefined,
      quantity,
      splitChoice === "friends" ? friends : []
    );
    if ("error" in result) {
      setError(result.error);
      throw new Error(result.error);
    }
    return result.clientSecret;
  }, [packageId, appliedCode, quantity, splitChoice, friends]);

  const handleClick = () => {
    setError(null);
    setDetailsError(null);
    setStage("details");
    setQuantity(1);
    setSplitChoice(null);
    setFriends([]);
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
            ) : stage === "details" ? (
              <div className="space-y-4 p-2">
                <div>
                  <label className="label">How many Drop-Ins?</label>
                  <select
                    value={quantity}
                    onChange={(e) => handleQuantityChange(Number(e.target.value))}
                    className="input"
                  >
                    {Array.from({ length: MAX_QUANTITY }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>

                {quantity > 1 ? (
                  <div>
                    <label className="label">Who are these for?</label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleSplitChoice("self")}
                        className={`flex-1 rounded-xl border px-3 py-2 text-sm font-600 ${
                          splitChoice === "self"
                            ? "border-magenta bg-blush text-magenta-deep"
                            : "border-ink/10 text-ink/60"
                        }`}
                      >
                        Just me
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSplitChoice("friends")}
                        className={`flex-1 rounded-xl border px-3 py-2 text-sm font-600 ${
                          splitChoice === "friends"
                            ? "border-magenta bg-blush text-magenta-deep"
                            : "border-ink/10 text-ink/60"
                        }`}
                      >
                        Me + friends
                      </button>
                    </div>
                  </div>
                ) : null}

                {splitChoice === "friends" ? (
                  <div className="space-y-3">
                    <p className="text-xs text-ink/50">
                      You&apos;ll keep 1 class for yourself — the other {friendSlots} will each get their
                      own invite to sign the waiver and book.
                    </p>
                    {friends.map((f, i) => (
                      <div key={i} className="space-y-2 rounded-xl border border-ink/10 p-3">
                        <p className="text-xs font-700 uppercase tracking-wide text-ink/40">
                          Friend {i + 1}
                        </p>
                        <input
                          value={f.name}
                          onChange={(e) => updateFriend(i, "name", e.target.value)}
                          placeholder="Full name"
                          className="input"
                        />
                        <input
                          value={f.phone}
                          onChange={(e) => updateFriend(i, "phone", e.target.value)}
                          placeholder="Phone"
                          type="tel"
                          className="input"
                        />
                        <input
                          value={f.email}
                          onChange={(e) => updateFriend(i, "email", e.target.value)}
                          placeholder="Email (we'll send their invite here)"
                          type="email"
                          className="input"
                        />
                      </div>
                    ))}
                  </div>
                ) : null}

                {detailsError ? (
                  <p className="rounded-lg bg-magenta/10 px-3 py-2 text-sm text-magenta-deep">{detailsError}</p>
                ) : null}

                <button type="button" onClick={handleContinueFromDetails} className="btn-primary w-full">
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
