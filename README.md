# Polymarket Agent

Prediction market intelligence terminal. Scans 15+ news feeds, matches headlines to Polymarket, and produces ranked bet recommendations with sentiment analysis, Kelly sizing, and expected value calculations.

All features work with **public APIs only** — no wallet or API keys required.

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
```

### Paper Trading

```bash
portfolio show            # Summary: cash, positions, P&L (live prices)
portfolio buy <q> <$>     # Buy shares (--side YES|NO, default YES)
portfolio sell <index>    # Sell position at current market price
portfolio reset           # Reset to $1,000 starting balance
portfolio history [-l]    # Trade log
```

### History & Accuracy

```bash
history [options]         # View recommendation log
  --update                # Check for resolved markets, update W/L stats
  -l, --limit <n>         # Entries to show (default: 20)
```

Recommendations from `scan` are automatically logged. Run `history --update` periodically to track resolution accuracy.

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

## Persistent Data

State files are stored in the project root as JSON (all gitignored):

| File | Module | Content |
|------|--------|---------|
| `.watchlist.json` | `watchlist.ts` | Saved markets with add-time prices |
| `.alerts.json` | `alerts.ts` | Price thresholds (side, direction, target) |
| `.keywords.json` | `keyword-alerts.ts` | Keyword watch list |
| `.history.json` | `history.ts` | Recommendation log with resolution tracking |
| `.portfolio.json` | `portfolio.ts` | Virtual balance, positions, trade history |

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
