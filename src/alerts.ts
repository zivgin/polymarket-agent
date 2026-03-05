// ── Price Alerts ──
// Set price thresholds on markets, poll to check

import fs from "fs";
import path from "path";
import type { PolymarketClient } from "./clients/polymarket.js";

const ALERTS_PATH = path.join(process.env.HOME ?? ".", "polymarket-agent", ".alerts.json");

export interface PriceAlert {
  id: string;
  marketQuery: string;
  marketId: string;
  marketQuestion: string;
  side: "YES" | "NO";
  direction: "above" | "below";
  threshold: number;
  createdAt: string;
  triggered?: boolean;
  triggeredAt?: string;
}

interface AlertsData {
  alerts: PriceAlert[];
}

function loadAlerts(): AlertsData {
  try {
    return JSON.parse(fs.readFileSync(ALERTS_PATH, "utf-8"));
  } catch {
    return { alerts: [] };
  }
}

function saveAlerts(data: AlertsData): void {
  fs.writeFileSync(ALERTS_PATH, JSON.stringify(data, null, 2));
}

export function getAlerts(): PriceAlert[] {
  return loadAlerts().alerts;
}

export async function addAlert(
  client: PolymarketClient,
  query: string,
  side: "YES" | "NO",
  direction: "above" | "below",
  threshold: number
): Promise<PriceAlert | null> {
  const markets = await client.searchMarkets(query, 5);
  if (markets.length === 0) return null;

  const market = markets[0];
  const alert: PriceAlert = {
    id: `alert_${Date.now()}`,
    marketQuery: query,
    marketId: market.id,
    marketQuestion: market.question,
    side,
    direction,
    threshold,
    createdAt: new Date().toISOString(),
  };

  const data = loadAlerts();
  data.alerts.push(alert);
  saveAlerts(data);
  return alert;
}

export function removeAlert(index: number): PriceAlert | null {
  const data = loadAlerts();
  if (index < 0 || index >= data.alerts.length) return null;
  const removed = data.alerts.splice(index, 1)[0];
  saveAlerts(data);
  return removed;
}

export interface AlertCheckResult {
  alert: PriceAlert;
  currentPrice: number;
  triggered: boolean;
}

export async function checkAlerts(client: PolymarketClient): Promise<AlertCheckResult[]> {
  const data = loadAlerts();
  const results: AlertCheckResult[] = [];

  for (const alert of data.alerts) {
    if (alert.triggered) continue;

    try {
      const markets = await client.searchMarkets(alert.marketQuestion.slice(0, 30), 5);
      const match = markets.find((m) => m.id === alert.marketId);
      if (!match) continue;

      const priceIdx = alert.side === "YES" ? 0 : 1;
      const currentPrice = match.outcomePrices[priceIdx] ?? 0;

      const triggered =
        alert.direction === "above"
          ? currentPrice >= alert.threshold
          : currentPrice <= alert.threshold;

      if (triggered) {
        alert.triggered = true;
        alert.triggeredAt = new Date().toISOString();
      }

      results.push({ alert, currentPrice, triggered });
    } catch {
      // skip on error
    }
  }

  saveAlerts(data);
  return results;
}
