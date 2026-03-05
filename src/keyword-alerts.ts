// ── News Keyword Alerts ──
// Watch for keywords in news, auto-search matching markets

import fs from "fs";
import path from "path";

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
