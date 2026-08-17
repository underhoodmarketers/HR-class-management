import { formatDay, formatTime, formatMoney, monthLabel, INSTRUCTOR_RATE_CENTS } from "@/lib/utils";

type SessionRow = {
  id: number;
  startsAt: Date;
  canceled: boolean;
  classType: { name: string };
  location: { name: string };
};

export type MonthRow = {
  monthKey: string;
  sessions: SessionRow[];
  completedCount: number;
  totalCents: number;
  payoutStatus: "due" | "paid";
};

export default function InstructorPayMonthDetail({ month, now }: { month: MonthRow; now: Date }) {
  const { monthKey, sessions, completedCount, totalCents, payoutStatus } = month;
  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/5 p-5">
        <div>
          <p className="font-600">{monthLabel(monthKey)}</p>
          <p className="text-sm text-ink/50">
            {completedCount} class{completedCount === 1 ? "" : "es"} · {formatMoney(totalCents)}
          </p>
        </div>
        <span
          className={`badge ${
            payoutStatus === "paid" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
          }`}
        >
          {payoutStatus === "paid" ? "Paid" : "Due"}
        </span>
      </div>

      {sessions.length === 0 ? (
        <p className="p-5 text-sm text-ink/40">No classes assigned this month.</p>
      ) : (
        <ul className="divide-y divide-ink/5 text-sm">
          {sessions.map((s) => (
            <li key={s.id} className="flex items-center justify-between px-5 py-3">
              <span>
                {s.classType.name} · {s.location.name}
              </span>
              <span className="flex items-center gap-3 text-ink/50">
                {formatDay(s.startsAt)} {formatTime(s.startsAt)}
                {s.canceled ? (
                  <span className="badge bg-blush text-magenta-deep">Canceled</span>
                ) : s.startsAt >= now ? (
                  <span className="badge bg-blush/60 text-ink/50">Upcoming</span>
                ) : (
                  <span className="badge bg-emerald-100 text-emerald-700">
                    Completed · {formatMoney(INSTRUCTOR_RATE_CENTS)}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
