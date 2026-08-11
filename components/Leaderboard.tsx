import type { LeaderboardRow } from "@/lib/leaderboard";

const MEDALS = ["🥇", "🥈", "🥉"];

export default function Leaderboard({
  currentLabel,
  rows,
  lastMonth,
  limit,
}: {
  currentLabel: string;
  rows: LeaderboardRow[];
  lastMonth: { label: string; champion: LeaderboardRow | null };
  limit?: number;
}) {
  const visible = limit ? rows.slice(0, limit) : rows;

  return (
    <div className="space-y-6">
      {lastMonth.champion ? (
        <div className="card p-5 text-center">
          <p className="text-2xl">🏆</p>
          <p className="mt-1 font-600">
            {lastMonth.champion.userName}
            <span className="font-400 text-ink/50"> ({lastMonth.champion.locationNames})</span>
          </p>
          <p className="text-xs text-ink/50">{lastMonth.label} champion</p>
          <p className="mt-1 text-xs text-magenta">
            {lastMonth.champion.percent}% attendance ({lastMonth.champion.attended}/
            {lastMonth.champion.possible} classes)
          </p>
        </div>
      ) : null}

      <div>
        <h2 className="mb-3 font-600">{currentLabel} · live</h2>
        <div className="card p-6">
          {visible.length === 0 ? (
            <p className="text-sm text-ink/40">No classes attended yet this month.</p>
          ) : (
            <ul className="divide-y divide-ink/5 text-sm">
              {visible.map((r, i) => (
                <li key={r.userId} className="flex items-center justify-between gap-3 py-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="w-6 shrink-0 text-center">{MEDALS[i] ?? i + 1}</span>
                    <span className="truncate">
                      {r.userName}
                      <span className="text-ink/40"> ({r.locationNames})</span>
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-ink/50">
                    {r.percent}% ({r.attended}/{r.possible})
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
