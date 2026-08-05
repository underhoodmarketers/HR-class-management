"use client";

import { useState } from "react";
import { updateMembership } from "@/app/actions/admin";
import { formatDay, formatMoney, studioDateKey } from "@/lib/utils";
import { SubmitButton } from "./SubmitButton";

type Membership = {
  id: number;
  packageId: number;
  packageName: string;
  status: string;
  creditsRemaining: number | null;
  startsAt: Date;
  endsAt: Date;
  billingType: string;
};

const BILLING_LABELS: Record<string, string> = {
  one_time: "Card (one-time)",
  recurring: "Card (autopay)",
  zelle: "Zelle",
  manual: "Manual / other",
};

export default function MembershipCard({
  customerId,
  membership,
  packages,
  attendedInPackage,
}: {
  customerId: number;
  membership: Membership | null;
  packages: { id: number; name: string; priceCents: number }[];
  attendedInPackage: number;
}) {
  const [editing, setEditing] = useState(false);

  if (!membership) {
    return (
      <div className="card p-6">
        <h2 className="mb-3 text-sm font-700 uppercase tracking-wide text-ink/50">Membership</h2>
        <p className="text-sm text-ink/40">No membership yet.</p>
      </div>
    );
  }

  if (editing) {
    return (
      <div className="card p-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-700 uppercase tracking-wide text-ink/50">Membership</h2>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="text-xs text-ink/40 hover:text-ink/60"
          >
            Cancel
          </button>
        </div>
        <form action={updateMembership} className="space-y-3">
          <input type="hidden" name="id" value={membership.id} />
          <input type="hidden" name="customerId" value={customerId} />
          <div>
            <label className="label">Package</label>
            <select name="packageId" defaultValue={membership.packageId} className="input">
              {packages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({formatMoney(p.priceCents)})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Status</label>
            <select name="status" defaultValue={membership.status} className="input">
              <option value="active">Active</option>
              <option value="expired">Expired</option>
              <option value="pending">Pending</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">First day</label>
              <input
                type="date"
                name="startsAt"
                defaultValue={studioDateKey(membership.startsAt)}
                required
                className="input"
              />
            </div>
            <div>
              <label className="label">Last day</label>
              <input
                type="date"
                name="endsAt"
                defaultValue={studioDateKey(membership.endsAt)}
                required
                className="input"
              />
            </div>
          </div>
          <div>
            <label className="label">Credits remaining</label>
            <input
              type="number"
              name="creditsRemaining"
              min={0}
              defaultValue={membership.creditsRemaining ?? ""}
              placeholder="Unlimited"
              className="input"
            />
            <p className="mt-1 text-xs text-ink/40">Leave blank for unlimited.</p>
          </div>
          <div>
            <label className="label">Payment method</label>
            <select name="billingType" defaultValue={membership.billingType} className="input">
              <option value="one_time">Card (one-time)</option>
              <option value="recurring">Card (autopay)</option>
              <option value="zelle">Zelle</option>
              <option value="manual">Manual / other</option>
            </select>
          </div>
          <SubmitButton className="w-full">Save</SubmitButton>
        </form>
      </div>
    );
  }

  return (
    <div className="card p-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-700 uppercase tracking-wide text-ink/50">Membership</h2>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-xs text-magenta hover:underline"
        >
          Edit
        </button>
      </div>
      <dl className="space-y-2 text-sm">
        <div><dt className="text-ink/40">Package</dt><dd>{membership.packageName}</dd></div>
        <div>
          <dt className="text-ink/40">Status</dt>
          <dd><span className="badge bg-blush text-magenta-deep">{membership.status}</span></dd>
        </div>
        <div><dt className="text-ink/40">First day</dt><dd>{formatDay(membership.startsAt)}</dd></div>
        <div><dt className="text-ink/40">Last day</dt><dd>{formatDay(membership.endsAt)}</dd></div>
        <div>
          <dt className="text-ink/40">Credits remaining</dt>
          <dd>{membership.creditsRemaining === null ? "Unlimited" : membership.creditsRemaining}</dd>
        </div>
        <div>
          <dt className="text-ink/40">Classes attended (this package)</dt>
          <dd>{attendedInPackage}</dd>
        </div>
        <div>
          <dt className="text-ink/40">Payment method</dt>
          <dd>{BILLING_LABELS[membership.billingType] ?? membership.billingType}</dd>
        </div>
      </dl>
    </div>
  );
}
