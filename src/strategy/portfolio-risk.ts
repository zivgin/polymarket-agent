// ── Portfolio Risk Analyzer ──
// Concentration, correlation, drawdown, and hedge suggestions

import type { PolymarketClient } from "../clients/polymarket.js";
import { getPortfolio } from "../portfolio.js";

export interface PortfolioRisk {
  concentrationScore: number; // Herfindahl index (0-1)
  maxDrawdownExposure: number;
  diversificationIndex: number;
  correlatedGroups: CorrelatedGroup[];
  hedgeSuggestions: HedgeSuggestion[];
}

export interface CorrelatedGroup {
  reason: string;
  positions: string[];
}

export interface HedgeSuggestion {
  description: string;
  currentExposure: string;
}

export async function analyzePortfolioRisk(
  client: PolymarketClient
): Promise<PortfolioRisk> {
  const portfolio = getPortfolio();
  const positions = portfolio.positions;

  if (positions.length === 0) {
    return {
      concentrationScore: 0,
      maxDrawdownExposure: 0,
      diversificationIndex: 0,
      correlatedGroups: [],
      hedgeSuggestions: [],
    };
  }

  // Fetch current prices
  const positionsWithPrices = [];
  for (const pos of positions) {
    let currentPrice = pos.avgCost;
    try {
      const markets = await client.searchMarkets(pos.marketQuestion.slice(0, 30), 5);
      const match = markets.find((m) => m.id === pos.marketId);
      if (match) {
        const priceIdx = pos.side === "YES" ? 0 : 1;
        currentPrice = match.outcomePrices[priceIdx] ?? pos.avgCost;
      }
    } catch {
      // use avgCost
    }
    positionsWithPrices.push({ ...pos, currentPrice, currentValue: pos.shares * currentPrice });
  }

  const totalValue = positionsWithPrices.reduce((s, p) => s + p.currentValue, 0);

  // Herfindahl concentration index
  let herfindahl = 0;
  for (const p of positionsWithPrices) {
    const weight = totalValue > 0 ? p.currentValue / totalValue : 0;
    herfindahl += weight * weight;
  }

  // Max drawdown exposure: sum of all position costs (max loss)
  const maxDrawdownExposure = positions.reduce((s, p) => s + p.totalCost, 0);

  // Diversification: 1 / (n * herfindahl) — 1.0 = perfectly diversified
  const n = positions.length;
  const diversificationIndex = n > 0 && herfindahl > 0 ? 1 / (n * herfindahl) : 0;

  // Correlation detection: group by keyword overlap
  const correlatedGroups = detectCorrelations(positions);

  // Hedge suggestions
  const hedgeSuggestions = generateHedgeSuggestions(positionsWithPrices, correlatedGroups);

  return {
    concentrationScore: herfindahl,
    maxDrawdownExposure,
    diversificationIndex,
    correlatedGroups,
    hedgeSuggestions,
  };
}

function detectCorrelations(
  positions: Array<{ marketQuestion: string; side: string; marketId: string }>
): CorrelatedGroup[] {
  const groups: CorrelatedGroup[] = [];

  // Extract keywords from questions
  const posKeywords = positions.map((p) => {
    const words = p.marketQuestion.toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3)
      .filter((w) => !["will", "would", "could", "does", "have", "been", "this", "that", "with", "from", "before", "after"].includes(w));
    return { question: p.marketQuestion, words: new Set(words) };
  });

  // Find pairs with significant overlap
  const seen = new Set<string>();
  for (let i = 0; i < posKeywords.length; i++) {
    for (let j = i + 1; j < posKeywords.length; j++) {
      const overlap = [...posKeywords[i].words].filter((w) => posKeywords[j].words.has(w));
      if (overlap.length >= 2) {
        const key = `${i}-${j}`;
        if (seen.has(key)) continue;
        seen.add(key);
        groups.push({
          reason: `Shared keywords: ${overlap.slice(0, 3).join(", ")}`,
          positions: [
            posKeywords[i].question.slice(0, 50),
            posKeywords[j].question.slice(0, 50),
          ],
        });
      }
    }
  }

  // Group by side (all YES or all NO = directional risk)
  const sides = positions.map((p) => p.side);
  const allYes = sides.every((s) => s === "YES");
  const allNo = sides.every((s) => s === "NO");
  if (positions.length >= 3 && (allYes || allNo)) {
    groups.push({
      reason: `All positions are ${allYes ? "YES" : "NO"} — high directional risk`,
      positions: positions.map((p) => p.marketQuestion.slice(0, 50)),
    });
  }

  return groups;
}

function generateHedgeSuggestions(
  positions: Array<{ marketQuestion: string; side: string; currentValue: number; totalCost: number }>,
  correlatedGroups: CorrelatedGroup[]
): HedgeSuggestion[] {
  const suggestions: HedgeSuggestion[] = [];
  const totalValue = positions.reduce((s, p) => s + p.currentValue, 0);

  // Check for single position dominance (>50% of portfolio)
  for (const p of positions) {
    const weight = totalValue > 0 ? p.currentValue / totalValue : 0;
    if (weight > 0.5) {
      suggestions.push({
        description: `Consider reducing "${p.marketQuestion.slice(0, 40)}" — it's ${(weight * 100).toFixed(0)}% of portfolio`,
        currentExposure: `$${p.currentValue.toFixed(2)} (${(weight * 100).toFixed(0)}%)`,
      });
    }
  }

  // Suggest hedging correlated groups
  for (const group of correlatedGroups) {
    if (group.reason.includes("directional")) {
      suggestions.push({
        description: "Add some NO positions to balance directional exposure",
        currentExposure: `${positions.length} correlated positions`,
      });
      break;
    }
  }

  // If all positions are in same "category" of question
  if (positions.length >= 3 && suggestions.length === 0) {
    suggestions.push({
      description: "Consider diversifying across different event categories",
      currentExposure: `${positions.length} positions`,
    });
  }

  return suggestions;
}
