"use client";

import { useState } from "react";
import { createPromoCode } from "@/app/actions/admin";
import CustomerMultiSelect from "./CustomerMultiSelect";

export default function PromoCodeForm({
  packages,
  locations,
  customers,
}: {
  packages: { id: number; name: string }[];
  locations: { id: number; name: string }[];
  customers: { id: number; name: string; email: string }[];
}) {
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

      <div className="border-t border-ink/10 pt-4">
        <p className="mb-1 text-sm font-600">Restrictions</p>
        <p className="mb-3 text-xs text-ink/40">
          Leave any of these blank to not restrict by that — e.g. no packages checked means the code
          works on every package. All restrictions you do set must match for the code to work.
        </p>

        <div className="mb-4">
          <label className="label">Packages (optional)</label>
          <div className="max-h-32 overflow-y-auto rounded-xl border border-ink/10">
            {packages.length === 0 ? (
              <p className="p-3 text-sm text-ink/40">No packages yet.</p>
            ) : (
              packages.map((p) => (
                <label
                  key={p.id}
                  className="flex cursor-pointer items-center gap-2 border-b border-ink/5 px-3 py-2 text-sm last:border-b-0 hover:bg-blush/20"
                >
                  <input type="checkbox" name="packageIds" value={p.id} />
                  <span>{p.name}</span>
                </label>
              ))
            )}
          </div>
        </div>

        <div className="mb-4">
          <label className="label">Studios (optional)</label>
          <div className="rounded-xl border border-ink/10">
            {locations.length === 0 ? (
              <p className="p-3 text-sm text-ink/40">No studios yet.</p>
            ) : (
              locations.map((l) => (
                <label
                  key={l.id}
                  className="flex cursor-pointer items-center gap-2 border-b border-ink/5 px-3 py-2 text-sm last:border-b-0 hover:bg-blush/20"
                >
                  <input type="checkbox" name="locationIds" value={l.id} />
                  <span>{l.name}</span>
                </label>
              ))
            )}
          </div>
        </div>

        <div>
          <label className="label">Customers (optional)</label>
          <CustomerMultiSelect customers={customers} />
        </div>
      </div>

      <button className="btn-primary w-full">Create promo code</button>
    </form>
  );
}
