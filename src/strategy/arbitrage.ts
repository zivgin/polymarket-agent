// ── Arbitrage Scanner ──
// Detect YES+NO price sums < 1.0 (buy both sides for guaranteed profit)

import type { PolymarketClient } from "../clients/polymarket.js";
import type { Market, OrderBook } from "../types/index.js";

export interface ArbOpportunity {
  market: Market;
  yesPrice: number;
  noPrice: number;
  totalCost: number;
  profitPerDollar: number;
  profitCents: number;
  deepVerified?: boolean;
  effectiveYes?: number;
  effectiveNo?: number;
}

export class ArbitrageScanner {
  constructor(private client: PolymarketClient) {}

  async scan(opts: {
    minProfitCents?: number;
    deep?: boolean;
    limit?: number;
  } = {}): Promise<ArbOpportunity[]> {
    const { minProfitCents = 1, deep = false, limit = 500 } = opts;

    const markets = await this.client.getActiveMarkets({ limit });
    const opportunities: ArbOpportunity[] = [];

    for (const market of markets) {
      if (market.outcomePrices.length < 2) continue;
      if (market.closed || !market.active) continue;

      const yesPrice = market.outcomePrices[0];
      const noPrice = market.outcomePrices[1] ?? 1 - yesPrice;
      const totalCost = yesPrice + noPrice;

      if (totalCost >= 1.0) continue;

      const profitPerDollar = 1.0 - totalCost;
      const profitCents = Math.round(profitPerDollar * 100);

      if (profitCents < minProfitCents) continue;

      const opp: ArbOpportunity = {
        market,
        yesPrice,
        noPrice,
        totalCost,
        profitPerDollar,
        profitCents,
      };

      opportunities.push(opp);
    }

    // Sort by profit descending
    opportunities.sort((a, b) => b.profitPerDollar - a.profitPerDollar);

    // Deep verification with orderbook if requested
    if (deep) {
      const verified: ArbOpportunity[] = [];
      for (const opp of opportunities.slice(0, 20)) {
        const deepResult = await this.verifyWithOrderbook(opp);
        if (deepResult) verified.push(deepResult);
      }
      return verified;
    }

    return opportunities;
  }

  private async verifyWithOrderbook(opp: ArbOpportunity): Promise<ArbOpportunity | null> {
    try {
      const yesToken = opp.market.tokens.find((t) => t.outcome === "Yes" || t.outcome === "YES");
      const noToken = opp.market.tokens.find((t) => t.outcome === "No" || t.outcome === "NO");

      if (!yesToken || !noToken) return { ...opp, deepVerified: false };

      const [yesBook, noBook] = await Promise.all([
        this.client.getOrderBook(yesToken.token_id),
        this.client.getOrderBook(noToken.token_id),
      ]);

      // Best ask prices (what we'd actually pay)
      const effectiveYes = yesBook.asks[0]?.price ?? opp.yesPrice;
      const effectiveNo = noBook.asks[0]?.price ?? opp.noPrice;
      const effectiveTotal = effectiveYes + effectiveNo;

      if (effectiveTotal >= 1.0) return null;

      return {
        ...opp,
        deepVerified: true,
        effectiveYes,
        effectiveNo,
        totalCost: effectiveTotal,
        profitPerDollar: 1.0 - effectiveTotal,
        profitCents: Math.round((1.0 - effectiveTotal) * 100),
      };
    } catch {
      return { ...opp, deepVerified: false };
    }
  }
}
