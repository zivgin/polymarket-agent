// ── Backtest Engine ──
// Evaluate historical recommendation accuracy with metrics

import type { BacktestResult, BacktestDetail, CalibrationBucket } from "../types/index.js";
import type { HistoryEntry } from "../history.js";
import { getHistory } from "../history.js";

export function runBacktest(): BacktestResult {
  const entries = getHistory();

  const resolved = entries.filter(
    (e) => e.resolution === "correct" || e.resolution === "incorrect"
  );
  const correct = resolved.filter((e) => e.resolution === "correct");
  const incorrect = resolved.filter((e) => e.resolution === "incorrect");

  const hitRate = resolved.length > 0 ? correct.length / resolved.length : 0;
  const totalROI = calculateROI(resolved);
  const brierScore = calculateBrierScore(resolved);
  const calibration = buildCalibration(resolved);

  const details: BacktestDetail[] = resolved.map((e) => ({
    marketQuestion: e.marketQuestion,
    side: e.side,
    priceAtRec: e.priceAtRec,
    confidence: e.confidence,
    resolution: e.resolution as "correct" | "incorrect",
    pnl: computePnl(e),
  }));

  return {
    totalRecs: entries.length,
    resolved: resolved.length,
    correct: correct.length,
    incorrect: incorrect.length,
    hitRate,
    totalROI,
    brierScore,
    calibration,
    details,
  };
}

export function calculateBrierScore(entries: HistoryEntry[]): number {
  if (entries.length === 0) return 0;

  let sum = 0;
  for (const e of entries) {
    const outcome = e.resolution === "correct" ? 1 : 0;
    sum += (e.confidence - outcome) ** 2;
  }
  return sum / entries.length;
}

export function buildCalibration(entries: HistoryEntry[], buckets = 5): CalibrationBucket[] {
  const step = 1 / buckets;
  const result: CalibrationBucket[] = [];

  for (let i = 0; i < buckets; i++) {
    const lo = i * step;
    const hi = (i + 1) * step;
    const range = `${(lo * 100).toFixed(0)}%-${(hi * 100).toFixed(0)}%`;

    const inBucket = entries.filter(
      (e) => e.confidence >= lo && (i === buckets - 1 ? e.confidence <= hi : e.confidence < hi)
    );

    if (inBucket.length === 0) {
      result.push({ range, predicted: (lo + hi) / 2, actual: 0, count: 0 });
      continue;
    }

    const predicted = inBucket.reduce((s, e) => s + e.confidence, 0) / inBucket.length;
    const actual = inBucket.filter((e) => e.resolution === "correct").length / inBucket.length;

    result.push({ range, predicted, actual, count: inBucket.length });
  }

  return result;
}

export function calculateROI(entries: HistoryEntry[]): number {
  if (entries.length === 0) return 0;

  let totalPnl = 0;
  let totalInvested = 0;

  for (const e of entries) {
    totalPnl += computePnl(e);
    totalInvested += e.suggestedSize;
  }

  return totalInvested > 0 ? totalPnl / totalInvested : 0;
}

function computePnl(entry: HistoryEntry): number {
  if (entry.resolution === "correct") {
    return (1 / entry.priceAtRec - 1) * entry.suggestedSize;
  }
  return -entry.suggestedSize;
}
