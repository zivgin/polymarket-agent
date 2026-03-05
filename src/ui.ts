import chalk from "chalk";
import type { BetRecommendation, Market, MarketMatch, NewsItem } from "./types/index.js";

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
