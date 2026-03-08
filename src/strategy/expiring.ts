import type { Market, NewsItem, MarketMatch, BetRecommendation } from "../types/index.js";
import { PolymarketClient } from "../clients/polymarket.js";
import { MarketMatcher } from "../matcher/index.js";
import { BetRecommender } from "./recommender.js";
import type { AgentConfig } from "../types/index.js";

export interface ExpiringMarket {
  market: Market;
  hoursUntilExpiry: number;
  yesPrice: number;
  noPrice: number;
  spread: number;
  urgency: "imminent" | "today" | "tonight";
}

export interface PricingAnomaly {
  market: Market;
  hoursUntilExpiry: number;
  type: "arb" | "uncertain" | "mispriced-sum";
  detail: string;
  yesPrice: number;
  noPrice: number;
  priceSum: number;
}

export interface ExpiringScanResult {
  scannedAt: string;
  totalActive: number;
  expiringToday: ExpiringMarket[];
  recommendations: BetRecommendation[];
  anomalies: PricingAnomaly[];
}

/**
 * Scan for markets expiring today, sorted by time remaining.
 * Cross-reference with news to find edge opportunities.
 */
export async function scanExpiringMarkets(
  client: PolymarketClient,
  matcher: MarketMatcher,
  recommender: BetRecommender,
  newsItems: NewsItem[],
  opts: { hoursAhead?: number; minLiquidity?: number; minEdge?: number } = {}
): Promise<ExpiringScanResult> {
  const hoursAhead = opts.hoursAhead ?? 24;
  const minLiquidity = opts.minLiquidity ?? 500;
  const minEdge = opts.minEdge ?? 0.01;

  const now = new Date();
  const cutoff = new Date(now.getTime() + hoursAhead * 60 * 60 * 1000);

  // Fetch large batch of active markets
  const pages = await Promise.all([
    client.getActiveMarkets({ limit: 500, offset: 0 }),
    client.getActiveMarkets({ limit: 500, offset: 500 }),
  ]);
  const allMarkets = pages.flat();

  // Filter to markets ending between now and cutoff
  const expiring: ExpiringMarket[] = [];
  for (const market of allMarkets) {
    if (!market.endDate || market.closed || !market.active) continue;

    const endDate = new Date(market.endDate);
    if (isNaN(endDate.getTime())) continue;
    if (endDate <= now || endDate > cutoff) continue;
    if (market.liquidity < minLiquidity) continue;
    if (market.outcomePrices.length < 2) continue;

    const hoursUntilExpiry = (endDate.getTime() - now.getTime()) / (1000 * 60 * 60);
    const yesPrice = market.outcomePrices[0];
    const noPrice = market.outcomePrices[1] ?? 1 - yesPrice;
    const spread = Math.abs(yesPrice + noPrice - 1);

    let urgency: ExpiringMarket["urgency"];
    if (hoursUntilExpiry <= 3) urgency = "imminent";
    else if (hoursUntilExpiry <= 8) urgency = "today";
    else urgency = "tonight";

    expiring.push({ market, hoursUntilExpiry, yesPrice, noPrice, spread, urgency });
  }

  // Sort by soonest first
  expiring.sort((a, b) => a.hoursUntilExpiry - b.hoursUntilExpiry);

  // Match news to expiring markets and generate recommendations
  const recommendations: BetRecommendation[] = [];

  for (const exp of expiring) {
    // Try matching each news item against this specific market
    const matches: MarketMatch[] = [];

    for (const newsItem of newsItems) {
      const score = scoreNewsToMarket(newsItem, exp.market);
      if (score > 0.1) {
        matches.push({
          market: exp.market,
          relevanceScore: score,
          matchedKeywords: extractOverlap(newsItem, exp.market),
        });
      }
    }

    if (matches.length === 0) continue;

    // Use the best-matching news item for recommendation
    matches.sort((a, b) => b.relevanceScore - a.relevanceScore);
    const bestMatch = matches[0];

    // Find the corresponding news item
    const bestNews = newsItems.find((n) => {
      const score = scoreNewsToMarket(n, exp.market);
      return score === bestMatch.relevanceScore;
    });

    if (!bestNews) continue;

    const recs = recommender.recommend(bestNews, [bestMatch]);
    for (const rec of recs) {
      if (Math.abs(rec.currentPrice - (rec.side === "YES" ? exp.yesPrice : exp.noPrice)) < 0.01) {
        // Edge must be meaningful
        const edge = rec.expectedValue;
        if (edge >= minEdge) {
          recommendations.push(rec);
        }
      } else {
        recommendations.push(rec);
      }
    }
  }

  // Deduplicate by market id, keep highest EV
  const seen = new Map<string, BetRecommendation>();
  for (const rec of recommendations) {
    const existing = seen.get(rec.market.id);
    if (!existing || rec.expectedValue > existing.expectedValue) {
      seen.set(rec.market.id, rec);
    }
  }

  const dedupedRecs = [...seen.values()].sort((a, b) => b.expectedValue - a.expectedValue);

  // Detect pricing anomalies on expiring markets
  const anomalies: PricingAnomaly[] = [];
  for (const exp of expiring) {
    const priceSum = exp.yesPrice + exp.noPrice;

    // Arb: YES + NO < 0.98 (can buy both sides for less than $1)
    if (priceSum < 0.98) {
      anomalies.push({
        market: exp.market,
        hoursUntilExpiry: exp.hoursUntilExpiry,
        type: "arb",
        detail: `YES+NO = ${(priceSum * 100).toFixed(1)}¢ — buy both for guaranteed ${((1 - priceSum) * 100).toFixed(1)}¢ profit`,
        yesPrice: exp.yesPrice,
        noPrice: exp.noPrice,
        priceSum,
      });
    }

    // Mispriced sum: YES + NO > 1.02
    if (priceSum > 1.02) {
      anomalies.push({
        market: exp.market,
        hoursUntilExpiry: exp.hoursUntilExpiry,
        type: "mispriced-sum",
        detail: `YES+NO = ${(priceSum * 100).toFixed(1)}¢ — overpriced by ${((priceSum - 1) * 100).toFixed(1)}¢`,
        yesPrice: exp.yesPrice,
        noPrice: exp.noPrice,
        priceSum,
      });
    }

    // Uncertain: price between 35-65% with high volume — most interesting to trade
    if (exp.yesPrice >= 0.35 && exp.yesPrice <= 0.65 && exp.market.volume > 5000) {
      anomalies.push({
        market: exp.market,
        hoursUntilExpiry: exp.hoursUntilExpiry,
        type: "uncertain",
        detail: `YES at ${(exp.yesPrice * 100).toFixed(0)}¢ with $${formatNum(exp.market.volume)} volume — high uncertainty near expiry`,
        yesPrice: exp.yesPrice,
        noPrice: exp.noPrice,
        priceSum,
      });
    }
  }

  anomalies.sort((a, b) => {
    // Arbs first, then uncertain, then mispriced
    const typeOrder = { arb: 0, uncertain: 1, "mispriced-sum": 2 };
    return typeOrder[a.type] - typeOrder[b.type] || a.hoursUntilExpiry - b.hoursUntilExpiry;
  });

  return {
    scannedAt: now.toISOString(),
    totalActive: allMarkets.length,
    expiringToday: expiring,
    recommendations: dedupedRecs,
    anomalies,
  };
}

function formatNum(v: number): string {
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + "M";
  if (v >= 1_000) return (v / 1_000).toFixed(1) + "K";
  return v.toFixed(0);
}

function scoreNewsToMarket(newsItem: NewsItem, market: Market): number {
  const newsText = (newsItem.title + " " + newsItem.summary + " " + newsItem.keywords.join(" ")).toLowerCase();
  const marketText = (market.question + " " + market.description).toLowerCase();

  const newsWords = new Set(newsText.split(/\s+/).filter((w) => w.length > 3));
  const marketWords = marketText.split(/\s+/).filter((w) => w.length > 3);

  let overlap = 0;
  for (const word of marketWords) {
    if (newsWords.has(word)) overlap++;
  }

  const keywordScore = marketWords.length > 0 ? Math.min(overlap / 4, 1) : 0;

  // Entity bonus: check for proper nouns from news in market text
  const entities = (newsItem.title + " " + newsItem.summary).match(/(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/g) ?? [];
  let entityBonus = 0;
  for (const entity of entities) {
    if (marketText.includes(entity.toLowerCase())) {
      entityBonus += 0.3;
    }
  }
  entityBonus = Math.min(entityBonus, 0.5);

  return Math.min(keywordScore * 0.5 + entityBonus, 1);
}

function extractOverlap(newsItem: NewsItem, market: Market): string[] {
  const newsWords = new Set(
    (newsItem.title + " " + newsItem.summary).toLowerCase().split(/\s+/).filter((w) => w.length > 3)
  );
  const marketWords = (market.question + " " + market.description).toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  const matched: string[] = [];
  for (const word of marketWords) {
    if (newsWords.has(word)) matched.push(word);
  }
  return [...new Set(matched)];
}
