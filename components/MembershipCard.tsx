"use client";

import { useState } from "react";
import {
  updateMembership,
  createMembershipForCustomer,
  freezeMembership,
  unfreezeMembership,
} from "@/app/actions/admin";
import { formatDay, formatMoney, studioDateKey, parseFlexibleDate, addDaysToDateKey } from "@/lib/utils";
import { SubmitButton } from "./SubmitButton";

type Membership = {
  id: number;
  packageId: number;
  packageName: string;
  packageCredits: number | null;
  status: string;
  creditsRemaining: number | null;
  startsAt: Date;
  endsAt: Date;
  frozenAt: Date | null;
  billingType: string;
};

type PackageOption = {
  id: number;
  name: string;
  priceCents: number;
  credits: number | null;
  durationDays: number;
};

const BILLING_LABELS: Record<string, string> = {
  one_time: "Card (one-time)",
  recurring: "Card (autopay)",
  zelle: "Zelle",
  manual: "Manual / other",
};

/** A date input that also accepts a pasted date in common formats. */
function DateField({
  name,
  value,
  onChange,
}: {
  name: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <input
      type="date"
      name={name}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onPaste={(e) => {
        const parsed = parseFlexibleDate(e.clipboardData.getData("text"));
        if (parsed) {
          e.preventDefault();
          onChange(parsed);
        }
      }}
      required
      className="input"
    />
  );
}

/** Credits/weeks used vs. left. A freeze stops the weeks clock but never
 * credits, since a frozen membership can't be booked against. */
function usageSummary(membership: Membership) {
  const now = new Date();
  const totalDays = Math.round((membership.endsAt.getTime() - membership.startsAt.getTime()) / 86400000);
  const totalWeeks = Math.max(1, Math.round(totalDays / 7));

  let elapsedDays: number;
  if (membership.frozenAt) {
    elapsedDays = Math.round((membership.frozenAt.getTime() - membership.startsAt.getTime()) / 86400000);
  } else if (now.getTime() >= membership.endsAt.getTime()) {
    elapsedDays = totalDays;
  } else if (now.getTime() <= membership.startsAt.getTime()) {
    elapsedDays = 0;
  } else {
    elapsedDays = Math.round((now.getTime() - membership.startsAt.getTime()) / 86400000);
  }
  elapsedDays = Math.min(Math.max(elapsedDays, 0), totalDays);

  const weeksUsed = Math.min(totalWeeks, Math.round(elapsedDays / 7));
  const weeksLeft = Math.max(0, totalWeeks - weeksUsed);

  const creditsUsed =
    membership.packageCredits !== null && membership.creditsRemaining !== null
      ? membership.packageCredits - membership.creditsRemaining
      : null;

  return { totalWeeks, weeksUsed, weeksLeft, creditsUsed };
}

function OwedBanner({ creditsOwed }: { creditsOwed: number }) {
  if (creditsOwed <= 0) return null;
  return (
    <p className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">
      Owes {creditsOwed} credit{creditsOwed === 1 ? "" : "s"} from classes checked
      in with no package — subtracted automatically from their next purchase.
    </p>
  );
}

function MakeupCreditsBanner({ makeupCredits }: { makeupCredits: number }) {
  if (makeupCredits <= 0) return null;
  return (
    <p className="mb-3 rounded-xl bg-sky-50 px-3 py-2 text-xs text-sky-700">
      {makeupCredits} banked makeup credit{makeupCredits === 1 ? "" : "s"} — never
      expires, and can be used any time they book a class, not just once their
      package runs out.
    </p>
  );
}

export default function MembershipCard({
  customerId,
  membership,
  packages,
  attendedInPackage,
  totalAttended,
  creditsOwed,
  makeupCredits,
}: {
  customerId: number;
  membership: Membership | null;
  packages: PackageOption[];
  attendedInPackage: number;
  totalAttended: number;
  creditsOwed: number;
  makeupCredits: number;
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
          <CreateMembershipForm customerId={customerId} packages={packages} todayKey={todayKey} />
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
        <OwedBanner creditsOwed={creditsOwed} />
        <MakeupCreditsBanner makeupCredits={makeupCredits} />
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
        <EditMembershipForm customerId={customerId} membership={membership} packages={packages} />
      </div>
    );
  }

  const usage = usageSummary(membership);
  const isFrozen = Boolean(membership.frozenAt);

  return (
    <div className="card p-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-700 uppercase tracking-wide text-ink/50">Membership</h2>
        <div className="flex items-center gap-3">
          {isFrozen ? (
            <form action={unfreezeMembership}>
              <input type="hidden" name="id" value={membership.id} />
              <input type="hidden" name="customerId" value={customerId} />
              <button type="submit" className="text-xs font-semibold text-emerald-700 hover:underline">
                Unfreeze
              </button>
            </form>
          ) : (
            <form
              action={freezeMembership}
              onSubmit={(e) => {
                if (
                  !confirm(
                    "Freeze this membership?\n\nThe customer won't be able to book classes with it until you unfreeze it. The paused time is added back onto the end date when resumed."
                  )
                )
                  e.preventDefault();
              }}
            >
              <input type="hidden" name="id" value={membership.id} />
              <input type="hidden" name="customerId" value={customerId} />
              <button type="submit" className="text-xs text-magenta hover:underline">
                Freeze
              </button>
            </form>
          )}
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
      <OwedBanner creditsOwed={creditsOwed} />
      <MakeupCreditsBanner makeupCredits={makeupCredits} />
      <dl className="space-y-2 text-sm">
        <div><dt className="text-ink/40">Package</dt><dd>{membership.packageName}</dd></div>
        <div>
          <dt className="text-ink/40">Status</dt>
          <dd>
            <span className={`badge ${isFrozen ? "bg-sky-100 text-sky-700" : "bg-blush text-magenta-deep"}`}>
              {membership.status}
            </span>
            {isFrozen ? (
              <span className="ml-2 text-xs text-ink/40">since {formatDay(membership.frozenAt!)}</span>
            ) : null}
          </dd>
        </div>
        <div><dt className="text-ink/40">First day</dt><dd>{formatDay(membership.startsAt)}</dd></div>
        <div><dt className="text-ink/40">Last day</dt><dd>{formatDay(membership.endsAt)}</dd></div>
        <div>
          <dt className="text-ink/40">Credits</dt>
          <dd>
            {membership.creditsRemaining === null ? (
              "Unlimited"
            ) : (
              <>
                {usage.creditsUsed ?? "—"} used · {membership.creditsRemaining} left
                {membership.packageCredits !== null ? ` (of ${membership.packageCredits})` : ""}
              </>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-ink/40">Weeks</dt>
          <dd>
            {usage.weeksUsed} used · {usage.weeksLeft} left (of {usage.totalWeeks})
          </dd>
        </div>
        <div>
          <dt className="text-ink/40">Classes attended (this package)</dt>
          <dd>{attendedInPackage}</dd>
        </div>
        <div>
          <dt className="text-ink/40">Total classes attended (all time)</dt>
          <dd>{totalAttended}</dd>
        </div>
        <div>
          <dt className="text-ink/40">Payment method</dt>
          <dd>{BILLING_LABELS[membership.billingType] ?? membership.billingType}</dd>
        </div>
      </dl>
    </div>
  );
}

function EditMembershipForm({
  customerId,
  membership,
  packages,
}: {
  customerId: number;
  membership: Membership;
  packages: PackageOption[];
}) {
  const [startsAt, setStartsAt] = useState(studioDateKey(membership.startsAt));
  const [endsAt, setEndsAt] = useState(studioDateKey(membership.endsAt));

  return (
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
          <DateField name="startsAt" value={startsAt} onChange={setStartsAt} />
        </div>
        <div>
          <label className="label">Last day</label>
          <DateField name="endsAt" value={endsAt} onChange={setEndsAt} />
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
  );
}

function CreateMembershipForm({
  customerId,
  packages,
  todayKey,
}: {
  customerId: number;
  packages: PackageOption[];
  todayKey: string;
}) {
  // The start day itself counts as day 1 of the package, so a 28-day
  // ("1 month") package starting 8/8 ends 9/4, not 9/5.
  const [packageId, setPackageId] = useState(packages[0].id);
  const [startsAt, setStartsAt] = useState(todayKey);
  const [endsAt, setEndsAt] = useState(addDaysToDateKey(todayKey, packages[0].durationDays - 1));
  const [creditsRemaining, setCreditsRemaining] = useState<string>(
    packages[0].credits === null ? "" : String(packages[0].credits)
  );

  function handlePackageChange(id: number) {
    setPackageId(id);
    const pkg = packages.find((p) => p.id === id);
    if (!pkg) return;
    setEndsAt(addDaysToDateKey(startsAt, pkg.durationDays - 1));
    setCreditsRemaining(pkg.credits === null ? "" : String(pkg.credits));
  }

  function handleStartChange(value: string) {
    setStartsAt(value);
    const pkg = packages.find((p) => p.id === packageId);
    if (pkg && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      setEndsAt(addDaysToDateKey(value, pkg.durationDays - 1));
    }
  }

  return (
    <form action={createMembershipForCustomer} className="space-y-3">
      <input type="hidden" name="customerId" value={customerId} />
      <div>
        <label className="label">Package</label>
        <select
          name="packageId"
          value={packageId}
          onChange={(e) => handlePackageChange(Number(e.target.value))}
          className="input"
        >
          {packages.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({formatMoney(p.priceCents)})
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Status</label>
        <select name="status" defaultValue="active" className="input">
          <option value="active">Active</option>
          <option value="expired">Expired</option>
          <option value="pending">Pending</option>
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">First day</label>
          <DateField name="startsAt" value={startsAt} onChange={handleStartChange} />
        </div>
        <div>
          <label className="label">Last day</label>
          <DateField name="endsAt" value={endsAt} onChange={setEndsAt} />
        </div>
      </div>
      <p className="text-xs text-ink/40">
        Last day and credits fill in automatically from the package — edit either if this one's different.
      </p>
      <div>
        <label className="label">Credits remaining</label>
        <input
          type="number"
          name="creditsRemaining"
          min={0}
          value={creditsRemaining}
          onChange={(e) => setCreditsRemaining(e.target.value)}
          placeholder="Unlimited"
          className="input"
        />
        <p className="mt-1 text-xs text-ink/40">Leave blank for unlimited.</p>
      </div>
      <div>
        <label className="label">Payment method</label>
        <select name="billingType" defaultValue="manual" className="input">
          <option value="one_time">Card (one-time)</option>
          <option value="recurring">Card (autopay)</option>
          <option value="zelle">Zelle</option>
          <option value="manual">Manual / other</option>
        </select>
      </div>
      <SubmitButton className="w-full">Add membership</SubmitButton>
    </form>
  );
}
