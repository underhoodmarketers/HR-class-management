"use client";

import { useEffect, useState } from "react";
import { getPackageLocationOptions, getLocationScheduleInfo } from "@/app/actions/checkout";
import { fromStudioTime, studioDateKey, studioWeekday, addStudioDays, monthLabel } from "@/lib/utils";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function buildMonthGrid(monthKey: string): Date[] {
  const monthStart = fromStudioTime(`${monthKey}-01T00:00`);
  const gridStart = addStudioDays(monthStart, -studioWeekday(monthStart));
  return Array.from({ length: 42 }, (_, i) => addStudioDays(gridStart, i));
}

function shiftMonthKey(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Lets a customer pick which studio they'll attend and, optionally, which
 * date their package should start on — the calendar only allows future
 * dates that studio actually runs a class on. Leaving a date unpicked
 * means "use the soonest one," computed server-side at purchase time.
 */
export default function StartDatePicker({
  packageId,
  onChange,
}: {
  packageId: number;
  onChange: (value: { locationId: number | null; startDate: string | null }) => void;
}) {
  const [locationOptions, setLocationOptions] = useState<{ id: number; name: string }[] | null>(null);
  const [locationId, setLocationId] = useState<number | null>(null);
  const [weekdays, setWeekdays] = useState<number[] | null>(null);
  const [defaultDate, setDefaultDate] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const todayKey = studioDateKey(new Date());
  const [visibleMonthKey, setVisibleMonthKey] = useState<string>(todayKey.slice(0, 7));

  useEffect(() => {
    getPackageLocationOptions(packageId).then((locs) => {
      setLocationOptions(locs);
      if (locs.length > 0) setLocationId(locs[0].id);
    });
  }, [packageId]);

  useEffect(() => {
    if (!locationId) return;
    setWeekdays(null);
    setSelectedDate(null);
    getLocationScheduleInfo(locationId).then(({ weekdays, defaultDate }) => {
      setWeekdays(weekdays);
      setDefaultDate(defaultDate);
      setVisibleMonthKey((defaultDate ?? todayKey).slice(0, 7));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId]);

  useEffect(() => {
    onChange({ locationId, startDate: selectedDate });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId, selectedDate]);

  if (locationOptions === null) {
    return <p className="text-sm text-ink/40">Loading available start dates…</p>;
  }

  const days = buildMonthGrid(visibleMonthKey);
  const canGoBack = shiftMonthKey(visibleMonthKey, 0) > todayKey.slice(0, 7);

  return (
    <div className="space-y-3">
      {locationOptions.length > 1 ? (
        <div>
          <label className="label">Which studio?</label>
          <select
            value={locationId ?? ""}
            onChange={(e) => setLocationId(Number(e.target.value))}
            className="input"
          >
            {locationOptions.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
      ) : locationOptions.length === 1 ? (
        <p className="text-sm text-ink/60">
          Studio: <span className="font-600">{locationOptions[0].name}</span>
        </p>
      ) : (
        <p className="text-sm text-ink/40">No studios available for this package.</p>
      )}

      {locationId ? (
        <div>
          <label className="label">Start date (optional)</label>
          {weekdays === null ? (
            <p className="text-sm text-ink/40">Loading schedule…</p>
          ) : (
            <>
              <p className="mb-2 text-xs text-ink/50">
                {weekdays.length > 0
                  ? `Classes there run on ${weekdays.map((w) => WEEKDAY_LABELS[w]).join(" & ")}.`
                  : "No classes scheduled there yet — pick any future date."}
                {defaultDate ? (
                  <>
                    {" "}
                    Leave unset to start on the soonest available date
                    {selectedDate === null ? " (used below)" : ""}.
                  </>
                ) : null}
              </p>
              <div className="rounded-xl border border-ink/10 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setVisibleMonthKey((k) => shiftMonthKey(k, -1))}
                    disabled={!canGoBack}
                    className="rounded-full px-2 py-1 text-sm text-ink/50 hover:bg-blush disabled:opacity-30"
                  >
                    ‹
                  </button>
                  <p className="text-sm font-600">{monthLabel(visibleMonthKey)}</p>
                  <button
                    type="button"
                    onClick={() => setVisibleMonthKey((k) => shiftMonthKey(k, 1))}
                    className="rounded-full px-2 py-1 text-sm text-ink/50 hover:bg-blush"
                  >
                    ›
                  </button>
                </div>
                <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-600 uppercase text-ink/40">
                  {WEEKDAY_LABELS.map((w) => (
                    <div key={w}>{w}</div>
                  ))}
                </div>
                <div className="mt-1 grid grid-cols-7 gap-1">
                  {days.map((d) => {
                    const key = studioDateKey(d);
                    const inMonth = key.slice(0, 7) === visibleMonthKey;
                    const isPast = key < todayKey;
                    const matchesSchedule = weekdays.length === 0 || weekdays.includes(studioWeekday(d));
                    const selectable = inMonth && !isPast && matchesSchedule;
                    const isSelected = selectedDate === key;
                    const isDefault = !selectedDate && defaultDate === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        disabled={!selectable}
                        onClick={() => setSelectedDate(key)}
                        className={`rounded-lg py-1.5 text-xs ${
                          !inMonth
                            ? "text-transparent"
                            : !selectable
                            ? "text-ink/20"
                            : isSelected
                            ? "bg-magenta text-white font-600"
                            : isDefault
                            ? "bg-blush text-magenta-deep font-600"
                            : "text-ink/70 hover:bg-blush/60"
                        }`}
                      >
                        {inMonth ? d.getDate() : ""}
                      </button>
                    );
                  })}
                </div>
              </div>
              {selectedDate ? (
                <button
                  type="button"
                  onClick={() => setSelectedDate(null)}
                  className="mt-2 text-xs font-semibold text-magenta hover:underline"
                >
                  Use soonest available instead
                </button>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
