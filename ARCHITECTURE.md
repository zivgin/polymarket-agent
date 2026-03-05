# Architecture

## System Overview

```
┌────────────────────────────────────────────────────────────────────────┐
│                            CLI Layer (934 LOC)                         │
│  cli.ts — 18 commands via Commander.js, orchestrates all modules       │
├────────────────────────────────────────────────────────────────────────┤
│                       Presentation Layer (853 LOC)                     │
│  ui.ts — 31 exported functions: tables, bars, cards, dashboards        │
│  export.ts — JSON/CSV serialization for markets, recs, watchlist       │
├───────────────────┬───────────────────┬────────────────────────────────┤
│  Strategy (525)   │  State (696)      │  Data Sources (344)            │
│                   │                   │                                │
│  recommender.ts   │  watchlist.ts     │  news/index.ts (aggregator)    │
│    220 LOC        │    65 LOC         │    58 LOC                      │
│  arbitrage.ts     │  alerts.ts        │  news/rss.ts                   │
│    107 LOC        │    118 LOC        │    89 LOC                      │
│  correlation.ts   │  history.ts       │  news/telegram.ts              │
│    97 LOC         │    144 LOC        │    107 LOC                     │
│  odds.ts          │  portfolio.ts     │  news/scraper.ts               │
│    101 LOC        │    232 LOC        │    87 LOC                      │
│                   │  keywords.ts      │                                │
│                   │    87 LOC         │  matcher/index.ts              │
│                   │                   │    192 LOC                     │
├───────────────────┴───────────────────┤                                │
│           API Client (287 LOC)        │                                │
│  clients/polymarket.ts                │                                │
│  13 public methods + normalization    │                                │
├───────────────────────────────────────┴────────────────────────────────┤
│                          External Services                             │
│                                                                        │
│  Gamma API ──── gamma-api.polymarket.com ──── markets, events, tags    │
│  CLOB API ───── clob.polymarket.com ───────── orderbook, prices        │
│  RSS ────────── 15 feeds (NYT, BBC, Bloomberg, CoinDesk, ESPN...)      │
│  Telegram ───── 3 channels (polyaborygen, WhaleTrades, cryptonews)     │
│  Firecrawl ──── firecrawl.dev ─────────────── article scraping         │
└────────────────────────────────────────────────────────────────────────┘
```

**Total:** ~3,200 lines of TypeScript across 18 source files.

## Directory Structure

```
polymarket-agent/
├── src/
│   ├── cli.ts                    # Entry point — 18 command groups
│   ├── config.ts                 # Environment variable loading + defaults
│   ├── ui.ts                     # Terminal rendering (31 print functions)
│   ├── export.ts                 # JSON/CSV file serialization
│   │
│   ├── watchlist.ts              # Market watchlist CRUD
│   ├── alerts.ts                 # Price alert thresholds + polling check
│   ├── keyword-alerts.ts         # News keyword watches + matching
│   ├── history.ts                # Recommendation log + resolution tracking
│   ├── portfolio.ts              # Paper trading: positions, trades, P&L
│   │
│   ├── clients/
│   │   └── polymarket.ts         # Gamma + CLOB API client (13 methods)
│   │
│   ├── news/
│   │   ├── index.ts              # NewsAggregator: dedup + merge sources
│   │   ├── rss.ts                # RSS parser (rss-parser library)
│   │   ├── telegram.ts           # Telegram channel integration
│   │   └── scraper.ts            # Firecrawl web scraper
│   │
│   ├── matcher/
│   │   └── index.ts              # News-to-market matching engine
│   │
│   ├── strategy/
│   │   ├── recommender.ts        # Sentiment → edge → Kelly → confidence
│   │   ├── arbitrage.ts          # YES+NO < $1 scanner
│   │   └── correlation.ts        # Multi-market probability analysis
│   │
│   ├── utils/
│   │   └── odds.ts               # Odds format conversion + edge math
│   │
│   └── types/
│       └── index.ts              # All TypeScript interfaces (126 LOC)
│
├── dist/                         # Compiled output (gitignored)
├── .env.example                  # Environment template
├── .gitignore
├── package.json
├── tsconfig.json                 # ES2022, ESNext modules, strict
├── README.md
└── ARCHITECTURE.md
```

## Data Flow

### 1. News → Recommendation Pipeline (`scan`)

```
                    ┌──── RSS (15 feeds) ──────┐
                    │                          │
News Sources ──────►│──── Telegram (3 ch) ─────├──► NewsAggregator
                    │                          │    (dedup by title,
                    └──── Firecrawl (URLs) ────┘     sort by date)
                                                         │
                                                    NewsItem[]
                                                         │
                                                         ▼
                                                   MarketMatcher
                                               (cache 500 markets,
                                                5-min TTL, score
                                                against news items)
                                                         │
                                                   MarketMatch[]
                                                         │
                                                         ▼
                                                   BetRecommender
                                               (sentiment analysis,
                                                edge detection,
                                                Kelly sizing, EV)
                                                         │
                                               BetRecommendation[]
                                                    │         │
                                            ┌───────┘         └───────┐
                                            ▼                         ▼
                                      UI (terminal)            history.ts
                                      export.ts (CSV/JSON)     (auto-log)
```

### 2. Market Discovery Pipeline (`markets`, `trending`, `categories`)

```
Gamma API (/markets)          Gamma API (/events)
       │                              │
       ▼                              ▼
 normalizeMarkets()            getTrendingEvents()
       │                       getCategories()
       ▼                              │
 searchMarkets()                      ▼
 getTopMarkets()               TrendingEvent[]
 getMarketsByCategory()        CategorySummary[]
       │                              │
       └──────────┬───────────────────┘
                  ▼
            UI rendering
```

### 3. Arbitrage Detection (`arb`)

```
getActiveMarkets(500) ──► filter: yesPrice + noPrice < 1.0
                                    │
                              ArbOpportunity[]
                                    │
                           ┌────────┴────────┐
                           │   --deep flag?   │
                           │                  │
                         no│                  │yes
                           ▼                  ▼
                        print            getOrderBook()
                                        for each (top 20)
                                              │
                                    verify with ask prices
                                              │
                                        print verified
```

### 4. Paper Trading Lifecycle (`portfolio`)

```
                    $1,000 initial balance
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
         portfolio buy    portfolio sell   portfolio show
              │               │               │
        searchMarkets()  get current price  getPortfolioValue()
              │               │               │
        deduct from      add to balance    fetch live prices
        balance, create   remove position   calculate P&L
        position + trade  create trade      for each position
              │               │               │
              └───────┬───────┘               │
                      ▼                       ▼
               .portfolio.json          UI with live P&L
```

## API Client (`clients/polymarket.ts`)

Two base URLs, both public for read operations:

| API | Base URL | Timeout |
|-----|----------|---------|
| **Gamma** | `https://gamma-api.polymarket.com` | 15s |
| **CLOB** | `https://clob.polymarket.com` | 15s |

### Methods

| Method | API | Purpose |
|--------|-----|---------|
| `getActiveMarkets(params)` | Gamma | Paginated market list (active, not closed) |
| `searchMarkets(query, limit)` | Gamma | Client-side text search (fetches 2x500, filters) |
| `getEvent(slugOrId)` | Gamma | Single event by slug or ID |
| `getEvents(params)` | Gamma | Event list with filters |
| `getMarketBySlug(slug)` | Gamma | Resolve market by slug/ID (with fallback search) |
| `getMarketByConditionId(id)` | Gamma | Resolve by condition_id |
| `getPrice(tokenId, side)` | CLOB | Buy/sell price for a token |
| `getMidpoint(tokenId)` | CLOB | Midpoint price |
| `getOrderBook(tokenId)` | CLOB | Full bid/ask ladder with spread + midpoint |
| `getTopMarkets(count)` | Gamma | Top N by volume |
| `getMarketsByCategory(cat)` | Gamma | Filter by tag/category |
| `getTrendingEvents(limit)` | Gamma | Events sorted by aggregate volume |
| `getCategories()` | Gamma | Aggregate markets into category summaries |

### Market Normalization

Raw Gamma API responses vary in shape. `normalizeMarkets()` handles:
- `outcomePrices` as string, array, or JSON-encoded string
- `volume`/`volumeNum` field aliasing
- `end_date_iso`/`endDate` field aliasing
- `category` extraction from tags (handles object tags with `.label`/`.slug`)
- Token array construction with price mapping

## Strategy Modules

### BetRecommender (`strategy/recommender.ts`, 220 LOC)

Pipeline per news item × market pair:

1. **Sentiment analysis** — 23 positive signals ("confirms", "approved", "wins"...) and 24 negative signals ("denies", "rejected", "collapses"...) scanned in news text
2. **Question polarity** — detects negation in market question ("won't", "fail", "ban") and reverses direction
3. **Subject overlap** — word-level intersection between news text and market question (words >3 chars)
4. **Direction** — net sentiment + polarity → YES or NO
5. **Probability estimate** — market price + edge estimate (strength × 15%, max), clamped to [5%, 95%]
6. **Edge** — estimated probability - market price; requires >1% positive edge
7. **Confidence** — relevance score (30%) + signal strength (30%) + edge contribution (40%), capped at 1.0
8. **Kelly fraction** — `(b*p - q) / b` × configurable half-Kelly multiplier
9. **EV per dollar** — `p * (1/price - 1) - (1 - p)`
10. **Ranking** — sort all recommendations by EV descending

### ArbitrageScanner (`strategy/arbitrage.ts`, 107 LOC)

Scans 500 active markets for YES + NO price sums below $1.00:

- **Surface scan:** midpoint prices from Gamma API
- **Deep mode:** verifies top 20 candidates against actual orderbook ask prices via CLOB API
- Reports profit per share in cents

### CorrelationAnalyzer (`strategy/correlation.ts`, 97 LOC)

Groups markets by event (via Gamma `/events` endpoint):

- Sums all YES probabilities for markets within each event
- For exclusive outcomes, the sum should equal ~1.0
- Flags **anomalies** where deviation > 5%: "over-priced" (Σ > 1.05) or "under-priced" (Σ < 0.95)
- Sorts anomalies first

### Odds Calculator (`utils/odds.ts`, 101 LOC)

Bidirectional conversion between four formats:
- **Probability** (0.0–1.0)
- **Decimal** (1.0–∞)
- **American** (+100/−100 style)
- **Fractional** (nearest common fraction from lookup table)

Edge calculator: given user's probability estimate vs market price, computes edge %, EV, Kelly fraction, and dollar-optimal bet size.

## Persistent State

Each state module owns a single JSON file in the project root:

| Module | File | Schema | Key Operations |
|--------|------|--------|----------------|
| `watchlist.ts` | `.watchlist.json` | `{ entries: WatchlistEntry[] }` | add, remove, get, clear |
| `alerts.ts` | `.alerts.json` | `{ alerts: PriceAlert[] }` | add, remove, list, check (poll) |
| `keyword-alerts.ts` | `.keywords.json` | `{ keywords: KeywordWatch[] }` | add, remove, list, match |
| `history.ts` | `.history.json` | `{ entries: HistoryEntry[] }` | log, get, updateResolutions, stats |
| `portfolio.ts` | `.portfolio.json` | `{ balance, positions[], trades[], createdAt }` | buy, sell, reset, value |

All files use synchronous `fs.readFileSync`/`fs.writeFileSync`. Each module has private `load()`/`save()` helpers. No shared database or cross-module state dependencies.

### History Resolution Tracking

`HistoryEntry` tracks each recommendation through its lifecycle:

```
logged (scan/recommend)
  → resolution: "pending"
  → market resolves (closed, winner determined)
  → resolution: "correct" | "incorrect"
  → stats updated: win rate, avg EV, avg confidence
```

`updateResolutions()` checks all pending entries against live market data, looking for closed markets with a declared winner token.

### Portfolio Simulator

Virtual balance starts at $1,000. Positions track:
- Market ID, question, side (YES/NO)
- Share count, average cost, total invested
- Live value calculated by re-fetching current prices

Sells calculate realized P&L. The `getPortfolioValue()` function enriches positions with live prices and unrealized P&L.

## Presentation Layer (`ui.ts`, 781 LOC)

### Color Palette

```
Brand:   #00E5FF (electric cyan)     #006B7A (muted teal)
Data:    #6B7280 (slate label)       #E5E7EB (near-white value)
         #4B5563 (dark dim)          #374151 (very dark muted)
Prices:  #F59E0B (amber/gold)
Signals: #10B981 (emerald long)      #EF4444 (signal red short)
         #F97316 (orange warning)
Accent:  #A78BFA (soft violet)       #60A5FA (cool blue)
```

### UI Components

| Function | Used by | Output |
|----------|---------|--------|
| `printHeader()` | All commands | ASCII art banner |
| `printMarkets()` | markets, search | Box-drawn table with YES/NO/vol/cat/end columns |
| `printRecommendations()` | scan, recommend, live | Bet cards: direction, price, confidence bar, EV, Kelly, size |
| `printScanMatches()` | scan, recommend | News→market tree with relevance bars |
| `printNewsFeed()` | news | Time + source + title list |
| `printMarketDetail()` | market | Full detail: description, orderbook depth, related markets |
| `printTrending()` | trending | Numbered event list with vol/liq/count |
| `printCategories()` | categories | Category rows with top markets |
| `printArbitrage()` | arb | Opportunity list with profit per share |
| `printCorrelation()` | correlate | Event groups with anomaly flags |
| `printOddsConversion()` | odds | Prob/decimal/american/fractional table |
| `printEdgeAnalysis()` | odds -m | Edge/EV/Kelly breakdown |
| `printPortfolio()` | portfolio show | Cash + positions + P&L |
| `printTradeHistory()` | portfolio history | Buy/sell log with P&L |
| `printHistory()` | history | Recommendation entries with resolution icons |
| `printAccuracyStats()` | history | Win rate, avg EV, avg confidence |
| `printAlerts()` | alert list | Alert thresholds with status |
| `printAlertChecks()` | alert watch | Triggered alert notifications |
| `printKeywords()` | kw list | Keyword watch list |
| `printKeywordMatches()` | kw scan | Keyword→news matches |
| `printWatchlist()` | watch list | Entries with price deltas |
| `printConfigStatus()` | status | Service readiness indicators |
| `printLiveHeader/Tick/Alert()` | live | Live monitoring UI |

### Utility Functions

- `priceTag(price)` — color-coded cents: green (>70¢), amber (30–70¢), red (<30¢)
- `fmtVol(vol)` — `$1.2M`, `$350K`, `$99`
- `fmtDate(dateStr)` — `"Mar 5"` format
- `pad(str, width, align)` — ANSI-aware padding (strips escape codes for length calc)
- `miniBar(value, width)` — `█████░░░░░` relevance bar
- `wideBar(value, width)` — gradient confidence bar (dim→cyan→green)

## Matching Engine (`matcher/index.ts`, 192 LOC)

### Market Caching

- Fetches top 500 markets by volume
- 5-minute TTL (re-fetches if stale)
- Cached markets used as primary search pool

### Relevance Scoring

For each news item × cached market pair:

| Factor | Weight | Method |
|--------|--------|--------|
| Keyword overlap | 50% | Word frequency matching between news keywords and market text |
| Entity matching | 30% | Named entity detection (2+ capitalized words) with +0.3 bonus per entity match |
| Liquidity bonus | 10% | +0.1 for markets with >$10K liquidity |
| *Cap* | 100% | Final score clamped to 1.0 |

### Search Strategy

Dual approach for each news item:
1. Score all cached markets against news keywords
2. Build targeted search queries from extracted entities + top keywords
3. Deduplicate results and return top N

## Build & Runtime

| Config | Value |
|--------|-------|
| TypeScript target | ES2022 |
| Module system | ESNext (bundler resolution) |
| Strict mode | Enabled |
| Output | `dist/` |
| Dev runner | tsx (esbuild-based, no build step) |
| Node.js | ESM (`"type": "module"` in package.json) |

## Design Decisions

1. **No auth required** — Every feature works against public Polymarket Gamma/CLOB endpoints. Trading keys are optional and only needed for future live execution.

2. **Conservative sizing** — Half-Kelly default with probability clamped to [5%, 95%]. Prevents ruin from over-confident estimates.

3. **Graceful degradation** — Telegram and Firecrawl silently return empty results when not configured. RSS feeds always work.

4. **Client-side search** — Gamma API has no text search endpoint. We fetch 1,000 markets (2 pages of 500) and filter client-side with word-matching and phrase-bonus scoring.

5. **File-based state** — Each module owns a simple JSON file. No database, no migrations, no shared state. Portable and debuggable.

6. **Automatic history logging** — `scan` auto-logs recommendations to `.history.json` so accuracy can be tracked over time without extra steps.

7. **Modular presentation** — All terminal output goes through `ui.ts`. No `console.log` in business logic modules. Export functionality is separate from display.

8. **No external AI/LLM dependency** — Sentiment analysis uses a deterministic keyword-based approach. Fast, predictable, no API costs.
