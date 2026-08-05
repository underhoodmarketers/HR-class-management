import type { LocationBoard } from "@/lib/leaderboard";

const MEDALS = ["🥇", "🥈", "🥉"];

export default function Leaderboard({
  currentLabel,
  boards,
  lastMonth,
}: {
  currentLabel: string;
  boards: LocationBoard[];
  lastMonth: {
    label: string;
    winners: { locationId: number; locationName: string; winner: { userName: string; attended: number } }[];
  };
}) {
  return (
    <div className="space-y-6">
      {lastMonth.winners.length > 0 ? (
        <div>
          <h2 className="mb-3 font-600">{lastMonth.label} champions</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {lastMonth.winners.map((w) => (
              <div key={w.locationId} className="card p-5 text-center">
                <p className="text-2xl">🏆</p>
                <p className="mt-1 font-600">{w.winner.userName}</p>
                <p className="text-xs text-ink/50">{w.locationName}</p>
                <p className="mt-1 text-xs text-magenta">
                  {w.winner.attended} class{w.winner.attended === 1 ? "" : "es"} attended
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div>
        <h2 className="mb-3 font-600">{currentLabel} · live</h2>
        <div className="grid gap-6 lg:grid-cols-2">
          {boards.map((board) => (
            <div key={board.locationId} className="card p-6">
              <h3 className="mb-3 font-600">{board.locationName}</h3>
              {board.rows.length === 0 ? (
                <p className="text-sm text-ink/40">No classes attended yet this month.</p>
              ) : (
                <ul className="divide-y divide-ink/5 text-sm">
                  {board.rows.slice(0, 10).map((r, i) => (
                    <li key={r.userId} className="flex items-center justify-between py-2">
                      <span className="flex items-center gap-2">
                        <span className="w-6 text-center">{MEDALS[i] ?? i + 1}</span>
                        {r.userName}
                      </span>
                      <span className="text-xs text-ink/50">
                        {r.attended} class{r.attended === 1 ? "" : "es"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
