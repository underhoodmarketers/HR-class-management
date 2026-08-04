"use client";

import { useState } from "react";
import { updateProfile } from "@/app/actions/profile";
import { formatDob } from "@/lib/utils";

type Profile = {
  name: string;
  email: string;
  phone: string | null;
  dob: string | null;
  instagram: string | null;
  locationId: number | null;
};

export default function EditProfileCard({
  profile,
  studios,
}: {
  profile: Profile;
  studios: { id: number; name: string }[];
}) {
  const [editing, setEditing] = useState(false);
  const studioName = studios.find((s) => s.id === profile.locationId)?.name;

  if (editing) {
    return (
      <div className="card p-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-600">Your details</h2>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="text-xs text-ink/40 hover:text-ink/60"
          >
            Cancel
          </button>
        </div>
        <form action={updateProfile} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Full name</label>
              <input name="name" defaultValue={profile.name} required className="input" />
            </div>
            <div>
              <label className="label">Email</label>
              <input name="email" type="email" defaultValue={profile.email} required className="input" />
            </div>
            <div>
              <label className="label">Phone</label>
              <input name="phone" type="tel" defaultValue={profile.phone ?? ""} required className="input" />
            </div>
            <div>
              <label className="label">Date of birth</label>
              <input
                name="dob"
                type="date"
                defaultValue={profile.dob ?? ""}
                required
                className="input"
              />
            </div>
            <div>
              <label className="label">Preferred studio</label>
              <select
                name="locationId"
                defaultValue={profile.locationId ?? ""}
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
                defaultValue={profile.instagram ?? ""}
                placeholder="@yourhandle"
                className="input"
              />
            </div>
          </div>
          <button className="btn-primary w-full">Save changes</button>
        </form>
      </div>
    );
  }

  return (
    <div className="card p-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-600">Your details</h2>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-xs text-magenta hover:underline"
        >
          Edit
        </button>
      </div>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div><dt className="text-ink/40">Full name</dt><dd>{profile.name}</dd></div>
        <div><dt className="text-ink/40">Email</dt><dd>{profile.email}</dd></div>
        <div><dt className="text-ink/40">Phone</dt><dd>{profile.phone || "—"}</dd></div>
        <div><dt className="text-ink/40">Date of birth</dt><dd>{formatDob(profile.dob)}</dd></div>
        <div><dt className="text-ink/40">Preferred studio</dt><dd>{studioName || "—"}</dd></div>
        <div>
          <dt className="text-ink/40">Instagram</dt>
          <dd>
            {profile.instagram ? (
              <a
                href={`https://instagram.com/${profile.instagram}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-magenta hover:underline"
              >
                @{profile.instagram}
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
