"use client";

import { useEffect, useState } from "react";
import {
  getPackagePaceInfo,
  getPackageLocationOptions,
  getLocationWeekdays,
  getNearestSlotDate,
} from "@/app/actions/checkout";
import { fromStudioTime, studioDateKey, studioWeekday, addStudioDays, monthLabel } from "@/lib/utils";

type Slot = { locationId: number; weekday: number };
type LocationOption = { id: number; name: string };

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

function WeekdayCheckboxes({
  weekdays,
  selected,
  max,
  onToggle,
}: {
  weekdays: number[];
  selected: number[];
  max: number;
  onToggle: (weekday: number) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {weekdays.map((w) => {
        const isSelected = selected.includes(w);
        const disabled = !isSelected && selected.length >= max;
        return (
          <button
            key={w}
            type="button"
            disabled={disabled}
            onClick={() => onToggle(w)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
              isSelected
                ? "bg-magenta text-white"
                : disabled
                ? "bg-ink/5 text-ink/30"
                : "bg-blush/40 text-ink/60 hover:bg-blush"
            }`}
          >
            {WEEKDAY_LABELS[w]}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Lets a customer build their weekly attendance schedule and, optionally,
 * pick a start date — a package's weekly pace (1/2/3, from its own credits
 * ÷ duration) determines how many specific weekday slots they need. If
 * their chosen studio doesn't run that many days a week, they pick up the
 * remainder at a second studio. The calendar only allows future dates that
 * actually match one of the chosen slots.
 */
export default function SchedulePicker({
  packageId,
  onChange,
}: {
  packageId: number;
  onChange: (value: { slots: Slot[]; startDate: string | null }) => void;
}) {
  const [pace, setPace] = useState<number | null>(null);
  const [locationOptions, setLocationOptions] = useState<LocationOption[] | null>(null);

  const [primaryLocationId, setPrimaryLocationId] = useState<number | null>(null);
  const [primaryWeekdays, setPrimaryWeekdays] = useState<number[] | null>(null);
  const [primarySelected, setPrimarySelected] = useState<number[]>([]);

  const [wantsSecondStudio, setWantsSecondStudio] = useState(false);
  const [secondLocationId, setSecondLocationId] = useState<number | null>(null);
  const [secondWeekdays, setSecondWeekdays] = useState<number[] | null>(null);
  const [secondSelected, setSecondSelected] = useState<number[]>([]);

  const [defaultDate, setDefaultDate] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const todayKey = studioDateKey(new Date());
  const [visibleMonthKey, setVisibleMonthKey] = useState<string>(todayKey.slice(0, 7));

  useEffect(() => {
    getPackagePaceInfo(packageId).then((info) => setPace(info?.pace ?? null));
    getPackageLocationOptions(packageId).then((locs) => {
      setLocationOptions(locs);
      if (locs.length > 0) setPrimaryLocationId(locs[0].id);
    });
  }, [packageId]);

  useEffect(() => {
    if (!primaryLocationId) return;
    setPrimaryWeekdays(null);
    setPrimarySelected([]);
    setWantsSecondStudio(false);
    setSecondLocationId(null);
    setSecondWeekdays(null);
    setSecondSelected([]);
    getLocationWeekdays(primaryLocationId).then(setPrimaryWeekdays);
  }, [primaryLocationId]);

  // Once the primary studio's schedule is known, auto-select every day if
  // there aren't more than the pace needs.
  useEffect(() => {
    if (primaryWeekdays === null || pace === null) return;
    if (primaryWeekdays.length <= pace) {
      setPrimarySelected(primaryWeekdays);
    }
  }, [primaryWeekdays, pace]);

  useEffect(() => {
    if (!secondLocationId) return;
    setSecondWeekdays(null);
    setSecondSelected([]);
    getLocationWeekdays(secondLocationId).then(setSecondWeekdays);
  }, [secondLocationId]);

  const remainingAfterPrimary = pace !== null ? pace - primarySelected.length : 0;
  useEffect(() => {
    if (secondWeekdays === null) return;
    if (secondWeekdays.length <= remainingAfterPrimary) {
      setSecondSelected(secondWeekdays);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondWeekdays]);

  const allSlots: Slot[] = [
    ...(primaryLocationId ? primarySelected.map((weekday) => ({ locationId: primaryLocationId, weekday })) : []),
    ...(secondLocationId ? secondSelected.map((weekday) => ({ locationId: secondLocationId, weekday })) : []),
  ];
  const slotsComplete = pace !== null && allSlots.length === pace;

  useEffect(() => {
    if (!slotsComplete) {
      setDefaultDate(null);
      return;
    }
    getNearestSlotDate(allSlots).then((d) => {
      setDefaultDate(d);
      setVisibleMonthKey((d ?? todayKey).slice(0, 7));
    });
    setSelectedDate(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(allSlots), slotsComplete]);

  useEffect(() => {
    onChange({ slots: slotsComplete ? allSlots : [], startDate: selectedDate });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(allSlots), slotsComplete, selectedDate]);

  if (locationOptions === null || pace === null) {
    return <p className="text-sm text-ink/40">Loading available start dates…</p>;
  }

  const otherLocationOptions = locationOptions.filter((l) => l.id !== primaryLocationId);
  const needsMoreDays = primaryWeekdays !== null && primaryWeekdays.length < pace && !wantsSecondStudio;
  const slotWeekdays = [...new Set(allSlots.map((s) => s.weekday))];

  return (
    <div className="space-y-4">
      <div>
        {locationOptions.length > 1 ? (
          <>
            <label className="label">Which studio?</label>
            <select
              value={primaryLocationId ?? ""}
              onChange={(e) => setPrimaryLocationId(Number(e.target.value))}
              className="input"
            >
              {locationOptions.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </>
        ) : locationOptions.length === 1 ? (
          <p className="text-sm text-ink/60">
            Studio: <span className="font-600">{locationOptions[0].name}</span>
          </p>
        ) : (
          <p className="text-sm text-ink/40">No studios available for this package.</p>
        )}
      </div>

      {primaryLocationId && primaryWeekdays !== null ? (
        primaryWeekdays.length === 0 ? (
          <p className="text-sm text-ink/40">No classes scheduled there yet.</p>
        ) : (
          <div>
            <label className="label">
              {primaryWeekdays.length > pace
                ? `Pick ${pace} day${pace === 1 ? "" : "s"} a week`
                : "Class days"}
            </label>
            <WeekdayCheckboxes
              weekdays={primaryWeekdays}
              selected={primarySelected}
              max={pace}
              onToggle={(w) =>
                setPrimarySelected((prev) =>
                  prev.includes(w) ? prev.filter((x) => x !== w) : [...prev, w]
                )
              }
            />
          </div>
        )
      ) : null}

      {needsMoreDays ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <p className="mb-2">
            That studio only runs {primaryWeekdays!.length} day{primaryWeekdays!.length === 1 ? "" : "s"} a
            week — pick another studio for the other {remainingAfterPrimary} day
            {remainingAfterPrimary === 1 ? "" : "s"}.
          </p>
          <button
            type="button"
            onClick={() => setWantsSecondStudio(true)}
            className="text-sm font-semibold text-magenta hover:underline"
          >
            Add a second studio
          </button>
        </div>
      ) : null}

      {wantsSecondStudio && otherLocationOptions.length > 0 ? (
        <div>
          <label className="label">Second studio</label>
          <select
            value={secondLocationId ?? ""}
            onChange={(e) => setSecondLocationId(Number(e.target.value))}
            className="input"
          >
            <option value="">Choose a studio…</option>
            {otherLocationOptions.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>

          {secondLocationId && secondWeekdays !== null ? (
            secondWeekdays.length === 0 ? (
              <p className="mt-2 text-sm text-ink/40">No classes scheduled there yet.</p>
            ) : (
              <div className="mt-2">
                <label className="label">
                  Pick {remainingAfterPrimary} more day{remainingAfterPrimary === 1 ? "" : "s"}
                </label>
                <WeekdayCheckboxes
                  weekdays={secondWeekdays}
                  selected={secondSelected}
                  max={remainingAfterPrimary}
                  onToggle={(w) =>
                    setSecondSelected((prev) =>
                      prev.includes(w) ? prev.filter((x) => x !== w) : [...prev, w]
                    )
                  }
                />
              </div>
            )
          ) : null}
        </div>
      ) : null}

      {slotsComplete ? (
        <div>
          <label className="label">Start date (optional)</label>
          <p className="mb-2 text-xs text-ink/50">
            Leave unset to start on the soonest available date{selectedDate === null ? " (used below)" : ""}.
          </p>
          <div className="rounded-xl border border-ink/10 p-3">
            <div className="mb-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setVisibleMonthKey((k) => shiftMonthKey(k, -1))}
                disabled={shiftMonthKey(visibleMonthKey, 0) <= todayKey.slice(0, 7)}
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
              {buildMonthGrid(visibleMonthKey).map((d) => {
                const key = studioDateKey(d);
                const inMonth = key.slice(0, 7) === visibleMonthKey;
                const isPast = key < todayKey;
                const matchesSchedule = slotWeekdays.length === 0 || slotWeekdays.includes(studioWeekday(d));
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
        </div>
      ) : null}
    </div>
  );
}
