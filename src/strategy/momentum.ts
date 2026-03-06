// ── Price Momentum Tracker ──
// Record price snapshots, compute deltas and sparklines

import fs from "fs";
import path from "path";
import type { Market, PriceSnapshot, MomentumResult } from "../types/index.js";

const MOMENTUM_PATH = path.join(process.env.HOME ?? ".", "polymarket-agent", ".momentum.json");

interface MomentumData {
  snapshots: Record<string, PriceSnapshot[]>;
}

function loadMomentum(): MomentumData {
  try {
    return JSON.parse(fs.readFileSync(MOMENTUM_PATH, "utf-8"));
  } catch {
    return { snapshots: {} };
  }
}

function saveMomentum(data: MomentumData): void {
  fs.writeFileSync(MOMENTUM_PATH, JSON.stringify(data, null, 2));
}

export function recordPrice(marketId: string, price: number): void {
  const data = loadMomentum();
  if (!data.snapshots[marketId]) {
    data.snapshots[marketId] = [];
  }
  data.snapshots[marketId].push({
    marketId,
    price,
    timestamp: Date.now(),
  });
  saveMomentum(data);
}

export function recordPrices(markets: Market[]): void {
  const data = loadMomentum();
  const now = Date.now();
  for (const m of markets) {
    const price = m.outcomePrices[0] ?? 0;
    if (price <= 0) continue;
    if (!data.snapshots[m.id]) {
      data.snapshots[m.id] = [];
    }
    data.snapshots[m.id].push({ marketId: m.id, price, timestamp: now });
  }
  saveMomentum(data);
}

export function getMomentum(marketId: string, question?: string): MomentumResult | null {
  const data = loadMomentum();
  const snapshots = data.snapshots[marketId];
  if (!snapshots || snapshots.length === 0) return null;

  const now = Date.now();
  const current = snapshots[snapshots.length - 1];

  const findPriceAt = (msAgo: number): number | null => {
    const target = now - msAgo;
    // Find the closest snapshot at or before the target time
    let closest: PriceSnapshot | null = null;
    for (const s of snapshots) {
      if (s.timestamp <= target) {
        if (!closest || s.timestamp > closest.timestamp) {
          closest = s;
        }
      }
    }
    return closest?.price ?? null;
  };

  const HOUR = 3_600_000;
  const price1h = findPriceAt(HOUR);
  const price6h = findPriceAt(6 * HOUR);
  const price24h = findPriceAt(24 * HOUR);
  const price7d = findPriceAt(7 * 24 * HOUR);

  const delta = (old: number | null): number | null => {
    if (old === null) return null;
    return current.price - old;
  };

  const deltas = {
    "1h": delta(price1h),
    "6h": delta(price6h),
    "24h": delta(price24h),
    "7d": delta(price7d),
  };

  // Determine trend from most recent available delta
  const recentDelta = deltas["1h"] ?? deltas["6h"] ?? deltas["24h"] ?? 0;
  const trend: "up" | "down" | "flat" =
    recentDelta > 0.01 ? "up" : recentDelta < -0.01 ? "down" : "flat";

  // Build sparkline from last 20 snapshots
  const sparkline = buildSparkline(snapshots.slice(-20));

  return {
    marketId,
    question: question ?? marketId,
    currentPrice: current.price,
    deltas,
    trend,
    sparkline,
    snapshots: snapshots.slice(-50),
  };
}

export function pruneOldSnapshots(maxAgeDays = 30): number {
  const data = loadMomentum();
  const cutoff = Date.now() - maxAgeDays * 24 * 3_600_000;
  let pruned = 0;

  for (const id of Object.keys(data.snapshots)) {
    const before = data.snapshots[id].length;
    data.snapshots[id] = data.snapshots[id].filter((s) => s.timestamp > cutoff);
    pruned += before - data.snapshots[id].length;
    if (data.snapshots[id].length === 0) {
      delete data.snapshots[id];
    }
  }

  saveMomentum(data);
  return pruned;
}

function buildSparkline(snapshots: PriceSnapshot[]): string {
  if (snapshots.length === 0) return "";
  const chars = "▁▂▃▄▅▆▇█";
  const prices = snapshots.map((s) => s.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 0.01;

  return prices
    .map((p) => {
      const idx = Math.round(((p - min) / range) * (chars.length - 1));
      return chars[idx];
    })
    .join("");
}

export function getAllTrackedIds(): string[] {
  const data = loadMomentum();
  return Object.keys(data.snapshots);
}
