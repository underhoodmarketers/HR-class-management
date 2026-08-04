"use client";

import { useState } from "react";
import { createPromoCode } from "@/app/actions/admin";

export default function PromoCodeForm() {
  const [discountType, setDiscountType] = useState<"percent" | "amount">("percent");
  const [duration, setDuration] = useState<"once" | "forever" | "repeating">("once");

  return (
    <form action={createPromoCode} className="space-y-4">
      <div>
        <label className="label">Code</label>
        <input
          name="code"
          className="input uppercase"
          placeholder="WELCOME10"
          required
          maxLength={40}
        />
      </div>

      <div>
        <label className="label">Discount</label>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => setDiscountType("percent")}
            className={
              discountType === "percent"
                ? "rounded-full bg-magenta px-3 py-1.5 text-xs font-medium text-white"
                : "rounded-full border border-ink/15 px-3 py-1.5 text-xs text-ink/60"
            }
          >
            % off
          </button>
          <button
            type="button"
            onClick={() => setDiscountType("amount")}
            className={
              discountType === "amount"
                ? "rounded-full bg-magenta px-3 py-1.5 text-xs font-medium text-white"
                : "rounded-full border border-ink/15 px-3 py-1.5 text-xs text-ink/60"
            }
          >
            $ off
          </button>
        </div>
        <input type="hidden" name="discountType" value={discountType} />
      </div>

      {discountType === "percent" ? (
        <div>
          <label className="label">Percent off</label>
          <input
            type="number"
            name="percentOff"
            min={1}
            max={100}
            step={1}
            className="input"
            placeholder="10"
            required
          />
        </div>
      ) : (
        <div>
          <label className="label">Amount off (USD)</label>
          <input
            type="number"
            name="amountOff"
            min={0.01}
            step={0.01}
            className="input"
            placeholder="10"
            required
          />
        </div>
      )}

      <div>
        <label className="label">Applies to autopay renewals</label>
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ["once", "First payment only"],
              ["forever", "Every renewal"],
              ["repeating", "For a few months"],
            ] as const
          ).map(([value, text]) => (
            <button
              key={value}
              type="button"
              onClick={() => setDuration(value)}
              className={
                duration === value
                  ? "rounded-full bg-magenta px-3 py-1.5 text-xs font-medium text-white"
                  : "rounded-full border border-ink/15 px-3 py-1.5 text-xs text-ink/60"
              }
            >
              {text}
            </button>
          ))}
        </div>
        <input type="hidden" name="duration" value={duration} />
        <p className="mt-1.5 text-xs text-ink/40">
          Only matters for autopay plans — one-time purchases are a single charge either way.
        </p>
      </div>

      {duration === "repeating" ? (
        <div>
          <label className="label">Number of months</label>
          <input
            type="number"
            name="durationMonths"
            min={1}
            className="input"
            placeholder="3"
            required
          />
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Expires (optional)</label>
          <input type="date" name="expiresAt" className="input" />
        </div>
        <div>
          <label className="label">Max uses (optional)</label>
          <input type="number" name="maxRedemptions" min={1} className="input" placeholder="Unlimited" />
        </div>
      </div>

      <button className="btn-primary w-full">Create promo code</button>
    </form>
  );
}
