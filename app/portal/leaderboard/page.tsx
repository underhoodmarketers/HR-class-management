import { requireUser } from "@/lib/guards";
import { getCurrentMonthLeaderboard, getLastMonthChampion } from "@/lib/leaderboard";
import Leaderboard from "@/components/Leaderboard";

export const dynamic = "force-dynamic";

export default async function PortalLeaderboardPage() {
  await requireUser();
  const [current, lastMonth] = await Promise.all([
    getCurrentMonthLeaderboard(),
    getLastMonthChampion(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-600">Leaderboard</h1>
        <p className="text-sm text-ink/50">
          Your attendance rate this month, against classes held at your own studio(s).
        </p>
      </div>
      <Leaderboard currentLabel={current.label} rows={current.rows} lastMonth={lastMonth} />
    </div>
  );
}
