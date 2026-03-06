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
  printOddsConversion,
  printEdgeAnalysis,
  printMarketDetail,
  printTrending,
  printCategories,
  printArbitrage,
  printAlerts,
  printAlertChecks,
  printKeywords,
  printKeywordMatches,
  printHistory,
  printAccuracyStats,
  printCorrelation,
  printPortfolio,
  printTradeHistory,
  printMomentum,
  printBacktest,
  printCalendar,
  printLiquidity,
  printSmartKeywordMatches,
  printPortfolioRisk,
  printComparison,
  printSocialSignals,
  printEventTree,
  printDigest,
} from "./ui.js";
import { addToWatchlist, removeFromWatchlist, getWatchlist, clearWatchlist } from "./watchlist.js";
import { isTelegramConfigured } from "./news/index.js";
import { convertOdds, calculateEdge } from "./utils/odds.js";
import { exportMarkets, exportRecommendations, exportWatchlist } from "./export.js";
import { ArbitrageScanner } from "./strategy/arbitrage.js";
import { CorrelationAnalyzer } from "./strategy/correlation.js";
import { addAlert, removeAlert, getAlerts, checkAlerts } from "./alerts.js";
import { addKeyword, removeKeyword, getKeywords, matchKeywordsToNews, smartMatchKeywordsToNews } from "./keyword-alerts.js";
import { getHistory, logRecommendations, updateResolutions, getAccuracyStats } from "./history.js";
import { getPortfolioValue, buyPosition, sellPosition, resetPortfolio, getTradeHistory } from "./portfolio.js";
import { recordPrices, getMomentum } from "./strategy/momentum.js";
import { runBacktest } from "./strategy/backtest.js";
import { getResolutionCalendar } from "./calendar.js";
import { analyzeLiquidity } from "./strategy/liquidity.js";
import { analyzePortfolioRisk } from "./strategy/portfolio-risk.js";
import { fetchRedditSignals } from "./news/social.js";
import { buildEventTree } from "./strategy/event-graph.js";
import { generateDigest, digestToMarkdown } from "./digest.js";
import type { BetRecommendation, Market, MarketMatch, NewsItem } from "./types/index.js";
import fs from "fs";

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
  .option("--export <file>", "Export results to file (.json or .csv)")
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
      logRecommendations(allRecs.slice(0, 15));
    } else {
      printNoRecommendations();
    }

    if (opts.export) {
      exportRecommendations(allRecs, opts.export);
      printStatus(`exported to ${opts.export}`, "ok");
    }

    // Record prices for momentum tracking
    const scannedMarkets = allMatches.flatMap((m) => m.matches.map((mm) => mm.market));
    if (scannedMarkets.length > 0) {
      recordPrices(scannedMarkets);
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
  .option("--export <file>", "Export results to file (.json or .csv)")
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

    if (opts.export) {
      exportMarkets(markets, opts.export);
      printStatus(`exported to ${opts.export}`, "ok");
    }

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

    // Feature counts
    const wl = getWatchlist();
    const alerts = getAlerts();
    const keywords = getKeywords();
    const history = getHistory();
    const stats = getAccuracyStats();
    const featureLines: [string, string][] = [
      ["watchlist", `${wl.length} markets`],
      ["alerts", `${alerts.length} active`],
      ["keywords", `${keywords.length} watches`],
      ["history", `${history.length} recs (${(stats.winRate * 100).toFixed(0)}% win rate)`],
    ];
    for (const [k, v] of featureLines) {
      console.log(`  ${chalk.hex("#6B7280")(k.padEnd(18))} ${chalk.hex("#E5E7EB")(v)}`);
    }
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

    // Record prices for momentum tracking
    const watchMarkets = enriched.filter((e) => e.currentPrice).map((e) => ({
      id: e.id,
      outcomePrices: [e.currentPrice!.yes, e.currentPrice!.no],
    }));
    if (watchMarkets.length > 0) {
      recordPrices(watchMarkets as any);
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

// ── odds ──
program
  .command("odds")
  .description("Convert odds between formats and calculate edge vs market")
  .argument("<value>", "Odds value to convert")
  .option("-f, --format <format>", "Input format: prob, decimal, american", "prob")
  .option("-m, --market <query>", "Compare against a market")
  .action(async (valueStr, opts) => {
    printHeader();

    const value = Number(valueStr);
    if (isNaN(value)) {
      printStatus("invalid number", "err");
      return;
    }

    const result = convertOdds(value, opts.format);
    printOddsConversion(result);

    if (opts.market) {
      printStatus(`searching market: "${opts.market}"...`);
      const markets = await polymarket.searchMarkets(opts.market, 1);
      if (markets.length > 0) {
        const marketProb = markets[0].outcomePrices[0] ?? 0;
        const edge = calculateEdge(result.probability, marketProb);
        printEdgeAnalysis(edge);
        printStatus(`market: "${markets[0].question.slice(0, 55)}"`, "ok");
      } else {
        printStatus("market not found", "warn");
      }
    }

    printTimestamp();
  });

// ── market (detail) ──
program
  .command("market")
  .description("Show detailed market info with orderbook")
  .argument("<id>", "Market slug, ID, or condition_id")
  .action(async (id) => {
    printHeader();

    printStatus(`resolving market: "${id}"...`);

    // Try slug first, then condition ID, then search
    let market = await polymarket.getMarketBySlug(id);
    if (!market) {
      market = await polymarket.getMarketByConditionId(id);
    }
    if (!market) {
      const results = await polymarket.searchMarkets(id, 1);
      market = results[0] ?? null;
    }

    if (!market) {
      printStatus("market not found", "err");
      return;
    }

    printStatus(`found: "${market.question.slice(0, 55)}"`, "ok");

    // Get orderbook if YES token exists
    let orderbook;
    const yesToken = market.tokens.find((t) => t.outcome === "Yes" || t.outcome === "YES");
    if (yesToken?.token_id) {
      try {
        orderbook = await polymarket.getOrderBook(yesToken.token_id);
      } catch {
        // skip
      }
    }

    // Get related markets from same event
    let relatedMarkets: Market[] = [];
    try {
      const events = await polymarket.getEvents({ limit: 50, active: true });
      for (const event of events) {
        const eventMarkets = event.markets ?? [];
        if (eventMarkets.some((m: any) => m.id === market!.id || m.condition_id === market!.id)) {
          relatedMarkets = eventMarkets
            .filter((m: any) => m.id !== market!.id && m.condition_id !== market!.id)
            .map((m: any) => ({
              id: m.id ?? "",
              question: m.question ?? "",
              slug: m.slug ?? "",
              category: m.category ?? "",
              endDate: m.end_date_iso ?? "",
              active: m.active ?? true,
              closed: m.closed ?? false,
              tokens: [],
              volume: Number(m.volume ?? 0),
              liquidity: Number(m.liquidity ?? 0),
              outcomes: m.outcomes ?? [],
              outcomePrices: Array.isArray(m.outcomePrices) ? m.outcomePrices.map(Number) : [],
              description: "",
              tags: m.tags ?? [],
            }));
          break;
        }
      }
    } catch {
      // skip
    }

    printMarketDetail(market, orderbook, relatedMarkets);
    printTimestamp();
  });

// ── trending ──
program
  .command("trending")
  .description("Show trending events by volume")
  .option("-l, --limit <n>", "Number of events", "15")
  .action(async (opts) => {
    printHeader();

    printStatus("loading trending events...");
    const events = await polymarket.getTrendingEvents(Number(opts.limit));
    printStatus(`${events.length} trending events`, "ok");
    printTrending(events);
    printTimestamp();
  });

// ── categories ──
program
  .command("categories")
  .description("Show market categories with counts and volume")
  .action(async () => {
    printHeader();

    printStatus("loading categories...");
    const categories = await polymarket.getCategories();
    printStatus(`${categories.length} categories`, "ok");
    printCategories(categories);
    printTimestamp();
  });

// ── export ──
program
  .command("export")
  .description("Export data to JSON or CSV")
  .argument("<type>", "Data type: markets, watchlist, scan")
  .argument("<file>", "Output file path (.json or .csv)")
  .option("-l, --limit <n>", "Max items for markets export", "50")
  .option("-s, --search <query>", "Search filter for markets")
  .action(async (type, file, opts) => {
    printHeader();

    if (type === "markets") {
      printStatus("fetching markets...");
      let markets: Market[];
      if (opts.search) {
        markets = await polymarket.searchMarkets(opts.search, Number(opts.limit));
      } else {
        markets = await polymarket.getTopMarkets(Number(opts.limit));
      }
      exportMarkets(markets, file);
      printStatus(`exported ${markets.length} markets to ${file}`, "ok");
    } else if (type === "watchlist") {
      const entries = getWatchlist();
      exportWatchlist(entries, file);
      printStatus(`exported ${entries.length} watchlist entries to ${file}`, "ok");
    } else if (type === "scan") {
      printStatus("running scan for export...");
      const news = await newsAgg.fetchAll();
      const allRecs: BetRecommendation[] = [];
      for (const item of news.slice(0, 20)) {
        const matches = await matcher.findMatchingMarkets(item, 5);
        if (matches.length > 0) {
          const recs = recommender.recommend(item, matches);
          allRecs.push(...recs);
        }
      }
      exportRecommendations(allRecs, file);
      printStatus(`exported ${allRecs.length} recommendations to ${file}`, "ok");
    } else {
      printStatus(`unknown type: ${type} (use: markets, watchlist, scan)`, "err");
    }

    printTimestamp();
  });

// ── arb ──
program
  .command("arb")
  .description("Scan for arbitrage opportunities (YES+NO < $1)")
  .option("--deep", "Verify with orderbook depth")
  .option("-l, --min-profit <cents>", "Minimum profit in cents", "1")
  .action(async (opts) => {
    printHeader();

    const scanner = new ArbitrageScanner(polymarket);
    printStatus(`scanning for arbitrage${opts.deep ? " (deep verification)..." : "..."}`);
    const opps = await scanner.scan({
      deep: opts.deep,
      minProfitCents: Number(opts.minProfit),
    });
    printStatus(`${opps.length} opportunities found`, opps.length > 0 ? "ok" : "info");
    printArbitrage(opps);
    printTimestamp();
  });

// ── alert ──
const alertCmd = program
  .command("alert")
  .description("Manage price alerts on markets");

alertCmd
  .command("add")
  .description("Set a price alert")
  .argument("<query>", "Market search query")
  .option("--side <side>", "YES or NO", "YES")
  .option("--above <price>", "Alert when price goes above threshold")
  .option("--below <price>", "Alert when price goes below threshold")
  .action(async (query, opts) => {
    printHeader();

    const side = opts.side.toUpperCase() as "YES" | "NO";
    const direction = opts.above ? "above" : "below";
    const threshold = Number(opts.above ?? opts.below);

    if (!threshold || isNaN(threshold)) {
      printStatus("specify --above or --below with a price (e.g., 0.75)", "err");
      return;
    }

    printStatus(`searching: "${query}"...`);
    const alert = await addAlert(polymarket, query, side, direction, threshold);
    if (alert) {
      printStatus(`alert set: ${side} ${direction} ${(threshold * 100).toFixed(0)}¢ on "${alert.marketQuestion.slice(0, 50)}"`, "ok");
    } else {
      printStatus("no markets found", "warn");
    }
    printTimestamp();
  });

alertCmd
  .command("list")
  .description("Show all alerts")
  .action(() => {
    printHeader();
    printAlerts(getAlerts());
    printTimestamp();
  });

alertCmd
  .command("rm")
  .description("Remove an alert")
  .argument("<index>", "Alert index (1-based)")
  .action((indexStr) => {
    const removed = removeAlert(Number(indexStr) - 1);
    if (removed) {
      printStatus(`removed alert on "${removed.marketQuestion.slice(0, 50)}"`, "ok");
    } else {
      printStatus("invalid index", "err");
    }
  });

alertCmd
  .command("watch")
  .description("Poll alerts for triggers")
  .option("-i, --interval <seconds>", "Poll interval", "60")
  .action(async (opts) => {
    printHeader();
    printSectionHeader("Alert Monitor", "◈");
    console.log(chalk.hex("#4B5563")(`  polling every ${opts.interval}s — ctrl+c to exit`));
    console.log();

    const poll = async () => {
      const results = await checkAlerts(polymarket);
      printAlertChecks(results);
    };

    await poll();
    setInterval(poll, Number(opts.interval) * 1000);
  });

// ── kw (keyword alerts) ──
const kwCmd = program
  .command("kw")
  .description("Manage news keyword watches");

kwCmd
  .command("add")
  .description("Watch for a keyword in news")
  .argument("<keyword>", "Keyword to watch")
  .action((keyword) => {
    const kw = addKeyword(keyword);
    printStatus(`watching: "${kw.keyword}"`, "ok");
  });

kwCmd
  .command("list")
  .description("Show all keyword watches")
  .action(() => {
    printHeader();
    printKeywords(getKeywords());
    printTimestamp();
  });

kwCmd
  .command("rm")
  .description("Remove a keyword watch")
  .argument("<index>", "Index (1-based)")
  .action((indexStr) => {
    const removed = removeKeyword(Number(indexStr) - 1);
    if (removed) {
      printStatus(`removed: "${removed.keyword}"`, "ok");
    } else {
      printStatus("invalid index", "err");
    }
  });

kwCmd
  .command("scan")
  .description("Scan current news for keyword matches")
  .option("--smart", "Include market matching and recommendations")
  .action(async (opts) => {
    printHeader();

    printStatus("fetching news...");
    const news = await newsAgg.fetchAll();

    if (opts.smart) {
      printStatus("running smart keyword matching...");
      const smartMatches = await smartMatchKeywordsToNews(news as any, matcher, recommender);
      if (smartMatches.length > 0) {
        printSmartKeywordMatches(smartMatches);
      } else {
        printStatus("no keyword matches in current news", "info");
      }
    } else {
      const matches = matchKeywordsToNews(news);
      if (matches.length > 0) {
        printKeywordMatches(matches);
        // Auto-search for matching markets
        printStatus("searching for related markets...");
        for (const m of matches.slice(0, 5)) {
          const markets = await polymarket.searchMarkets(m.keyword, 3);
          if (markets.length > 0) {
            printStatus(`"${m.keyword}" → ${markets.length} markets`, "ok");
            for (const market of markets.slice(0, 2)) {
              const yp = market.outcomePrices[0] ?? 0;
              console.log(chalk.hex("#006B7A")(`    └─ `) + chalk.hex("#E5E7EB")(market.question.slice(0, 50)));
            }
          }
        }
      } else {
        printStatus("no keyword matches in current news", "info");
      }
    }

    printTimestamp();
  });

// ── history ──
program
  .command("history")
  .description("View recommendation history and accuracy")
  .option("--update", "Check for resolved markets and update stats")
  .option("-l, --limit <n>", "Number of entries to show", "20")
  .action(async (opts) => {
    printHeader();

    if (opts.update) {
      printStatus("updating resolutions...");
      const result = await updateResolutions(polymarket);
      printStatus(`updated ${result.updated} entries (${result.correct}W / ${result.incorrect}L / ${result.pending}P)`, "ok");
    }

    const entries = getHistory(Number(opts.limit));
    printHistory(entries);
    printAccuracyStats(getAccuracyStats());
    printTimestamp();
  });

// ── correlate ──
program
  .command("correlate")
  .description("Analyze probability correlations across related markets")
  .argument("[query]", "Optional category/tag filter")
  .option("--all", "Show all groups, not just anomalies")
  .action(async (query, opts) => {
    printHeader();

    printStatus("analyzing market correlations...");
    const analyzer = new CorrelationAnalyzer(polymarket);
    let groups = await analyzer.analyze(query);

    if (!opts.all) {
      const anomalies = groups.filter((g) => g.anomaly);
      if (anomalies.length > 0) groups = anomalies;
    }

    printStatus(`${groups.length} event groups analyzed`, "ok");
    printCorrelation(groups);
    printTimestamp();
  });

// ── portfolio ──
const portfolioCmd = program
  .command("portfolio")
  .description("Paper trading portfolio simulator");

portfolioCmd
  .command("show")
  .description("Show portfolio summary")
  .action(async () => {
    printHeader();

    printStatus("fetching portfolio...");
    const data = await getPortfolioValue(polymarket);
    printPortfolio(data);
    printTimestamp();
  });

portfolioCmd
  .command("buy")
  .description("Buy shares in a market")
  .argument("<query>", "Market search query")
  .argument("<amount>", "Dollar amount to invest")
  .option("--side <side>", "YES or NO", "YES")
  .action(async (query, amountStr, opts) => {
    printHeader();

    const amount = Number(amountStr);
    if (isNaN(amount) || amount <= 0) {
      printStatus("invalid amount", "err");
      return;
    }

    printStatus(`buying $${amount} ${opts.side} on "${query}"...`);
    const result = await buyPosition(polymarket, query, amount, opts.side.toUpperCase());
    if ("error" in result) {
      printStatus(result.error, "err");
    } else {
      printStatus(`bought ${result.trade.shares.toFixed(1)} shares @ ${(result.trade.price * 100).toFixed(0)}¢ = $${result.trade.total.toFixed(2)}`, "ok");
      printStatus(`"${result.position.marketQuestion.slice(0, 55)}"`, "info");
    }
    printTimestamp();
  });

portfolioCmd
  .command("sell")
  .description("Sell a position")
  .argument("<index>", "Position index (1-based)")
  .action(async (indexStr) => {
    printHeader();

    printStatus("selling position...");
    const result = await sellPosition(polymarket, Number(indexStr) - 1);
    if ("error" in result) {
      printStatus(result.error, "err");
    } else {
      const pnlStr = result.pnl >= 0 ? `+$${result.pnl.toFixed(2)}` : `-$${Math.abs(result.pnl).toFixed(2)}`;
      printStatus(`sold for $${result.trade.total.toFixed(2)} (${pnlStr})`, "ok");
    }
    printTimestamp();
  });

portfolioCmd
  .command("reset")
  .description("Reset portfolio to $1000")
  .action(() => {
    resetPortfolio();
    printStatus("portfolio reset to $1,000", "ok");
  });

portfolioCmd
  .command("history")
  .description("Show trade history")
  .option("-l, --limit <n>", "Number of trades", "20")
  .action((opts) => {
    printHeader();
    const trades = getTradeHistory(Number(opts.limit));
    printTradeHistory(trades);
    printTimestamp();
  });

// ── momentum ──
program
  .command("momentum")
  .description("Show price momentum and sparkline for a market")
  .argument("<query>", "Market search query")
  .action(async (query) => {
    printHeader();

    printStatus(`searching: "${query}"...`);
    const markets = await polymarket.searchMarkets(query, 5);
    if (markets.length === 0) {
      printStatus("no markets found", "warn");
      return;
    }

    const market = markets[0];
    // Record current price
    recordPrices([market]);

    const result = getMomentum(market.id, market.question);
    if (!result) {
      printStatus("no price history yet — run scan or watch list to record prices", "info");
      printStatus(`recorded current price: ${(market.outcomePrices[0] * 100).toFixed(0)}¢`, "ok");
      printTimestamp();
      return;
    }

    printMomentum(result);
    printTimestamp();
  });

// ── backtest ──
program
  .command("backtest")
  .description("Backtest recommendation accuracy and calibration")
  .option("--detailed", "Show individual trade details")
  .option("--update", "Update resolutions before backtesting")
  .action(async (opts) => {
    printHeader();

    if (opts.update) {
      printStatus("updating resolutions...");
      const result = await updateResolutions(polymarket);
      printStatus(`updated ${result.updated} entries (${result.correct}W / ${result.incorrect}L / ${result.pending}P)`, "ok");
    }

    printStatus("running backtest...");
    const result = runBacktest();

    if (result.totalRecs === 0) {
      printStatus("no recommendations in history — run scan first", "info");
      printTimestamp();
      return;
    }

    printBacktest(result, opts.detailed);
    printTimestamp();
  });

// ── calendar ──
program
  .command("calendar")
  .description("Show upcoming market resolution dates")
  .option("-d, --days <n>", "Max days ahead", "90")
  .option("--watch", "Only show watchlist markets")
  .action(async (opts) => {
    printHeader();

    printStatus("loading resolution calendar...");
    const buckets = await getResolutionCalendar(polymarket, {
      days: Number(opts.days),
      watchlistOnly: opts.watch,
    });

    printStatus(`${buckets.reduce((s, b) => s + b.markets.length, 0)} markets with resolution dates`, "ok");
    printCalendar(buckets);
    printTimestamp();
  });

// ── liquidity ──
program
  .command("liquidity")
  .description("Analyze market liquidity and orderbook depth")
  .argument("[query]", "Market search query (defaults to watchlist)")
  .option("-l, --limit <n>", "Max markets to analyze", "10")
  .action(async (query, opts) => {
    printHeader();

    let markets: Market[];
    if (query) {
      printStatus(`searching: "${query}"...`);
      markets = await polymarket.searchMarkets(query, Number(opts.limit));
    } else {
      printStatus("analyzing watchlist liquidity...");
      const entries = getWatchlist();
      const fetched: Market[] = [];
      for (const entry of entries) {
        try {
          const results = await polymarket.searchMarkets(entry.question.slice(0, 30), 5);
          const match = results.find((m) => m.id === entry.id || m.slug === entry.slug);
          if (match) fetched.push(match);
        } catch {
          // skip
        }
      }
      markets = fetched;
    }

    if (markets.length === 0) {
      printStatus("no markets found", "warn");
      return;
    }

    printStatus(`analyzing ${markets.length} markets...`);
    const profiles = await analyzeLiquidity(polymarket, markets.slice(0, Number(opts.limit)));
    printStatus(`${profiles.length} markets analyzed`, "ok");
    printLiquidity(profiles);
    printTimestamp();
  });

// ── portfolio risk ──
portfolioCmd
  .command("risk")
  .description("Analyze portfolio risk, concentration, and correlations")
  .action(async () => {
    printHeader();

    printStatus("analyzing portfolio risk...");
    const risk = await analyzePortfolioRisk(polymarket);
    printPortfolioRisk(risk);
    printTimestamp();
  });

// ── compare ──
program
  .command("compare")
  .description("Compare two markets side-by-side")
  .argument("<query1>", "First market search query")
  .argument("<query2>", "Second market search query")
  .action(async (query1, query2) => {
    printHeader();

    printStatus(`searching: "${query1}"...`);
    const markets1 = await polymarket.searchMarkets(query1, 1);
    printStatus(`searching: "${query2}"...`);
    const markets2 = await polymarket.searchMarkets(query2, 1);

    if (markets1.length === 0) {
      printStatus(`no markets found for "${query1}"`, "warn");
      return;
    }
    if (markets2.length === 0) {
      printStatus(`no markets found for "${query2}"`, "warn");
      return;
    }

    const m1 = markets1[0];
    const m2 = markets2[0];

    // Fetch orderbooks
    let ob1, ob2;
    const yesToken1 = m1.tokens.find((t) => t.outcome === "Yes" || t.outcome === "YES");
    const yesToken2 = m2.tokens.find((t) => t.outcome === "Yes" || t.outcome === "YES");
    if (yesToken1?.token_id) {
      try { ob1 = await polymarket.getOrderBook(yesToken1.token_id); } catch {}
    }
    if (yesToken2?.token_id) {
      try { ob2 = await polymarket.getOrderBook(yesToken2.token_id); } catch {}
    }

    printComparison(m1, m2, ob1, ob2);
    printTimestamp();
  });

// ── signals (social) ──
program
  .command("signals")
  .description("Scan Reddit for social signals on a topic")
  .argument("<query>", "Search query")
  .option("-l, --limit <n>", "Max posts to fetch", "25")
  .action(async (query, opts) => {
    printHeader();

    printStatus(`scanning Reddit for "${query}"...`);
    const signal = await fetchRedditSignals(query, Number(opts.limit));
    printStatus(`${signal.mentionCount} mentions found`, signal.mentionCount > 0 ? "ok" : "info");
    printSocialSignals(signal);
    printTimestamp();
  });

// ── event-tree ──
program
  .command("event-tree")
  .description("Show event probability tree with anomaly detection")
  .argument("[query]", "Filter by event/market keyword")
  .option("-l, --limit <n>", "Max events to show", "10")
  .action(async (query, opts) => {
    printHeader();

    printStatus("building event tree...");
    const trees = await buildEventTree(polymarket, query, Number(opts.limit));
    printStatus(`${trees.length} multi-market events found`, trees.length > 0 ? "ok" : "info");
    printEventTree(trees);
    printTimestamp();
  });

// ── digest ──
program
  .command("digest")
  .description("Generate a daily digest report")
  .option("--export <file>", "Export digest to markdown file")
  .action(async (opts) => {
    printHeader();

    printStatus("generating daily digest...");
    const digest = await generateDigest(polymarket, newsAgg, matcher, recommender);
    printDigest(digest);

    if (opts.export) {
      const md = digestToMarkdown(digest);
      fs.writeFileSync(opts.export, md);
      printStatus(`exported to ${opts.export}`, "ok");
    }

    printTimestamp();
  });

program.parse();
