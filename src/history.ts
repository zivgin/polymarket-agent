// ── Historical Recommendation Tracker ──
// Log recommendations with timestamps, track accuracy

import fs from "fs";
import path from "path";
import type { BetRecommendation, Market } from "./types/index.js";
import type { PolymarketClient } from "./clients/polymarket.js";

const HISTORY_PATH = path.join(process.env.HOME ?? ".", "polymarket-agent", ".history.json");

export interface HistoryEntry {
  id: string;
  marketId: string;
  marketQuestion: string;
  marketSlug: string;
  side: "YES" | "NO";
  confidence: number;
  expectedValue: number;
  priceAtRec: number;
  suggestedSize: number;
  reasoning: string;
  recordedAt: string;
  resolution?: "correct" | "incorrect" | "pending";
  resolvedAt?: string;
  finalPrice?: number;
}

interface HistoryData {
  entries: HistoryEntry[];
}

function loadHistory(): HistoryData {
  try {
    return JSON.parse(fs.readFileSync(HISTORY_PATH, "utf-8"));
  } catch {
    return { entries: [] };
  }
}

function saveHistory(data: HistoryData): void {
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(data, null, 2));
}

export function getHistory(limit?: number): HistoryEntry[] {
  const entries = loadHistory().entries;
  entries.sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime());
  return limit ? entries.slice(0, limit) : entries;
}

export function logRecommendation(rec: BetRecommendation): HistoryEntry {
  const data = loadHistory();
  const entry: HistoryEntry = {
    id: `rec_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    marketId: rec.market.id,
    marketQuestion: rec.market.question,
    marketSlug: rec.market.slug,
    side: rec.side,
    confidence: rec.confidence,
    expectedValue: rec.expectedValue,
    priceAtRec: rec.currentPrice,
    suggestedSize: rec.suggestedSize,
    reasoning: rec.reasoning,
    recordedAt: new Date().toISOString(),
    resolution: "pending",
  };
  data.entries.push(entry);
  saveHistory(data);
  return entry;
}

export function logRecommendations(recs: BetRecommendation[]): HistoryEntry[] {
  return recs.map(logRecommendation);
}

export async function updateResolutions(client: PolymarketClient): Promise<{
  updated: number;
  correct: number;
  incorrect: number;
  pending: number;
}> {
  const data = loadHistory();
  let updated = 0;

  for (const entry of data.entries) {
    if (entry.resolution !== "pending") continue;

    try {
      const markets = await client.searchMarkets(entry.marketQuestion.slice(0, 30), 5);
      const match = markets.find((m) => m.id === entry.marketId);
      if (!match) continue;

      // Check if market is closed/resolved
      if (match.closed) {
        const winnerToken = match.tokens.find((t) => t.winner);
        if (winnerToken) {
          const winnerSide = winnerToken.outcome.toUpperCase() === "YES" ? "YES" : "NO";
          entry.resolution = winnerSide === entry.side ? "correct" : "incorrect";
          entry.resolvedAt = new Date().toISOString();
          entry.finalPrice = entry.side === "YES"
            ? match.outcomePrices[0] ?? 0
            : match.outcomePrices[1] ?? 0;
          updated++;
        }
      }
    } catch {
      // skip
    }
  }

  saveHistory(data);

  const correct = data.entries.filter((e) => e.resolution === "correct").length;
  const incorrect = data.entries.filter((e) => e.resolution === "incorrect").length;
  const pending = data.entries.filter((e) => e.resolution === "pending").length;

  return { updated, correct, incorrect, pending };
}

export function getAccuracyStats(): {
  total: number;
  resolved: number;
  correct: number;
  incorrect: number;
  pending: number;
  winRate: number;
  avgEV: number;
  avgConfidence: number;
} {
  const entries = loadHistory().entries;
  const total = entries.length;
  const correct = entries.filter((e) => e.resolution === "correct").length;
  const incorrect = entries.filter((e) => e.resolution === "incorrect").length;
  const pending = entries.filter((e) => e.resolution === "pending").length;
  const resolved = correct + incorrect;
  const winRate = resolved > 0 ? correct / resolved : 0;
  const avgEV = total > 0
    ? entries.reduce((s, e) => s + e.expectedValue, 0) / total
    : 0;
  const avgConfidence = total > 0
    ? entries.reduce((s, e) => s + e.confidence, 0) / total
    : 0;

  return { total, resolved, correct, incorrect, pending, winRate, avgEV, avgConfidence };
}
