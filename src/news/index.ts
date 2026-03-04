import type { NewsItem, AgentConfig } from "../types/index.js";
import { fetchRssFeeds } from "./rss.js";
import { fetchAllTelegramChannels } from "./telegram.js";
import { WebScraper } from "./scraper.js";

export class NewsAggregator {
  private scraper: WebScraper;
  private config: AgentConfig;

  constructor(config: AgentConfig) {
    this.config = config;
    this.scraper = new WebScraper(config.firecrawl.apiKey);
  }

  async fetchAll(): Promise<NewsItem[]> {
    const [rssItems, telegramItems] = await Promise.allSettled([
      fetchRssFeeds(this.config.news.rssFeeds),
      fetchAllTelegramChannels(this.config.telegram.channels),
    ]);

    const items: NewsItem[] = [];

    if (rssItems.status === "fulfilled") {
      items.push(...rssItems.value);
    } else {
      console.error("[news] RSS fetch failed:", rssItems.reason);
    }

    if (telegramItems.status === "fulfilled") {
      items.push(...telegramItems.value);
    } else {
      console.error("[news] Telegram fetch failed:", telegramItems.reason);
    }

    // Deduplicate by similar titles
    const seen = new Set<string>();
    const deduped = items.filter((item) => {
      const key = item.title.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 50);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Sort newest first
    deduped.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());

    return deduped;
  }

  async scrapeUrl(url: string): Promise<NewsItem | null> {
    return this.scraper.scrapeUrl(url);
  }
}

export { fetchRssFeeds } from "./rss.js";
export { fetchAllTelegramChannels, isTelegramConfigured } from "./telegram.js";
export { WebScraper } from "./scraper.js";
