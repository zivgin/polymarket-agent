#!/usr/bin/env node
import { Command } from "commander";
import { loadConfig } from "./config.js";
import { PolymarketClient } from "./clients/polymarket.js";
import { NewsAggregator } from "./news/index.js";
import { MarketMatcher } from "./matcher/index.js";
import { BetRecommender } from "./strategy/recommender.js";
import {
  printHeader,
  printSectionHeader,
  printStatus,
  printTimestamp,
  printMarkets,
  printNewsFeed,
  printScanMatches,
  printRecommendations,
  printLiveHeader,
  printLiveTick,
  printLiveAlert,
  printNoMatches,
  printNoRecommendations,
} from "./ui.js";
import type { BetRecommendation, Market, MarketMatch, NewsItem } from "./types/index.js";

const config = loadConfig();
const polymarket = new PolymarketClient(config.polymarket.apiKey);
const newsAgg = new NewsAggregator(config);
const matcher = new MarketMatcher(polymarket);
const recommender = new BetRecommender(config.trading);

const program = new Command();

program
  .name("polymarket-agent")
  .description("Prediction market intelligence terminal")
  .version("0.1.0");

// ── scan ──
program
  .command("scan")
  .description("Scan news feeds, match to markets, and recommend bets")
  .option("-l, --limit <n>", "Max news items to process", "20")
  .option("--rss-only", "Only use RSS feeds")
  .option("--min-confidence <n>", "Min confidence threshold", String(config.trading.minConfidence))
  .action(async (opts) => {
    printHeader();

    printStatus("fetching news feeds...");
    const news = await newsAgg.fetchAll();
    const limit = Number(opts.limit);
    const minConf = Number(opts.minConfidence);
    const items = news.slice(0, limit);

    printStatus(`${items.length} items loaded (${news.length} total)`, "ok");

    if (items.length === 0) {
      printStatus("no news items found — check RSS or Telegram config", "warn");
      return;
    }

    printStatus("matching news to polymarket...");

    const allRecs: BetRecommendation[] = [];
    const allMatches: { news: NewsItem; matches: MarketMatch[] }[] = [];

    for (const item of items) {
      const matches = await matcher.findMatchingMarkets(item, 5);
      if (matches.length > 0) {
        allMatches.push({ news: item, matches });
        const recs = recommender.recommend(item, matches);
        allRecs.push(...recs.filter((r) => r.confidence >= minConf));
      }
    }

    printStatus(`${allMatches.length} news items matched to markets`, "ok");

    if (allMatches.length > 0) {
      printScanMatches(allMatches);
    } else {
      printNoMatches();
    }

    if (allRecs.length > 0) {
      allRecs.sort((a, b) => b.expectedValue - a.expectedValue);
      printRecommendations(allRecs.slice(0, 15));
    } else {
      printNoRecommendations();
    }

    printTimestamp();
  });

// ── markets ──
program
  .command("markets")
  .description("Browse active Polymarket markets")
  .option("-l, --limit <n>", "Number of markets", "20")
  .option("-s, --search <query>", "Search markets")
  .option("-c, --category <tag>", "Filter by category")
  .action(async (opts) => {
    printHeader();

    let markets: Market[];
    if (opts.search) {
      printStatus(`searching: "${opts.search}"...`);
      markets = await polymarket.searchMarkets(opts.search, Number(opts.limit));
    } else if (opts.category) {
      printStatus(`category: ${opts.category}`);
      markets = await polymarket.getMarketsByCategory(opts.category, Number(opts.limit));
    } else {
      printStatus("loading top markets by volume...");
      markets = await polymarket.getTopMarkets(Number(opts.limit));
    }

    if (markets.length === 0) {
      printStatus("no markets found", "warn");
      return;
    }

    printStatus(`${markets.length} markets`, "ok");
    printSectionHeader("Markets", "◈");
    console.log();
    printMarkets(markets);
    printTimestamp();
  });

// ── recommend ──
program
  .command("recommend")
  .description("Analyze a news article URL and recommend bets")
  .argument("<url>", "News article URL")
  .action(async (url) => {
    printHeader();

    printStatus(`scraping: ${url}`);
    const newsItem = await newsAgg.scrapeUrl(url);
    if (!newsItem) {
      printStatus("failed to scrape URL — is FIRECRAWL_API_KEY set?", "err");
      return;
    }

    printStatus(`"${newsItem.title.slice(0, 60)}"`, "ok");
    printStatus(`keywords: ${newsItem.keywords.slice(0, 8).join(", ")}`);

    printStatus("finding matching markets...");
    const matches = await matcher.findMatchingMarkets(newsItem, 10);

    if (matches.length === 0) {
      printNoMatches();
      return;
    }

    printStatus(`${matches.length} matching markets`, "ok");
    printScanMatches([{ news: newsItem, matches }]);

    const recs = recommender.recommend(newsItem, matches);
    if (recs.length > 0) {
      printRecommendations(recs);
    } else {
      printNoRecommendations();
    }

    printTimestamp();
  });

// ── news ──
program
  .command("news")
  .description("Show latest news from all sources")
  .option("-l, --limit <n>", "Number of items", "30")
  .action(async (opts) => {
    printHeader();

    printStatus("fetching news feeds...");
    const news = await newsAgg.fetchAll();
    const items = news.slice(0, Number(opts.limit));

    printStatus(`${news.length} items from all sources`, "ok");
    printNewsFeed(items, news.length);
    printTimestamp();
  });

// ── search ──
program
  .command("search")
  .description("Search Polymarket for markets matching a query")
  .argument("<query>", "Search query")
  .option("-l, --limit <n>", "Max results", "15")
  .action(async (query, opts) => {
    printHeader();

    printStatus(`searching: "${query}"...`);
    const matches = await matcher.searchByQuery(query, Number(opts.limit));

    if (matches.length === 0) {
      printStatus("no markets found", "warn");
      return;
    }

    printStatus(`${matches.length} results`, "ok");
    printSectionHeader(`Results: "${query}"`, "◈");
    console.log();
    printMarkets(matches.map((m) => m.market));
    printTimestamp();
  });

// ── live ──
program
  .command("live")
  .description("Continuously watch news and alert on opportunities")
  .option("-i, --interval <seconds>", "Poll interval in seconds", "300")
  .action(async (opts) => {
    const interval = Number(opts.interval) * 1000;
    const seenIds = new Set<string>();

    printLiveHeader(Number(opts.interval));

    const poll = async () => {
      try {
        const news = await newsAgg.fetchAll();
        const newItems = news.filter((n) => !seenIds.has(n.id));

        for (const item of newItems) {
          seenIds.add(item.id);
        }

        printLiveTick(newItems.length);

        if (newItems.length === 0) return;

        for (const item of newItems.slice(0, 10)) {
          const matches = await matcher.findMatchingMarkets(item, 5);
          if (matches.length > 0) {
            const recs = recommender.recommend(item, matches);
            if (recs.length > 0) {
              printLiveAlert(recs.slice(0, 3));
            }
          }
        }
      } catch (err: any) {
        printStatus(`poll error: ${err.message}`, "err");
      }
    };

    await poll();
    setInterval(poll, interval);
  });

program.parse();
