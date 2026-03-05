// ── Portfolio Simulator (Paper Trading) ──
// Virtual $1000 balance, simulate buys/sells at live prices

import fs from "fs";
import path from "path";
import type { PolymarketClient } from "./clients/polymarket.js";

const PORTFOLIO_PATH = path.join(process.env.HOME ?? ".", "polymarket-agent", ".portfolio.json");

const INITIAL_BALANCE = 1000;

export interface Position {
  id: string;
  marketId: string;
  marketQuestion: string;
  marketSlug: string;
  side: "YES" | "NO";
  shares: number;
  avgCost: number;
  totalCost: number;
  boughtAt: string;
}

export interface Trade {
  id: string;
  type: "buy" | "sell";
  marketQuestion: string;
  side: "YES" | "NO";
  shares: number;
  price: number;
  total: number;
  timestamp: string;
  pnl?: number;
}

export interface PortfolioData {
  balance: number;
  positions: Position[];
  trades: Trade[];
  createdAt: string;
}

function loadPortfolio(): PortfolioData {
  try {
    return JSON.parse(fs.readFileSync(PORTFOLIO_PATH, "utf-8"));
  } catch {
    return {
      balance: INITIAL_BALANCE,
      positions: [],
      trades: [],
      createdAt: new Date().toISOString(),
    };
  }
}

function savePortfolio(data: PortfolioData): void {
  fs.writeFileSync(PORTFOLIO_PATH, JSON.stringify(data, null, 2));
}

export function getPortfolio(): PortfolioData {
  return loadPortfolio();
}

export function resetPortfolio(): PortfolioData {
  const data: PortfolioData = {
    balance: INITIAL_BALANCE,
    positions: [],
    trades: [],
    createdAt: new Date().toISOString(),
  };
  savePortfolio(data);
  return data;
}

export async function buyPosition(
  client: PolymarketClient,
  query: string,
  amount: number,
  side: "YES" | "NO" = "YES"
): Promise<{ position: Position; trade: Trade } | { error: string }> {
  const portfolio = loadPortfolio();

  if (amount <= 0) return { error: "Amount must be positive" };
  if (amount > portfolio.balance) return { error: `Insufficient balance: $${portfolio.balance.toFixed(2)} available` };

  const markets = await client.searchMarkets(query, 5);
  if (markets.length === 0) return { error: "No markets found" };

  const market = markets[0];
  const priceIdx = side === "YES" ? 0 : 1;
  const price = market.outcomePrices[priceIdx] ?? 0;

  if (price <= 0 || price >= 1) return { error: "Invalid market price" };

  const shares = amount / price;

  // Check for existing position in same market/side
  let position = portfolio.positions.find(
    (p) => p.marketId === market.id && p.side === side
  );

  if (position) {
    const newTotal = position.totalCost + amount;
    const newShares = position.shares + shares;
    position.avgCost = newTotal / newShares;
    position.shares = newShares;
    position.totalCost = newTotal;
  } else {
    position = {
      id: `pos_${Date.now()}`,
      marketId: market.id,
      marketQuestion: market.question,
      marketSlug: market.slug,
      side,
      shares,
      avgCost: price,
      totalCost: amount,
      boughtAt: new Date().toISOString(),
    };
    portfolio.positions.push(position);
  }

  const trade: Trade = {
    id: `trade_${Date.now()}`,
    type: "buy",
    marketQuestion: market.question,
    side,
    shares,
    price,
    total: amount,
    timestamp: new Date().toISOString(),
  };

  portfolio.balance -= amount;
  portfolio.trades.push(trade);
  savePortfolio(portfolio);

  return { position, trade };
}

export async function sellPosition(
  client: PolymarketClient,
  positionIndex: number
): Promise<{ trade: Trade; pnl: number } | { error: string }> {
  const portfolio = loadPortfolio();

  if (positionIndex < 0 || positionIndex >= portfolio.positions.length) {
    return { error: `Invalid position index: ${positionIndex + 1}` };
  }

  const position = portfolio.positions[positionIndex];

  // Get current price
  let currentPrice: number;
  try {
    const markets = await client.searchMarkets(position.marketQuestion.slice(0, 30), 5);
    const match = markets.find((m) => m.id === position.marketId);
    if (!match) return { error: "Market not found" };
    const priceIdx = position.side === "YES" ? 0 : 1;
    currentPrice = match.outcomePrices[priceIdx] ?? 0;
  } catch {
    return { error: "Failed to fetch current price" };
  }

  const saleValue = position.shares * currentPrice;
  const pnl = saleValue - position.totalCost;

  const trade: Trade = {
    id: `trade_${Date.now()}`,
    type: "sell",
    marketQuestion: position.marketQuestion,
    side: position.side,
    shares: position.shares,
    price: currentPrice,
    total: saleValue,
    timestamp: new Date().toISOString(),
    pnl,
  };

  portfolio.balance += saleValue;
  portfolio.positions.splice(positionIndex, 1);
  portfolio.trades.push(trade);
  savePortfolio(portfolio);

  return { trade, pnl };
}

export async function getPortfolioValue(client: PolymarketClient): Promise<{
  balance: number;
  positionsValue: number;
  totalValue: number;
  totalPnL: number;
  positions: Array<Position & { currentPrice: number; currentValue: number; unrealizedPnL: number }>;
}> {
  const portfolio = loadPortfolio();
  let positionsValue = 0;
  const enrichedPositions: Array<Position & { currentPrice: number; currentValue: number; unrealizedPnL: number }> = [];

  for (const pos of portfolio.positions) {
    let currentPrice = pos.avgCost;
    try {
      const markets = await client.searchMarkets(pos.marketQuestion.slice(0, 30), 5);
      const match = markets.find((m) => m.id === pos.marketId);
      if (match) {
        const priceIdx = pos.side === "YES" ? 0 : 1;
        currentPrice = match.outcomePrices[priceIdx] ?? pos.avgCost;
      }
    } catch {
      // use avgCost as fallback
    }

    const currentValue = pos.shares * currentPrice;
    const unrealizedPnL = currentValue - pos.totalCost;
    positionsValue += currentValue;

    enrichedPositions.push({ ...pos, currentPrice, currentValue, unrealizedPnL });
  }

  return {
    balance: portfolio.balance,
    positionsValue,
    totalValue: portfolio.balance + positionsValue,
    totalPnL: portfolio.balance + positionsValue - INITIAL_BALANCE,
    positions: enrichedPositions,
  };
}

export function getTradeHistory(limit?: number): Trade[] {
  const portfolio = loadPortfolio();
  const trades = [...portfolio.trades].reverse();
  return limit ? trades.slice(0, limit) : trades;
}
