// ── Multi-Market Correlation ──
// Group related markets via events, check probability sums for anomalies

import type { PolymarketClient } from "../clients/polymarket.js";
import type { Market } from "../types/index.js";

export interface CorrelationGroup {
  eventTitle: string;
  eventId: string;
  markets: Market[];
  totalYesProb: number;
  anomaly: boolean;
  anomalyType?: "over" | "under";
  deviation: number; // how far from 1.0 for exclusive outcomes
}

export class CorrelationAnalyzer {
  constructor(private client: PolymarketClient) {}

  async analyze(query?: string): Promise<CorrelationGroup[]> {
    const events = await this.client.getEvents({
      limit: 50,
      active: true,
      ...(query ? { tag: query } : {}),
    });

    const groups: CorrelationGroup[] = [];

    for (const event of events) {
      const markets: Market[] = (event.markets ?? []).map((m: any) => this.normalizeEventMarket(m));

      if (markets.length < 2) continue;

      const totalYesProb = markets.reduce((sum, m) => {
        return sum + (m.outcomePrices[0] ?? 0);
      }, 0);

      const deviation = Math.abs(totalYesProb - 1.0);
      const anomaly = deviation > 0.05; // >5% deviation from sum=1
      const anomalyType = totalYesProb > 1.05 ? "over" : totalYesProb < 0.95 ? "under" : undefined;

      groups.push({
        eventTitle: event.title ?? event.slug ?? "Unknown",
        eventId: event.id ?? "",
        markets,
        totalYesProb,
        anomaly,
        anomalyType,
        deviation,
      });
    }

    // Sort: anomalies first, then by deviation
    groups.sort((a, b) => {
      if (a.anomaly !== b.anomaly) return a.anomaly ? -1 : 1;
      return b.deviation - a.deviation;
    });

    return groups;
  }

  private normalizeEventMarket(m: any): Market {
    const outcomePrices = this.parseOutcomePrices(m.outcomePrices);
    const tokens = (m.tokens ?? []).map((t: any, i: number) => ({
      token_id: t.token_id ?? "",
      outcome: t.outcome ?? m.outcomes?.[i] ?? `Outcome ${i}`,
      price: outcomePrices[i] ?? 0,
      winner: t.winner ?? false,
    }));

    return {
      id: m.id ?? m.condition_id ?? "",
      question: m.question ?? "",
      slug: m.slug ?? "",
      category: m.category ?? m.tags?.[0] ?? "",
      endDate: m.end_date_iso ?? m.endDate ?? "",
      active: m.active ?? true,
      closed: m.closed ?? false,
      tokens,
      volume: Number(m.volume ?? m.volumeNum ?? 0),
      liquidity: Number(m.liquidity ?? m.liquidityNum ?? 0),
      outcomes: m.outcomes ?? tokens.map((t: any) => t.outcome),
      outcomePrices,
      description: m.description ?? "",
      tags: m.tags ?? [],
    };
  }

  private parseOutcomePrices(raw: any): number[] {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.map(Number);
    if (typeof raw === "string") {
      try { return JSON.parse(raw).map(Number); } catch { return []; }
    }
    return [];
  }
}
