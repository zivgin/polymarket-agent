import type { NewsItem, Market, MarketMatch } from "../types/index.js";
import { PolymarketClient } from "../clients/polymarket.js";

export class MarketMatcher {
  private marketCache: Market[] = [];
  private cacheTime = 0;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor(private client: PolymarketClient) {}

  /**
   * Pre-load markets into cache for faster matching.
   */
  async warmup(): Promise<void> {
    await this.ensureCache();
  }

  private async ensureCache(): Promise<void> {
    if (Date.now() - this.cacheTime < this.CACHE_TTL && this.marketCache.length > 0) {
      return;
    }
    console.log("  Loading markets...");
    this.marketCache = await this.client.getTopMarkets(500);
    this.cacheTime = Date.now();
    console.log(`  Cached ${this.marketCache.length} markets`);
  }

  /**
   * Given a news item, find relevant open markets on Polymarket.
   * Matches against cached market pool for speed + does targeted search.
   */
  async findMatchingMarkets(
    newsItem: NewsItem,
    limit = 10
  ): Promise<MarketMatch[]> {
    await this.ensureCache();

    // Score all cached markets against this news item
    const scored: MarketMatch[] = [];
    for (const market of this.marketCache) {
      if (!market.active || market.closed) continue;
      const { score, matchedKeywords } = this.scoreRelevance(newsItem, market);
      if (score > 0.05) {
        scored.push({
          market,
          relevanceScore: score,
          matchedKeywords,
        });
      }
    }

    // Also do a targeted search with top entities
    const queries = this.buildSearchQueries(newsItem);
    if (queries.length > 0) {
      const searchResults = await Promise.allSettled(
        queries.slice(0, 2).map((q) => this.client.searchMarkets(q, 10))
      );

      const seenIds = new Set(scored.map((s) => s.market.id));
      for (const result of searchResults) {
        if (result.status === "fulfilled") {
          for (const market of result.value) {
            if (market.active && !market.closed && !seenIds.has(market.id)) {
              const { score, matchedKeywords } = this.scoreRelevance(newsItem, market);
              if (score > 0.05) {
                scored.push({ market, relevanceScore: score, matchedKeywords });
                seenIds.add(market.id);
              }
            }
          }
        }
      }
    }

    // Sort by relevance, return top N
    scored.sort((a, b) => b.relevanceScore - a.relevanceScore);
    return scored.slice(0, limit);
  }

  /**
   * Search markets by a direct query string.
   */
  async searchByQuery(query: string, limit = 20): Promise<MarketMatch[]> {
    const markets = await this.client.searchMarkets(query, limit);

    return markets
      .filter((m) => m.active && !m.closed)
      .map((market) => ({
        market,
        relevanceScore: 1,
        matchedKeywords: query.toLowerCase().split(/\s+/),
      }));
  }

  private buildSearchQueries(newsItem: NewsItem): string[] {
    const queries: string[] = [];

    // Extract named entities (capitalized multi-word phrases)
    const entities = this.extractEntities(newsItem.title + " " + newsItem.summary);
    for (const entity of entities.slice(0, 3)) {
      queries.push(entity);
    }

    // Use top keywords as fallback
    if (queries.length === 0) {
      const topKeywords = newsItem.keywords.slice(0, 3);
      if (topKeywords.length > 0) {
        queries.push(topKeywords.join(" "));
      }
    }

    // Also search by title words (simplified)
    const titleWords = newsItem.title
      .replace(/[^a-zA-Z0-9\s]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 3);
    if (titleWords.length >= 2) {
      queries.push(titleWords.slice(0, 4).join(" "));
    }

    return [...new Set(queries)];
  }

  private extractEntities(text: string): string[] {
    // Simple NER: find capitalized word sequences (2+ words)
    const matches = text.match(/(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/g) ?? [];

    // Also grab single important proper nouns
    const singleCaps = text.match(/\b[A-Z][a-z]{2,}\b/g) ?? [];
    const commonWords = new Set([
      "The", "This", "That", "These", "Those", "What", "When", "Where",
      "Why", "How", "Who", "Which", "After", "Before", "During", "Under",
      "Over", "From", "Into", "With", "About", "Between", "Through",
      "Against", "Along", "Among", "Around", "Behind", "Beyond", "Despite",
      "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
      "Sunday", "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
      "New", "Also", "More", "Most", "Some", "Many", "Just", "Now",
    ]);

    const filtered = singleCaps.filter((w) => !commonWords.has(w));

    return [...new Set([...matches, ...filtered])];
  }

  private scoreRelevance(
    newsItem: NewsItem,
    market: Market
  ): { score: number; matchedKeywords: string[] } {
    const newsText = (
      newsItem.title + " " + newsItem.summary + " " + newsItem.keywords.join(" ")
    ).toLowerCase();

    const marketText = (
      market.question + " " + market.description + " " + market.tags.join(" ")
    ).toLowerCase();

    const matchedKeywords: string[] = [];

    // Keyword overlap
    const newsWords = new Set(newsText.split(/\s+/).filter((w) => w.length > 3));
    const marketWords = marketText.split(/\s+/).filter((w) => w.length > 3);

    let overlapCount = 0;
    for (const word of marketWords) {
      if (newsWords.has(word)) {
        overlapCount++;
        matchedKeywords.push(word);
      }
    }

    const keywordScore = Math.min(overlapCount / 5, 1);

    // Entity match bonus
    const entities = this.extractEntities(newsItem.title + " " + newsItem.summary);
    let entityBonus = 0;
    for (const entity of entities) {
      if (marketText.includes(entity.toLowerCase())) {
        entityBonus += 0.3;
        matchedKeywords.push(entity);
      }
    }
    entityBonus = Math.min(entityBonus, 0.5);

    // Volume/liquidity bonus (prefer liquid markets)
    const liquidityBonus = market.liquidity > 10_000 ? 0.1 : 0;

    const score = Math.min(keywordScore * 0.5 + entityBonus + liquidityBonus, 1);

    return { score, matchedKeywords: [...new Set(matchedKeywords)] };
  }
}
