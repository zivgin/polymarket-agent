import axios from "axios";
import type { NewsItem } from "../types/index.js";

const FIRECRAWL_BASE = "https://api.firecrawl.dev/v1";

export class WebScraper {
  private apiKey?: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey;
  }

  async scrapeUrl(url: string): Promise<NewsItem | null> {
    if (!this.apiKey) {
      console.error("[scraper] No FIRECRAWL_API_KEY configured, skipping scrape");
      return null;
    }

    try {
      const { data } = await axios.post(
        `${FIRECRAWL_BASE}/scrape`,
        {
          url,
          formats: ["markdown"],
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          timeout: 30_000,
        }
      );

      const content = data.data?.markdown ?? "";
      const metadata = data.data?.metadata ?? {};

      return {
        id: `web-${url}`,
        title: metadata.title ?? url,
        summary: content.slice(0, 500),
        source: { type: "web" as const, site: new URL(url).hostname },
        url,
        publishedAt: metadata.publishedTime
          ? new Date(metadata.publishedTime)
          : new Date(),
        keywords: extractKeywords(content),
        rawContent: content.slice(0, 3000),
      };
    } catch (err: any) {
      console.error(`[scraper] Failed to scrape ${url}: ${err.message}`);
      return null;
    }
  }

  async scrapeMultiple(urls: string[]): Promise<NewsItem[]> {
    const results = await Promise.allSettled(
      urls.map((url) => this.scrapeUrl(url))
    );

    return results
      .filter(
        (r): r is PromiseFulfilledResult<NewsItem> =>
          r.status === "fulfilled" && r.value !== null
      )
      .map((r) => r.value);
  }
}

function extractKeywords(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 3);

  const freq = new Map<string, number>();
  for (const w of words) {
    freq.set(w, (freq.get(w) ?? 0) + 1);
  }

  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([word]) => word);
}
