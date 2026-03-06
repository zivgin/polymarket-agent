// ── Social Signal Scanner ──
// Fetch Reddit mentions and analyze sentiment

import axios from "axios";
import type { SocialSignal, SocialPost } from "../types/index.js";

const REDDIT_SEARCH = "https://old.reddit.com/search.json";

export async function fetchRedditSignals(
  query: string,
  limit = 25
): Promise<SocialSignal> {
  const posts: SocialPost[] = [];

  try {
    const { data } = await axios.get(REDDIT_SEARCH, {
      params: {
        q: query,
        sort: "relevance",
        t: "week",
        limit,
        type: "link",
      },
      headers: {
        "User-Agent": "polymarket-agent/0.1 (prediction-market-tool)",
      },
      timeout: 10_000,
    });

    const children = data?.data?.children ?? [];
    for (const child of children) {
      const d = child.data;
      posts.push({
        title: d.title ?? "",
        score: d.score ?? 0,
        comments: d.num_comments ?? 0,
        subreddit: d.subreddit ?? "",
        url: `https://reddit.com${d.permalink ?? ""}`,
        created: d.created_utc ?? 0,
      });
    }
  } catch {
    // Return empty signal on failure
  }

  const sentiment = analyzeSocialSentiment(posts);

  return {
    source: "reddit",
    query,
    mentionCount: posts.length,
    sentiment,
    topPosts: posts.sort((a, b) => b.score - a.score).slice(0, 10),
    fetchedAt: new Date().toISOString(),
  };
}

export function analyzeSocialSentiment(
  posts: SocialPost[]
): { pos: number; neg: number; neutral: number } {
  if (posts.length === 0) return { pos: 0, neg: 0, neutral: 0 };

  const positiveWords = [
    "confirms", "approved", "passed", "wins", "victory", "deal",
    "agreement", "success", "launches", "announces", "breakthrough",
    "rises", "gains", "surges", "increases", "supports", "endorses",
    "signs", "ratifies", "accepts", "adopts", "achieves", "completes",
  ];
  const negativeWords = [
    "denies", "rejected", "fails", "loses", "defeat", "collapses",
    "crisis", "scandal", "drops", "falls", "declines", "opposes",
    "blocks", "vetoes", "cancels", "withdraws", "delays", "suspends",
    "threatens", "warns", "cuts", "reduces", "bans", "restricts",
  ];

  let pos = 0;
  let neg = 0;
  let neutral = 0;

  for (const post of posts) {
    const text = post.title.toLowerCase();
    const posCount = positiveWords.filter((w) => text.includes(w)).length;
    const negCount = negativeWords.filter((w) => text.includes(w)).length;

    if (posCount > negCount) pos++;
    else if (negCount > posCount) neg++;
    else neutral++;
  }

  return { pos, neg, neutral };
}
