export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function formatMoney(cents: number) {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  });
}

// Stripe's standard US card rate.
const STRIPE_PERCENT = 0.029;
const STRIPE_FIXED_CENTS = 30;

/**
 * The surcharge (in cents) to add on top of baseCents so that, after
 * Stripe's cut on the *total* charged amount, we still net exactly
 * baseCents. Rounds up so we never net slightly under.
 */
export function stripeFeeCents(baseCents: number): number {
  const grossedUp = Math.ceil((baseCents + STRIPE_FIXED_CENTS) / (1 - STRIPE_PERCENT));
  return grossedUp - baseCents;
}

/**
 * All classes happen in Texas. Servers run in UTC, so every date shown to a
 * human — and every wall-clock time typed in by one — must be interpreted in
 * the studio's timezone, never the server's.
 */
export const STUDIO_TZ = "America/Chicago";

/** Wall-clock parts of an instant, as seen in the studio's timezone. */
function studioParts(d: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: STUDIO_TZ,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(d);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    // Intl can emit "24" for midnight in hour12:false mode.
    hour: Number(map.hour) % 24,
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

/** Offset (ms) between the studio timezone and UTC at a given instant. */
function studioOffsetMs(d: Date) {
  const p = studioParts(d);
  return (
    Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) -
    d.getTime()
  );
}

/**
 * Converts "2026-08-10T19:30" typed by Pre into the correct UTC instant,
 * treating it as studio wall-clock time. Two passes settle DST boundaries.
 */
export function fromStudioTime(localValue: string): Date {
  const naive = Date.parse(`${localValue}:00Z`);
  if (Number.isNaN(naive)) return new Date(NaN);
  let ts = naive - studioOffsetMs(new Date(naive));
  ts = naive - studioOffsetMs(new Date(ts));
  return new Date(ts);
}

/** Same wall-clock time N weeks later, staying correct across DST changes. */
export function addStudioWeeks(d: Date, weeks: number): Date {
  const p = studioParts(d);
  const pad = (n: number) => String(n).padStart(2, "0");
  const shifted = new Date(
    Date.UTC(p.year, p.month - 1, p.day) + weeks * 7 * 86400000
  );
  const y = shifted.getUTCFullYear();
  const m = shifted.getUTCMonth() + 1;
  const day = shifted.getUTCDate();
  return fromStudioTime(
    `${y}-${pad(m)}-${pad(day)}T${pad(p.hour)}:${pad(p.minute)}`
  );
}

/** Same wall-clock time N days later in studio time. */
export function addStudioDays(d: Date, days: number): Date {
  if (days === 0) return d;
  const p = studioParts(d);
  const pad = (n: number) => String(n).padStart(2, "0");
  const shifted = new Date(
    Date.UTC(p.year, p.month - 1, p.day) + days * 86400000
  );
  return fromStudioTime(
    `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(
      shifted.getUTCDate()
    )}T${pad(p.hour)}:${pad(p.minute)}`
  );
}

/** Hour and minute of an instant, in studio time. */
export function studioClock(d: Date) {
  const p = studioParts(d);
  return { hour: p.hour, minute: p.minute };
}

/** Keeps the date, replaces the time-of-day, in studio time. */
export function withStudioClock(d: Date, hour: number, minute: number): Date {
  const p = studioParts(d);
  const pad = (n: number) => String(n).padStart(2, "0");
  return fromStudioTime(
    `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(hour)}:${pad(minute)}`
  );
}

/** Day-of-week (0=Sun) in the studio's timezone. */
export function studioWeekday(d: Date): number {
  const p = studioParts(d);
  return new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
}

/** "yyyy-mm-dd" calendar date of an instant, in studio time. */
export function studioDateKey(d: Date): string {
  const p = studioParts(d);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Whole calendar days from today until an instant, in studio time (negative if past). */
export function daysUntil(d: Date): number {
  const toUtcMidnight = (key: string) => {
    const [y, m, day] = key.split("-").map(Number);
    return Date.UTC(y, m - 1, day);
  };
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.round(
    (toUtcMidnight(studioDateKey(d)) - toUtcMidnight(studioDateKey(new Date()))) / dayMs
  );
}

export function formatDay(d: Date) {
  return d.toLocaleDateString("en-US", {
    timeZone: STUDIO_TZ,
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function formatTime(d: Date) {
  return d.toLocaleTimeString("en-US", {
    timeZone: STUDIO_TZ,
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatDateTimeLocalValue(d: Date) {
  // yyyy-MM-ddThh:mm for <input type="datetime-local">, in studio time.
  const p = studioParts(d);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(
    p.minute
  )}`;
}

export function parseMonthKey(value: string | undefined, fallback: string) {
  return value && /^\d{4}-\d{2}$/.test(value) ? value : fallback;
}

export function shiftMonthKey(monthKey: string, delta: number) {
  const [y, m] = monthKey.split("-").map(Number);
  const total = y * 12 + (m - 1) + delta;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

export function monthLabel(monthKey: string) {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatDob(dob: string | null) {
  if (!dob) return "—";
  // dob is stored as a plain "yyyy-mm-dd" date with no timezone.
  const [y, m, d] = dob.split("-").map(Number);
  if (!y || !m || !d) return dob;
  const label = new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const today = new Date();
  let age = today.getFullYear() - y;
  const hadBirthday =
    today.getMonth() + 1 > m || (today.getMonth() + 1 === m && today.getDate() >= d);
  if (!hadBirthday) age -= 1;
  return `${label} (${age})`;
}
