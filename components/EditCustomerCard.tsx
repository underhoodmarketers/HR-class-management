"use client";

import { useState } from "react";
import { updateCustomer } from "@/app/actions/admin";
import { formatDob } from "@/lib/utils";

type Customer = {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  dob: string | null;
  instagram: string | null;
  locationId: number | null;
};

export default function EditCustomerCard({
  customer,
  studios,
}: {
  customer: Customer;
  studios: { id: number; name: string }[];
}) {
  const [editing, setEditing] = useState(false);
  const studioName = studios.find((s) => s.id === customer.locationId)?.name;

  if (editing) {
    return (
      <div className="card p-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-700 uppercase tracking-wide text-ink/50">Contact</h2>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="text-xs text-ink/40 hover:text-ink/60"
          >
            Cancel
          </button>
        </div>
        <form action={updateCustomer} className="space-y-3">
          <input type="hidden" name="id" value={customer.id} />
          <div>
            <label className="label">Full name</label>
            <input name="name" defaultValue={customer.name} required className="input" />
          </div>
          <div>
            <label className="label">Email</label>
            <input name="email" type="email" defaultValue={customer.email} required className="input" />
          </div>
          <div>
            <label className="label">Phone</label>
            <input name="phone" type="tel" defaultValue={customer.phone ?? ""} required className="input" />
          </div>
          <div>
            <label className="label">Date of birth</label>
            <input
              name="dob"
              type="date"
              defaultValue={customer.dob ?? ""}
              required
              className="input"
            />
          </div>
          <div>
            <label className="label">Preferred studio</label>
            <select
              name="locationId"
              defaultValue={customer.locationId ?? ""}
              required
              className="input"
            >
              <option value="" disabled>
                Choose a studio
              </option>
              {studios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Instagram</label>
            <input
              name="instagram"
              defaultValue={customer.instagram ?? ""}
              placeholder="@yourhandle"
              className="input"
            />
          </div>
          <button className="btn-primary w-full">Save</button>
        </form>
      </div>
    );
  }

  return (
    <div className="card p-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-700 uppercase tracking-wide text-ink/50">Contact</h2>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-xs text-magenta hover:underline"
        >
          Edit
        </button>
      </div>
      <dl className="space-y-2 text-sm">
        <div><dt className="text-ink/40">Email</dt><dd>{customer.email}</dd></div>
        <div><dt className="text-ink/40">Phone</dt><dd>{customer.phone || "—"}</dd></div>
        <div><dt className="text-ink/40">Date of birth</dt><dd>{formatDob(customer.dob)}</dd></div>
        <div><dt className="text-ink/40">Preferred studio</dt><dd>{studioName || "—"}</dd></div>
        <div>
          <dt className="text-ink/40">Instagram</dt>
          <dd>
            {customer.instagram ? (
              <a
                href={`https://instagram.com/${customer.instagram}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-magenta hover:underline"
              >
                @{customer.instagram}
              </a>
            ) : (
              "—"
            )}
          </dd>
        </div>
      </dl>
    </div>
  );
}
