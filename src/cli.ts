#!/usr/bin/env node
import { Command } from "commander";
import chalk from "chalk";
import Table from "cli-table3";
import { loadConfig } from "./config.js";
import { PolymarketClient } from "./clients/polymarket.js";
import { NewsAggregator } from "./news/index.js";
import { MarketMatcher } from "./matcher/index.js";
import { BetRecommender } from "./strategy/recommender.js";
import type { BetRecommendation, Market, NewsItem } from "./types/index.js";

const config = loadConfig();
const polymarket = new PolymarketClient(config.polymarket.apiKey);
const newsAgg = new NewsAggregator(config);
const matcher = new MarketMatcher(polymarket);
const recommender = new BetRecommender(config.trading);

const program = new Command();

program
  .name("polymarket-agent")
  .description("News-driven Polymarket bet recommendations")
  .version("0.1.0");

// ── scan: Fetch news → find matching markets → recommend bets ──
program
  .command("scan")
  .description("Scan news feeds and recommend bets")
  .option("-l, --limit <n>", "Max news items to process", "20")
  .option("--rss-only", "Only use RSS feeds")
  .option("--min-confidence <n>", "Min confidence threshold", String(config.trading.minConfidence))
  .action(async (opts) => {
    console.log(chalk.blue("⏳ Fetching news..."));

    const news = await newsAgg.fetchAll();
    const limit = Number(opts.limit);
    const minConf = Number(opts.minConfidence);
    const items = news.slice(0, limit);

    console.log(chalk.green(`📰 Got ${items.length} news items from ${news.length} total`));

    if (items.length === 0) {
      console.log(chalk.yellow("No news items found. Check your RSS feeds or Telegram config."));
      return;
    }

    console.log(chalk.blue("🔍 Matching news to Polymarket markets...\n"));

    const allRecs: BetRecommendation[] = [];
    const allMatches: { news: NewsItem; matches: import("./types/index.js").MarketMatch[] }[] = [];

    for (const item of items) {
      const matches = await matcher.findMatchingMarkets(item, 5);
      if (matches.length > 0) {
        allMatches.push({ news: item, matches });
        const recs = recommender.recommend(item, matches);
        allRecs.push(...recs.filter((r) => r.confidence >= minConf));
      }
    }

    // Always show matched news → markets
    if (allMatches.length > 0) {
      console.log(chalk.bold.white("📰 News → Market Matches\n"));
      for (const { news: n, matches } of allMatches) {
        console.log(chalk.bold(`  ${n.title.slice(0, 75)}`));
        console.log(chalk.gray(`  ${n.source.type === "rss" ? n.source.feed : n.source.type}: ${n.publishedAt.toLocaleTimeString()}`));
        for (const m of matches.slice(0, 3)) {
          const yesPrice = m.market.outcomePrices[0] ?? 0;
          const noPrice = m.market.outcomePrices[1] ?? 1 - yesPrice;
          console.log(
            `    ${chalk.cyan("→")} ${m.market.question.slice(0, 55)} ` +
            `[YES: ${colorPrice(yesPrice)} / NO: ${colorPrice(noPrice)}] ` +
            chalk.gray(`rel: ${(m.relevanceScore * 100).toFixed(0)}%`)
          );
        }
        console.log();
      }
    } else {
      console.log(chalk.yellow("No matching markets found for current news.\n"));
    }

    // Show recommendations if any
    if (allRecs.length > 0) {
      allRecs.sort((a, b) => b.expectedValue - a.expectedValue);
      printRecommendations(allRecs.slice(0, 15));
    } else {
      console.log(
        chalk.gray(
          "No bet recommendations above confidence threshold — markets already efficiently priced.\n" +
          "Use 'recommend <url>' with a breaking news URL for targeted analysis.\n"
        )
      );
    }
  });

// ── markets: Browse active markets ──
program
  .command("markets")
  .description("List active Polymarket markets")
  .option("-l, --limit <n>", "Number of markets", "20")
  .option("-s, --search <query>", "Search markets")
  .option("-c, --category <tag>", "Filter by category")
  .action(async (opts) => {
    let markets: Market[];

    if (opts.search) {
      console.log(chalk.blue(`🔍 Searching: "${opts.search}"...`));
      markets = await polymarket.searchMarkets(opts.search, Number(opts.limit));
    } else if (opts.category) {
      console.log(chalk.blue(`📂 Category: ${opts.category}`));
      markets = await polymarket.getMarketsByCategory(opts.category, Number(opts.limit));
    } else {
      console.log(chalk.blue("📊 Top markets by volume..."));
      markets = await polymarket.getTopMarkets(Number(opts.limit));
    }

    if (markets.length === 0) {
      console.log(chalk.yellow("No markets found."));
      return;
    }

    printMarkets(markets);
  });

// ── recommend: Analyze specific news URL against markets ──
program
  .command("recommend")
  .description("Get bet recommendations for a specific news article")
  .argument("<url>", "News article URL to analyze")
  .action(async (url) => {
    console.log(chalk.blue(`🔍 Scraping: ${url}...`));

    const newsItem = await newsAgg.scrapeUrl(url);
    if (!newsItem) {
      console.log(chalk.red("Failed to scrape URL. Is FIRECRAWL_API_KEY set?"));
      return;
    }

    console.log(chalk.green(`📰 "${newsItem.title}"`));
    console.log(chalk.gray(`Keywords: ${newsItem.keywords.slice(0, 8).join(", ")}\n`));

    console.log(chalk.blue("🔍 Finding matching markets..."));
    const matches = await matcher.findMatchingMarkets(newsItem, 10);

    if (matches.length === 0) {
      console.log(chalk.yellow("No matching markets found for this article."));
      return;
    }

    console.log(chalk.green(`Found ${matches.length} matching markets\n`));

    const recs = recommender.recommend(newsItem, matches);
    if (recs.length === 0) {
      console.log(chalk.yellow("No recommendations above confidence threshold."));
      return;
    }

    printRecommendations(recs);
  });

// ── news: Just show latest news ──
program
  .command("news")
  .description("Show latest news from all sources")
  .option("-l, --limit <n>", "Number of items", "30")
  .action(async (opts) => {
    console.log(chalk.blue("📰 Fetching news..."));
    const news = await newsAgg.fetchAll();
    const items = news.slice(0, Number(opts.limit));

    const table = new Table({
      head: [
        chalk.white("Time"),
        chalk.white("Source"),
        chalk.white("Title"),
      ],
      colWidths: [12, 18, 70],
      wordWrap: true,
    });

    for (const item of items) {
      const time = item.publishedAt.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      });
      const source =
        item.source.type === "rss"
          ? item.source.feed.slice(0, 15)
          : item.source.type === "telegram"
            ? `TG:${item.source.channel}`
            : item.source.site;

      table.push([time, source, item.title.slice(0, 67)]);
    }

    console.log(table.toString());
    console.log(chalk.gray(`\nShowing ${items.length} of ${news.length} items`));
  });

// ── search: Search markets for a topic ──
program
  .command("search")
  .description("Search Polymarket for markets matching a query")
  .argument("<query>", "Search query")
  .option("-l, --limit <n>", "Max results", "15")
  .action(async (query, opts) => {
    console.log(chalk.blue(`🔍 Searching markets: "${query}"...\n`));
    const matches = await matcher.searchByQuery(query, Number(opts.limit));

    if (matches.length === 0) {
      console.log(chalk.yellow("No markets found."));
      return;
    }

    printMarkets(matches.map((m) => m.market));
  });

// ── live: Watch for news and auto-recommend ──
program
  .command("live")
  .description("Continuously watch news feeds and recommend bets")
  .option("-i, --interval <seconds>", "Poll interval in seconds", "300")
  .action(async (opts) => {
    const interval = Number(opts.interval) * 1000;
    const seenIds = new Set<string>();

    console.log(
      chalk.blue(
        `👁️  Live mode — polling every ${opts.interval}s. Press Ctrl+C to stop.\n`
      )
    );

    const poll = async () => {
      try {
        const news = await newsAgg.fetchAll();
        const newItems = news.filter((n) => !seenIds.has(n.id));

        for (const item of newItems) {
          seenIds.add(item.id);
        }

        if (newItems.length === 0) {
          console.log(
            chalk.gray(`[${new Date().toLocaleTimeString()}] No new items`)
          );
          return;
        }

        console.log(
          chalk.green(
            `[${new Date().toLocaleTimeString()}] ${newItems.length} new items`
          )
        );

        for (const item of newItems.slice(0, 10)) {
          const matches = await matcher.findMatchingMarkets(item, 5);
          if (matches.length > 0) {
            const recs = recommender.recommend(item, matches);
            if (recs.length > 0) {
              console.log(chalk.yellow(`\n🔔 Recommendation found!`));
              printRecommendations(recs.slice(0, 3));
            }
          }
        }
      } catch (err: any) {
        console.error(chalk.red(`Poll error: ${err.message}`));
      }
    };

    await poll();
    setInterval(poll, interval);
  });

// ── Display helpers ──

function printMarkets(markets: Market[]) {
  const table = new Table({
    head: [
      chalk.white("Market"),
      chalk.white("YES"),
      chalk.white("NO"),
      chalk.white("Volume"),
      chalk.white("Category"),
      chalk.white("End Date"),
    ],
    colWidths: [45, 8, 8, 12, 14, 12],
    wordWrap: true,
  });

  for (const m of markets) {
    const yesPrice = m.outcomePrices[0] ?? 0;
    const noPrice = m.outcomePrices[1] ?? 1 - yesPrice;

    table.push([
      m.question.slice(0, 42),
      colorPrice(yesPrice),
      colorPrice(noPrice),
      formatVolume(m.volume),
      m.category.slice(0, 12) || "-",
      m.endDate ? new Date(m.endDate).toLocaleDateString() : "-",
    ]);
  }

  console.log(table.toString());
}

function printRecommendations(recs: BetRecommendation[]) {
  console.log(chalk.bold.white("\n📊 Bet Recommendations\n"));

  for (let i = 0; i < recs.length; i++) {
    const r = recs[i];
    const evColor = r.expectedValue > 0 ? chalk.green : chalk.red;

    console.log(chalk.bold(`${i + 1}. ${r.market.question}`));
    console.log(
      `   ${chalk.bold(r.side === "YES" ? chalk.green("▲ YES") : chalk.red("▼ NO"))} ` +
        `at ${chalk.yellow(`$${r.currentPrice.toFixed(2)}`)} ` +
        `→ confidence: ${confidenceBar(r.confidence)} ${(r.confidence * 100).toFixed(0)}%`
    );
    console.log(
      `   EV: ${evColor(`$${r.expectedValue.toFixed(3)}/dollar`)} ` +
        `| Kelly: ${(r.kellyFraction * 100).toFixed(1)}% ` +
        `| Suggested: ${chalk.bold(`$${r.suggestedSize.toFixed(2)}`)} ` +
        `→ payout: ${chalk.green(`$${r.potentialPayout.toFixed(2)}`)}`
    );
    console.log(chalk.gray(`   ${r.reasoning}`));
    console.log();
  }
}

function colorPrice(price: number): string {
  const pct = `${(price * 100).toFixed(0)}¢`;
  if (price >= 0.7) return chalk.green(pct);
  if (price <= 0.3) return chalk.red(pct);
  return chalk.yellow(pct);
}

function formatVolume(vol: number): string {
  if (vol >= 1_000_000) return `$${(vol / 1_000_000).toFixed(1)}M`;
  if (vol >= 1_000) return `$${(vol / 1_000).toFixed(0)}K`;
  return `$${vol.toFixed(0)}`;
}

function confidenceBar(conf: number): string {
  const filled = Math.round(conf * 10);
  const empty = 10 - filled;
  return chalk.green("█".repeat(filled)) + chalk.gray("░".repeat(empty));
}

program.parse();
