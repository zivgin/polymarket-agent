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
  printGeoEvents,
  printGdeltTimeline,
  printGeoAlerts,
  printGdeltTone,
  printExpiringScan,
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
import { recordPrices, getMomentum, pruneOldSnapshots, getAllTrackedIds } from "./strategy/momentum.js";
import { runBacktest } from "./strategy/backtest.js";
import { getResolutionCalendar } from "./calendar.js";
import { analyzeLiquidity } from "./strategy/liquidity.js";
import { analyzePortfolioRisk } from "./strategy/portfolio-risk.js";
import { fetchRedditSignals } from "./news/social.js";
import { buildEventTree } from "./strategy/event-graph.js";
import { generateDigest, digestToMarkdown } from "./digest.js";
import {
  fetchGdeltArticles, fetchGdeltTimeline, fetchGdeltByTheme, fetchGdeltTone,
  fetchGdeltTvMentions, fetchHighSignalAlerts,
  fetchEarthquakes, earthquakesToNewsItems,
  fetchEonetEvents, eonetToNewsItems,
  fetchGdacsEvents, gdacsToNewsItems,
  fetchAllGeopoliticalEvents,
  GDELT_THEMES,
} from "./news/geopolitical.js";
import type { GdeltThemeKey } from "./news/geopolitical.js";
import type { BetRecommendation, Market, MarketMatch, NewsItem } from "./types/index.js";
import { scanExpiringMarkets } from "./strategy/expiring.js";
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

    // Record prices for momentum tracking
    recordPrices(markets);

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

    // Record prices for momentum tracking
    recordPrices(matches.map((m) => m.market));

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
      {
        name: "GDELT",
        ok: true,
        detail: "global news database (no key needed)",
      },
      {
        name: "USGS Earthquakes",
        ok: true,
        detail: "real-time seismic data (no key needed)",
      },
      {
        name: "NASA EONET",
        ok: true,
        detail: "natural event tracker (no key needed)",
      },
      {
        name: "GDACS",
        ok: true,
        detail: "disaster alerts (no key needed)",
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
    const trackedIds = getAllTrackedIds();
    const featureLines: [string, string][] = [
      ["watchlist", `${wl.length} markets`],
      ["alerts", `${alerts.length} active`],
      ["keywords", `${keywords.length} watches`],
      ["history", `${history.length} recs (${(stats.winRate * 100).toFixed(0)}% win rate)`],
      ["momentum", `${trackedIds.length} markets tracked`],
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

    // Record prices for momentum tracking
    const trendingMarkets = events.flatMap((e) => e.markets);
    if (trendingMarkets.length > 0) recordPrices(trendingMarkets);

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
  .argument("[query]", "Market search query")
  .option("--prune", "Remove snapshots older than 30 days")
  .action(async (query, opts) => {
    printHeader();

    if (opts.prune) {
      const pruned = pruneOldSnapshots();
      printStatus(`pruned ${pruned} old snapshots`, "ok");
      printTimestamp();
      return;
    }

    if (!query) {
      // Show summary of all tracked markets
      const ids = getAllTrackedIds();
      if (ids.length === 0) {
        printStatus("no price history yet — run scan, markets, or search to start tracking", "info");
        printTimestamp();
        return;
      }
      printStatus(`tracking ${ids.length} markets`, "ok");
      printSectionHeader("Tracked Markets", "▲");
      console.log();
      let shown = 0;
      for (const id of ids.slice(0, 20)) {
        const m = getMomentum(id);
        if (m) {
          const trendIcon = m.trend === "up" ? chalk.hex("#10B981")("▲") : m.trend === "down" ? chalk.hex("#EF4444")("▼") : chalk.hex("#4B5563")("━");
          const d24 = m.deltas["24h"];
          const deltaStr = d24 !== null
            ? (d24 >= 0 ? chalk.hex("#10B981")(`+${(d24 * 100).toFixed(1)}¢`) : chalk.hex("#EF4444")(`${(d24 * 100).toFixed(1)}¢`))
            : chalk.hex("#4B5563")("—");
          console.log(`  ${trendIcon} ${chalk.hex("#E5E7EB")(m.question.slice(0, 45).padEnd(45))} ${chalk.hex("#F59E0B")((m.currentPrice * 100).toFixed(0) + "¢")} ${deltaStr}  ${chalk.hex("#00E5FF")(m.sparkline)}`);
          shown++;
        }
      }
      if (ids.length > 20) console.log(chalk.hex("#4B5563")(`  ...and ${ids.length - 20} more`));
      console.log();
      printTimestamp();
      return;
    }

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
      printStatus("no price history yet — run scan or search first to start tracking", "info");
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
  .option("--no-scan", "Skip news scan (faster, uses existing data only)")
  .action(async (opts) => {
    printHeader();

    printStatus("generating daily digest...");
    const digest = await generateDigest(
      polymarket,
      opts.scan === false ? null : newsAgg,
      opts.scan === false ? null : matcher,
      opts.scan === false ? null : recommender,
    );
    printDigest(digest);

    if (opts.export) {
      const md = digestToMarkdown(digest);
      fs.writeFileSync(opts.export, md);
      printStatus(`exported to ${opts.export}`, "ok");
    }

    printTimestamp();
  });

// ── geo ──
const geoCmd = program
  .command("geo")
  .description("Browse real-time geopolitical and natural disaster events");

geoCmd
  .command("events")
  .description("Show all active geopolitical events (USGS + NASA + GDACS)")
  .option("--quakes", "Only show earthquakes (USGS)")
  .option("--disasters", "Only show disasters (GDACS Orange/Red)")
  .option("--natural", "Only show natural events (NASA EONET)")
  .option("--min-mag <n>", "Minimum earthquake magnitude (e.g., 6.0)")
  .option("--tsunami", "Only show tsunami-warning earthquakes")
  .action(async (opts) => {
    printHeader();

    let items: NewsItem[] = [];

    if (opts.quakes || opts.minMag || opts.tsunami) {
      printStatus("fetching earthquakes (USGS)...");
      const quakeOpts: any = {};
      if (opts.minMag) quakeOpts.minMagnitude = Number(opts.minMag);
      if (opts.tsunami) quakeOpts.tsunamiOnly = true;
      items = earthquakesToNewsItems(await fetchEarthquakes(Object.keys(quakeOpts).length > 0 ? quakeOpts : undefined));
    } else if (opts.disasters) {
      printStatus("fetching disaster alerts (GDACS)...");
      items = gdacsToNewsItems(await fetchGdacsEvents({ alertLevel: "Orange;Red" }));
    } else if (opts.natural) {
      printStatus("fetching natural events (NASA EONET)...");
      items = eonetToNewsItems(await fetchEonetEvents({ days: 7 }));
    } else {
      printStatus("fetching all geopolitical sources...");
      items = await fetchAllGeopoliticalEvents();
    }

    printStatus(`${items.length} events from geopolitical sources`, items.length > 0 ? "ok" : "info");
    printGeoEvents(items);
    printTimestamp();
  });

geoCmd
  .command("gdelt")
  .description("Search GDELT global news database")
  .argument("<query>", "Search query (e.g., 'ukraine ceasefire', 'iran nuclear')")
  .option("-l, --limit <n>", "Max articles", "20")
  .option("--timeline", "Show volume timeline instead of articles")
  .option("--tone", "Show tone/sentiment analysis")
  .option("-d, --days <n>", "Timeline/tone days back", "7")
  .option("--theme <code>", "Filter by GDELT theme code (e.g., ELECTION, PROTEST)")
  .option("--lang <code>", "Filter by source language (e.g., english, spanish)")
  .option("--country <code>", "Filter by source country (e.g., US, UK, CN)")
  .action(async (query, opts) => {
    printHeader();

    if (opts.tone) {
      printStatus(`fetching GDELT tone for "${query}"...`);
      const result = await fetchGdeltTone(query, Number(opts.days));
      if (result.toneTimeline.length === 0) {
        printStatus("no tone data — try a broader query", "info");
      } else {
        printGdeltTone(result);
      }
    } else if (opts.timeline) {
      printStatus(`fetching GDELT timeline for "${query}"...`);
      const timeline = await fetchGdeltTimeline(query, Number(opts.days));
      if (timeline.length === 0) {
        printStatus("no timeline data — try a broader query", "info");
      } else {
        printGdeltTimeline(query, timeline);
      }
    } else {
      const advOpts: any = {};
      if (opts.theme) advOpts.theme = opts.theme;
      if (opts.lang) advOpts.sourcelang = opts.lang;
      if (opts.country) advOpts.sourcecountry = opts.country;

      printStatus(`searching GDELT for "${query}"...`);
      const articles = await fetchGdeltArticles(query, Number(opts.limit), Object.keys(advOpts).length > 0 ? advOpts : undefined);
      if (articles.length === 0) {
        printStatus("no articles found — GDELT rate-limits to 1 req/5s", "info");
      } else {
        printStatus(`${articles.length} articles`, "ok");
        printGeoEvents(articles);
      }
    }

    printTimestamp();
  });

geoCmd
  .command("alerts")
  .description("High-signal alerts only — critical/high severity events for fast decisions")
  .option("--match", "Auto-match alerts to Polymarket markets")
  .action(async (opts) => {
    printHeader();
    printStatus("fetching high-signal alerts (USGS + GDACS + EONET)...");
    const alerts = await fetchHighSignalAlerts();
    printStatus(`${alerts.length} high-signal alerts`, alerts.length > 0 ? "ok" : "info");
    printGeoAlerts(alerts);

    if (opts.match && alerts.length > 0) {
      printStatus("matching alerts to polymarket...");
      const allRecs: BetRecommendation[] = [];
      const allMatches: { news: NewsItem; matches: MarketMatch[] }[] = [];

      for (const alert of alerts.slice(0, 10)) {
        const newsItem: NewsItem = {
          id: `alert_${Date.now()}`,
          title: alert.title,
          summary: alert.summary,
          source: { type: "web" as const, site: alert.source },
          url: alert.url,
          publishedAt: alert.publishedAt,
          keywords: alert.keywords,
        };
        const matches = await matcher.findMatchingMarkets(newsItem, 5);
        if (matches.length > 0) {
          allMatches.push({ news: newsItem, matches });
          allRecs.push(...recommender.recommend(newsItem, matches));
        }
      }

      if (allMatches.length > 0) {
        printScanMatches(allMatches);
        allRecs.sort((a, b) => b.expectedValue - a.expectedValue);
        printRecommendations(allRecs.slice(0, 10));
        logRecommendations(allRecs.slice(0, 10));
      } else {
        printStatus("no alerts matched to active markets", "info");
      }
    }

    printTimestamp();
  });

geoCmd
  .command("themes")
  .description("Browse GDELT structured themes (elections, conflicts, sanctions...)")
  .argument("[theme]", `Theme key: ${Object.keys(GDELT_THEMES).join(", ")}`)
  .option("-l, --limit <n>", "Max articles", "15")
  .option("--list", "List all available theme keys")
  .action(async (theme, opts) => {
    printHeader();

    if (opts.list || !theme) {
      printSectionHeader("GDELT Themes", "#");
      console.log();
      for (const [key, code] of Object.entries(GDELT_THEMES)) {
        console.log(`  ${chalk.hex("#A78BFA")(key.padEnd(20))} ${chalk.hex("#6B7280")(code)}`);
      }
      console.log();
      console.log(chalk.hex("#4B5563")("  usage: geo themes <key>  (e.g., geo themes elections)"));
      console.log();
      printTimestamp();
      return;
    }

    if (!(theme in GDELT_THEMES)) {
      printStatus(`unknown theme "${theme}" — use --list to see available themes`, "info");
      printTimestamp();
      return;
    }

    printStatus(`fetching GDELT theme: ${theme} (${GDELT_THEMES[theme as GdeltThemeKey]})...`);
    const articles = await fetchGdeltByTheme(theme as GdeltThemeKey, Number(opts.limit));

    if (articles.length === 0) {
      printStatus("no articles — GDELT rate-limits to 1 req/5s, try again shortly", "info");
    } else {
      printStatus(`${articles.length} articles for theme: ${theme}`, "ok");
      printGeoEvents(articles);
    }

    printTimestamp();
  });

geoCmd
  .command("tone")
  .description("Analyze global media sentiment/tone on a topic (GDELT)")
  .argument("<query>", "Topic to analyze (e.g., 'iran nuclear', 'bitcoin regulation')")
  .option("-d, --days <n>", "Days back", "7")
  .action(async (query, opts) => {
    printHeader();
    printStatus(`analyzing GDELT tone for "${query}"...`);
    const result = await fetchGdeltTone(query, Number(opts.days));

    if (result.toneTimeline.length === 0) {
      printStatus("no tone data — try a broader query or wait 5s (rate limit)", "info");
    } else {
      printGdeltTone(result);
    }

    printTimestamp();
  });

geoCmd
  .command("tv")
  .description("Track US cable news mentions of a topic (GDELT TV API)")
  .argument("<query>", "Topic to track")
  .action(async (query) => {
    printHeader();
    printStatus(`checking TV mentions for "${query}"...`);
    const result = await fetchGdeltTvMentions(query, "stationdetail");

    if (!result.stations || Object.keys(result.stations).length === 0) {
      printStatus("no TV mentions found in last 24h", "info");
      printTimestamp();
      return;
    }

    printSectionHeader(`TV Mentions: "${query}" (24h)`, "TV");
    console.log();

    const entries = Object.entries(result.stations).sort((a, b) => b[1] - a[1]);
    const maxVal = Math.max(...entries.map(([, v]) => v), 0.001);

    for (const [station, count] of entries) {
      const barLen = Math.round((count / maxVal) * 30);
      const bar = chalk.hex("#00E5FF")("█".repeat(barLen)) + chalk.hex("#374151")("░".repeat(30 - barLen));
      console.log(`  ${chalk.hex("#A78BFA")(station.padEnd(12))} ${bar} ${chalk.hex("#E5E7EB")(String(count))}`);
    }

    console.log();
    printTimestamp();
  });

geoCmd
  .command("scan")
  .description("Scan geopolitical events and match to Polymarket")
  .action(async () => {
    printHeader();

    printStatus("fetching geopolitical events...");
    const geoItems = await fetchAllGeopoliticalEvents();
    printStatus(`${geoItems.length} events from USGS/NASA/GDACS`, "ok");

    if (geoItems.length === 0) {
      printStatus("no events to match", "info");
      printTimestamp();
      return;
    }

    printStatus("matching to polymarket...");
    const allRecs: BetRecommendation[] = [];
    const allMatches: { news: NewsItem; matches: MarketMatch[] }[] = [];

    for (const item of geoItems.slice(0, 15)) {
      const matches = await matcher.findMatchingMarkets(item, 5);
      if (matches.length > 0) {
        allMatches.push({ news: item, matches });
        const recs = recommender.recommend(item, matches);
        allRecs.push(...recs);
      }
    }

    printStatus(`${allMatches.length} events matched to markets`, "ok");

    if (allMatches.length > 0) {
      printScanMatches(allMatches);
    } else {
      printStatus("no geopolitical events matched to active markets", "info");
    }

    if (allRecs.length > 0) {
      allRecs.sort((a, b) => b.expectedValue - a.expectedValue);
      printRecommendations(allRecs.slice(0, 10));
      logRecommendations(allRecs.slice(0, 10));
    }

    printTimestamp();
  });

// ── expiring ──
program
  .command("expiring")
  .description("Scan markets expiring today, find edge opportunities")
  .option("-h, --hours <n>", "hours ahead to scan (default: 24)", "24")
  .option("--min-liquidity <n>", "minimum liquidity in USD (default: 500)", "500")
  .option("--no-news", "skip news matching, just list expiring markets")
  .action(async (opts) => {
    printHeader();

    const hoursAhead = Number(opts.hours);
    const minLiquidity = Number(opts.minLiquidity);

    console.log(chalk.hex("#6B7280")(`  Scanning for markets expiring within ${hoursAhead}h...`));
    console.log();

    let newsItems: NewsItem[] = [];
    if (opts.news !== false) {
      console.log(chalk.hex("#6B7280")("  Fetching news for edge analysis..."));
      newsItems = await newsAgg.fetchAll();
      console.log(chalk.hex("#6B7280")(`  ${newsItems.length} news items loaded.`));
      console.log();
    }

    const result = await scanExpiringMarkets(
      polymarket, matcher, recommender, newsItems,
      { hoursAhead, minLiquidity }
    );

    printExpiringScan(result);

    // Log recommendations to history
    if (result.recommendations.length > 0) {
      logRecommendations(result.recommendations);
    }

    printTimestamp();
  });

program.parse();
