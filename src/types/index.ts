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

// ── Trending / Categories ──

export interface TrendingEvent {
  id: string;
  title: string;
  slug: string;
  volume: number;
  liquidity: number;
  marketCount: number;
  category: string;
  markets: Market[];
}

export interface CategorySummary {
  name: string;
  marketCount: number;
  totalVolume: number;
  topMarkets: Market[];
}

// ── Momentum ──

export interface PriceSnapshot {
  marketId: string;
  price: number;
  timestamp: number;
}

export interface MomentumResult {
  marketId: string;
  question: string;
  currentPrice: number;
  deltas: { "1h": number | null; "6h": number | null; "24h": number | null; "7d": number | null };
  trend: "up" | "down" | "flat";
  sparkline: string;
  snapshots: PriceSnapshot[];
}

// ── Backtest ──

export interface CalibrationBucket {
  range: string;
  predicted: number;
  actual: number;
  count: number;
}

export interface BacktestResult {
  totalRecs: number;
  resolved: number;
  correct: number;
  incorrect: number;
  hitRate: number;
  totalROI: number;
  brierScore: number;
  calibration: CalibrationBucket[];
  details: BacktestDetail[];
}

export interface BacktestDetail {
  marketQuestion: string;
  side: "YES" | "NO";
  priceAtRec: number;
  confidence: number;
  resolution: "correct" | "incorrect";
  pnl: number;
}

// ── Calendar ──

export interface CalendarMarket {
  market: Market;
  yesPrice: number;
  daysUntil: number;
}

export interface CalendarBucket {
  label: string;
  markets: CalendarMarket[];
}

// ── Liquidity ──

export interface DepthLevel {
  price: number;
  size: number;
  cumulative: number;
}

export interface LiquidityProfile {
  market: Market;
  spread: number;
  midpoint: number;
  bidDepth: DepthLevel[];
  askDepth: DepthLevel[];
  totalBidLiquidity: number;
  totalAskLiquidity: number;
  liquidityScore: number;
}

// ── Social ──

export interface SocialPost {
  title: string;
  score: number;
  comments: number;
  subreddit: string;
  url: string;
  created: number;
}

export interface SocialSignal {
  source: string;
  query: string;
  mentionCount: number;
  sentiment: { pos: number; neg: number; neutral: number };
  topPosts: SocialPost[];
  fetchedAt: string;
}

// ── Event Graph ──

export interface EventTreeMarket {
  market: Market;
  yesPrice: number;
  volume: number;
}

export interface EventTree {
  eventId: string;
  eventTitle: string;
  totalYesProb: number;
  anomaly: boolean;
  markets: EventTreeMarket[];
}

// ── Digest ──

export interface DigestData {
  generatedAt: string;
  watchlistChanges: Array<{ question: string; oldPrice: number; newPrice: number; delta: number }>;
  triggeredAlerts: Array<{ question: string; side: string; threshold: number; currentPrice: number }>;
  newRecommendations: BetRecommendation[];
  resolvedBets: Array<{ question: string; side: string; resolution: string; pnl: number }>;
  upcomingResolutions: Array<{ question: string; yesPrice: number; daysUntil: number }>;
  portfolioSummary: { balance: number; positionsValue: number; totalValue: number; totalPnL: number } | null;
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
