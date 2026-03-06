// ── Resolution Calendar ──
// Group markets by when they resolve

import type { PolymarketClient } from "./clients/polymarket.js";
import type { CalendarBucket, CalendarMarket, Market } from "./types/index.js";
import { getWatchlist } from "./watchlist.js";

export async function getResolutionCalendar(
  client: PolymarketClient,
  opts?: { days?: number; watchlistOnly?: boolean }
): Promise<CalendarBucket[]> {
  const maxDays = opts?.days ?? 90;

  let markets: Market[];
  if (opts?.watchlistOnly) {
    const entries = getWatchlist();
    const fetched: Market[] = [];
    for (const entry of entries) {
      try {
        const results = await client.searchMarkets(entry.question.slice(0, 30), 5);
        const match = results.find((m) => m.id === entry.id || m.slug === entry.slug);
        if (match) fetched.push(match);
      } catch {
        // skip
      }
    }
    markets = fetched;
  } else {
    markets = await client.getActiveMarkets({ limit: 500 });
  }

  const now = Date.now();
  const calendarMarkets: CalendarMarket[] = [];

  for (const m of markets) {
    if (!m.endDate) continue;
    const endMs = new Date(m.endDate).getTime();
    if (isNaN(endMs)) continue;
    const daysUntil = Math.ceil((endMs - now) / (24 * 3_600_000));
    if (daysUntil < 0 || daysUntil > maxDays) continue;

    calendarMarkets.push({
      market: m,
      yesPrice: m.outcomePrices[0] ?? 0,
      daysUntil,
    });
  }

  calendarMarkets.sort((a, b) => a.daysUntil - b.daysUntil);

  const buckets: CalendarBucket[] = [
    { label: "Today", markets: [] },
    { label: "Tomorrow", markets: [] },
    { label: "This Week (2-7d)", markets: [] },
    { label: "Next Week (8-14d)", markets: [] },
    { label: "This Month (15-30d)", markets: [] },
    { label: "Later (>30d)", markets: [] },
  ];

  for (const cm of calendarMarkets) {
    if (cm.daysUntil <= 0) {
      buckets[0].markets.push(cm);
    } else if (cm.daysUntil === 1) {
      buckets[1].markets.push(cm);
    } else if (cm.daysUntil <= 7) {
      buckets[2].markets.push(cm);
    } else if (cm.daysUntil <= 14) {
      buckets[3].markets.push(cm);
    } else if (cm.daysUntil <= 30) {
      buckets[4].markets.push(cm);
    } else {
      buckets[5].markets.push(cm);
    }
  }

  return buckets.filter((b) => b.markets.length > 0);
}
