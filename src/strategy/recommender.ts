import type {
  NewsItem,
  Market,
  MarketMatch,
  BetRecommendation,
  AgentConfig,
} from "../types/index.js";

export class BetRecommender {
  private config: AgentConfig["trading"];

  constructor(config: AgentConfig["trading"]) {
    this.config = config;
  }

  /**
   * Given a news item and matching markets, produce ranked bet recommendations.
   */
  recommend(
    newsItem: NewsItem,
    matches: MarketMatch[]
  ): BetRecommendation[] {
    const recommendations: BetRecommendation[] = [];

    for (const match of matches) {
      const rec = this.analyzeMarket(newsItem, match);
      if (rec && rec.confidence >= this.config.minConfidence) {
        recommendations.push(rec);
      }
    }

    // Sort by expected value descending
    recommendations.sort((a, b) => b.expectedValue - a.expectedValue);

    return recommendations;
  }

  private analyzeMarket(
    newsItem: NewsItem,
    match: MarketMatch
  ): BetRecommendation | null {
    const { market, relevanceScore } = match;

    if (market.outcomePrices.length < 2) return null;

    const yesPrice = market.outcomePrices[0];
    const noPrice = market.outcomePrices[1] ?? 1 - yesPrice;

    // Determine direction from news sentiment
    const sentiment = this.analyzeSentiment(newsItem, market);

    // Our estimated probability based on news + sentiment
    const side = sentiment.direction;
    const currentPrice = side === "YES" ? yesPrice : noPrice;
    const estimatedProb = sentiment.probability;

    // Edge = our probability - market price
    const edge = estimatedProb - currentPrice;

    // Only recommend if we see positive edge
    if (edge <= 0.01) return null;

    // Confidence = f(relevance, sentiment strength, edge size)
    const confidence = Math.min(
      relevanceScore * 0.3 +
        sentiment.strength * 0.3 +
        Math.min(edge * 2, 0.4),
      1
    );

    // Kelly criterion for position sizing
    const winAmount = (1 - currentPrice) / currentPrice; // payout ratio
    const lossAmount = 1; // lose your stake
    const kellyFraction = this.kellySize(estimatedProb, winAmount, lossAmount);

    // Suggested bet size
    const suggestedSize = Math.min(
      this.config.maxBetSizeUsd * kellyFraction,
      this.config.maxBetSizeUsd
    );

    // Expected value per dollar
    const ev =
      estimatedProb * (1 / currentPrice - 1) - (1 - estimatedProb);

    // Potential payout if we win
    const potentialPayout = suggestedSize / currentPrice;

    return {
      market,
      newsItem,
      side,
      confidence,
      expectedValue: ev,
      kellyFraction,
      suggestedSize: Math.round(suggestedSize * 100) / 100,
      currentPrice,
      potentialPayout: Math.round(potentialPayout * 100) / 100,
      reasoning: this.buildReasoning(newsItem, market, sentiment, edge, ev),
    };
  }

  private analyzeSentiment(
    newsItem: NewsItem,
    market: Market
  ): { direction: "YES" | "NO"; probability: number; strength: number } {
    const newsText = (newsItem.title + " " + newsItem.summary).toLowerCase();
    const question = market.question.toLowerCase();

    // Positive/negative signal words
    const positiveSignals = [
      "confirms", "approved", "passed", "wins", "victory", "deal",
      "agreement", "success", "launches", "announces", "breakthrough",
      "rises", "gains", "surges", "increases", "supports", "endorses",
      "signs", "ratifies", "accepts", "adopts", "achieves", "completes",
    ];
    const negativeSignals = [
      "denies", "rejected", "fails", "loses", "defeat", "collapses",
      "crisis", "scandal", "drops", "falls", "declines", "opposes",
      "blocks", "vetoes", "cancels", "withdraws", "delays", "suspends",
      "threatens", "warns", "cuts", "reduces", "bans", "restricts",
    ];

    let positiveCount = 0;
    let negativeCount = 0;
    for (const word of positiveSignals) {
      if (newsText.includes(word)) positiveCount++;
    }
    for (const word of negativeSignals) {
      if (newsText.includes(word)) negativeCount++;
    }

    // Check if news subject matches market subject
    const subjectOverlap = this.subjectOverlap(newsText, question);

    // Determine direction
    const netSentiment = positiveCount - negativeCount;
    const isQuestionNegative = /won't|not|fail|lose|drop|decrease|ban|block/i.test(
      question
    );

    let direction: "YES" | "NO";
    if (isQuestionNegative) {
      direction = netSentiment < 0 ? "YES" : "NO";
    } else {
      direction = netSentiment >= 0 ? "YES" : "NO";
    }

    // Strength of signal
    const signalCount = positiveCount + negativeCount;
    const strength = Math.min(signalCount / 5, 1) * 0.5 + subjectOverlap * 0.5;

    // Estimated probability (we're conservative — slight edge over market)
    const marketPrice =
      direction === "YES"
        ? market.outcomePrices[0]
        : market.outcomePrices[1] ?? 1 - market.outcomePrices[0];

    // Adjust market price by our edge estimate
    const edgeEstimate = strength * 0.15; // max 15% edge
    const probability = Math.min(
      Math.max(marketPrice + edgeEstimate, 0.05),
      0.95
    );

    return { direction, probability, strength };
  }

  private subjectOverlap(newsText: string, question: string): number {
    const newsWords = new Set(newsText.split(/\s+/).filter((w) => w.length > 3));
    const questionWords = question.split(/\s+/).filter((w) => w.length > 3);

    if (questionWords.length === 0) return 0;

    let overlap = 0;
    for (const word of questionWords) {
      if (newsWords.has(word)) overlap++;
    }

    return Math.min(overlap / questionWords.length, 1);
  }

  private kellySize(
    winProb: number,
    winAmount: number,
    lossAmount: number
  ): number {
    if (lossAmount === 0) return 0;
    const b = winAmount / lossAmount;
    const p = winProb;
    const q = 1 - p;
    const kelly = (b * p - q) / b;

    // Half-Kelly for safety
    return Math.max(0, kelly * this.config.kellyFraction);
  }

  private buildReasoning(
    newsItem: NewsItem,
    market: Market,
    sentiment: { direction: "YES" | "NO"; probability: number; strength: number },
    edge: number,
    ev: number
  ): string {
    const parts: string[] = [];

    parts.push(`News: "${newsItem.title}"`);
    parts.push(`Market: "${market.question}"`);
    parts.push(
      `Signal: ${sentiment.direction} (strength: ${(sentiment.strength * 100).toFixed(0)}%)`
    );
    parts.push(
      `Our prob: ${(sentiment.probability * 100).toFixed(1)}% vs market: ${(market.outcomePrices[sentiment.direction === "YES" ? 0 : 1] * 100).toFixed(1)}%`
    );
    parts.push(`Edge: ${(edge * 100).toFixed(1)}%`);
    parts.push(`EV per $1: $${ev.toFixed(3)}`);

    return parts.join(" | ");
  }
}
