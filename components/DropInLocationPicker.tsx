"use client";

import { useEffect, useState } from "react";
import { getPackageLocationOptions, addPreferredLocation } from "@/app/actions/checkout";

/**
 * A Drop-In doesn't have a weekly schedule to build like a real package
 * does — just which studio the customer intends to attend. Picking one
 * (or the default, once loaded) adds it to their preferred studios, same
 * as editing it from their profile.
 */
export default function DropInLocationPicker({ packageId }: { packageId: number }) {
  const [options, setOptions] = useState<{ id: number; name: string }[] | null>(null);
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    getPackageLocationOptions(packageId).then((locs) => {
      setOptions(locs);
      if (locs.length > 0) {
        setSelected(locs[0].id);
        addPreferredLocation(locs[0].id);
      }
    });
  }, [packageId]);

  const handleChange = (id: number) => {
    setSelected(id);
    addPreferredLocation(id);
  };

  if (options === null) {
    return <p className="text-sm text-ink/40">Loading studios…</p>;
  }
  if (options.length === 0) return null;
  if (options.length === 1) {
    return (
      <p className="text-sm text-ink/60">
        Studio: <span className="font-600">{options[0].name}</span>
      </p>
    );
  }

  return (
    <div>
      <label className="label">Which studio will you attend?</label>
      <select
        value={selected ?? ""}
        onChange={(e) => handleChange(Number(e.target.value))}
        className="input"
      >
        {options.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </select>
    </div>
  );
}
