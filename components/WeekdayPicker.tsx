"use client";

import { useState } from "react";

const DAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
];

export default function WeekdayPicker() {
  const [selected, setSelected] = useState<number[]>([]);

  return (
    <div>
      <label className="label">Also repeat on (optional)</label>
      <div className="flex flex-wrap gap-1.5">
        {DAYS.map((d) => {
          const on = selected.includes(d.value);
          return (
            <button
              key={d.value}
              type="button"
              onClick={() =>
                setSelected((prev) =>
                  on ? prev.filter((v) => v !== d.value) : [...prev, d.value]
                )
              }
              className={
                on
                  ? "rounded-full bg-magenta px-3 py-1.5 text-xs font-medium text-white"
                  : "rounded-full border border-ink/15 px-3 py-1.5 text-xs text-ink/60 hover:border-magenta/40"
              }
            >
              {d.label}
            </button>
          );
        })}
      </div>
      {selected.map((v) => (
        <input key={v} type="hidden" name="weekdays" value={v} />
      ))}
      <p className="mt-1.5 text-xs text-ink/40">
        The day of your start date is always included. Add days here to run the
        same class more than once a week.
      </p>
    </div>
  );
}
