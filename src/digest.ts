// ── Daily Digest Generator ──
// Combine watchlist, alerts, recommendations, resolutions into one report

import type { PolymarketClient } from "./clients/polymarket.js";
import type { NewsAggregator } from "./news/index.js";
import type { MarketMatcher } from "./matcher/index.js";
import type { BetRecommender } from "./strategy/recommender.js";
import type { DigestData, BetRecommendation } from "./types/index.js";
import { getWatchlist } from "./watchlist.js";
import { getAlerts, checkAlerts } from "./alerts.js";
import { getHistory } from "./history.js";
import { getPortfolioValue } from "./portfolio.js";

export async function generateDigest(
  client: PolymarketClient,
  newsAgg: NewsAggregator,
  matcher: MarketMatcher,
  recommender: BetRecommender
): Promise<DigestData> {
  const now = new Date();
  const oneDayAgo = now.getTime() - 24 * 3_600_000;
  const sevenDaysMs = 7 * 24 * 3_600_000;

  // 1. Watchlist price changes
  const watchlistChanges: DigestData["watchlistChanges"] = [];
  const watchlist = getWatchlist();
  for (const entry of watchlist) {
    try {
      const markets = await client.searchMarkets(entry.question.slice(0, 30), 5);
      const match = markets.find((m) => m.id === entry.id || m.slug === entry.slug);
      if (match) {
        const newPrice = match.outcomePrices[0] ?? 0;
        const oldPrice = entry.addedPrice.yes;
        const delta = newPrice - oldPrice;
        if (Math.abs(delta) > 0.01) {
          watchlistChanges.push({
            question: entry.question,
            oldPrice,
            newPrice,
            delta,
          });
        }
      }
    } catch {
      // skip
    }
  }

  // 2. Triggered alerts (last 24h)
  const triggeredAlerts: DigestData["triggeredAlerts"] = [];
  const alerts = getAlerts();
  try {
    const alertResults = await checkAlerts(client);
    for (const r of alertResults) {
      if (r.triggered) {
        triggeredAlerts.push({
          question: r.alert.marketQuestion,
          side: r.alert.side,
          threshold: r.alert.threshold,
          currentPrice: r.currentPrice,
        });
      }
    }
  } catch {
    // skip alert check errors
  }

  // 3. Top 5 new recommendations (mini-scan)
  const newRecommendations: BetRecommendation[] = [];
  try {
    const news = await newsAgg.fetchAll();
    const items = news.slice(0, 10);
    for (const item of items) {
      const matches = await matcher.findMatchingMarkets(item, 5);
      if (matches.length > 0) {
        const recs = recommender.recommend(item, matches);
        newRecommendations.push(...recs);
      }
    }
    newRecommendations.sort((a, b) => b.expectedValue - a.expectedValue);
  } catch {
    // skip scan errors
  }

  // 4. Recently resolved bets
  const resolvedBets: DigestData["resolvedBets"] = [];
  const history = getHistory();
  for (const entry of history) {
    if (
      entry.resolvedAt &&
      new Date(entry.resolvedAt).getTime() > oneDayAgo &&
      (entry.resolution === "correct" || entry.resolution === "incorrect")
    ) {
      const pnl = entry.resolution === "correct"
        ? (1 / entry.priceAtRec - 1) * entry.suggestedSize
        : -entry.suggestedSize;
      resolvedBets.push({
        question: entry.marketQuestion,
        side: entry.side,
        resolution: entry.resolution,
        pnl,
      });
    }
  }

  // 5. Upcoming resolutions (7 days)
  const upcomingResolutions: DigestData["upcomingResolutions"] = [];
  try {
    const markets = await client.getActiveMarkets({ limit: 500 });
    const nowMs = now.getTime();
    for (const m of markets) {
      if (!m.endDate) continue;
      const endMs = new Date(m.endDate).getTime();
      if (isNaN(endMs)) continue;
      const daysUntil = Math.ceil((endMs - nowMs) / (24 * 3_600_000));
      if (daysUntil >= 0 && daysUntil <= 7) {
        upcomingResolutions.push({
          question: m.question,
          yesPrice: m.outcomePrices[0] ?? 0,
          daysUntil,
        });
      }
    }
    upcomingResolutions.sort((a, b) => a.daysUntil - b.daysUntil);
  } catch {
    // skip
  }

  // 6. Portfolio summary
  let portfolioSummary: DigestData["portfolioSummary"] = null;
  try {
    const pv = await getPortfolioValue(client);
    portfolioSummary = {
      balance: pv.balance,
      positionsValue: pv.positionsValue,
      totalValue: pv.totalValue,
      totalPnL: pv.totalPnL,
    };
  } catch {
    // skip
  }

  return {
    generatedAt: now.toISOString(),
    watchlistChanges,
    triggeredAlerts,
    newRecommendations: newRecommendations.slice(0, 5),
    resolvedBets,
    upcomingResolutions: upcomingResolutions.slice(0, 10),
    portfolioSummary,
  };
}

export function digestToMarkdown(digest: DigestData): string {
  const lines: string[] = [];
  const date = new Date(digest.generatedAt).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  lines.push(`# Polymarket Daily Digest`);
  lines.push(`*${date}*\n`);

  // Watchlist
  if (digest.watchlistChanges.length > 0) {
    lines.push(`## Watchlist Changes`);
    for (const w of digest.watchlistChanges) {
      const sign = w.delta >= 0 ? "+" : "";
      lines.push(`- **${w.question}**: ${(w.oldPrice * 100).toFixed(0)}¢ → ${(w.newPrice * 100).toFixed(0)}¢ (${sign}${(w.delta * 100).toFixed(0)}¢)`);
    }
    lines.push("");
  }

  // Alerts
  if (digest.triggeredAlerts.length > 0) {
    lines.push(`## Triggered Alerts`);
    for (const a of digest.triggeredAlerts) {
      lines.push(`- **${a.question}**: ${a.side} now ${(a.currentPrice * 100).toFixed(0)}¢ (threshold: ${(a.threshold * 100).toFixed(0)}¢)`);
    }
    lines.push("");
  }

  // Recommendations
  if (digest.newRecommendations.length > 0) {
    lines.push(`## Top Recommendations`);
    for (const r of digest.newRecommendations) {
      lines.push(`- **${r.side}** ${r.market.question} @ ${(r.currentPrice * 100).toFixed(0)}¢ (conf: ${(r.confidence * 100).toFixed(0)}%, EV: $${r.expectedValue.toFixed(3)})`);
    }
    lines.push("");
  }

  // Resolved
  if (digest.resolvedBets.length > 0) {
    lines.push(`## Recently Resolved`);
    for (const r of digest.resolvedBets) {
      const pnlStr = r.pnl >= 0 ? `+$${r.pnl.toFixed(2)}` : `-$${Math.abs(r.pnl).toFixed(2)}`;
      lines.push(`- ${r.resolution === "correct" ? "✅" : "❌"} **${r.question}** (${r.side}) ${pnlStr}`);
    }
    lines.push("");
  }

  // Upcoming
  if (digest.upcomingResolutions.length > 0) {
    lines.push(`## Upcoming Resolutions (7d)`);
    for (const u of digest.upcomingResolutions) {
      lines.push(`- **${u.question}**: YES ${(u.yesPrice * 100).toFixed(0)}¢ — resolves in ${u.daysUntil}d`);
    }
    lines.push("");
  }

  // Portfolio
  if (digest.portfolioSummary) {
    const p = digest.portfolioSummary;
    const pnlStr = p.totalPnL >= 0 ? `+$${p.totalPnL.toFixed(2)}` : `-$${Math.abs(p.totalPnL).toFixed(2)}`;
    lines.push(`## Portfolio Summary`);
    lines.push(`- Cash: $${p.balance.toFixed(2)}`);
    lines.push(`- Positions: $${p.positionsValue.toFixed(2)}`);
    lines.push(`- Total: $${p.totalValue.toFixed(2)} (${pnlStr})`);
    lines.push("");
  }

  lines.push("---");
  lines.push(`*Generated by polymarket-agent at ${new Date(digest.generatedAt).toLocaleTimeString()}*`);

  return lines.join("\n");
}
