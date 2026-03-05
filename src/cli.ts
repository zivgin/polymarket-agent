#!/usr/bin/env node
import { Command } from "commander";
import chalk from "chalk";
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
  printConfigStatus,
  printWatchlist,
} from "./ui.js";
import { addToWatchlist, removeFromWatchlist, getWatchlist, clearWatchlist } from "./watchlist.js";
import { isTelegramConfigured } from "./news/index.js";
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

// ── status ──
program
  .command("status")
  .description("Show system configuration status")
  .action(async () => {
    printHeader();

    const checks = [
      {
        name: "Polymarket API",
        ok: true, // Always available for reads
        detail: "public endpoints (read-only)",
      },
      {
        name: "Polymarket Trade",
        ok: !!config.polymarket.privateKey,
        detail: config.polymarket.privateKey ? "wallet connected" : "set POLYMARKET_PRIVATE_KEY",
      },
      {
        name: "RSS Feeds",
        ok: config.news.rssFeeds.length > 0,
        detail: `${config.news.rssFeeds.length} feeds configured`,
      },
      {
        name: "Telegram",
        ok: await isTelegramConfigured(),
        detail: !config.telegram.apiId ? "set TELEGRAM_API_ID + API_HASH" : "checking...",
      },
      {
        name: "Firecrawl",
        ok: !!config.firecrawl.apiKey,
        detail: config.firecrawl.apiKey ? "api key set" : "set FIRECRAWL_API_KEY",
      },
    ];

    printConfigStatus(checks);

    // Trading config
    printSectionHeader("Trading Config", "◇");
    console.log();
    const tc = config.trading;
    const lines = [
      ["max bet size", `$${tc.maxBetSizeUsd}`],
      ["min confidence", `${(tc.minConfidence * 100).toFixed(0)}%`],
      ["kelly fraction", `${(tc.kellyFraction * 100).toFixed(0)}% (half-kelly)`],
    ];
    for (const [k, v] of lines) {
      console.log(`  ${chalk.hex("#6B7280")(k.padEnd(18))} ${chalk.hex("#E5E7EB")(v)}`);
    }
    console.log();

    // Watchlist count
    const wl = getWatchlist();
    console.log(`  ${chalk.hex("#6B7280")("watchlist")}          ${chalk.hex("#E5E7EB")(`${wl.length} markets`)}`);
    console.log();

    printTimestamp();
  });

// ── watch ──
const watchCmd = program
  .command("watch")
  .description("Manage your market watchlist");

watchCmd
  .command("list")
  .description("Show watchlist with current prices")
  .action(async () => {
    printHeader();

    const entries = getWatchlist();
    if (entries.length === 0) {
      printWatchlist([]);
      printTimestamp();
      return;
    }

    // Fetch current prices for each
    printStatus("fetching current prices...");
    const enriched = [];
    for (const entry of entries) {
      let currentPrice: { yes: number; no: number } | undefined;
      try {
        const markets = await polymarket.searchMarkets(entry.question.slice(0, 30), 5);
        const match = markets.find((m) => m.id === entry.id || m.slug === entry.slug);
        if (match) {
          currentPrice = {
            yes: match.outcomePrices[0] ?? 0,
            no: match.outcomePrices[1] ?? 1 - (match.outcomePrices[0] ?? 0),
          };
        }
      } catch {
        // skip price fetch errors
      }
      enriched.push({ ...entry, currentPrice });
    }

    printWatchlist(enriched);
    printTimestamp();
  });

watchCmd
  .command("add")
  .description("Add a market to watchlist by search")
  .argument("<query>", "Market search query")
  .option("-n, --notes <text>", "Notes for this watch")
  .action(async (query, opts) => {
    printHeader();

    printStatus(`searching: "${query}"...`);
    const markets = await polymarket.searchMarkets(query, 5);

    if (markets.length === 0) {
      printStatus("no markets found", "warn");
      return;
    }

    // Add the top result
    const market = markets[0];
    const yesPrice = market.outcomePrices[0] ?? 0;
    const noPrice = market.outcomePrices[1] ?? 1 - yesPrice;

    addToWatchlist({
      id: market.id,
      question: market.question,
      slug: market.slug,
      addedAt: new Date().toISOString(),
      addedPrice: { yes: yesPrice, no: noPrice },
      notes: opts.notes,
    });

    printStatus(`added: "${market.question.slice(0, 55)}"`, "ok");
    printStatus(`price at add: YES ${(yesPrice * 100).toFixed(0)}¢ / NO ${(noPrice * 100).toFixed(0)}¢`);
    printTimestamp();
  });

watchCmd
  .command("rm")
  .description("Remove a market from watchlist")
  .argument("<index>", "Index from watch list (1-based)")
  .action(async (indexStr) => {
    const entries = getWatchlist();
    const idx = Number(indexStr) - 1;

    if (idx < 0 || idx >= entries.length) {
      printStatus(`invalid index: ${indexStr} (have ${entries.length} entries)`, "err");
      return;
    }

    const entry = entries[idx];
    removeFromWatchlist(entry.id);
    printStatus(`removed: "${entry.question.slice(0, 55)}"`, "ok");
  });

watchCmd
  .command("clear")
  .description("Clear entire watchlist")
  .action(() => {
    clearWatchlist();
    printStatus("watchlist cleared", "ok");
  });

program.parse();
