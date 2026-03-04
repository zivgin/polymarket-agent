import Parser from "rss-parser";
import type { NewsItem } from "../types/index.js";

const parser = new Parser({
  timeout: 10_000,
  headers: {
    "User-Agent": "polymarket-agent/0.1",
    Accept: "application/rss+xml, application/xml, text/xml",
  },
});

export async function fetchRssFeeds(feedUrls: string[]): Promise<NewsItem[]> {
  const results = await Promise.allSettled(
    feedUrls.map((url) => fetchSingleFeed(url))
  );

  const items: NewsItem[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      items.push(...result.value);
    }
  }

  // Sort by date, newest first
  items.sort(
    (a, b) => b.publishedAt.getTime() - a.publishedAt.getTime()
  );

  return items;
}

async function fetchSingleFeed(url: string): Promise<NewsItem[]> {
  const feed = await parser.parseURL(url);
  const feedName = feed.title ?? url;

  return (feed.items ?? []).map((item) => {
    const title = item.title ?? "";
    const summary = stripHtml(item.contentSnippet ?? item.content ?? "");

    return {
      id: item.guid ?? item.link ?? `${feedName}-${title}`,
      title,
      summary: summary.slice(0, 500),
      source: { type: "rss" as const, feed: feedName },
      url: item.link,
      publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
      keywords: extractKeywords(title + " " + summary),
      rawContent: summary,
    };
  });
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "shall", "can", "to", "of", "in", "for",
    "on", "with", "at", "by", "from", "as", "into", "through", "during",
    "before", "after", "above", "below", "between", "and", "but", "or",
    "not", "no", "nor", "so", "yet", "both", "either", "neither", "each",
    "every", "all", "any", "few", "more", "most", "other", "some", "such",
    "than", "too", "very", "just", "about", "also", "back", "been",
    "even", "how", "its", "new", "now", "old", "see", "way", "who",
    "said", "says", "that", "this", "it", "he", "she", "they", "we",
    "our", "their", "his", "her", "my", "your", "what", "which", "when",
    "where", "why", "up", "out", "if", "then", "over", "only", "get",
  ]);

  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w));

  // Count frequency, return top keywords
  const freq = new Map<string, number>();
  for (const w of words) {
    freq.set(w, (freq.get(w) ?? 0) + 1);
  }

  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([word]) => word);
}
