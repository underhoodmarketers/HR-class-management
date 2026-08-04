"use client";

import { useState } from "react";
import BuyButton from "@/components/BuyButton";
import { formatMoney } from "@/lib/utils";

type Variant = {
  id: number;
  durationLabel: string;
  credits: number | null;
  priceCents: number;
  recurringPriceCents: number | null;
  billingWeeks: number | null;
  locationNames: string[];
};

export default function PackageTierCard({
  tierName,
  perWeekLabel,
  variants,
  highlighted,
  initialVariantId,
}: {
  tierName: string;
  perWeekLabel: string;
  variants: Variant[];
  highlighted?: boolean;
  initialVariantId?: number;
}) {
  const initialIndex = Math.max(
    0,
    variants.findIndex((v) => v.id === initialVariantId)
  );
  const [selected, setSelected] = useState(initialIndex);
  const v = variants[selected];
  const savingsCents =
    v.recurringPriceCents != null ? v.priceCents - v.recurringPriceCents : null;

  return (
    <div className={`card flex flex-col p-6 ${highlighted ? "ring-2 ring-magenta" : ""}`}>
      <p className="font-display text-xl font-600">{tierName}</p>
      <p className="mt-1 text-sm text-ink/50">{perWeekLabel}</p>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {variants.map((variant, i) => (
          <button
            key={variant.id}
            type="button"
            onClick={() => setSelected(i)}
            className={
              i === selected
                ? "rounded-full bg-magenta px-3 py-1 text-xs font-medium text-white"
                : "rounded-full bg-ink/5 px-3 py-1 text-xs text-ink/60 hover:bg-ink/10"
            }
          >
            {variant.durationLabel}
          </button>
        ))}
      </div>

      <div className="mt-4">
        <p className="font-display text-3xl font-700 text-magenta">
          {formatMoney(v.priceCents)}
          <span className="ml-1 text-sm font-500 text-ink/40">paid in full</span>
        </p>
        {v.recurringPriceCents != null ? (
          <p className="mt-1 text-sm text-ink/60">
            or {formatMoney(v.recurringPriceCents)} every {v.billingWeeks} weeks on autopay
            {savingsCents ? (
              <span className="ml-1 text-magenta-deep">
                (save {formatMoney(savingsCents)})
              </span>
            ) : null}
          </p>
        ) : null}
      </div>

      <ul className="mt-3 space-y-1 text-sm text-ink/60">
        <li>{v.credits ? `${v.credits} classes` : "Unlimited classes"}</li>
        <li>{v.locationNames.length ? v.locationNames.join(", ") : "All studios"}</li>
      </ul>

      <div className="mt-6 flex flex-col gap-2">
        <BuyButton
          packageId={v.id}
          billingType="one_time"
          label="Pay in full"
          className="btn-primary w-full"
        />
        {v.recurringPriceCents != null ? (
          <BuyButton
            packageId={v.id}
            billingType="recurring"
            label="Start autopay & save"
            className="btn-ghost w-full"
          />
        ) : null}
      </div>
    </div>
  );
}
