import { getCurrentMonthLeaderboard, getLastMonthWinners } from "@/lib/leaderboard";
import Leaderboard from "@/components/Leaderboard";

export const dynamic = "force-dynamic";

export default async function AdminLeaderboardPage() {
  const [current, lastMonth] = await Promise.all([
    getCurrentMonthLeaderboard(),
    getLastMonthWinners(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-600">Leaderboard</h1>
        <p className="text-sm text-ink/50">Classes attended, by studio.</p>
      </div>
      <Leaderboard currentLabel={current.label} boards={current.boards} lastMonth={lastMonth} />
    </div>
  );
}
