// ── News Keyword Alerts ──
// Watch for keywords in news, auto-search matching markets

import fs from "fs";
import path from "path";
import type { MarketMatch, BetRecommendation } from "./types/index.js";
import type { MarketMatcher } from "./matcher/index.js";
import type { BetRecommender } from "./strategy/recommender.js";

const KEYWORDS_PATH = path.join(process.env.HOME ?? ".", "polymarket-agent", ".keywords.json");

export interface KeywordWatch {
  keyword: string;
  addedAt: string;
}

interface KeywordsData {
  keywords: KeywordWatch[];
}

function loadKeywords(): KeywordsData {
  try {
    return JSON.parse(fs.readFileSync(KEYWORDS_PATH, "utf-8"));
  } catch {
    return { keywords: [] };
  }
}

function saveKeywords(data: KeywordsData): void {
  fs.writeFileSync(KEYWORDS_PATH, JSON.stringify(data, null, 2));
}

export function getKeywords(): KeywordWatch[] {
  return loadKeywords().keywords;
}

export function addKeyword(keyword: string): KeywordWatch {
  const data = loadKeywords();
  const existing = data.keywords.find(
    (k) => k.keyword.toLowerCase() === keyword.toLowerCase()
  );
  if (existing) return existing;

  const entry: KeywordWatch = {
    keyword,
    addedAt: new Date().toISOString(),
  };
  data.keywords.push(entry);
  saveKeywords(data);
  return entry;
}

export function removeKeyword(index: number): KeywordWatch | null {
  const data = loadKeywords();
  if (index < 0 || index >= data.keywords.length) return null;
  const removed = data.keywords.splice(index, 1)[0];
  saveKeywords(data);
  return removed;
}

export interface KeywordMatch {
  keyword: string;
  newsTitle: string;
  newsUrl?: string;
  matchedAt: string;
}

export function matchKeywordsToNews(
  newsItems: { title: string; summary: string; url?: string }[]
): KeywordMatch[] {
  const keywords = getKeywords();
  const matches: KeywordMatch[] = [];

  for (const kw of keywords) {
    const kwLower = kw.keyword.toLowerCase();
    for (const item of newsItems) {
      const text = (item.title + " " + item.summary).toLowerCase();
      if (text.includes(kwLower)) {
        matches.push({
          keyword: kw.keyword,
          newsTitle: item.title,
          newsUrl: item.url,
          matchedAt: new Date().toISOString(),
        });
      }
    }
  }

  return matches;
}

// ── Smart Keyword Matching ──

export interface SmartKeywordMatch extends KeywordMatch {
  markets: MarketMatch[];
  recommendations: BetRecommendation[];
}

export async function smartMatchKeywordsToNews(
  newsItems: { title: string; summary: string; url?: string; id: string; publishedAt: Date; keywords: string[]; source: any; rawContent?: string }[],
  matcher: MarketMatcher,
  recommender: BetRecommender
): Promise<SmartKeywordMatch[]> {
  const basicMatches = matchKeywordsToNews(newsItems);
  const smartMatches: SmartKeywordMatch[] = [];

  // Deduplicate by news title to avoid redundant API calls
  const processedTitles = new Set<string>();

  for (const match of basicMatches) {
    if (processedTitles.has(match.newsTitle)) continue;
    processedTitles.add(match.newsTitle);

    // Find the original news item
    const newsItem = newsItems.find((n) => n.title === match.newsTitle);
    if (!newsItem) {
      smartMatches.push({ ...match, markets: [], recommendations: [] });
      continue;
    }

    try {
      const markets = await matcher.findMatchingMarkets(newsItem as any, 5);
      const recommendations = markets.length > 0
        ? recommender.recommend(newsItem as any, markets)
        : [];

      smartMatches.push({
        ...match,
        markets,
        recommendations,
      });
    } catch {
      smartMatches.push({ ...match, markets: [], recommendations: [] });
    }
  }

  return smartMatches;
}
