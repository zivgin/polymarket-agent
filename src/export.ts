// ── Export: JSON/CSV for scan results, watchlist, market lists ──

import fs from "fs";
import type { Market, BetRecommendation } from "./types/index.js";
import type { WatchlistEntry } from "./watchlist.js";

export type ExportFormat = "json" | "csv";

function detectFormat(filePath: string): ExportFormat {
  return filePath.endsWith(".csv") ? "csv" : "json";
}

export function exportMarkets(markets: Market[], filePath: string): void {
  const fmt = detectFormat(filePath);
  if (fmt === "csv") {
    const header = "id,question,slug,category,yes_price,no_price,volume,liquidity,end_date";
    const rows = markets.map((m) => {
      const yes = m.outcomePrices[0] ?? 0;
      const no = m.outcomePrices[1] ?? 1 - yes;
      return [
        csvEscape(m.id), csvEscape(m.question), csvEscape(m.slug),
        csvEscape(m.category), yes.toFixed(4), no.toFixed(4),
        m.volume.toFixed(2), m.liquidity.toFixed(2), csvEscape(m.endDate),
      ].join(",");
    });
    fs.writeFileSync(filePath, [header, ...rows].join("\n"));
  } else {
    fs.writeFileSync(filePath, JSON.stringify(markets, null, 2));
  }
}

export function exportRecommendations(recs: BetRecommendation[], filePath: string): void {
  const fmt = detectFormat(filePath);
  if (fmt === "csv") {
    const header = "market,side,confidence,ev,kelly,suggested_size,current_price,payout,reasoning";
    const rows = recs.map((r) =>
      [
        csvEscape(r.market.question), r.side, r.confidence.toFixed(3),
        r.expectedValue.toFixed(4), r.kellyFraction.toFixed(4),
        r.suggestedSize.toFixed(2), r.currentPrice.toFixed(4),
        r.potentialPayout.toFixed(2), csvEscape(r.reasoning),
      ].join(",")
    );
    fs.writeFileSync(filePath, [header, ...rows].join("\n"));
  } else {
    fs.writeFileSync(filePath, JSON.stringify(recs, null, 2));
  }
}

export function exportWatchlist(entries: WatchlistEntry[], filePath: string): void {
  const fmt = detectFormat(filePath);
  if (fmt === "csv") {
    const header = "id,question,slug,added_at,yes_price,no_price,notes";
    const rows = entries.map((e) =>
      [
        csvEscape(e.id), csvEscape(e.question), csvEscape(e.slug),
        csvEscape(e.addedAt), e.addedPrice.yes.toFixed(4),
        e.addedPrice.no.toFixed(4), csvEscape(e.notes ?? ""),
      ].join(",")
    );
    fs.writeFileSync(filePath, [header, ...rows].join("\n"));
  } else {
    fs.writeFileSync(filePath, JSON.stringify(entries, null, 2));
  }
}

function csvEscape(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}
