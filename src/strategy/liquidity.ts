// ── Liquidity Analyzer ──
// Evaluate market depth, spread, and liquidity quality

import type { PolymarketClient } from "../clients/polymarket.js";
import type { Market, LiquidityProfile, DepthLevel } from "../types/index.js";

export async function analyzeLiquidity(
  client: PolymarketClient,
  markets: Market[]
): Promise<LiquidityProfile[]> {
  const profiles: LiquidityProfile[] = [];

  for (const market of markets) {
    const yesToken = market.tokens.find(
      (t) => t.outcome === "Yes" || t.outcome === "YES"
    );
    if (!yesToken?.token_id) continue;

    try {
      const orderbook = await client.getOrderBook(yesToken.token_id);

      const bidDepth: DepthLevel[] = [];
      let bidCum = 0;
      for (const b of orderbook.bids.slice(0, 10)) {
        bidCum += b.size;
        bidDepth.push({ price: b.price, size: b.size, cumulative: bidCum });
      }

      const askDepth: DepthLevel[] = [];
      let askCum = 0;
      for (const a of orderbook.asks.slice(0, 10)) {
        askCum += a.size;
        askDepth.push({ price: a.price, size: a.size, cumulative: askCum });
      }

      const totalBidLiquidity = bidDepth.reduce((s, d) => s + d.size * d.price, 0);
      const totalAskLiquidity = askDepth.reduce((s, d) => s + d.size * d.price, 0);

      // Composite score: spread tightness (40%), bid depth (30%), ask depth (30%)
      const spreadScore = Math.max(0, 1 - orderbook.spread * 20); // 5¢ spread = 0 score
      const bidScore = Math.min(totalBidLiquidity / 5000, 1); // $5K = max score
      const askScore = Math.min(totalAskLiquidity / 5000, 1);

      const liquidityScore = spreadScore * 0.4 + bidScore * 0.3 + askScore * 0.3;

      profiles.push({
        market,
        spread: orderbook.spread,
        midpoint: orderbook.midpoint,
        bidDepth,
        askDepth,
        totalBidLiquidity,
        totalAskLiquidity,
        liquidityScore,
      });
    } catch {
      // skip markets where orderbook fetch fails
    }
  }

  profiles.sort((a, b) => b.liquidityScore - a.liquidityScore);
  return profiles;
}
