# Polymarket Agent

Prediction market intelligence terminal. Scans 15+ news feeds, matches headlines to Polymarket, and produces ranked bet recommendations with sentiment analysis, Kelly sizing, and expected value calculations.

All features work with **public APIs only** — no wallet or API keys required.

> **Geo-restricted regions:** The Polymarket website is blocked in certain countries (US, UAE, etc.), but the API endpoints used by this tool are **not blocked**. All read-only features work without a VPN.

## Quick Start

```bash
npm install
cp .env.example .env   # optional: configure API keys

# Development (tsx, no build step)
npx tsx src/cli.ts scan
npx tsx src/cli.ts trending
npx tsx src/cli.ts odds 0.65

# Production
npm run build
node dist/cli.js scan
```

## Commands

### Intelligence & Scanning

```bash
scan [options]            # Scan news → match markets → recommend bets
  -l, --limit <n>         # Max news items (default: 20)
  --rss-only              # Skip Telegram/web sources
  --min-confidence <n>    # Threshold (default: 0.6)
  --export <file>         # Export results (.json or .csv)

expiring [options]        # Scan markets expiring today, find edge opportunities
  -h, --hours <n>         # Hours ahead to scan (default: 24)
  --min-liquidity <n>     # Minimum liquidity in USD (default: 500)
  --no-news               # Skip news matching, just list expiring markets

news [-l <n>]             # Show latest news from all sources
recommend <url>           # Scrape article, find matching markets, recommend
live [-i <seconds>]       # Continuous monitoring (default: 300s poll)
```

### Market Discovery

```bash
markets [options]         # Browse active markets
  -l, --limit <n>         # Number of results (default: 20)
  -s, --search <query>    # Text search
  -c, --category <tag>    # Filter by category
  --export <file>         # Export results

search <query> [-l <n>]   # Search markets by query
market <id>               # Detail view: orderbook, description, related markets
                          # Resolves slug, numeric ID, or condition_id
trending [-l <n>]         # Events ranked by aggregate volume
categories                # Category breakdown: counts + total volume + top markets
```

### Odds & Strategy

```bash
odds <value> [options]    # Convert odds formats + edge calculation
  -f, --format <fmt>      # Input: prob (default), decimal, american
  -m, --market <query>    # Compare your estimate vs live market price

arb [options]             # Arbitrage scanner: find YES+NO < $1.00
  --deep                  # Verify with orderbook ask prices
  -l, --min-profit <c>    # Minimum profit in cents (default: 1)

correlate [query] [--all] # Group markets by event, check probability sums
                          # Flags anomalies where Σ(YES) deviates >5% from 1.0
```

### Watchlist

```bash
watch list                # Show watchlist with live price deltas
watch add <query> [-n]    # Add top search result, optional --notes
watch rm <index>          # Remove by 1-based index
watch clear               # Clear entire watchlist
```

### Price Alerts

```bash
alert add <query> [opts]  # Set threshold alert
  --side <YES|NO>         # Side to monitor (default: YES)
  --above <price>         # Trigger when price rises above
  --below <price>         # Trigger when price drops below

alert list                # View all alerts (active + triggered)
alert rm <index>          # Remove by index
alert watch [-i <sec>]    # Poll for triggers (default: 60s)
```

### Keyword Watches

```bash
kw add <keyword>          # Watch for keyword in news headlines
kw list                   # Show all keyword watches
kw rm <index>             # Remove by index
kw scan                   # Scan current news for matches, auto-search markets
kw scan --smart           # Smart mode: match + recommend + market signals
```

### Paper Trading

```bash
portfolio show            # Summary: cash, positions, P&L (live prices)
portfolio buy <q> <$>     # Buy shares (--side YES|NO, default YES)
portfolio sell <index>    # Sell position at current market price
portfolio reset           # Reset to $1,000 starting balance
portfolio history [-l]    # Trade log
portfolio risk            # Concentration, correlation, and hedge suggestions
```

### History & Accuracy

```bash
history [options]         # View recommendation log
  --update                # Check for resolved markets, update W/L stats
  -l, --limit <n>         # Entries to show (default: 20)
```

Recommendations from `scan` are automatically logged. Run `history --update` periodically to track resolution accuracy.

### Price Momentum

```bash
momentum <query>          # Show price history, sparkline, and deltas (1h/6h/24h/7d)
```

Prices are automatically recorded during `scan` and `watch list`. The more you use the tool, the richer the momentum data.

### Backtesting

```bash
backtest [options]        # Evaluate recommendation accuracy
  --detailed              # Show individual trade-level results
  --update                # Update resolutions before backtesting
```

Computes hit rate, ROI, Brier score, and calibration buckets.

### Resolution Calendar

```bash
calendar [options]        # Show upcoming market resolution dates
  -d, --days <n>          # Max days ahead (default: 90)
  --watch                 # Only show watchlist markets
```

### Liquidity Analysis

```bash
liquidity [query]         # Analyze orderbook depth and spread quality
  -l, --limit <n>         # Max markets (default: 10)
```

Defaults to watchlist if no query. Composite score: spread tightness (40%), bid depth (30%), ask depth (30%).

### Market Comparison

```bash
compare <query1> <query2> # Side-by-side: prices, volume, orderbook, category, dates
```

### Social Signals

```bash
signals <query>           # Scan Reddit for mentions and sentiment
  -l, --limit <n>         # Max posts (default: 25)
```

### Event Tree

```bash
event-tree [query]        # Probability tree with anomaly detection
  -l, --limit <n>         # Max events (default: 10)
```

Groups markets by event, sums YES probabilities, flags >5% deviations from 1.0.

### Daily Digest

```bash
digest [options]          # All-in-one daily report
  --export <file>         # Export to markdown file
```

Combines: watchlist changes, triggered alerts, top recommendations, resolved bets, upcoming resolutions, and portfolio summary.

### Geopolitical Intelligence

```bash
# Quick decision-making
geo alerts               # High-signal events only (critical/high severity)
geo alerts --match       # Auto-match alerts to Polymarket + recommend

# Browse events
geo events               # All active events (USGS + NASA + GDACS)
geo events --quakes      # Earthquakes only (USGS M4.5+)
geo events --min-mag 6   # Earthquakes M6.0+
geo events --tsunami     # Only tsunami-warning quakes
geo events --disasters   # Orange/Red disaster alerts (GDACS)
geo events --natural     # Natural events: fires, storms, volcanoes (NASA)

# GDELT global news database
geo gdelt <query>              # Search articles
geo gdelt <query> --timeline   # Volume intensity chart over time
geo gdelt <query> --tone       # Sentiment/tone analysis with timeline
geo gdelt <query> --theme ELECTION  # Filter by GDELT theme code
geo gdelt <query> --lang english    # Filter by source language
geo gdelt <query> --country US      # Filter by source country

# Structured GDELT themes
geo themes               # List all available theme keys
geo themes elections     # Articles tagged with ELECTION theme
geo themes sanctions     # Articles tagged with ECON_SANCTIONS
geo themes terror        # Articles tagged with TERROR

# Media monitoring
geo tone <query>         # Global media sentiment analysis
geo tv <query>           # US cable news mentions (last 24h by station)

# Match to markets
geo scan                 # Match geopolitical events to Polymarket + recommend
```

All geopolitical sources are also automatically included in `scan` and `news` feeds. No API keys required — these are all free public feeds:

- **GDELT** — Global Database of Events, Language, and Tone (250M+ articles, 6 API modes)
- **USGS** — Real-time earthquake data with PAGER alerts, tsunami warnings, felt reports
- **NASA EONET** — 13 categories: wildfires, storms, volcanoes, floods, landslides, etc.
- **GDACS** — Global disaster alerts with population exposure and vulnerability scores

**GDELT Theme Codes:** elections, protests, terror, armedConflict, militaryForce, ceasefires, negotiations, sanctions, pandemic, nuclearWeapons, coupAttempt, naturalDisaster, economicCrisis, tradeWar

### Data Export

```bash
export markets <file>     # Export top markets (.json or .csv)
  -l, --limit <n>         # Max items (default: 50)
  -s, --search <query>    # Filter markets

export watchlist <file>   # Export watchlist entries
export scan <file>        # Run full scan and export recommendations
```

Also available as inline flags: `scan --export out.csv`, `markets --export out.json`.

### System

```bash
status                    # Dashboard: API status, config, feature counts
```

## Market Coverage

Polymarket primarily offers **futures and event-based markets**, not real-time game-by-game sports betting:

- **Politics** — Elections, approval ratings, legislation, geopolitics (strongest coverage)
- **Crypto** — Price targets, protocol milestones, regulatory events
- **Sports futures** — Championship winners, season awards (NBA Finals, World Cup, MVP)
- **AI/Tech** — Model releases, company milestones
- **Novelty** — "Before GTA VI" markets, pop culture predictions

For **same-day individual game betting** (spreads, O/U, props), traditional sportsbooks (DraftKings, FanDuel, BetMGM) are better suited.

### Edge Detection Tips

The tool's automated edge detection is conservative. For manual edge-hunting:

1. **Use `expiring`** — Markets resolving within hours have the most actionable edge; the `expiring` command flags pricing anomalies (arb, mispriced sums, high-uncertainty) automatically
2. **Compare Polymarket vs sportsbook odds** — Polymarket futures often lag behind sportsbook line movements
3. **Watch 40-60¢ markets** — These are where mispricing is most likely
4. **Cross-reference data sources** — Use `geo scan`, `news`, and web search to form your own probability estimate, then compare to market price
5. **Check volume** — Low-volume markets (<$50K) may be mispriced but are hard to enter/exit

## Configuration

Copy `.env.example` to `.env`. All variables are optional:

| Variable | Default | Purpose |
|----------|---------|---------|
| `POLYMARKET_PRIVATE_KEY` | — | Wallet for live trading |
| `POLYMARKET_API_KEY` | — | Authenticated CLOB access |
| `POLYMARKET_API_SECRET` | — | CLOB auth |
| `POLYMARKET_API_PASSPHRASE` | — | CLOB auth |
| `POLYMARKET_FUNDER_ADDRESS` | — | Wallet address |
| `TELEGRAM_API_ID` | — | Telegram channel news ([my.telegram.org](https://my.telegram.org/auth)) |
| `TELEGRAM_API_HASH` | — | Telegram auth |
| `FIRECRAWL_API_KEY` | — | Web scraping for `recommend <url>` ([firecrawl.dev](https://www.firecrawl.dev)) |
| `NEWS_RSS_FEEDS` | 15 feeds | Comma-separated override |
| `MAX_BET_SIZE_USD` | `10` | Max suggested bet |
| `MIN_CONFIDENCE` | `0.6` | Minimum recommendation confidence |
| `KELLY_FRACTION` | `0.5` | Kelly multiplier (0.5 = half-Kelly) |

### Default News Sources

**RSS (15 feeds):** NYT (World, Politics, Business, Tech), BBC World, Reuters, Bloomberg (Politics, Markets), NPR, CoinDesk, CoinTelegraph, Decrypt, The Block, Ars Technica, ESPN

**Telegram (3 channels):** polyaborygen, WhaleTrades, cryptonews

**Geopolitical (4 sources, no keys needed):** GDELT (global news database), USGS (earthquakes), NASA EONET (natural events), GDACS (disaster alerts)

## Persistent Data

State files are stored in the project root as JSON (all gitignored):

| File | Module | Content |
|------|--------|---------|
| `.watchlist.json` | `watchlist.ts` | Saved markets with add-time prices |
| `.alerts.json` | `alerts.ts` | Price thresholds (side, direction, target) |
| `.keywords.json` | `keyword-alerts.ts` | Keyword watch list |
| `.history.json` | `history.ts` | Recommendation log with resolution tracking |
| `.portfolio.json` | `portfolio.ts` | Virtual balance, positions, trade history |
| `.momentum.json` | `strategy/momentum.ts` | Price snapshots for momentum tracking |

## Tech Stack

| Dependency | Version | Purpose |
|-----------|---------|---------|
| TypeScript | ^5.6 | Language (strict mode, ES2022 target) |
| Commander | ^12.1 | CLI framework |
| Chalk | ^5.3 | Terminal colors |
| Axios | ^1.7 | HTTP client |
| rss-parser | ^3.13 | RSS feed parsing |
| dotenv | ^16.4 | Environment config |
| ws | ^8.18 | WebSocket (reserved for future use) |
| tsx | ^4.19 | TypeScript execution (dev) |

## Example Workflow

```bash
# 1. Scan expiring markets for immediate opportunities
npx tsx src/cli.ts expiring --hours 6

# 2. Full news scan — match all feeds to markets
npx tsx src/cli.ts scan

# 3. Geopolitical scan — earthquakes, disasters, conflicts
npx tsx src/cli.ts geo scan

# 3. Search specific markets
npx tsx src/cli.ts search "trump approval"
npx tsx src/cli.ts search "NBA finals"

# 4. Check for arbitrage
npx tsx src/cli.ts arb

# 5. Paper trade if you spot edge
npx tsx src/cli.ts portfolio buy "thunder NBA finals" 50

# 6. Track your positions
npx tsx src/cli.ts portfolio show
```

## Development

```bash
npm run dev              # tsx src/cli.ts (auto-resolves TS)
npm run build            # tsc → dist/
npx tsc --noEmit         # Type check without emitting

# Quick-access scripts
npm run scan             # tsx src/cli.ts scan
npm run markets          # tsx src/cli.ts markets
npm run live             # tsx src/cli.ts live
```

## Project Structure

See [ARCHITECTURE.md](ARCHITECTURE.md) for full system design, data flow diagrams, and module documentation.
