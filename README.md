# Polymarket Agent

Prediction market intelligence terminal — scan news, match to Polymarket, and get AI-driven bet recommendations with Kelly sizing.

## Quick Start

```bash
npm install
cp .env.example .env   # optional: add API keys for trading/Telegram/scraping

# Run commands directly
npx tsx src/cli.ts scan
npx tsx src/cli.ts markets
npx tsx src/cli.ts trending

# Or build and run
npm run build
node dist/cli.js scan
```

## Commands

### Core

| Command | Description |
|---------|-------------|
| `scan` | Scan news feeds, match to markets, recommend bets |
| `markets [-s query] [-c category]` | Browse active markets |
| `search <query>` | Search for specific markets |
| `market <id>` | Detailed market view with orderbook |
| `news` | Show latest news from all sources |
| `recommend <url>` | Analyze a specific article for opportunities |
| `live [-i seconds]` | Continuous monitoring with alerts |
| `status` | System configuration dashboard |

### Analysis & Strategy

| Command | Description |
|---------|-------------|
| `odds <value> [-f format] [-m market]` | Convert between probability, decimal, American odds; show edge vs market |
| `trending [-l limit]` | Trending events sorted by volume |
| `categories` | Market categories with counts and total volume |
| `arb [--deep]` | Arbitrage scanner (YES+NO < $1) |
| `correlate [query] [--all]` | Multi-market probability correlation, flag anomalies |

### Watchlist & Alerts

| Command | Description |
|---------|-------------|
| `watch list` | Show watchlist with live prices |
| `watch add <query>` | Add market to watchlist |
| `watch rm <index>` | Remove by index |
| `alert add <query> --side YES --above 0.75` | Set price alert |
| `alert list` | View all alerts |
| `alert rm <index>` | Remove alert |
| `alert watch [-i seconds]` | Poll alerts for triggers |
| `kw add <keyword>` | Watch for keyword in news |
| `kw list` | View keyword watches |
| `kw rm <index>` | Remove keyword |
| `kw scan` | Scan current news for keyword matches |

### Paper Trading & History

| Command | Description |
|---------|-------------|
| `portfolio show` | Portfolio summary with live P&L |
| `portfolio buy <query> <amount> [--side YES\|NO]` | Buy shares |
| `portfolio sell <index>` | Sell a position at market price |
| `portfolio reset` | Reset to $1,000 |
| `portfolio history [-l limit]` | Trade log |
| `history [--update] [-l limit]` | Recommendation history with accuracy stats |

### Data Export

| Command | Description |
|---------|-------------|
| `export markets <file>` | Export markets to JSON/CSV |
| `export watchlist <file>` | Export watchlist |
| `export scan <file>` | Run scan and export recommendations |
| `scan --export <file>` | Inline export on scan |
| `markets --export <file>` | Inline export on markets |

## Configuration

All features work with **public APIs only** — no keys required for market data, news scanning, or paper trading.

Optional API keys unlock additional features:

| Variable | Purpose |
|----------|---------|
| `POLYMARKET_PRIVATE_KEY` | Live trading (wallet) |
| `POLYMARKET_API_KEY/SECRET/PASSPHRASE` | Authenticated CLOB access |
| `TELEGRAM_API_ID/HASH` | Telegram channel news |
| `FIRECRAWL_API_KEY` | Web scraping for `recommend <url>` |
| `NEWS_RSS_FEEDS` | Custom RSS feeds (comma-separated) |
| `MAX_BET_SIZE_USD` | Max bet size (default: $10) |
| `MIN_CONFIDENCE` | Minimum confidence threshold (default: 0.6) |
| `KELLY_FRACTION` | Kelly fraction for sizing (default: 0.5 = half-Kelly) |

## Data Files

Persistent state is stored as JSON in the project root (all gitignored):

| File | Purpose |
|------|---------|
| `.watchlist.json` | Saved market watches |
| `.alerts.json` | Price alert thresholds |
| `.keywords.json` | News keyword watches |
| `.history.json` | Recommendation log with resolutions |
| `.portfolio.json` | Paper trading positions and trades |

## Development

```bash
npm run dev             # Run with tsx (hot reload)
npm run build           # Compile TypeScript
npx tsc --noEmit        # Type check only
```
