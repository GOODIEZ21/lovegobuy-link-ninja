import { rankBadgeClass } from "@/lib/agentRank";

/** Malutka blaszka #1 / #2 / #3 w prawym górnym rogu karty agenta. */
export function AgentRankBadge({ rank }: { rank: 0 | 1 | 2 | 3 }) {
  if (!rank) return null;
  return (
    <span
      title={`TOP ${rank}`}
      className={`pointer-events-none absolute right-1 top-1 rounded-[4px] px-1 py-[1px] text-[9px] font-black leading-none tracking-tight ${rankBadgeClass(rank)}`}
    >
      #{rank}
    </span>
  );
}
