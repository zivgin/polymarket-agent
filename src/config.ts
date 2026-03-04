import "dotenv/config";
import type { AgentConfig } from "./types/index.js";

const DEFAULT_RSS_FEEDS = [
  "https://rss.nytimes.com/services/xml/rss/nyt/World.xml",
  "https://feeds.bbci.co.uk/news/world/rss.xml",
  "https://www.reutersagency.com/feed/?best-topics=political-general",
  "https://feeds.bloomberg.com/politics/news.rss",
  "https://www.coindesk.com/arc/outboundfeeds/rss/",
  "https://cointelegraph.com/rss",
  "https://decrypt.co/feed",
];

const DEFAULT_TELEGRAM_CHANNELS = [
  "polyaborygen",
  "WhaleTrades",
  "cryptonews",
];

export function loadConfig(): AgentConfig {
  const env = process.env;

  return {
    polymarket: {
      privateKey: env.POLYMARKET_PRIVATE_KEY,
      apiKey: env.POLYMARKET_API_KEY,
      apiSecret: env.POLYMARKET_API_SECRET,
      apiPassphrase: env.POLYMARKET_API_PASSPHRASE,
      funderAddress: env.POLYMARKET_FUNDER_ADDRESS,
    },
    telegram: {
      apiId: env.TELEGRAM_API_ID,
      apiHash: env.TELEGRAM_API_HASH,
      channels: DEFAULT_TELEGRAM_CHANNELS,
    },
    firecrawl: {
      apiKey: env.FIRECRAWL_API_KEY,
    },
    news: {
      rssFeeds: env.NEWS_RSS_FEEDS
        ? env.NEWS_RSS_FEEDS.split(",").map((s) => s.trim())
        : DEFAULT_RSS_FEEDS,
    },
    trading: {
      maxBetSizeUsd: Number(env.MAX_BET_SIZE_USD) || 10,
      minConfidence: Number(env.MIN_CONFIDENCE) || 0.6,
      kellyFraction: Number(env.KELLY_FRACTION) || 0.5,
    },
  };
}
