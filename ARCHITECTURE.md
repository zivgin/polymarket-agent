# Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                         CLI Layer                           │
│  cli.ts — Commander.js command definitions & orchestration  │
├─────────────────────────────────────────────────────────────┤
│                      Presentation Layer                     │
│  ui.ts — Terminal rendering (chalk, box-drawing, tables)    │
│  export.ts — JSON/CSV file output                          │
├──────────────┬──────────────┬───────────────────────────────┤
│  Strategy    │  State       │  Data Sources                 │
│              │              │                               │
│  recommender │  watchlist   │  news/index (aggregator)      │
│  arbitrage   │  alerts      │  news/rss                     │
│  correlation │  keywords    │  news/telegram                │
│  odds        │  history     │  news/scraper                 │
│              │  portfolio   │                               │
├──────────────┴──────────────┤  matcher/index                │
│        API Client           │                               │
│  clients/polymarket.ts      │                               │
├─────────────────────────────┴───────────────────────────────┤
│                     External APIs                           │
│  Gamma API (markets/events) │ CLOB API (orderbook/prices)   │
│  RSS Feeds (15 default)     │ Telegram │ Firecrawl          │
└─────────────────────────────────────────────────────────────┘
```

## Directory Structure

```
src/
├── cli.ts                    # Entry point — all command definitions
├── ui.ts                     # Terminal output (30+ print functions)
├── config.ts                 # Environment variable loading
├── export.ts                 # JSON/CSV export for markets, recs, watchlist
├── watchlist.ts              # Persistent market watchlist
├── alerts.ts                 # Price alert thresholds + polling
├── keyword-alerts.ts         # News keyword watches
├── history.ts                # Recommendation log + accuracy tracking
├── portfolio.ts              # Paper trading simulator
├── clients/
│   └── polymarket.ts         # Gamma + CLOB API client
├── news/
│   ├── index.ts              # NewsAggregator — dedup + merge sources
│   ├── rss.ts                # RSS parser (15 default feeds)
│   ├── telegram.ts           # Telegram channel integration
│   └── scraper.ts            # Firecrawl web scraper
├── matcher/
│   └── index.ts              # News-to-market matching (keyword + entity)
├── strategy/
│   ├── recommender.ts        # Sentiment → edge → Kelly → confidence
│   ├── arbitrage.ts          # YES+NO < $1 scanner
│   └── correlation.ts        # Multi-market probability analysis
├── utils/
│   └── odds.ts               # Odds format conversion + edge calculator
└── types/
    └── index.ts              # All TypeScript interfaces
```

## Data Flow

### News → Recommendation Pipeline

```
RSS/Telegram/Web ──→ NewsAggregator ──→ MarketMatcher ──→ BetRecommender
                     (dedup, sort)      (cache + search)   (sentiment, Kelly)
                                                                 │
                                              ┌──────────────────┤
                                              ▼                  ▼
                                         UI (terminal)     History (log)
```

1. **NewsAggregator** fetches from RSS (15 feeds), Telegram (3 channels), web scraper
2. **MarketMatcher** caches top 500 markets (5-min TTL), scores news against markets using keyword overlap (50%), entity matching (30%), liquidity bonus (10%)
3. **BetRecommender** runs sentiment analysis (20+ signal words), estimates probability, calculates edge/EV/Kelly, produces ranked recommendations

### API Layer

Two Polymarket APIs, both public for reads:

| API | Base URL | Purpose |
|-----|----------|---------|
| **Gamma** | `gamma-api.polymarket.com` | Market discovery, events, categories |
| **CLOB** | `clob.polymarket.com` | Orderbook, prices, midpoints |

Key client methods:
- `getActiveMarkets()` — Fetch active markets with pagination
- `searchMarkets()` — Client-side text search (fetches 1000, filters)
- `getMarketBySlug()` — Resolve by slug/ID
- `getOrderBook()` — Bid/ask ladder
- `getTrendingEvents()` — Events sorted by aggregate volume
- `getCategories()` — Group markets by category

### Persistent State

All state files use simple JSON, stored in the project root:

| Module | File | Structure |
|--------|------|-----------|
| `watchlist.ts` | `.watchlist.json` | `{ entries: WatchlistEntry[] }` |
| `alerts.ts` | `.alerts.json` | `{ alerts: PriceAlert[] }` |
| `keyword-alerts.ts` | `.keywords.json` | `{ keywords: KeywordWatch[] }` |
| `history.ts` | `.history.json` | `{ entries: HistoryEntry[] }` |
| `portfolio.ts` | `.portfolio.json` | `{ balance, positions[], trades[] }` |

Each module owns its file with `load()`/`save()` functions. No shared database.

## Strategy Modules

### BetRecommender (`strategy/recommender.ts`)

1. **Sentiment analysis** — scans for 20+ positive/negative signal words
2. **Direction** — accounts for question polarity (e.g., "won't", "fail")
3. **Edge detection** — compares estimated probability to market price
4. **Confidence** — blends relevance (30%) + sentiment strength (30%) + edge size (40%)
5. **Kelly criterion** — half-Kelly position sizing, capped at max bet
6. **EV** — expected value per dollar: `p*(1/price - 1) - (1-p)`

### ArbitrageScanner (`strategy/arbitrage.ts`)

Scans all active markets for YES + NO prices summing to less than $1. Optional `--deep` mode verifies with actual orderbook ask prices.

### CorrelationAnalyzer (`strategy/correlation.ts`)

Groups markets by event, sums YES probabilities across exclusive outcomes. Flags groups where the sum deviates >5% from 1.0 (pricing anomalies).

### Odds Calculator (`utils/odds.ts`)

Converts between probability, decimal, American, and fractional odds. Calculates edge, EV, and Kelly-optimal bet size when compared against a market.

## Design Decisions

- **No auth required** — All features work with public Polymarket APIs
- **Conservative sizing** — Half-Kelly default, probability capped 5%–95%
- **Graceful degradation** — Telegram/Firecrawl silently skip if not configured
- **Client-side search** — Gamma API lacks text search, so we fetch 1000 markets and filter
- **File-based state** — Simple JSON persistence, no database dependency
- **Live dedup** — Set-based tracking of seen news IDs to prevent duplicate alerts
