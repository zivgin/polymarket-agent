import chalk from "chalk";
import type { BetRecommendation, Market, MarketMatch, NewsItem, TrendingEvent, CategorySummary } from "./types/index.js";
import type { OddsResult, EdgeAnalysis } from "./utils/odds.js";
import type { ArbOpportunity } from "./strategy/arbitrage.js";
import type { CorrelationGroup } from "./strategy/correlation.js";
import type { PriceAlert, AlertCheckResult } from "./alerts.js";
import type { KeywordWatch, KeywordMatch, SmartKeywordMatch } from "./keyword-alerts.js";
import type { HistoryEntry } from "./history.js";
import type { Position, Trade } from "./portfolio.js";
import type {
  MomentumResult, BacktestResult, CalendarBucket, LiquidityProfile,
  EventTree, DigestData, SocialSignal, OrderBook,
} from "./types/index.js";
import type { PortfolioRisk } from "./strategy/portfolio-risk.js";

// ── Color Palette ──
// Financial terminal: dark bg assumed, cyan data, amber prices, green/red signals
const c = {
  // Brand
  brand:    chalk.hex("#00E5FF"),       // electric cyan
  brandDim: chalk.hex("#006B7A"),       // muted teal
  // Data
  label:    chalk.hex("#6B7280"),       // slate gray
  value:    chalk.hex("#E5E7EB"),       // near-white
  dim:      chalk.hex("#4B5563"),       // dark gray
  muted:    chalk.hex("#374151"),       // very dark gray
  // Prices
  amber:    chalk.hex("#F59E0B"),       // amber/gold
  // Signals
  long:     chalk.hex("#10B981"),       // emerald green
  short:    chalk.hex("#EF4444"),       // signal red
  warn:     chalk.hex("#F97316"),       // orange warning
  // Accents
  purple:   chalk.hex("#A78BFA"),       // soft violet
  blue:     chalk.hex("#60A5FA"),       // cool blue
};

// ── Box Drawing ──
const B = {
  tl: "┌", tr: "┐", bl: "└", br: "┘",
  h: "─", v: "│", hd: "┬", hu: "┴",
  vr: "├", vl: "┤", x: "┼",
  dh: "═", dtl: "╔", dtr: "╗", dbl: "╚", dbr: "╝", dv: "║",
  dvr: "╠", dvl: "╣",
};

// ── Branding ──

export function printHeader() {
  const lines = [
    "",
    c.brand("  ╔══════════════════════════════════════════════════════╗"),
    c.brand("  ║") + c.value("  ▄▀▀▄ ▄▀▀▄ █   ▀▀▄ █▀▄▀█ ▄▀▀▄ █▀▀▄ █ ▄▀ ▄▀▀▀ ▀█▀  ") + c.brand("║"),
    c.brand("  ║") + c.value("  █▄▄█ █  █ █    ▄▀  █ ▀ █ █▄▄█ █▄▄▀ █▀▄  █▄▄▄  █   ") + c.brand("║"),
    c.brand("  ║") + c.value("  █    ▀▄▄▀ ▀▄▄ ▄▄▀  █   █ █  █ █  █ █  ▀ ▄▄▄█  █   ") + c.brand("║"),
    c.brand("  ╠══════════════════════════════════════════════════════╣"),
    c.brand("  ║") + c.dim("  prediction market intelligence terminal       v0.1  ") + c.brand("║"),
    c.brand("  ╚══════════════════════════════════════════════════════╝"),
    "",
  ];
  console.log(lines.join("\n"));
}

export function printDivider(width = 60) {
  console.log(c.muted("  " + B.h.repeat(width)));
}

export function printSectionHeader(title: string, icon = "◆") {
  const line = c.brandDim(B.h.repeat(3)) + " " + c.brand(icon + " " + title.toUpperCase()) + " " + c.brandDim(B.h.repeat(Math.max(1, 50 - title.length)));
  console.log("\n" + line);
}

export function printStatus(message: string, type: "info" | "ok" | "warn" | "err" = "info") {
  const icons = { info: c.brandDim("▸"), ok: c.long("✓"), warn: c.warn("!"), err: c.short("✗") };
  const colors = { info: c.dim, ok: c.long, warn: c.warn, err: c.short };
  console.log(`  ${icons[type]} ${colors[type](message)}`);
}

export function printTimestamp() {
  const now = new Date();
  const ts = now.toLocaleTimeString("en-US", { hour12: false });
  const date = now.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  console.log(c.dim(`  ${date} ${ts}`));
}

// ── Markets Table ──

export function printMarkets(markets: Market[]) {
  const colW = { q: 46, yes: 7, no: 7, vol: 10, cat: 12, end: 11 };
  const totalW = colW.q + colW.yes + colW.no + colW.vol + colW.cat + colW.end + 7; // +7 for separators

  // Header
  console.log(
    c.muted("  " + B.tl + B.h.repeat(totalW) + B.tr)
  );
  console.log(
    c.muted("  " + B.v) +
    c.brand(pad(" MARKET", colW.q)) +
    c.muted(B.v) +
    c.brand(pad("YES", colW.yes, "right")) +
    c.muted(B.v) +
    c.brand(pad("NO", colW.no, "right")) +
    c.muted(B.v) +
    c.brand(pad("VOL", colW.vol, "right")) +
    c.muted(B.v) +
    c.brand(pad("CAT", colW.cat)) +
    c.muted(B.v) +
    c.brand(pad("ENDS", colW.end)) +
    c.muted(B.v)
  );
  console.log(
    c.muted("  " + B.vr + B.h.repeat(colW.q) + B.x + B.h.repeat(colW.yes) + B.x + B.h.repeat(colW.no) + B.x + B.h.repeat(colW.vol) + B.x + B.h.repeat(colW.cat) + B.x + B.h.repeat(colW.end) + B.vl)
  );

  // Rows
  for (const m of markets) {
    const yesPrice = m.outcomePrices[0] ?? 0;
    const noPrice = m.outcomePrices[1] ?? 1 - yesPrice;

    console.log(
      c.muted("  " + B.v) +
      c.value(pad(" " + m.question.slice(0, colW.q - 2), colW.q)) +
      c.muted(B.v) +
      pad(priceTag(yesPrice), colW.yes, "right") +
      c.muted(B.v) +
      pad(priceTag(noPrice), colW.no, "right") +
      c.muted(B.v) +
      c.amber(pad(fmtVol(m.volume), colW.vol, "right")) +
      c.muted(B.v) +
      c.dim(pad(" " + (m.category || "—").slice(0, colW.cat - 2), colW.cat)) +
      c.muted(B.v) +
      c.dim(pad(" " + fmtDate(m.endDate), colW.end)) +
      c.muted(B.v)
    );
  }

  // Footer
  console.log(
    c.muted("  " + B.bl + B.h.repeat(totalW) + B.br)
  );
  console.log(c.dim(`  ${markets.length} markets`));
}

// ── News Feed ──

export function printNewsFeed(items: NewsItem[], total: number) {
  printSectionHeader("Live Feed", "◈");
  console.log();

  for (const item of items) {
    const time = item.publishedAt.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

    const sourceLabel =
      item.source.type === "rss"
        ? item.source.feed
        : item.source.type === "telegram"
          ? `TG/${item.source.channel}`
          : item.source.site;

    console.log(
      c.dim(`  ${time}`) + "  " +
      c.purple(sourceLabel.slice(0, 18).padEnd(18)) + "  " +
      c.value(item.title.slice(0, 68))
    );
  }

  console.log();
  console.log(c.dim(`  showing ${items.length} of ${total}`));
}

// ── Scan: News → Market Matches ──

export function printScanMatches(
  allMatches: { news: NewsItem; matches: MarketMatch[] }[]
) {
  printSectionHeader("News → Market Signals", "◉");
  console.log();

  for (const { news: n, matches } of allMatches) {
    const time = n.publishedAt.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const source =
      n.source.type === "rss"
        ? n.source.feed
        : n.source.type === "telegram"
          ? `TG/${n.source.channel}`
          : n.source.site;

    console.log(
      c.dim(`  ${time}`) + " " +
      c.value(n.title.slice(0, 72))
    );
    console.log(
      c.dim(`         ${source}`)
    );

    for (const m of matches.slice(0, 3)) {
      const yesPrice = m.market.outcomePrices[0] ?? 0;
      const noPrice = m.market.outcomePrices[1] ?? 1 - yesPrice;
      const relBar = miniBar(m.relevanceScore, 5);

      console.log(
        c.brandDim("         ├─ ") +
        c.value(m.market.question.slice(0, 48).padEnd(48)) + " " +
        priceTag(yesPrice) + c.dim("/") + priceTag(noPrice) + " " +
        relBar + " " +
        c.dim(`${(m.relevanceScore * 100).toFixed(0)}%`)
      );
    }
    console.log(c.brandDim("         │"));
  }
}

// ── Bet Recommendations ──

export function printRecommendations(recs: BetRecommendation[]) {
  printSectionHeader("Recommendations", "◆");
  console.log();

  for (let i = 0; i < recs.length; i++) {
    const r = recs[i];
    const idx = c.dim(`${String(i + 1).padStart(2)}.`);

    // Market question
    console.log(`  ${idx} ${c.value(r.market.question)}`);

    // Direction + Price
    const arrow = r.side === "YES"
      ? c.long("  ▲ LONG YES")
      : c.short("  ▼ SHORT NO");
    console.log(
      `     ${arrow}  ${c.dim("@")} ${c.amber(`$${r.currentPrice.toFixed(2)}`)}` +
      `  ${c.dim("→")}  payout ${c.long(`$${r.potentialPayout.toFixed(2)}`)}`
    );

    // Confidence bar
    const confPct = (r.confidence * 100).toFixed(0);
    const confBar = wideBar(r.confidence, 20);
    console.log(
      `     ${c.dim("confidence")} ${confBar} ${c.value(confPct + "%")}`
    );

    // Metrics row
    const evStr = r.expectedValue >= 0
      ? c.long(`+$${r.expectedValue.toFixed(3)}`)
      : c.short(`-$${Math.abs(r.expectedValue).toFixed(3)}`);
    console.log(
      `     ${c.dim("ev/dollar")} ${evStr}  ` +
      `${c.dim("kelly")} ${c.value((r.kellyFraction * 100).toFixed(1) + "%")}  ` +
      `${c.dim("size")} ${c.amber("$" + r.suggestedSize.toFixed(2))}`
    );

    // Reasoning
    console.log(c.dim(`     ${r.reasoning.slice(0, 90)}`));
    console.log();
  }
}

// ── Live Mode ──

export function printLiveHeader(intervalSec: number) {
  printHeader();
  printSectionHeader("Live Monitor", "◈");
  console.log(c.dim(`  polling every ${intervalSec}s — ctrl+c to exit`));
  console.log();
}

export function printLiveTick(newCount: number) {
  const ts = new Date().toLocaleTimeString("en-US", { hour12: false });
  if (newCount === 0) {
    console.log(c.dim(`  ${ts}  ·  no new signals`));
  } else {
    console.log(c.brand(`  ${ts}  ·  ${newCount} new items detected`));
  }
}

export function printLiveAlert(recs: BetRecommendation[]) {
  console.log();
  console.log(c.warn("  ┌─────────────────────────────────────────┐"));
  console.log(c.warn("  │") + c.value("  SIGNAL DETECTED                         ") + c.warn("│"));
  console.log(c.warn("  └─────────────────────────────────────────┘"));
  printRecommendations(recs);
}

// ── No Results States ──

export function printNoMatches() {
  console.log();
  console.log(c.dim("  no matching markets found for current news cycle"));
  console.log(c.dim("  try: recommend <url> for targeted analysis"));
  console.log();
}

export function printNoRecommendations() {
  console.log();
  console.log(c.dim("  markets efficiently priced — no edge detected"));
  console.log(c.dim("  matched markets shown above for manual review"));
  console.log();
}

// ── Status Dashboard ──

export function printConfigStatus(checks: { name: string; ok: boolean; detail: string }[]) {
  printSectionHeader("System Status", "◇");
  console.log();

  for (const check of checks) {
    const icon = check.ok ? c.long("●") : c.dim("○");
    const status = check.ok ? c.long("ready") : c.dim("not configured");
    console.log(
      `  ${icon} ${c.value(check.name.padEnd(18))} ${status.padEnd(30)} ${c.dim(check.detail)}`
    );
  }
  console.log();
}

// ── Watchlist ──

export function printWatchlist(
  entries: { question: string; addedPrice: { yes: number; no: number }; currentPrice?: { yes: number; no: number }; addedAt: string; notes?: string }[]
) {
  if (entries.length === 0) {
    console.log(c.dim("  watchlist empty — use: watch add <market-id>"));
    return;
  }

  printSectionHeader("Watchlist", "★");
  console.log();

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const idx = c.dim(`${String(i + 1).padStart(2)}.`);

    console.log(`  ${idx} ${c.value(e.question)}`);

    // Price at add time
    let priceLine = `     ${c.dim("added")} ${priceTag(e.addedPrice.yes)}/${priceTag(e.addedPrice.no)}`;

    // Current price + delta if available
    if (e.currentPrice) {
      const deltaYes = e.currentPrice.yes - e.addedPrice.yes;
      const deltaStr = deltaYes >= 0
        ? c.long(`+${(deltaYes * 100).toFixed(0)}¢`)
        : c.short(`${(deltaYes * 100).toFixed(0)}¢`);

      priceLine += `  ${c.dim("→ now")} ${priceTag(e.currentPrice.yes)}/${priceTag(e.currentPrice.no)}  ${deltaStr}`;
    }
    console.log(priceLine);

    if (e.notes) {
      console.log(`     ${c.dim(e.notes)}`);
    }

    const addedDate = new Date(e.addedAt).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    console.log(c.dim(`     since ${addedDate}`));
    console.log();
  }
}

// ── Odds Calculator ──

export function printOddsConversion(result: OddsResult) {
  printSectionHeader("Odds Conversion", "◇");
  console.log();
  const rows = [
    ["probability", `${(result.probability * 100).toFixed(2)}%`],
    ["decimal", result.decimal.toFixed(3)],
    ["american", result.american > 0 ? `+${result.american}` : String(result.american)],
    ["fractional", result.fractional],
  ];
  for (const [k, v] of rows) {
    console.log(`  ${c.label(k.padEnd(16))} ${c.value(v)}`);
  }
  console.log();
}

export function printEdgeAnalysis(edge: EdgeAnalysis) {
  printSectionHeader("Edge Analysis", "◆");
  console.log();
  const edgeColor = edge.edge > 0 ? c.long : c.short;
  const evColor = edge.ev > 0 ? c.long : c.short;
  const rows = [
    ["your estimate", `${(edge.userProb * 100).toFixed(1)}%`],
    ["market price", `${(edge.marketProb * 100).toFixed(1)}%`],
    ["edge", edgeColor(`${(edge.edge * 100).toFixed(1)}%`)],
    ["ev per $1", evColor(`$${edge.ev.toFixed(4)}`)],
    ["kelly fraction", `${(edge.kellyFraction * 100).toFixed(1)}%`],
    ["suggested size", c.amber(`$${edge.kellySuggested.toFixed(2)}`)],
  ];
  for (const [k, v] of rows) {
    console.log(`  ${c.label(k.padEnd(16))} ${v}`);
  }
  console.log();
}

// ── Market Detail ──

export function printMarketDetail(
  market: Market,
  orderbook?: { bids: { price: number; size: number }[]; asks: { price: number; size: number }[]; spread: number; midpoint: number },
  relatedMarkets?: Market[]
) {
  printSectionHeader("Market Detail", "◈");
  console.log();

  console.log(`  ${c.value(market.question)}`);
  console.log(`  ${c.dim("slug:")} ${c.label(market.slug)}`);
  console.log(`  ${c.dim("id:")}   ${c.label(market.id)}`);
  console.log(`  ${c.dim("cat:")}  ${c.label(market.category || "—")}  ${c.dim("ends:")} ${c.label(fmtDate(market.endDate))}`);
  console.log();

  // Prices
  const yesPrice = market.outcomePrices[0] ?? 0;
  const noPrice = market.outcomePrices[1] ?? 1 - yesPrice;
  console.log(`  ${c.dim("YES")} ${priceTag(yesPrice)}   ${c.dim("NO")} ${priceTag(noPrice)}   ${c.dim("vol")} ${c.amber(fmtVol(market.volume))}  ${c.dim("liq")} ${c.amber(fmtVol(market.liquidity))}`);
  console.log();

  // Description
  if (market.description) {
    const desc = market.description.slice(0, 300);
    console.log(`  ${c.dim(desc)}${market.description.length > 300 ? "..." : ""}`);
    console.log();
  }

  // Orderbook
  if (orderbook) {
    console.log(`  ${c.brand("ORDER BOOK")}`);
    console.log(`  ${c.dim("spread:")} ${c.amber((orderbook.spread * 100).toFixed(1) + "¢")}  ${c.dim("mid:")} ${c.amber((orderbook.midpoint * 100).toFixed(1) + "¢")}`);
    console.log();
    console.log(`  ${c.long("BIDS".padEnd(24))} ${c.short("ASKS")}`);
    const depth = 5;
    for (let i = 0; i < depth; i++) {
      const bid = orderbook.bids[i];
      const ask = orderbook.asks[i];
      const bidStr = bid ? `${c.long((bid.price * 100).toFixed(1).padStart(5) + "¢")} ${c.dim(bid.size.toFixed(0).padStart(8))}` : c.dim("—".padStart(15));
      const askStr = ask ? `${c.short((ask.price * 100).toFixed(1).padStart(5) + "¢")} ${c.dim(ask.size.toFixed(0).padStart(8))}` : c.dim("—".padStart(15));
      console.log(`  ${bidStr}    ${askStr}`);
    }
    console.log();
  }

  // Related markets
  if (relatedMarkets && relatedMarkets.length > 0) {
    console.log(`  ${c.brand("RELATED MARKETS")}`);
    for (const rm of relatedMarkets.slice(0, 5)) {
      const rYes = rm.outcomePrices[0] ?? 0;
      console.log(`  ${c.dim("├─")} ${c.value(rm.question.slice(0, 50).padEnd(50))} ${priceTag(rYes)}`);
    }
    console.log();
  }
}

// ── Trending & Categories ──

export function printTrending(events: TrendingEvent[]) {
  printSectionHeader("Trending Events", "▲");
  console.log();

  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    const idx = c.dim(`${String(i + 1).padStart(2)}.`);
    console.log(`  ${idx} ${c.value(e.title.slice(0, 60))}`);
    console.log(`     ${c.dim("vol")} ${c.amber(fmtVol(e.volume))}  ${c.dim("liq")} ${c.amber(fmtVol(e.liquidity))}  ${c.dim("markets")} ${c.value(String(e.marketCount))}  ${c.dim("cat")} ${c.label(e.category || "—")}`);
    console.log();
  }
}

export function printCategories(categories: CategorySummary[]) {
  printSectionHeader("Categories", "◇");
  console.log();

  for (const cat of categories) {
    console.log(`  ${c.brand(cat.name.padEnd(24))} ${c.value(String(cat.marketCount).padStart(4))} markets  ${c.amber(fmtVol(cat.totalVolume).padStart(10))} vol`);
    for (const m of cat.topMarkets) {
      const yp = m.outcomePrices[0] ?? 0;
      console.log(`    ${c.dim("└")} ${c.dim(m.question.slice(0, 50))}  ${priceTag(yp)}`);
    }
  }
  console.log();
}

// ── Arbitrage ──

export function printArbitrage(opps: ArbOpportunity[]) {
  printSectionHeader("Arbitrage Opportunities", "◆");
  console.log();

  if (opps.length === 0) {
    console.log(c.dim("  no arbitrage opportunities found"));
    console.log();
    return;
  }

  for (let i = 0; i < opps.length; i++) {
    const o = opps[i];
    const idx = c.dim(`${String(i + 1).padStart(2)}.`);
    const verified = o.deepVerified === true ? c.long(" [verified]") : o.deepVerified === false ? c.short(" [unverified]") : "";
    console.log(`  ${idx} ${c.value(o.market.question.slice(0, 60))}${verified}`);
    console.log(`     ${c.dim("buy YES")} ${priceTag(o.effectiveYes ?? o.yesPrice)} + ${c.dim("NO")} ${priceTag(o.effectiveNo ?? o.noPrice)} = ${c.amber((o.totalCost * 100).toFixed(1) + "¢")}  ${c.long("profit " + o.profitCents + "¢/share")}`);
    console.log();
  }
}

// ── Alerts ──

export function printAlerts(alerts: PriceAlert[]) {
  printSectionHeader("Price Alerts", "◈");
  console.log();

  if (alerts.length === 0) {
    console.log(c.dim("  no alerts set — use: alert add <query> --side YES --above 0.75"));
    console.log();
    return;
  }

  for (let i = 0; i < alerts.length; i++) {
    const a = alerts[i];
    const idx = c.dim(`${String(i + 1).padStart(2)}.`);
    const statusIcon = a.triggered ? c.long("●") : c.dim("○");
    const triggerStr = `${a.side} ${a.direction} ${(a.threshold * 100).toFixed(0)}¢`;
    console.log(`  ${idx} ${statusIcon} ${c.value(a.marketQuestion.slice(0, 50))}  ${c.amber(triggerStr)}`);
    if (a.triggered) {
      console.log(`     ${c.long("triggered")} ${c.dim(a.triggeredAt ?? "")}`);
    }
  }
  console.log();
}

export function printAlertChecks(results: AlertCheckResult[]) {
  const triggered = results.filter((r) => r.triggered);
  if (triggered.length > 0) {
    console.log(c.warn("  ┌─────────────────────────────────────────┐"));
    console.log(c.warn("  │") + c.value("  ALERTS TRIGGERED                        ") + c.warn("│"));
    console.log(c.warn("  └─────────────────────────────────────────┘"));
    for (const r of triggered) {
      console.log(`  ${c.long("●")} ${c.value(r.alert.marketQuestion.slice(0, 50))}`);
      console.log(`    ${r.alert.side} now ${priceTag(r.currentPrice)} (threshold: ${r.alert.direction} ${(r.alert.threshold * 100).toFixed(0)}¢)`);
    }
    console.log();
  } else {
    console.log(c.dim(`  checked ${results.length} alerts — none triggered`));
  }
}

// ── Keyword Alerts ──

export function printKeywords(keywords: KeywordWatch[]) {
  printSectionHeader("Keyword Watches", "◈");
  console.log();

  if (keywords.length === 0) {
    console.log(c.dim("  no keywords set — use: kw add <keyword>"));
    console.log();
    return;
  }

  for (let i = 0; i < keywords.length; i++) {
    const kw = keywords[i];
    const idx = c.dim(`${String(i + 1).padStart(2)}.`);
    console.log(`  ${idx} ${c.value(kw.keyword)}  ${c.dim("since " + new Date(kw.addedAt).toLocaleDateString())}`);
  }
  console.log();
}

export function printKeywordMatches(matches: KeywordMatch[]) {
  if (matches.length === 0) return;

  console.log(c.warn("  ┌─────────────────────────────────────────┐"));
  console.log(c.warn("  │") + c.value("  KEYWORD MATCHES                         ") + c.warn("│"));
  console.log(c.warn("  └─────────────────────────────────────────┘"));
  for (const m of matches) {
    console.log(`  ${c.brand(m.keyword.padEnd(16))} ${c.value(m.newsTitle.slice(0, 60))}`);
  }
  console.log();
}

// ── History ──

export function printHistory(entries: HistoryEntry[]) {
  printSectionHeader("Recommendation History", "◇");
  console.log();

  if (entries.length === 0) {
    console.log(c.dim("  no recommendations logged yet"));
    console.log();
    return;
  }

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const idx = c.dim(`${String(i + 1).padStart(2)}.`);
    const resIcon = e.resolution === "correct" ? c.long("✓") : e.resolution === "incorrect" ? c.short("✗") : c.dim("○");
    const date = new Date(e.recordedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    console.log(`  ${idx} ${resIcon} ${c.value(e.marketQuestion.slice(0, 50))}`);
    console.log(`     ${e.side === "YES" ? c.long("YES") : c.short("NO")} @ ${priceTag(e.priceAtRec)}  ${c.dim("conf")} ${c.value((e.confidence * 100).toFixed(0) + "%")}  ${c.dim("ev")} ${c.value("$" + e.expectedValue.toFixed(3))}  ${c.dim(date)}`);
    console.log();
  }
}

export function printAccuracyStats(stats: {
  total: number; resolved: number; correct: number; incorrect: number;
  pending: number; winRate: number; avgEV: number; avgConfidence: number;
}) {
  printSectionHeader("Accuracy Stats", "◆");
  console.log();

  const winColor = stats.winRate >= 0.5 ? c.long : c.short;
  const rows = [
    ["total recs", String(stats.total)],
    ["resolved", `${stats.resolved} (${stats.correct} correct, ${stats.incorrect} incorrect)`],
    ["pending", String(stats.pending)],
    ["win rate", winColor(`${(stats.winRate * 100).toFixed(1)}%`)],
    ["avg EV", `$${stats.avgEV.toFixed(4)}`],
    ["avg confidence", `${(stats.avgConfidence * 100).toFixed(1)}%`],
  ];
  for (const [k, v] of rows) {
    console.log(`  ${c.label(k.padEnd(16))} ${c.value(v)}`);
  }
  console.log();
}

// ── Correlation ──

export function printCorrelation(groups: CorrelationGroup[]) {
  printSectionHeader("Market Correlation", "◉");
  console.log();

  if (groups.length === 0) {
    console.log(c.dim("  no multi-market events found"));
    console.log();
    return;
  }

  for (const g of groups) {
    const anomalyLabel = g.anomaly
      ? g.anomalyType === "over"
        ? c.short(" [OVER-PRICED Σ>" + (g.totalYesProb * 100).toFixed(0) + "%]")
        : c.long(" [UNDER-PRICED Σ=" + (g.totalYesProb * 100).toFixed(0) + "%]")
      : c.dim(" [Σ=" + (g.totalYesProb * 100).toFixed(0) + "%]");

    console.log(`  ${c.value(g.eventTitle.slice(0, 55))}${anomalyLabel}`);
    for (const m of g.markets.slice(0, 6)) {
      const yp = m.outcomePrices[0] ?? 0;
      console.log(`    ${c.dim("├─")} ${c.dim(m.question.slice(0, 48).padEnd(48))} ${priceTag(yp)}`);
    }
    if (g.markets.length > 6) {
      console.log(`    ${c.dim(`└─ ...and ${g.markets.length - 6} more`)}`);
    }
    console.log();
  }
}

// ── Portfolio ──

export function printPortfolio(data: {
  balance: number;
  positionsValue: number;
  totalValue: number;
  totalPnL: number;
  positions: Array<{ marketQuestion: string; side: string; shares: number; avgCost: number; totalCost: number; currentPrice: number; currentValue: number; unrealizedPnL: number }>;
}) {
  printSectionHeader("Paper Portfolio", "◆");
  console.log();

  const pnlColor = data.totalPnL >= 0 ? c.long : c.short;
  const pnlSign = data.totalPnL >= 0 ? "+" : "";
  console.log(`  ${c.dim("cash")}       ${c.amber("$" + data.balance.toFixed(2))}`);
  console.log(`  ${c.dim("positions")}  ${c.amber("$" + data.positionsValue.toFixed(2))}`);
  console.log(`  ${c.dim("total")}      ${c.value("$" + data.totalValue.toFixed(2))}  ${pnlColor(pnlSign + "$" + data.totalPnL.toFixed(2))}`);
  console.log();

  if (data.positions.length === 0) {
    console.log(c.dim("  no open positions — use: portfolio buy <query> <amount>"));
    console.log();
    return;
  }

  for (let i = 0; i < data.positions.length; i++) {
    const p = data.positions[i];
    const idx = c.dim(`${String(i + 1).padStart(2)}.`);
    const pnlC = p.unrealizedPnL >= 0 ? c.long : c.short;
    const pnlS = p.unrealizedPnL >= 0 ? "+" : "";
    console.log(`  ${idx} ${c.value(p.marketQuestion.slice(0, 50))}`);
    console.log(`     ${p.side === "YES" ? c.long("YES") : c.short("NO")} ${c.dim("shares")} ${c.value(p.shares.toFixed(1))}  ${c.dim("avg")} ${priceTag(p.avgCost)}  ${c.dim("now")} ${priceTag(p.currentPrice)}  ${pnlC(pnlS + "$" + p.unrealizedPnL.toFixed(2))}`);
    console.log();
  }
}

export function printTradeHistory(trades: Trade[]) {
  printSectionHeader("Trade History", "◇");
  console.log();

  if (trades.length === 0) {
    console.log(c.dim("  no trades yet"));
    console.log();
    return;
  }

  for (const t of trades) {
    const typeIcon = t.type === "buy" ? c.long("BUY ") : c.short("SELL");
    const date = new Date(t.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    let line = `  ${typeIcon} ${c.value(t.marketQuestion.slice(0, 40))}  ${t.side} @ ${priceTag(t.price)}  ${c.amber("$" + t.total.toFixed(2))}`;
    if (t.pnl !== undefined) {
      const pnlC = t.pnl >= 0 ? c.long : c.short;
      line += `  ${pnlC((t.pnl >= 0 ? "+" : "") + "$" + t.pnl.toFixed(2))}`;
    }
    console.log(line + `  ${c.dim(date)}`);
  }
  console.log();
}

// ── Momentum ──

export function printMomentum(result: MomentumResult) {
  printSectionHeader("Price Momentum", "▲");
  console.log();

  console.log(`  ${c.value(result.question)}`);
  console.log(`  ${c.dim("current")} ${priceTag(result.currentPrice)}  ${c.dim("trend")} ${
    result.trend === "up" ? c.long("▲ UP") : result.trend === "down" ? c.short("▼ DOWN") : c.dim("━ FLAT")
  }`);
  console.log();

  // Sparkline
  if (result.sparkline) {
    console.log(`  ${c.dim("history")} ${c.brand(result.sparkline)}`);
  }

  // Deltas
  const deltas = [
    ["1h", result.deltas["1h"]],
    ["6h", result.deltas["6h"]],
    ["24h", result.deltas["24h"]],
    ["7d", result.deltas["7d"]],
  ] as const;

  let deltaLine = "  ";
  for (const [label, val] of deltas) {
    if (val === null) {
      deltaLine += `${c.dim(label)} ${c.dim("—")}  `;
    } else {
      const sign = val >= 0 ? "+" : "";
      const color = val > 0 ? c.long : val < 0 ? c.short : c.dim;
      deltaLine += `${c.dim(label)} ${color(`${sign}${(val * 100).toFixed(1)}¢`)}  `;
    }
  }
  console.log(deltaLine);
  console.log();
}

// ── Backtest ──

export function printBacktest(result: BacktestResult, detailed = false) {
  printSectionHeader("Backtest Results", "◆");
  console.log();

  const hitColor = result.hitRate >= 0.5 ? c.long : c.short;
  const roiColor = result.totalROI >= 0 ? c.long : c.short;
  const rows: [string, string][] = [
    ["total recs", String(result.totalRecs)],
    ["resolved", `${result.resolved} (${result.correct}W / ${result.incorrect}L)`],
    ["hit rate", hitColor(`${(result.hitRate * 100).toFixed(1)}%`)],
    ["total ROI", roiColor(`${(result.totalROI * 100).toFixed(1)}%`)],
    ["brier score", c.value(result.brierScore.toFixed(4))],
  ];
  for (const [k, v] of rows) {
    console.log(`  ${c.label(k.padEnd(16))} ${v}`);
  }
  console.log();

  // Calibration
  if (result.calibration.length > 0) {
    console.log(`  ${c.brand("CALIBRATION")}`);
    for (const bucket of result.calibration) {
      if (bucket.count === 0) continue;
      const predBar = miniBar(bucket.predicted, 10);
      const actBar = miniBar(bucket.actual, 10);
      console.log(
        `  ${c.dim(bucket.range.padEnd(10))} ` +
        `${c.dim("pred")} ${predBar} ${c.value((bucket.predicted * 100).toFixed(0) + "%")}  ` +
        `${c.dim("actual")} ${actBar} ${c.value((bucket.actual * 100).toFixed(0) + "%")}  ` +
        `${c.dim("n=")}${c.value(String(bucket.count))}`
      );
    }
    console.log();
  }

  // Detailed entries
  if (detailed && result.details.length > 0) {
    console.log(`  ${c.brand("DETAILS")}`);
    for (const d of result.details) {
      const resIcon = d.resolution === "correct" ? c.long("✓") : c.short("✗");
      const pnlColor = d.pnl >= 0 ? c.long : c.short;
      const pnlStr = d.pnl >= 0 ? `+$${d.pnl.toFixed(2)}` : `-$${Math.abs(d.pnl).toFixed(2)}`;
      console.log(
        `  ${resIcon} ${c.value(d.marketQuestion.slice(0, 45))}  ` +
        `${d.side === "YES" ? c.long("YES") : c.short("NO")} @ ${priceTag(d.priceAtRec)}  ` +
        `${c.dim("conf")} ${c.value((d.confidence * 100).toFixed(0) + "%")}  ` +
        `${pnlColor(pnlStr)}`
      );
    }
    console.log();
  }
}

// ── Calendar ──

export function printCalendar(buckets: CalendarBucket[]) {
  printSectionHeader("Resolution Calendar", "◇");
  console.log();

  if (buckets.length === 0) {
    console.log(c.dim("  no upcoming resolutions found"));
    console.log();
    return;
  }

  for (const bucket of buckets) {
    console.log(`  ${c.brand(bucket.label.toUpperCase())}`);
    for (const cm of bucket.markets.slice(0, 8)) {
      const daysStr = cm.daysUntil <= 0 ? c.warn("today") : c.dim(`${cm.daysUntil}d`);
      console.log(
        `    ${c.dim("├─")} ${c.value(cm.market.question.slice(0, 50).padEnd(50))} ` +
        `${priceTag(cm.yesPrice)} ${daysStr}`
      );
    }
    if (bucket.markets.length > 8) {
      console.log(`    ${c.dim(`└─ ...and ${bucket.markets.length - 8} more`)}`);
    }
    console.log();
  }
}

// ── Liquidity ──

export function printLiquidity(profiles: LiquidityProfile[]) {
  printSectionHeader("Liquidity Analysis", "◈");
  console.log();

  if (profiles.length === 0) {
    console.log(c.dim("  no liquidity data available"));
    console.log();
    return;
  }

  for (let i = 0; i < profiles.length; i++) {
    const p = profiles[i];
    const idx = c.dim(`${String(i + 1).padStart(2)}.`);
    const scoreBar = miniBar(p.liquidityScore, 8);
    const scoreColor = p.liquidityScore >= 0.7 ? c.long : p.liquidityScore >= 0.4 ? c.amber : c.short;

    console.log(`  ${idx} ${c.value(p.market.question.slice(0, 55))}`);
    console.log(
      `     ${c.dim("score")} ${scoreBar} ${scoreColor((p.liquidityScore * 100).toFixed(0) + "%")}  ` +
      `${c.dim("spread")} ${c.amber((p.spread * 100).toFixed(1) + "¢")}  ` +
      `${c.dim("mid")} ${priceTag(p.midpoint)}`
    );
    console.log(
      `     ${c.dim("bid $")}${c.long(fmtVol(p.totalBidLiquidity))} ` +
      `${c.dim("ask $")}${c.short(fmtVol(p.totalAskLiquidity))}`
    );

    // Mini depth view
    if (p.bidDepth.length > 0 || p.askDepth.length > 0) {
      const depth = Math.min(3, Math.max(p.bidDepth.length, p.askDepth.length));
      for (let d = 0; d < depth; d++) {
        const bid = p.bidDepth[d];
        const ask = p.askDepth[d];
        const bidStr = bid ? `${c.long((bid.price * 100).toFixed(1).padStart(5) + "¢")} ${c.dim(bid.size.toFixed(0).padStart(7))}` : c.dim("—".padStart(14));
        const askStr = ask ? `${c.short((ask.price * 100).toFixed(1).padStart(5) + "¢")} ${c.dim(ask.size.toFixed(0).padStart(7))}` : c.dim("—".padStart(14));
        console.log(`     ${bidStr}  ${askStr}`);
      }
    }
    console.log();
  }
}

// ── Smart Keyword Matches ──

export function printSmartKeywordMatches(matches: SmartKeywordMatch[]) {
  if (matches.length === 0) {
    console.log(c.dim("  no smart keyword matches found"));
    return;
  }

  console.log(c.warn("  ┌─────────────────────────────────────────┐"));
  console.log(c.warn("  │") + c.value("  SMART KEYWORD MATCHES                   ") + c.warn("│"));
  console.log(c.warn("  └─────────────────────────────────────────┘"));

  for (const m of matches) {
    console.log(`  ${c.brand(m.keyword.padEnd(16))} ${c.value(m.newsTitle.slice(0, 60))}`);

    for (const market of m.markets.slice(0, 3)) {
      const yp = market.market.outcomePrices[0] ?? 0;
      console.log(
        `    ${c.brandDim("├─")} ${c.dim(market.market.question.slice(0, 48).padEnd(48))} ${priceTag(yp)} ` +
        `${c.dim("rel")} ${c.value((market.relevanceScore * 100).toFixed(0) + "%")}`
      );
    }

    for (const rec of m.recommendations.slice(0, 2)) {
      const arrow = rec.side === "YES" ? c.long("▲ YES") : c.short("▼ NO");
      console.log(
        `    ${c.brandDim("└─")} ${arrow} @ ${c.amber(`$${rec.currentPrice.toFixed(2)}`)} ` +
        `${c.dim("conf")} ${c.value((rec.confidence * 100).toFixed(0) + "%")} ` +
        `${c.dim("ev")} ${rec.expectedValue >= 0 ? c.long(`+$${rec.expectedValue.toFixed(3)}`) : c.short(`-$${Math.abs(rec.expectedValue).toFixed(3)}`)}`
      );
    }
    console.log();
  }
}

// ── Portfolio Risk ──

export function printPortfolioRisk(risk: PortfolioRisk) {
  printSectionHeader("Portfolio Risk", "◆");
  console.log();

  const concColor = risk.concentrationScore > 0.5 ? c.short : risk.concentrationScore > 0.25 ? c.amber : c.long;
  const divColor = risk.diversificationIndex >= 0.8 ? c.long : risk.diversificationIndex >= 0.5 ? c.amber : c.short;

  const rows: [string, string][] = [
    ["concentration", concColor(`${(risk.concentrationScore * 100).toFixed(1)}% (Herfindahl)`)],
    ["diversification", divColor(`${(risk.diversificationIndex * 100).toFixed(1)}%`)],
    ["max drawdown", c.short(`$${risk.maxDrawdownExposure.toFixed(2)}`)],
  ];
  for (const [k, v] of rows) {
    console.log(`  ${c.label(k.padEnd(18))} ${v}`);
  }
  console.log();

  // Correlated groups
  if (risk.correlatedGroups.length > 0) {
    console.log(`  ${c.brand("CORRELATED POSITIONS")}`);
    for (const g of risk.correlatedGroups) {
      console.log(`  ${c.warn("!")} ${c.value(g.reason)}`);
      for (const p of g.positions) {
        console.log(`    ${c.dim("├─")} ${c.dim(p)}`);
      }
    }
    console.log();
  }

  // Hedge suggestions
  if (risk.hedgeSuggestions.length > 0) {
    console.log(`  ${c.brand("HEDGE SUGGESTIONS")}`);
    for (const h of risk.hedgeSuggestions) {
      console.log(`  ${c.blue("→")} ${c.value(h.description)}`);
      console.log(`    ${c.dim(h.currentExposure)}`);
    }
    console.log();
  }
}

// ── Compare ──

export function printComparison(
  market1: Market,
  market2: Market,
  orderbook1?: OrderBook,
  orderbook2?: OrderBook
) {
  printSectionHeader("Market Comparison", "◈");
  console.log();

  const colW = 38;

  // Headers
  console.log(
    `  ${c.brand("MARKET A".padEnd(colW))}  ${c.dim("│")}  ${c.brand("MARKET B")}`
  );
  console.log(c.dim("  " + "─".repeat(colW) + "──┼──" + "─".repeat(colW)));

  // Questions
  console.log(
    `  ${c.value(market1.question.slice(0, colW).padEnd(colW))}  ${c.dim("│")}  ${c.value(market2.question.slice(0, colW))}`
  );

  // Prices
  const y1 = market1.outcomePrices[0] ?? 0;
  const n1 = market1.outcomePrices[1] ?? 1 - y1;
  const y2 = market2.outcomePrices[0] ?? 0;
  const n2 = market2.outcomePrices[1] ?? 1 - y2;
  const price1Str = `YES ${pad(priceTag(y1), 5)} / NO ${pad(priceTag(n1), 5)}`;
  const price2Str = `YES ${pad(priceTag(y2), 5)} / NO ${pad(priceTag(n2), 5)}`;
  console.log(`  ${pad(price1Str, colW)}  ${c.dim("│")}  ${price2Str}`);

  // Volume
  console.log(
    `  ${c.dim("vol")} ${pad(c.amber(fmtVol(market1.volume)), colW - 4)}  ${c.dim("│")}  ${c.dim("vol")} ${c.amber(fmtVol(market2.volume))}`
  );

  // Liquidity
  console.log(
    `  ${c.dim("liq")} ${pad(c.amber(fmtVol(market1.liquidity)), colW - 4)}  ${c.dim("│")}  ${c.dim("liq")} ${c.amber(fmtVol(market2.liquidity))}`
  );

  // Category
  console.log(
    `  ${c.dim("cat")} ${pad(c.label(market1.category || "—"), colW - 4)}  ${c.dim("│")}  ${c.dim("cat")} ${c.label(market2.category || "—")}`
  );

  // End date
  console.log(
    `  ${c.dim("end")} ${pad(c.label(fmtDate(market1.endDate)), colW - 4)}  ${c.dim("│")}  ${c.dim("end")} ${c.label(fmtDate(market2.endDate))}`
  );

  // Orderbook comparison
  if (orderbook1 || orderbook2) {
    console.log(c.dim("  " + "─".repeat(colW) + "──┼──" + "─".repeat(colW)));
    const ob1 = orderbook1 ?? { spread: 0, midpoint: 0, bids: [], asks: [] };
    const ob2 = orderbook2 ?? { spread: 0, midpoint: 0, bids: [], asks: [] };
    console.log(
      `  ${c.dim("spread")} ${pad(c.amber((ob1.spread * 100).toFixed(1) + "¢"), colW - 7)}  ${c.dim("│")}  ${c.dim("spread")} ${c.amber((ob2.spread * 100).toFixed(1) + "¢")}`
    );
    console.log(
      `  ${c.dim("mid")} ${pad(priceTag(ob1.midpoint), colW - 4)}  ${c.dim("│")}  ${c.dim("mid")} ${priceTag(ob2.midpoint)}`
    );
  }

  console.log();
}

// ── Social Signals ──

export function printSocialSignals(signal: SocialSignal) {
  printSectionHeader(`Social Signals: "${signal.query}"`, "◉");
  console.log();

  console.log(`  ${c.dim("source")}   ${c.value(signal.source)}  ${c.dim("mentions")} ${c.value(String(signal.mentionCount))}`);
  console.log(`  ${c.dim("fetched")}  ${c.dim(new Date(signal.fetchedAt).toLocaleTimeString())}`);
  console.log();

  // Sentiment bar
  const total = signal.sentiment.pos + signal.sentiment.neg + signal.sentiment.neutral;
  if (total > 0) {
    const posW = Math.round((signal.sentiment.pos / total) * 30);
    const negW = Math.round((signal.sentiment.neg / total) * 30);
    const neutW = 30 - posW - negW;
    const bar = c.long("█".repeat(posW)) + c.dim("█".repeat(neutW)) + c.short("█".repeat(negW));
    console.log(`  ${c.dim("sentiment")} ${bar}`);
    console.log(
      `  ${c.long("+" + signal.sentiment.pos)}  ` +
      `${c.dim("~" + signal.sentiment.neutral)}  ` +
      `${c.short("-" + signal.sentiment.neg)}`
    );
    console.log();
  }

  // Top posts
  if (signal.topPosts.length > 0) {
    console.log(`  ${c.brand("TOP POSTS")}`);
    for (const post of signal.topPosts.slice(0, 8)) {
      const score = post.score >= 100 ? c.long(String(post.score).padStart(5)) : c.dim(String(post.score).padStart(5));
      console.log(
        `  ${score} ${c.purple(("r/" + post.subreddit).padEnd(18).slice(0, 18))} ${c.value(post.title.slice(0, 50))}`
      );
    }
    console.log();
  }
}

// ── Event Tree ──

export function printEventTree(trees: EventTree[]) {
  printSectionHeader("Event Tree", "◉");
  console.log();

  if (trees.length === 0) {
    console.log(c.dim("  no multi-market events found"));
    console.log();
    return;
  }

  for (const tree of trees) {
    const sumPct = (tree.totalYesProb * 100).toFixed(1);
    const anomalyLabel = tree.anomaly
      ? tree.totalYesProb > 1.05
        ? c.short(` [OVER Σ=${sumPct}%]`)
        : c.long(` [UNDER Σ=${sumPct}%]`)
      : c.dim(` [Σ=${sumPct}%]`);

    console.log(`  ${c.brand(B.dtl + B.dh)} ${c.value(`"${tree.eventTitle.slice(0, 50)}"`)}${anomalyLabel}`);

    for (let i = 0; i < tree.markets.length; i++) {
      const m = tree.markets[i];
      const isLast = i === tree.markets.length - 1;
      const connector = isLast ? B.dbl : B.dvr;
      const pricePct = (m.yesPrice * 100).toFixed(0);
      const barLen = Math.round(m.yesPrice * 15);
      const bar = c.brand("█".repeat(barLen)) + c.muted("░".repeat(15 - barLen));

      console.log(
        `  ${c.brand(connector + B.h)} ${c.value(m.market.question.slice(0, 30).padEnd(30))} ` +
        `${priceTag(m.yesPrice)}  ${bar}  ${c.amber(fmtVol(m.volume))}`
      );
    }
    console.log();
  }
}

// ── Digest ──

export function printDigest(digest: DigestData) {
  printSectionHeader("Daily Digest", "★");
  console.log();
  console.log(`  ${c.dim("generated")} ${c.value(new Date(digest.generatedAt).toLocaleString())}`);
  console.log();

  // Watchlist changes
  if (digest.watchlistChanges.length > 0) {
    console.log(`  ${c.brand("WATCHLIST CHANGES")}`);
    for (const w of digest.watchlistChanges) {
      const sign = w.delta >= 0 ? "+" : "";
      const color = w.delta >= 0 ? c.long : c.short;
      console.log(
        `  ${c.dim("├─")} ${c.value(w.question.slice(0, 45))} ` +
        `${priceTag(w.oldPrice)} ${c.dim("→")} ${priceTag(w.newPrice)} ` +
        `${color(`${sign}${(w.delta * 100).toFixed(0)}¢`)}`
      );
    }
    console.log();
  }

  // Triggered alerts
  if (digest.triggeredAlerts.length > 0) {
    console.log(c.warn("  ┌─────────────────────────────────────────┐"));
    console.log(c.warn("  │") + c.value("  TRIGGERED ALERTS                        ") + c.warn("│"));
    console.log(c.warn("  └─────────────────────────────────────────┘"));
    for (const a of digest.triggeredAlerts) {
      console.log(
        `  ${c.long("●")} ${c.value(a.question.slice(0, 45))} ${a.side} now ${priceTag(a.currentPrice)}`
      );
    }
    console.log();
  }

  // Recommendations
  if (digest.newRecommendations.length > 0) {
    console.log(`  ${c.brand("TOP RECOMMENDATIONS")}`);
    for (const r of digest.newRecommendations) {
      const arrow = r.side === "YES" ? c.long("▲ YES") : c.short("▼ NO");
      const evStr = r.expectedValue >= 0
        ? c.long(`+$${r.expectedValue.toFixed(3)}`)
        : c.short(`-$${Math.abs(r.expectedValue).toFixed(3)}`);
      console.log(
        `  ${c.dim("├─")} ${arrow} ${c.value(r.market.question.slice(0, 40))} ` +
        `@ ${c.amber(`${(r.currentPrice * 100).toFixed(0)}¢`)} ` +
        `${c.dim("ev")} ${evStr}`
      );
    }
    console.log();
  }

  // Resolved bets
  if (digest.resolvedBets.length > 0) {
    console.log(`  ${c.brand("RECENTLY RESOLVED")}`);
    for (const r of digest.resolvedBets) {
      const icon = r.resolution === "correct" ? c.long("✓") : c.short("✗");
      const pnlColor = r.pnl >= 0 ? c.long : c.short;
      const pnlStr = r.pnl >= 0 ? `+$${r.pnl.toFixed(2)}` : `-$${Math.abs(r.pnl).toFixed(2)}`;
      console.log(`  ${icon} ${c.value(r.question.slice(0, 45))} ${pnlColor(pnlStr)}`);
    }
    console.log();
  }

  // Upcoming resolutions
  if (digest.upcomingResolutions.length > 0) {
    console.log(`  ${c.brand("UPCOMING RESOLUTIONS (7d)")}`);
    for (const u of digest.upcomingResolutions) {
      console.log(
        `  ${c.dim("├─")} ${c.value(u.question.slice(0, 45))} ${priceTag(u.yesPrice)} ${c.dim(`${u.daysUntil}d`)}`
      );
    }
    console.log();
  }

  // Portfolio summary
  if (digest.portfolioSummary) {
    const p = digest.portfolioSummary;
    const pnlColor = p.totalPnL >= 0 ? c.long : c.short;
    const pnlSign = p.totalPnL >= 0 ? "+" : "";
    console.log(`  ${c.brand("PORTFOLIO")}`);
    console.log(`  ${c.dim("cash")} ${c.amber("$" + p.balance.toFixed(2))}  ${c.dim("positions")} ${c.amber("$" + p.positionsValue.toFixed(2))}  ${c.dim("total")} ${c.value("$" + p.totalValue.toFixed(2))}  ${pnlColor(pnlSign + "$" + p.totalPnL.toFixed(2))}`);
    console.log();
  }
}

// ── Utility ──

function priceTag(price: number): string {
  const cents = `${(price * 100).toFixed(0)}¢`;
  if (price >= 0.7) return c.long(cents.padStart(4));
  if (price <= 0.3) return c.short(cents.padStart(4));
  return c.amber(cents.padStart(4));
}

function fmtVol(vol: number): string {
  if (vol >= 1_000_000) return `$${(vol / 1_000_000).toFixed(1)}M `;
  if (vol >= 1_000) return `$${(vol / 1_000).toFixed(0)}K `;
  return `$${vol.toFixed(0)} `;
}

function fmtDate(dateStr: string): string {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return "—";
  }
}

function pad(str: string, width: number, align: "left" | "right" = "left"): string {
  // Strip ANSI codes for length calculation
  const visLen = str.replace(/\x1b\[[0-9;]*m/g, "").length;
  const diff = width - visLen;
  if (diff <= 0) return str;
  if (align === "right") return " ".repeat(diff) + str;
  return str + " ".repeat(diff);
}

function miniBar(value: number, width: number): string {
  const chars = ["░", "▒", "▓", "█"];
  const filled = Math.round(value * width);
  let bar = "";
  for (let i = 0; i < width; i++) {
    if (i < filled) {
      bar += c.brand("█");
    } else {
      bar += c.muted("░");
    }
  }
  return bar;
}

function wideBar(value: number, width: number): string {
  const filled = Math.round(value * width);
  let bar = "";
  for (let i = 0; i < width; i++) {
    if (i < filled) {
      // Gradient: green at low, cyan at mid, amber at high
      if (value < 0.4) bar += c.dim("█");
      else if (value < 0.7) bar += c.brand("█");
      else bar += c.long("█");
    } else {
      bar += c.muted("░");
    }
  }
  return bar;
}
