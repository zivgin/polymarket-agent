import axios, { type AxiosInstance } from "axios";
import type { Market, OrderBook, Token, TrendingEvent, CategorySummary } from "../types/index.js";

const GAMMA_BASE = "https://gamma-api.polymarket.com";
const CLOB_BASE = "https://clob.polymarket.com";

export class PolymarketClient {
  private gamma: AxiosInstance;
  private clob: AxiosInstance;

  constructor(private apiKey?: string) {
    this.gamma = axios.create({
      baseURL: GAMMA_BASE,
      timeout: 15_000,
    });

    this.clob = axios.create({
      baseURL: CLOB_BASE,
      timeout: 15_000,
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
    });
  }

  // ── Market Discovery (Gamma API - no auth needed) ──

  async getActiveMarkets(params?: {
    limit?: number;
    offset?: number;
    order?: string;
    ascending?: boolean;
    tag?: string;
  }): Promise<Market[]> {
    const { data } = await this.gamma.get("/markets", {
      params: {
        active: true,
        closed: false,
        limit: params?.limit ?? 100,
        offset: params?.offset ?? 0,
        order: params?.order ?? "volume",
        ascending: params?.ascending ?? false,
        ...(params?.tag ? { tag: params.tag } : {}),
      },
    });
    return this.normalizeMarkets(data);
  }

  async searchMarkets(query: string, limit = 50): Promise<Market[]> {
    // Gamma API doesn't support text search well,
    // so we fetch multiple pages and filter client-side
    const pages = await Promise.all([
      this.gamma.get("/markets", { params: { active: true, closed: false, limit: 500, offset: 0 } }),
      this.gamma.get("/markets", { params: { active: true, closed: false, limit: 500, offset: 500 } }),
    ]);

    const allRaw = pages.flatMap((p) => p.data);
    const markets = this.normalizeMarkets(allRaw);
    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/).filter((w) => w.length > 2);

    // Score and filter by relevance to query
    const scored = markets
      .map((m) => {
        const text = (m.question + " " + m.description + " " + m.tags.join(" ")).toLowerCase();
        let score = 0;
        for (const word of queryWords) {
          if (text.includes(word)) score++;
        }
        // Exact phrase match bonus
        if (text.includes(queryLower)) score += queryWords.length;
        return { market: m, score };
      })
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score || b.market.volume - a.market.volume)
      .slice(0, limit)
      .map((s) => s.market);

    return scored;
  }

  async getEvent(slugOrId: string): Promise<any> {
    const { data } = await this.gamma.get(`/events/${slugOrId}`);
    return data;
  }

  async getEvents(params?: {
    limit?: number;
    active?: boolean;
    tag?: string;
  }): Promise<any[]> {
    const { data } = await this.gamma.get("/events", {
      params: {
        active: params?.active ?? true,
        limit: params?.limit ?? 50,
        ...(params?.tag ? { tag: params.tag } : {}),
      },
    });
    return data;
  }

  // ── Price & Order Book (CLOB API - no auth for reads) ──

  async getPrice(tokenId: string, side: "BUY" | "SELL" = "BUY"): Promise<number> {
    const { data } = await this.clob.get("/price", {
      params: { token_id: tokenId, side },
    });
    return Number(data.price);
  }

  async getMidpoint(tokenId: string): Promise<number> {
    const { data } = await this.clob.get("/midpoint", {
      params: { token_id: tokenId },
    });
    return Number(data.mid);
  }

  async getOrderBook(tokenId: string): Promise<OrderBook> {
    const { data } = await this.clob.get("/book", {
      params: { token_id: tokenId },
    });

    const bids = (data.bids ?? []).map((b: any) => ({
      price: Number(b.price),
      size: Number(b.size),
    }));
    const asks = (data.asks ?? []).map((a: any) => ({
      price: Number(a.price),
      size: Number(a.size),
    }));

    const bestBid = bids[0]?.price ?? 0;
    const bestAsk = asks[0]?.price ?? 1;

    return {
      bids,
      asks,
      spread: bestAsk - bestBid,
      midpoint: (bestBid + bestAsk) / 2,
    };
  }

  async getMarketByConditionId(conditionId: string): Promise<Market | null> {
    const { data } = await this.gamma.get("/markets", {
      params: { condition_id: conditionId },
    });
    const markets = this.normalizeMarkets(data);
    return markets[0] ?? null;
  }

  // ── Bulk operations ──

  async getTopMarkets(count = 20): Promise<Market[]> {
    // Fetch large batch and sort client-side (API ordering unreliable)
    const markets = await this.getActiveMarkets({ limit: 500 });
    return markets
      .sort((a, b) => b.volume - a.volume)
      .slice(0, count);
  }

  async getMarketsByCategory(category: string, limit = 30): Promise<Market[]> {
    const markets = await this.getActiveMarkets({ limit: 500 });
    const catLower = category.toLowerCase();
    return markets
      .filter(
        (m) =>
          m.category.toLowerCase().includes(catLower) ||
          m.tags.some((t) => t.toLowerCase().includes(catLower)) ||
          m.question.toLowerCase().includes(catLower)
      )
      .sort((a, b) => b.volume - a.volume)
      .slice(0, limit);
  }

  // ── Market Detail (slug / ID resolution) ──

  async getMarketBySlug(slug: string): Promise<Market | null> {
    try {
      const { data } = await this.gamma.get(`/markets/${slug}`);
      if (!data) return null;
      const markets = this.normalizeMarkets(Array.isArray(data) ? data : [data]);
      return markets[0] ?? null;
    } catch {
      // Try searching by slug as fallback
      const markets = await this.getActiveMarkets({ limit: 500 });
      return markets.find((m) => m.slug === slug || m.id === slug) ?? null;
    }
  }

  // ── Trending & Categories ──

  async getTrendingEvents(limit = 20): Promise<TrendingEvent[]> {
    const events = await this.getEvents({ limit: 100, active: true });

    const trending: TrendingEvent[] = events
      .map((e: any) => {
        const markets = this.normalizeMarkets(e.markets ?? []);
        const volume = markets.reduce((s, m) => s + m.volume, 0);
        const liquidity = markets.reduce((s, m) => s + m.liquidity, 0);
        return {
          id: e.id ?? "",
          title: e.title ?? e.slug ?? "",
          slug: e.slug ?? "",
          volume,
          liquidity,
          marketCount: markets.length,
          category: (typeof e.tags?.[0] === "string" ? e.tags[0] : e.tags?.[0]?.label ?? e.tags?.[0]?.slug ?? markets[0]?.category) ?? "",
          markets,
        };
      })
      .sort((a: TrendingEvent, b: TrendingEvent) => b.volume - a.volume)
      .slice(0, limit);

    return trending;
  }

  async getCategories(): Promise<CategorySummary[]> {
    const markets = await this.getActiveMarkets({ limit: 500 });
    const catMap = new Map<string, { markets: Market[]; volume: number }>();

    for (const m of markets) {
      const cat = m.category || "Other";
      const entry = catMap.get(cat) ?? { markets: [], volume: 0 };
      entry.markets.push(m);
      entry.volume += m.volume;
      catMap.set(cat, entry);
    }

    const categories: CategorySummary[] = [];
    for (const [name, { markets: catMarkets, volume }] of catMap) {
      catMarkets.sort((a, b) => b.volume - a.volume);
      categories.push({
        name,
        marketCount: catMarkets.length,
        totalVolume: volume,
        topMarkets: catMarkets.slice(0, 3),
      });
    }

    categories.sort((a, b) => b.totalVolume - a.totalVolume);
    return categories;
  }

  // ── Normalization ──

  private normalizeMarkets(raw: any[]): Market[] {
    if (!Array.isArray(raw)) return [];

    return raw.map((m) => {
      const outcomePrices = this.parseOutcomePrices(m.outcomePrices);
      const tokens: Token[] = (m.tokens ?? []).map((t: any, i: number) => ({
        token_id: t.token_id ?? "",
        outcome: t.outcome ?? m.outcomes?.[i] ?? `Outcome ${i}`,
        price: outcomePrices[i] ?? 0,
        winner: t.winner ?? false,
      }));

      return {
        id: m.id ?? m.condition_id ?? "",
        question: m.question ?? "",
        slug: m.slug ?? "",
        category: m.category || (typeof m.tags?.[0] === "string" ? m.tags[0] : m.tags?.[0]?.label ?? m.tags?.[0]?.slug ?? "") || "",
        endDate: m.end_date_iso ?? m.endDate ?? "",
        active: m.active ?? true,
        closed: m.closed ?? false,
        tokens,
        volume: Number(m.volume ?? m.volumeNum ?? 0),
        liquidity: Number(m.liquidity ?? m.liquidityNum ?? 0),
        outcomes: m.outcomes ?? tokens.map((t) => t.outcome),
        outcomePrices,
        description: m.description ?? "",
        tags: m.tags ?? [],
      };
    });
  }

  private parseOutcomePrices(raw: any): number[] {
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
}
