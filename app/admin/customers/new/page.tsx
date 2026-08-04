import Link from "next/link";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { locations } from "@/db/schema";
import { createCustomer } from "@/app/actions/admin";

export const dynamic = "force-dynamic";

const errorMessages: Record<string, string> = {
  invalid:
    "Fill in name, email, phone, date of birth, preferred studio, an 8+ character password, and the waiver signer's name.",
  exists: "An account with that email already exists.",
};

export default async function NewCustomerPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const error = searchParams.error ? errorMessages[searchParams.error] : null;
  const studios = await db
    .select()
    .from(locations)
    .where(and(eq(locations.active, true), isNull(locations.archivedAt)));

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/customers" className="text-sm text-magenta">
          ← All customers
        </Link>
        <h1 className="mt-2 font-display text-3xl font-600">New customer</h1>
        <p className="text-sm text-ink/50">
          For enrolling someone in person or over the phone — no self-signup required.
        </p>
      </div>

      {error ? (
        <div className="max-w-lg rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <div className="card max-w-lg p-6">
        <form action={createCustomer} className="space-y-4">
          <div>
            <label className="label">Full name</label>
            <input name="name" required className="input" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Email</label>
              <input name="email" type="email" required className="input" />
            </div>
            <div>
              <label className="label">Phone</label>
              <input name="phone" type="tel" required className="input" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Date of birth</label>
              <input name="dob" type="date" required className="input" />
            </div>
            <div>
              <label className="label">Preferred studio</label>
              <select name="locationId" required defaultValue="" className="input">
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
          </div>
          <div>
            <label className="label">
              Instagram <span className="font-400 text-ink/40">(optional)</span>
            </label>
            <input name="instagram" placeholder="@yourhandle" className="input" />
          </div>
          <div>
            <label className="label">Temporary password</label>
            <input name="password" type="text" required minLength={8} className="input" />
            <p className="mt-1 text-xs text-ink/40">
              Share this with the customer — they can change it later.
            </p>
          </div>
          <div className="rounded-xl border border-ink/10 p-3">
            <label className="label">Waiver signed by</label>
            <input
              name="signedName"
              placeholder="Customer's (or guardian's) legal name"
              required
              className="input"
            />
            <p className="mt-1 text-xs text-ink/40">
              Confirms the liability waiver was reviewed and signed in person.
            </p>
          </div>
          <button className="btn-primary w-full">Create customer</button>
        </form>
      </div>
    </div>
  );
}
