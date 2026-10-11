import type { Agent } from "@/lib/store";

/** Klucze w ustawieniach, w których admin zapisuje TOP 1/2/3 agentów. */
export const TOP_AGENT_KEYS = ["agent_top1", "agent_top2", "agent_top3"] as const;

/** 1, 2, 3 dla agenta z podium; 0 dla pozostałych. */
export function agentRank(agent: Agent, settings?: Record<string, string> | null): 0 | 1 | 2 | 3 {
  const idx = TOP_AGENT_KEYS.findIndex((k) => (settings?.[k] ?? "") === agent.id);
  return (idx < 0 ? 0 : idx + 1) as 0 | 1 | 2 | 3;
}

/** Agenci z podium na początku listy, reszta w dotychczasowej kolejności. */
export function sortAgentsByRank<T extends Agent>(
  agents: T[],
  settings?: Record<string, string> | null,
): T[] {
  return agents
    .map((a, i) => ({ a, i, r: agentRank(a, settings) }))
    .sort((x, y) => (x.r || 9) - (y.r || 9) || x.i - y.i)
    .map((x) => x.a);
}

/** Styl malutkiej blaszki #1 / #2 / #3 (złoto, srebro, brąz). */
export function rankBadgeClass(rank: 1 | 2 | 3): string {
  if (rank === 1)
    return "bg-gradient-to-br from-[#f7d774] to-[#b98a1d] text-[#2a1c00] shadow-[0_0_6px_rgba(247,215,116,0.7)]";
  if (rank === 2) return "bg-gradient-to-br from-[#e6e8ec] to-[#9aa0a8] text-[#1b1d20]";
  return "bg-gradient-to-br from-[#e0a679] to-[#94592b] text-[#2a1500]";
}
