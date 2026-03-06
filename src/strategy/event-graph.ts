// ── Event Graph / Tree ──
// Group markets by event, sum probabilities, detect anomalies

import type { PolymarketClient } from "../clients/polymarket.js";
import type { Market, EventTree, EventTreeMarket } from "../types/index.js";

export async function buildEventTree(
  client: PolymarketClient,
  query?: string,
  limit = 20
): Promise<EventTree[]> {
  const events = await client.getEvents({
    limit: 100,
    active: true,
    ...(query ? { tag: query } : {}),
  });

  const trees: EventTree[] = [];

  for (const event of events) {
    const rawMarkets: any[] = event.markets ?? [];
    if (rawMarkets.length < 2) continue;

    const title = (event.title ?? event.slug ?? "Unknown") as string;

    // Filter by query if provided (search in title)
    if (query && !title.toLowerCase().includes(query.toLowerCase())) {
      // Also check individual market questions
      const anyMatch = rawMarkets.some((m: any) =>
        (m.question ?? "").toLowerCase().includes(query.toLowerCase())
      );
      if (!anyMatch) continue;
    }

    const markets: EventTreeMarket[] = rawMarkets.map((m: any) => {
      const outcomePrices = parseOutcomePrices(m.outcomePrices);
      const yesPrice = outcomePrices[0] ?? 0;
      const volume = Number(m.volume ?? 0);

      const normalized: Market = {
        id: m.id ?? m.condition_id ?? "",
        question: m.question ?? "",
        slug: m.slug ?? "",
        category: m.category ?? "",
        endDate: m.end_date_iso ?? m.endDate ?? "",
        active: m.active ?? true,
        closed: m.closed ?? false,
        tokens: (m.tokens ?? []).map((t: any, i: number) => ({
          token_id: t.token_id ?? "",
          outcome: t.outcome ?? `Outcome ${i}`,
          price: outcomePrices[i] ?? 0,
          winner: t.winner ?? false,
        })),
        volume,
        liquidity: Number(m.liquidity ?? 0),
        outcomes: m.outcomes ?? [],
        outcomePrices,
        description: m.description ?? "",
        tags: m.tags ?? [],
      };

      return { market: normalized, yesPrice, volume };
    });

    const totalYesProb = markets.reduce((sum, m) => sum + m.yesPrice, 0);
    const anomaly = Math.abs(totalYesProb - 1.0) > 0.05;

    trees.push({
      eventId: event.id ?? "",
      eventTitle: title,
      totalYesProb,
      anomaly,
      markets: markets.sort((a, b) => b.yesPrice - a.yesPrice),
    });
  }

  // Sort: anomalies first, then by market count
  trees.sort((a, b) => {
    if (a.anomaly !== b.anomaly) return a.anomaly ? -1 : 1;
    return b.markets.length - a.markets.length;
  });

  return trees.slice(0, limit);
}

function parseOutcomePrices(raw: any): number[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(Number);
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw).map(Number);
    } catch {
      return [];
    }
  }
  return [];
}
