"use client";

import { useState } from "react";
import { updateMembership, createMembershipForCustomer } from "@/app/actions/admin";
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

type PackageOption = { id: number; name: string; priceCents: number };

const BILLING_LABELS: Record<string, string> = {
  one_time: "Card (one-time)",
  recurring: "Card (autopay)",
  zelle: "Zelle",
  manual: "Manual / other",
};

function MembershipFields({
  packages,
  defaults,
}: {
  packages: PackageOption[];
  defaults: {
    packageId?: number;
    status: string;
    startsAt: string;
    endsAt: string;
    creditsRemaining: number | "";
    billingType: string;
  };
}) {
  return (
    <>
      <div>
        <label className="label">Package</label>
        <select name="packageId" defaultValue={defaults.packageId} className="input">
          {packages.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({formatMoney(p.priceCents)})
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Status</label>
        <select name="status" defaultValue={defaults.status} className="input">
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
            defaultValue={defaults.startsAt}
            required
            className="input"
          />
        </div>
        <div>
          <label className="label">Last day</label>
          <input
            type="date"
            name="endsAt"
            defaultValue={defaults.endsAt}
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
          defaultValue={defaults.creditsRemaining}
          placeholder="Unlimited"
          className="input"
        />
        <p className="mt-1 text-xs text-ink/40">Leave blank for unlimited.</p>
      </div>
      <div>
        <label className="label">Payment method</label>
        <select name="billingType" defaultValue={defaults.billingType} className="input">
          <option value="one_time">Card (one-time)</option>
          <option value="recurring">Card (autopay)</option>
          <option value="zelle">Zelle</option>
          <option value="manual">Manual / other</option>
        </select>
      </div>
    </>
  );
}

export default function MembershipCard({
  customerId,
  membership,
  packages,
  attendedInPackage,
}: {
  customerId: number;
  membership: Membership | null;
  packages: PackageOption[];
  attendedInPackage: number;
}) {
  const [mode, setMode] = useState<null | "edit" | "create">(null);
  const todayKey = studioDateKey(new Date());

  if (mode === "create") {
    return (
      <div className="card p-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-700 uppercase tracking-wide text-ink/50">Add membership</h2>
          <button
            type="button"
            onClick={() => setMode(null)}
            className="text-xs text-ink/40 hover:text-ink/60"
          >
            Cancel
          </button>
        </div>
        {packages.length === 0 ? (
          <p className="text-sm text-ink/40">
            Add a package first on the Packages page before granting a membership.
          </p>
        ) : (
          <form action={createMembershipForCustomer} className="space-y-3">
            <input type="hidden" name="customerId" value={customerId} />
            <MembershipFields
              packages={packages}
              defaults={{
                packageId: packages[0]?.id,
                status: "active",
                startsAt: todayKey,
                endsAt: "",
                creditsRemaining: "",
                billingType: "manual",
              }}
            />
            <SubmitButton className="w-full">Add membership</SubmitButton>
          </form>
        )}
      </div>
    );
  }

  if (!membership) {
    return (
      <div className="card p-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-700 uppercase tracking-wide text-ink/50">Membership</h2>
          <button
            type="button"
            onClick={() => setMode("create")}
            className="text-xs text-magenta hover:underline"
          >
            Add membership
          </button>
        </div>
        <p className="text-sm text-ink/40">No membership yet.</p>
      </div>
    );
  }

  if (mode === "edit") {
    return (
      <div className="card p-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-700 uppercase tracking-wide text-ink/50">Membership</h2>
          <button
            type="button"
            onClick={() => setMode(null)}
            className="text-xs text-ink/40 hover:text-ink/60"
          >
            Cancel
          </button>
        </div>
        <form action={updateMembership} className="space-y-3">
          <input type="hidden" name="id" value={membership.id} />
          <input type="hidden" name="customerId" value={customerId} />
          <MembershipFields
            packages={packages}
            defaults={{
              packageId: membership.packageId,
              status: membership.status,
              startsAt: studioDateKey(membership.startsAt),
              endsAt: studioDateKey(membership.endsAt),
              creditsRemaining: membership.creditsRemaining ?? "",
              billingType: membership.billingType,
            }}
          />
          <SubmitButton className="w-full">Save</SubmitButton>
        </form>
      </div>
    );
  }

  return (
    <div className="card p-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-700 uppercase tracking-wide text-ink/50">Membership</h2>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMode("create")}
            className="text-xs text-magenta hover:underline"
          >
            Add new
          </button>
          <button
            type="button"
            onClick={() => setMode("edit")}
            className="text-xs text-magenta hover:underline"
          >
            Edit
          </button>
        </div>
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
