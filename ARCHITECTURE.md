# Architecture

## System Overview

```
┌────────────────────────────────────────────────────────────────────────┐
│                            CLI Layer (~1,400 LOC)                      │
│  cli.ts — 34 commands via Commander.js, orchestrates all modules       │
├────────────────────────────────────────────────────────────────────────┤
│                       Presentation Layer (~1,400 LOC)                  │
│  ui.ts — 43 exported functions: tables, bars, cards, dashboards        │
│  export.ts — JSON/CSV serialization for markets, recs, watchlist       │
├───────────────────┬───────────────────┬────────────────────────────────┤
│  Strategy (~1,300)│  State (696)      │  Data Sources (~450)           │
│                   │                   │                                │
│  recommender.ts   │  watchlist.ts     │  news/index.ts (aggregator)    │
│  arbitrage.ts     │  alerts.ts        │  news/rss.ts                   │
│  correlation.ts   │  history.ts       │  news/telegram.ts              │
│  momentum.ts      │  portfolio.ts     │  news/scraper.ts               │
│  backtest.ts      │  keywords.ts      │  news/social.ts (Reddit)       │
│  liquidity.ts     │                   │                                │
│  portfolio-risk.ts│  calendar.ts      │  matcher/index.ts              │
│  event-graph.ts   │  digest.ts        │                                │
│  odds.ts          │                   │                                │
├───────────────────┴───────────────────┤                                │
│           API Client (287 LOC)        │                                │
│  clients/polymarket.ts                │                                │
│  13 public methods + normalization    │                                │
├───────────────────────────────────────┴────────────────────────────────┤
│                          External Services                             │
│                                                                        │
│  Gamma API ──── gamma-api.polymarket.com ──── markets, events, tags    │
│  CLOB API ───── clob.polymarket.com ───────── orderbook, prices        │
│  Reddit ─────── old.reddit.com/search.json ── social signals           │
│  GDELT ──────── api.gdeltproject.org ──────── news, tone, geo, TV APIs │
│  USGS ───────── earthquake.usgs.gov ──────── seismic + query API       │
│  NASA EONET ─── eonet.gsfc.nasa.gov ──────── 13 natural event types    │
│  GDACS ──────── gdacs.org/gdacsapi ────────── alerts + population data │
│  RSS ────────── 15 feeds (NYT, BBC, Bloomberg, CoinDesk, ESPN...)      │
│  Telegram ───── 3 channels (polyaborygen, WhaleTrades, cryptonews)     │
│  Firecrawl ──── firecrawl.dev ─────────────── article scraping         │
└────────────────────────────────────────────────────────────────────────┘
```

**Total:** ~6,000 lines of TypeScript across 26 source files.

## Directory Structure

```
polymarket-agent/
├── src/
│   ├── cli.ts                    # Entry point — 34 command groups
│   ├── config.ts                 # Environment variable loading + defaults
│   ├── ui.ts                     # Terminal rendering (41 print functions)
│   ├── export.ts                 # JSON/CSV file serialization
│   ├── calendar.ts               # Resolution calendar (group by time bucket)
│   ├── digest.ts                 # Daily digest generator + markdown export
│   │
│   ├── watchlist.ts              # Market watchlist CRUD
│   ├── alerts.ts                 # Price alert thresholds + polling check
│   ├── keyword-alerts.ts         # News keyword watches + smart matching
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
│   │   ├── scraper.ts            # Firecrawl web scraper
│   │   ├── social.ts             # Reddit social signal scanner
│   │   └── geopolitical.ts      # GDELT + USGS + NASA EONET + GDACS
│   │
│   ├── matcher/
│   │   └── index.ts              # News-to-market matching engine
│   │
│   ├── strategy/
│   │   ├── recommender.ts        # Sentiment → edge → Kelly → confidence
│   │   ├── arbitrage.ts          # YES+NO < $1 scanner
│   │   ├── correlation.ts        # Multi-market probability analysis
│   │   ├── momentum.ts           # Price snapshot tracking + sparklines
│   │   ├── backtest.ts           # Historical accuracy + calibration
│   │   ├── liquidity.ts          # Orderbook depth + spread analysis
│   │   ├── portfolio-risk.ts     # Concentration + correlation + hedging
│   │   └── event-graph.ts        # Event probability tree + anomaly detection
│   │
│   ├── utils/
│   │   └── odds.ts               # Odds format conversion + edge math
│   │
│   └── types/
│       └── index.ts              # All TypeScript interfaces (~230 LOC)
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

### Momentum Tracker (`strategy/momentum.ts`)

Records price snapshots over time and computes deltas:

- **Data collection** — `recordPrices()` called automatically during `scan` and `watch list` commands
- **Delta computation** — Finds closest historical price to 1h/6h/24h/7d ago, computes change
- **Sparkline** — Maps last 20 prices to `▁▂▃▄▅▆▇█` characters
- **Trend detection** — UP (>+1¢), DOWN (<-1¢), or FLAT based on most recent delta
- **Pruning** — `pruneOldSnapshots(maxAgeDays)` removes stale data

### Backtest Engine (`strategy/backtest.ts`)

Evaluates historical recommendation accuracy:

- **Hit rate** — correct / (correct + incorrect)
- **Brier score** — `(1/N) × Σ(confidence - outcome)²` (lower = better calibrated)
- **Calibration** — Bins entries by confidence, compares predicted vs actual win rate
- **ROI** — `Σ(pnl) / Σ(suggestedSize)` across all resolved entries
- **PnL per entry** — correct: `(1/priceAtRec - 1) × suggestedSize`, incorrect: `-suggestedSize`

### Liquidity Analyzer (`strategy/liquidity.ts`)

Evaluates market depth quality via CLOB orderbook:

- **Spread tightness** (40% weight) — `max(0, 1 - spread × 20)` (5¢ spread = 0)
- **Bid depth** (30% weight) — cumulative bid liquidity vs $5K benchmark
- **Ask depth** (30% weight) — cumulative ask liquidity vs $5K benchmark
- Returns `LiquidityProfile` with full depth ladder for each market

### Portfolio Risk (`strategy/portfolio-risk.ts`)

Concentration and correlation analysis:

- **Herfindahl index** — Σ(weight²), 1.0 = single position, 1/n = perfectly diversified
- **Diversification index** — `1 / (n × HHI)`
- **Correlation detection** — Groups positions by keyword overlap (≥2 shared words)
- **Directional risk** — Flags if all positions are same side (all YES or all NO)
- **Hedge suggestions** — Alerts on >50% concentration, suggests opposing positions

### Event Graph (`strategy/event-graph.ts`)

Groups markets by event and checks probability consistency:

- Fetches events from Gamma API, extracts child markets
- Sums YES probabilities — exclusive outcomes should sum to ~1.0
- Flags anomalies where deviation exceeds ±5%
- ASCII tree rendering with bar charts and volume

### Social Signals (`news/social.ts`)

Reddit mention scanner:

- Queries `old.reddit.com/search.json` with proper User-Agent
- Reuses positive/negative word lists from recommender for sentiment classification
- Returns mention count, sentiment breakdown (pos/neg/neutral), and top posts by score

### Geopolitical Data Sources (`news/geopolitical.ts`)

Four free, keyless APIs with advanced filtering for market-moving event detection:

| Source | APIs Used | Capabilities |
|--------|-----------|-------------|
| **GDELT** | DOC, GEO, TV (3 endpoints) | Article search, tone/sentiment analysis, geographic clustering, TV broadcast monitoring, 15 structured theme codes, language/country filtering, near/repeat operators |
| **USGS** | Feed + Query API (2 endpoints) | Earthquake feeds (significant/4.5+/month), advanced query with alertlevel, minmag, minsig, tsunami, felt filters |
| **NASA EONET** | Events API | 13 categories (wildfires, storms, volcanoes, floods, landslides...), magnitude filtering, bounding box queries |
| **GDACS** | Events API | 6 disaster types, Green/Orange/Red alerts, population exposure, vulnerability scores |

**Key functions:**

- `fetchHighSignalAlerts()` — unified high-severity alert feed across all sources, sorted by criticality (critical > high > medium). Deduplicates earthquakes across significant/alert/tsunami feeds.
- `fetchGdeltByTheme(key)` — 15 structured themes: elections, protests, terror, armedConflict, ceasefires, sanctions, pandemic, nuclearWeapons, coupAttempt, etc.
- `fetchGdeltTone(query, days)` — global media sentiment over time (negative = bearish coverage, positive = bullish)
- `fetchGdeltTvMentions(query)` — US cable news mention counts by station (last 24h)
- `fetchGdeltGeo(query)` — geographic clustering of coverage
- `fetchHighSignalQuakes()` — merges significant + orange/red alert + tsunami quakes
- `fetchHighImpactEonetEvents()` — only severe storms, wildfires, volcanoes

All sources are fetched in parallel via `fetchAllGeopoliticalEvents()` and automatically merged into the `NewsAggregator.fetchAll()` pipeline alongside RSS and Telegram.

### Resolution Calendar (`calendar.ts`)

Groups active markets by resolution date into buckets: Today, Tomorrow, This Week, Next Week, This Month, Later.

### Daily Digest (`digest.ts`)

Aggregates all subsystems into a single report:

1. Watchlist price changes (>1¢ delta)
2. Triggered alerts (polled live)
3. Top 5 new recommendations (mini-scan of 10 news items)
4. Recently resolved bets (last 24h from history)
5. Upcoming resolutions (7-day window)
6. Portfolio summary

Supports markdown export via `digestToMarkdown()`.

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
| `keyword-alerts.ts` | `.keywords.json` | `{ keywords: KeywordWatch[] }` | add, remove, list, match, smartMatch |
| `history.ts` | `.history.json` | `{ entries: HistoryEntry[] }` | log, get, updateResolutions, stats |
| `portfolio.ts` | `.portfolio.json` | `{ balance, positions[], trades[], createdAt }` | buy, sell, reset, value |
| `strategy/momentum.ts` | `.momentum.json` | `{ snapshots: Record<string, PriceSnapshot[]> }` | record, get, prune |

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

## Presentation Layer (`ui.ts`, ~1,400 LOC)

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
| `printMomentum()` | momentum | Sparkline, deltas, trend indicator |
| `printBacktest()` | backtest | Hit rate, ROI, Brier, calibration chart |
| `printCalendar()` | calendar | Resolution date buckets |
| `printLiquidity()` | liquidity | Depth ladder, spread, liquidity score |
| `printSmartKeywordMatches()` | kw scan --smart | Keywords → markets → recommendations |
| `printPortfolioRisk()` | portfolio risk | HHI, correlations, hedge suggestions |
| `printComparison()` | compare | Two-column side-by-side market view |
| `printSocialSignals()` | signals | Sentiment bar, top Reddit posts |
| `printEventTree()` | event-tree | ASCII tree with probability bars |
| `printDigest()` | digest | Combined daily report |
| `printGeoEvents()` | geo events, geo gdelt | Geopolitical event list with alert coloring |
| `printGdeltTimeline()` | geo gdelt --timeline | Volume intensity bar chart |
| `printGeoAlerts()` | geo alerts | Severity-badged alert dashboard (critical/high/medium) |
| `printGdeltTone()` | geo tone | Diverging sentiment bar chart (positive/negative) |

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

9. **Geo-restriction bypass** — The Polymarket website is blocked in some regions (US, UAE, etc.), but the Gamma and CLOB API endpoints are accessible worldwide. This tool works from any location without a VPN.

10. **Futures-focused** — Polymarket primarily lists futures and event-based markets (election outcomes, championship winners, price targets), not real-time game-by-game sports bets. The tool's edge detection is most effective for political and crypto markets where news feeds directly move prices.
