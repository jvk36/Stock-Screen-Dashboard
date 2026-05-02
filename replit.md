# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

---

## Stock Screener Dashboard (`artifacts/stock-screener`)

A multi-strategy stock screener with live data from Yahoo Finance.

### Architecture

- **Frontend**: React + Vite + Tailwind CSS, deployed at `/stock-screener`
- **Backend API**: Express server at `artifacts/api-server`, endpoint `GET /api/stocks`
- **Data source**: Yahoo Finance via `yahoo-finance2` npm package
- **Mock fallback**: `src/data/mockStocks.ts` — 94 fictitious GARP tickers used when API unavailable

### Data Flow

1. API server fetches **78 real tickers** from Yahoo Finance in two phases:
   - Phase 1: `quoteSummary` (all fundamental fields, 5 concurrent workers, 250ms delay each)
   - Phase 2: `chart` (3m/1m price returns, 5 concurrent workers, 200ms delay each)
2. Results cached in-memory for **24 hours**
3. Frontend queries `GET /api/stocks` via `@workspace/api-client-react` (TanStack Query)
4. On fetch failure the UI falls back to mock demo data automatically

### 7 Strategy Tabs

| Tab | File | Strategy |
|-----|------|----------|
| GARP | `Dashboard.tsx` (inline) | Growth At Reasonable Price — 100-bagger framework |
| Deep Value | `tabs/DeepValueTab.tsx` | Low P/E, P/B, EV/EBITDA; high FCF yield |
| Momentum | `tabs/MomentumTab.tsx` | 52w / 3m / 1m return leaders; near 52wk high |
| Quality | `tabs/QualityTab.tsx` | High ROE, ROA, operating margin; strong balance sheet |
| Dividend | `tabs/DividendTab.tsx` | Dividend yield, payout safety, 5yr avg yield |
| Asymmetric | `tabs/AsymmetricTab.tsx` | Deep drawdowns + analyst/short-squeeze catalysts |
| Trending | `tabs/TrendingTab.tsx` | Short-term price-action leaders near 52wk highs |

### Key Files

```
artifacts/stock-screener/src/
  lib/screener.ts          — Stock + ScoredStock types; all 7 filter state types + filter functions
  data/mockStocks.ts       — 94 mock GARP stocks (EXT defaults for new fields)
  pages/Dashboard.tsx      — 7-tab navigation + GARP tab content
  pages/tabs/              — DeepValueTab, MomentumTab, QualityTab, DividendTab, AsymmetricTab, TrendingTab
  components/
    FilterPanel.tsx        — GARP-specific filter sidebar
    StockTable.tsx         — GARP-specific sortable table
    TabFilterPanel.tsx     — Generic config-driven filter sidebar for new tabs
    TabStockTable.tsx      — Generic config-driven sortable ranked table for new tabs
    StrategyBanner.tsx     — Strategy quote banner used by all tabs

artifacts/api-server/src/routes/stocks.ts  — Yahoo Finance fetch (Phase 1 + Phase 2)

lib/api-client-react/src/generated/api.schemas.ts  — Stock TypeScript interface (all fields)
lib/api-zod/src/generated/
  types/stock.ts           — Stock TypeScript interface
  api.ts                   — Zod schema with all fields
```

### Stock Fields

All 78 tickers include these fields (all numeric, 0 = no data):

**GARP**: `epsGrowth5yr`, `consecutiveYearsAbove16`, `pegRatio`, `forwardPE`, `revenueGrowth3yr`, `roe`, `netMargin`, `debtToEquity`, `yearsTo100x`, `hundredBaggerScore`

**Deep Value**: `trailingPE`, `priceToBook`, `evToEbitda`, `fcfYield`

**Quality**: `returnOnAssets`, `grossMargin`, `operatingMargin`, `currentRatio`

**Dividend**: `dividendYield`, `dividendRate`, `payoutRatio`, `fiveYearAvgDividendYield`

**Momentum/Trending**: `return52w`, `returnVsSP500`, `return3m`, `return1m`, `pctFromHigh`, `volumeTrend`

**Asymmetric**: `shortPercentOfFloat`, `analystRating` (1=Strong Buy … 5=Strong Sell)

### Scoring

Each tab computes a 0–100 composite score per stock:
- **GARP**: `hundredBaggerScore` (EPS growth + PEG + ROE + consistency)
- **Deep Value**: inverse-weighted P/E + P/B + EV/EBITDA + FCF yield
- **Momentum**: 40% 52w return + 35% vs S&P + 25% 3m return
- **Quality**: ROE + ROA + operating margin + gross margin + current ratio
- **Dividend**: yield + payout sustainability + EPS growth + yield history
- **Asymmetric**: price depression + cheap valuation + analyst/short catalyst signal
- **Trending**: 3m return + vs S&P + proximity to high + volume trend

### Filter States (stored as percent integers for sliders, compared against decimal stock fields × 100)

- `pctFromHigh`: stored as decimal (0.20 = 20% below 52wk high); filter values in `%`
- `return52w`, `return3m`, `return1m`, `returnVsSP500`: stored as decimals; filter values in `%`
- `dividendYield`, `fcfYield`, `payoutRatio`: stored as decimals; displayed × 100
- `debtToEquity`: stored as ratio (Yahoo `debtToEquity` ÷ 100)
- `analystRating`: 1–5 scale (0 = no data)
