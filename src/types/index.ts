// ── Core domain types ──

export interface Market {
  id: string;
  question: string;
  slug: string;
  category: string;
  endDate: string;
  active: boolean;
  closed: boolean;
  tokens: Token[];
  volume: number;
  liquidity: number;
  outcomes: string[];
  outcomePrices: number[];
  description: string;
  tags: string[];
}

export interface Token {
  token_id: string;
  outcome: string;
  price: number;
  winner: boolean;
}

export interface OrderBook {
  bids: OrderBookEntry[];
  asks: OrderBookEntry[];
  spread: number;
  midpoint: number;
}

export interface OrderBookEntry {
  price: number;
  size: number;
}

// ── News types ──

export interface NewsItem {
  id: string;
  title: string;
  summary: string;
  source: NewsSource;
  url?: string;
  publishedAt: Date;
  keywords: string[];
  rawContent?: string;
}

export type NewsSource =
  | { type: "rss"; feed: string }
  | { type: "telegram"; channel: string }
  | { type: "web"; site: string };

// ── Matching & Recommendation types ──

export interface MarketMatch {
  market: Market;
  relevanceScore: number; // 0-1
  matchedKeywords: string[];
}

export interface BetRecommendation {
  market: Market;
  newsItem: NewsItem;
  side: "YES" | "NO";
  confidence: number; // 0-1
  expectedValue: number;
  kellyFraction: number;
  suggestedSize: number;
  currentPrice: number;
  potentialPayout: number;
  reasoning: string;
}

// ── Config ──

export interface AgentConfig {
  polymarket: {
    privateKey?: string;
    apiKey?: string;
    apiSecret?: string;
    apiPassphrase?: string;
    funderAddress?: string;
  };
  telegram: {
    apiId?: string;
    apiHash?: string;
    channels: string[];
  };
  firecrawl: {
    apiKey?: string;
  };
  news: {
    rssFeeds: string[];
  };
  trading: {
    maxBetSizeUsd: number;
    minConfidence: number;
    kellyFraction: number;
  };
}
