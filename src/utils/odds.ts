// ── Odds Conversion & Edge Calculator ──

export interface OddsResult {
  probability: number;
  decimal: number;
  american: number;
  fractional: string;
}

export interface EdgeAnalysis {
  userProb: number;
  marketProb: number;
  edge: number;
  kellyFraction: number;
  kellySuggested: number;
  ev: number;
}

export function convertOdds(value: number, format: "prob" | "decimal" | "american"): OddsResult {
  let probability: number;

  switch (format) {
    case "prob":
      probability = value;
      break;
    case "decimal":
      probability = 1 / value;
      break;
    case "american":
      if (value > 0) {
        probability = 100 / (value + 100);
      } else {
        probability = Math.abs(value) / (Math.abs(value) + 100);
      }
      break;
  }

  probability = Math.max(0.001, Math.min(0.999, probability));

  const decimal = 1 / probability;
  let american: number;
  if (probability >= 0.5) {
    american = -Math.round((probability / (1 - probability)) * 100);
  } else {
    american = Math.round(((1 - probability) / probability) * 100);
  }

  const fractional = toFractional(decimal - 1);

  return { probability, decimal, american, fractional };
}

export function calculateEdge(
  userProb: number,
  marketProb: number,
  bankroll = 1000,
  kellyFrac = 0.5
): EdgeAnalysis {
  const edge = userProb - marketProb;
  const price = marketProb;
  const winAmount = (1 - price) / price;
  const b = winAmount;
  const p = userProb;
  const q = 1 - p;
  const kelly = Math.max(0, (b * p - q) / b);
  const halfKelly = kelly * kellyFrac;
  const ev = p * (1 / price - 1) - q;

  return {
    userProb,
    marketProb,
    edge,
    kellyFraction: halfKelly,
    kellySuggested: Math.round(bankroll * halfKelly * 100) / 100,
    ev,
  };
}

function toFractional(decimalMinusOne: number): string {
  if (decimalMinusOne <= 0) return "0/1";
  const common: [number, number][] = [
    [1, 10], [1, 5], [2, 9], [1, 4], [2, 7], [3, 10], [1, 3],
    [2, 5], [4, 9], [1, 2], [5, 9], [3, 5], [2, 3], [7, 10],
    [3, 4], [4, 5], [5, 6], [9, 10], [1, 1], [11, 10], [6, 5],
    [5, 4], [13, 10], [7, 5], [3, 2], [8, 5], [2, 1], [5, 2],
    [3, 1], [7, 2], [4, 1], [5, 1], [6, 1], [7, 1], [8, 1],
    [9, 1], [10, 1],
  ];

  let best = common[0];
  let bestDiff = Infinity;
  for (const [n, d] of common) {
    const diff = Math.abs(n / d - decimalMinusOne);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = [n, d];
    }
  }

  return `${best[0]}/${best[1]}`;
}
