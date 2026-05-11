export interface Stock {
  ticker: string;
  company: string;
  sector: string;
  marketCap: "Mega" | "Large" | "Mid" | "Small" | "Micro";
  // ── GARP ──────────────────────────────────────────────────────────────
  epsGrowth5yr: number;
  consecutiveYearsAbove16: number;
  pegRatio: number;
  forwardPE: number;
  revenueGrowth3yr: number;
  roe: number;
  netMargin: number;
  debtToEquity: number;
  yearsTo100x: number;
  hundredBaggerScore: number;
  // ── Deep Value ─────────────────────────────────────────────────────────
  trailingPE: number;
  priceToBook: number;
  evToEbitda: number;
  fcfYield: number;
  // ── Quality ────────────────────────────────────────────────────────────
  returnOnAssets: number;
  grossMargin: number;
  operatingMargin: number;
  currentRatio: number;
  // ── Dividend Growth ────────────────────────────────────────────────────
  dividendYield: number;
  dividendRate: number;
  payoutRatio: number;
  fiveYearAvgDividendYield: number;
  // ── Momentum / Trending / Asymmetric ───────────────────────────────────
  return52w: number;           // decimal e.g. 0.25 = +25%
  returnVsSP500: number;       // decimal, stock 52w minus S&P 52w
  return3m: number;            // decimal
  return1m: number;            // decimal
  pctFromHigh: number;         // decimal, e.g. 0.20 = 20% below 52wk high
  volumeTrend: number;         // ratio: 10-day avg / 90-day avg
  // ── Asymmetric ─────────────────────────────────────────────────────────
  shortPercentOfFloat: number; // decimal e.g. 0.12 = 12% short
  analystRating: number;       // 1=strong buy … 5=strong sell, 0=no data
  // ── Price ──────────────────────────────────────────────────────────────
  price: number;               // current market price (USD)
}

export interface ScoredStock extends Stock {
  score: number;
}

export interface StrategyStocks {
  garp: Stock[];
  deepValue: Stock[];
  momentum: Stock[];
  quality: Stock[];
  dividendGrowth: Stock[];
  asymmetric: Stock[];
  trending: Stock[];
}

export function calculateMetrics(
  stock: Omit<Stock, "yearsTo100x" | "hundredBaggerScore">
): Stock {
  const growth = Math.max(stock.epsGrowth5yr, 0.001);
  const yearsTo100x = Math.log(100) / Math.log(1 + growth);

  let epsScore = 0;
  if (stock.epsGrowth5yr >= 0.16) epsScore = 40;
  else if (stock.epsGrowth5yr >= 0.12)
    epsScore = 20 + ((stock.epsGrowth5yr - 0.12) / 0.04) * 20;
  else epsScore = Math.max(0, (stock.epsGrowth5yr / 0.12) * 20);

  let pegScore = 0;
  if (stock.pegRatio <= 0.5) pegScore = 25;
  else if (stock.pegRatio >= 3.0) pegScore = 0;
  else pegScore = 25 - ((stock.pegRatio - 0.5) / 2.5) * 25;

  let roeScore = 0;
  if (stock.roe >= 0.4) roeScore = 20;
  else if (stock.roe <= 0) roeScore = 0;
  else roeScore = (stock.roe / 0.4) * 20;

  const consistencyScore = Math.min(1.0, stock.consecutiveYearsAbove16 / 10) * 15;

  return {
    ...stock,
    yearsTo100x: Math.round(yearsTo100x * 100) / 100,
    hundredBaggerScore: Math.round(epsScore + pegScore + roeScore + consistencyScore),
  };
}

/**
 * Build seven strategy-specific sorted lists from any stock array.
 * Mirrors the server-side `buildStrategies` logic for fallback use with mock data.
 */
export function buildStrategyRankings(stocks: Stock[]): StrategyStocks {
  // GARP — Growth At Reasonable Price
  const garp = stocks
    .filter(
      (s) =>
        s.epsGrowth5yr >= 0.12 &&
        s.forwardPE > 0 && s.forwardPE <= 50 &&
        s.pegRatio > 0 && s.pegRatio <= 3 &&
        s.revenueGrowth3yr >= 0.08
    )
    .sort((a, b) => {
      const aScore = a.epsGrowth5yr - (a.forwardPE > 0 ? 1 / a.forwardPE : 0);
      const bScore = b.epsGrowth5yr - (b.forwardPE > 0 ? 1 / b.forwardPE : 0);
      return bScore - aScore;
    });

  // Deep Value — Cheap by book value, enterprise value, or free cash flow
  const deepValue = stocks
    .filter(
      (s) =>
        (s.priceToBook > 0 && s.priceToBook <= 2.5) ||
        (s.evToEbitda > 0 && s.evToEbitda <= 12) ||
        s.fcfYield >= 0.05
    )
    .sort((a, b) => {
      if (a.priceToBook <= 0 && b.priceToBook <= 0) return 0;
      if (a.priceToBook <= 0) return 1;
      if (b.priceToBook <= 0) return -1;
      return a.priceToBook - b.priceToBook;
    });

  // Momentum — Outperforming the market with confirmation
  const momentum = stocks
    .filter((s) => s.returnVsSP500 > 0 && s.return3m > 0)
    .sort((a, b) => b.returnVsSP500 - a.returnVsSP500);

  // Quality — High-moat durable businesses
  const quality = stocks
    .filter(
      (s) =>
        s.roe >= 0.15 &&
        s.grossMargin >= 0.30 &&
        s.debtToEquity <= 2.0
    )
    .sort((a, b) => b.roe - a.roe);

  // Dividend Growth — Sustainable yield with earnings support
  const dividendGrowth = stocks
    .filter(
      (s) =>
        s.dividendYield > 0 &&
        s.payoutRatio <= 0.80 &&
        s.epsGrowth5yr >= 0
    )
    .sort((a, b) => {
      const aScore = a.dividendYield * (1 - Math.min(a.payoutRatio, 1));
      const bScore = b.dividendYield * (1 - Math.min(b.payoutRatio, 1));
      return bScore - aScore;
    });

  // Asymmetric — Deep discount with analyst conviction as catalyst signal
  const asymmetric = stocks
    .filter(
      (s) =>
        s.pctFromHigh >= 0.15 &&
        (s.analystRating === 0 || s.analystRating <= 2.5)
    )
    .sort((a, b) => {
      const aNorm = a.analystRating > 0 ? (5 - a.analystRating) / 4 : 0.5;
      const bNorm = b.analystRating > 0 ? (5 - b.analystRating) / 4 : 0.5;
      return (
        b.pctFromHigh * (0.6 + 0.4 * bNorm) -
        a.pctFromHigh * (0.6 + 0.4 * aNorm)
      );
    });

  // Trending — Recent heat: positive short-term momentum with volume confirmation
  const trending = stocks
    .filter((s) => s.return1m > 0 && s.return3m > 0 && s.volumeTrend > 1.0)
    .sort((a, b) => b.return1m - a.return1m);

  return { garp, deepValue, momentum, quality, dividendGrowth, asymmetric, trending };
}

export const ALL_SECTORS = [
  "Information Technology",
  "Health Care",
  "Financials",
  "Consumer Discretionary",
  "Communication Services",
  "Industrials",
  "Consumer Staples",
  "Energy",
  "Utilities",
  "Real Estate",
  "Materials",
] as const;

export const ALL_MARKET_CAPS = ["Mega", "Large", "Mid", "Small", "Micro"] as const;

// ─── GARP ─────────────────────────────────────────────────────────────────────

export interface FilterState {
  epsGrowth: number;
  pegMin: number;
  pegMax: number;
  fwdPeMin: number;
  fwdPeMax: number;
  revGrowth: number;
  roeMin: number;
  netMarginMin: number;
  debtEqMax: number;
  marketCaps: string[];
  sectors: string[];
}

export const defaultFilters: FilterState = {
  epsGrowth: 15,
  pegMin: 0,
  pegMax: 2.0,
  fwdPeMin: 10,
  fwdPeMax: 40,
  revGrowth: 10,
  roeMin: 15,
  netMarginMin: 8,
  debtEqMax: 1.5,
  marketCaps: [...ALL_MARKET_CAPS],
  sectors: [...ALL_SECTORS],
};

export function filterStocks(stocks: Stock[], filters: FilterState): Stock[] {
  return stocks.filter((s) => {
    if (s.epsGrowth5yr * 100 < filters.epsGrowth) return false;
    if (s.pegRatio < filters.pegMin || s.pegRatio > filters.pegMax) return false;
    if (s.forwardPE < filters.fwdPeMin || s.forwardPE > filters.fwdPeMax) return false;
    if (s.revenueGrowth3yr * 100 < filters.revGrowth) return false;
    if (s.roe * 100 < filters.roeMin) return false;
    if (s.netMargin * 100 < filters.netMarginMin) return false;
    if (s.debtToEquity > filters.debtEqMax) return false;
    if (!filters.marketCaps.includes(s.marketCap)) return false;
    if (!filters.sectors.includes(s.sector)) return false;
    return true;
  });
}

// ─── Deep Value ───────────────────────────────────────────────────────────────

export interface DeepValueFilterState {
  trailingPEMax: number;
  pbMax: number;
  evToEbitdaMax: number;
  fcfYieldMin: number;   // percent: 3 = 3%
  netMarginMin: number;  // percent
  debtEqMax: number;
  marketCaps: string[];
  sectors: string[];
}

export const defaultDeepValueFilters: DeepValueFilterState = {
  trailingPEMax: 200,   // Slider ceiling — nothing filtered by default (WBD has PE ~93)
  pbMax: 20,            // Slider ceiling — nothing filtered by default
  evToEbitdaMax: 100,   // Slider ceiling — nothing filtered (CLF has EV/EBITDA ~76)
  fcfYieldMin: -20,     // Slider floor — allow negative FCF (distressed cyclicals)
  netMarginMin: -50,    // Slider floor — allow negative margins (CLF -6.4%, F -3.2%)
  debtEqMax: 20,        // Slider ceiling — banks/insurers can have high reported D/E
  marketCaps: [...ALL_MARKET_CAPS],
  sectors: [...ALL_SECTORS],
};

export function filterDeepValue(stocks: Stock[], filters: DeepValueFilterState): ScoredStock[] {
  return stocks
    .map((s) => {
      let score = 0;
      if (s.trailingPE > 0) score += Math.max(0, (30 - s.trailingPE) / 30) * 30;
      if (s.priceToBook > 0) score += Math.max(0, (5 - s.priceToBook) / 5) * 20;
      if (s.evToEbitda > 0) score += Math.max(0, (20 - s.evToEbitda) / 20) * 25;
      score += Math.min(s.fcfYield * 100, 10) * 1.5;
      score += Math.min(s.netMargin * 100, 25) * 0.2;
      return { ...s, score: Math.round(Math.max(0, score)) };
    })
    .filter((s) => {
      if (s.trailingPE > 0 && s.trailingPE > filters.trailingPEMax) return false;
      if (s.priceToBook > 0 && s.priceToBook > filters.pbMax) return false;
      if (s.evToEbitda > 0 && s.evToEbitda > filters.evToEbitdaMax) return false;
      if (s.fcfYield * 100 < filters.fcfYieldMin) return false;
      if (s.netMargin * 100 < filters.netMarginMin) return false;
      if (s.debtToEquity > 0 && s.debtToEquity > filters.debtEqMax) return false;
      if (filters.marketCaps.length && !filters.marketCaps.includes(s.marketCap)) return false;
      if (filters.sectors.length && !filters.sectors.includes(s.sector)) return false;
      return true;
    });
}

// ─── Momentum ─────────────────────────────────────────────────────────────────

export interface MomentumFilterState {
  return52wMin: number;      // percent: 10 = ≥10%
  returnVsSP500Min: number;  // percent
  return3mMin: number;       // percent
  pctFromHighMax: number;    // percent: 20 = at most 20% below 52wk high
  marketCaps: string[];
  sectors: string[];
}

export const defaultMomentumFilters: MomentumFilterState = {
  return52wMin: -100,      // Slider floor — stocks can beat S&P while having negative absolute 52w return
  returnVsSP500Min: -100,  // Slider floor — MSTR (-82%), AXON (-63%), SMR (-57%) need full open floor
  return3mMin: -100,       // Slider floor — strong leaders can have negative 3m in volatile markets
  pctFromHighMax: 100,     // Slider ceiling — already fully open
  marketCaps: [...ALL_MARKET_CAPS],
  sectors: [...ALL_SECTORS],
};

export function filterMomentum(stocks: Stock[], filters: MomentumFilterState): ScoredStock[] {
  return stocks
    .map((s) => {
      const score = Math.round(
        s.return52w * 100 * 0.4 +
          s.returnVsSP500 * 100 * 0.35 +
          s.return3m * 100 * 0.25
      );
      return { ...s, score: Math.max(0, score) };
    })
    .filter((s) => {
      if (s.return52w * 100 < filters.return52wMin) return false;
      if (s.returnVsSP500 * 100 < filters.returnVsSP500Min) return false;
      if (s.return3m * 100 < filters.return3mMin) return false;
      if (s.pctFromHigh * 100 > filters.pctFromHighMax) return false;
      if (filters.marketCaps.length && !filters.marketCaps.includes(s.marketCap)) return false;
      if (filters.sectors.length && !filters.sectors.includes(s.sector)) return false;
      return true;
    });
}

// ─── Quality ──────────────────────────────────────────────────────────────────

export interface QualityFilterState {
  roeMin: number;              // percent
  roaMin: number;              // percent
  operatingMarginMin: number;  // percent
  grossMarginMin: number;      // percent
  currentRatioMin: number;     // ratio
  debtEqMax: number;
  marketCaps: string[];
  sectors: string[];
}

export const defaultQualityFilters: QualityFilterState = {
  roeMin: -50,     // Slider floor — high-growth names (AXON) may have temporarily negative ROE
  roaMin: -50,     // Slider floor — AXON has negative ROA during heavy-investment phase
  operatingMarginMin: -50,  // Slider floor — allow negative op margin (growth phase)
  grossMarginMin: 0,        // Gross margin is rarely negative for quality picks; keep at 0
  currentRatioMin: 0,       // Slider floor — already open (0 means no minimum applied)
  debtEqMax: 10,   // Slider ceiling — HD has D/E=5.14; raised to avoid cutting legitimate picks
  marketCaps: [...ALL_MARKET_CAPS],
  sectors: [...ALL_SECTORS],
};

export function filterQuality(stocks: Stock[], filters: QualityFilterState): ScoredStock[] {
  return stocks
    .map((s) => {
      let score = 0;
      score += Math.min(s.roe * 100, 50) * 0.6;
      score += Math.min(s.returnOnAssets * 100, 30) * 0.5;
      score += Math.min(s.operatingMargin * 100, 40) * 0.5;
      score += Math.min(s.grossMargin * 100, 80) * 0.15;
      score += Math.min(s.currentRatio, 5) * 2;
      const debtPenalty = s.debtToEquity > 2 ? (s.debtToEquity - 2) * 3 : 0;
      return { ...s, score: Math.round(Math.max(0, score - debtPenalty)) };
    })
    .filter((s) => {
      if (s.roe * 100 < filters.roeMin) return false;
      if (s.returnOnAssets * 100 < filters.roaMin) return false;
      if (s.operatingMargin * 100 < filters.operatingMarginMin) return false;
      if (s.grossMargin * 100 < filters.grossMarginMin) return false;
      if (filters.currentRatioMin > 0 && s.currentRatio > 0 && s.currentRatio < filters.currentRatioMin) return false;
      if (s.debtToEquity > 0 && s.debtToEquity > filters.debtEqMax) return false;
      if (filters.marketCaps.length && !filters.marketCaps.includes(s.marketCap)) return false;
      if (filters.sectors.length && !filters.sectors.includes(s.sector)) return false;
      return true;
    });
}

// ─── Dividend Growth ──────────────────────────────────────────────────────────

export interface DividendFilterState {
  dividendYieldMin: number;       // percent: 2 = ≥2%
  payoutRatioMax: number;         // percent: 80 = ≤80%
  fiveYearAvgYieldMin: number;    // percent
  epsGrowthMin: number;           // percent, filter out yield traps
  debtEqMax: number;
  marketCaps: string[];
  sectors: string[];
}

export const defaultDividendFilters: DividendFilterState = {
  dividendYieldMin: 0,       // Slider floor — already open
  payoutRatioMax: 999,       // Sentinel "no limit" — REITs like O (275%), ABBV (326%), GPC (944%) all pass
  fiveYearAvgYieldMin: 0,    // Slider floor — already open
  epsGrowthMin: -100,        // Slider floor — PSX (-56.8%) and JNJ (-52.9%) need floor below -50%
  debtEqMax: 20,             // Slider ceiling — utilities and consumer staples are leveraged; CL=16x
  marketCaps: [...ALL_MARKET_CAPS],
  sectors: [...ALL_SECTORS],
};

export function filterDividend(stocks: Stock[], filters: DividendFilterState): ScoredStock[] {
  return stocks
    .filter((s) => s.dividendYield > 0)
    .map((s) => {
      let score = 0;
      score += Math.min(s.dividendYield * 100, 10) * 3;
      const payoutPenalty = s.payoutRatio > 0 ? Math.max(0, (s.payoutRatio * 100 - 60)) * 0.5 : 0;
      score += Math.max(0, 25 - payoutPenalty);
      score += Math.min(s.epsGrowth5yr * 100, 20) * 1.0;
      score += Math.min(s.fiveYearAvgDividendYield * 100, 8) * 2;
      return { ...s, score: Math.round(Math.max(0, score)) };
    })
    .filter((s) => {
      if (s.dividendYield * 100 < filters.dividendYieldMin) return false;
      if (s.payoutRatio > 0 && s.payoutRatio * 100 > filters.payoutRatioMax) return false;
      if (s.fiveYearAvgDividendYield * 100 < filters.fiveYearAvgYieldMin) return false;
      if (s.epsGrowth5yr * 100 < filters.epsGrowthMin) return false;
      if (s.debtToEquity > 0 && s.debtToEquity > filters.debtEqMax) return false;
      if (filters.marketCaps.length && !filters.marketCaps.includes(s.marketCap)) return false;
      if (filters.sectors.length && !filters.sectors.includes(s.sector)) return false;
      return true;
    });
}

// ─── Asymmetric Opportunities ─────────────────────────────────────────────────

export interface AsymmetricFilterState {
  pctFromHighMin: number;   // percent: 10 = at least 10% below 52wk high
  evToEbitdaMax: number;
  trailingPEMax: number;
  analystRatingMax: number; // 1=strong buy … 5=sell; e.g. 3 = neutral or better
  shortFloatMin: number;    // percent: 5 = at least 5% short
  marketCaps: string[];
  sectors: string[];
}

export const defaultAsymmetricFilters: AsymmetricFilterState = {
  pctFromHighMin: 0,    // Slider floor — CVS/INTC are only 3-4% below high, must not cut them
  evToEbitdaMax: 100,   // Slider ceiling — unprofitable plays have no EV/EBITDA (passes as 0)
  trailingPEMax: 200,   // Slider ceiling — MSTR/COIN have very high or negative PE
  analystRatingMax: 5,  // Slider ceiling — include all ratings
  shortFloatMin: 0,     // Slider floor — show all regardless of short interest
  marketCaps: [...ALL_MARKET_CAPS],
  sectors: [...ALL_SECTORS],
};

export function filterAsymmetric(stocks: Stock[], filters: AsymmetricFilterState): ScoredStock[] {
  return stocks
    .map((s) => {
      const hasAnalystBuy = s.analystRating > 0 && s.analystRating <= 2.5;
      const hasHighShort = s.shortPercentOfFloat * 100 >= 10;
      const catalystSignal = hasAnalystBuy && hasHighShort ? 2 : hasAnalystBuy || hasHighShort ? 1 : 0;

      let score = 0;
      score += Math.min(s.pctFromHigh * 100, 60) * 0.5;
      if (s.evToEbitda > 0) score += Math.max(0, (20 - s.evToEbitda) / 20) * 25;
      if (s.trailingPE > 0) score += Math.max(0, (25 - s.trailingPE) / 25) * 20;
      score += catalystSignal * 12.5;
      return { ...s, score: Math.round(Math.max(0, score)) };
    })
    .filter((s) => {
      if (s.pctFromHigh * 100 < filters.pctFromHighMin) return false;
      if (s.evToEbitda > 0 && s.evToEbitda > filters.evToEbitdaMax) return false;
      if (s.trailingPE > 0 && s.trailingPE > filters.trailingPEMax) return false;
      if (s.analystRating > 0 && s.analystRating > filters.analystRatingMax) return false;
      if (s.shortPercentOfFloat * 100 < filters.shortFloatMin) return false;
      if (filters.marketCaps.length && !filters.marketCaps.includes(s.marketCap)) return false;
      if (filters.sectors.length && !filters.sectors.includes(s.sector)) return false;
      return true;
    });
}

// ─── Trending ─────────────────────────────────────────────────────────────────

export interface TrendingFilterState {
  return3mMin: number;    // percent
  return1mMin: number;    // percent
  pctFromHighMax: number; // percent: 15 = at most 15% below high (near-high trend)
  volumeTrendMin: number; // ratio: 0.8 = at least 80% of avg volume
  marketCaps: string[];
  sectors: string[];
}

export const defaultTrendingFilters: TrendingFilterState = {
  return3mMin: -50,    // Slider floor — NVDA/AAPL had slightly negative returns in recent months
  return1mMin: -20,    // Slider floor — allow small dips; ranking already puts best 1m return first
  pctFromHighMax: 100, // Slider ceiling — fully open
  volumeTrendMin: 0,   // Slider floor — fully open
  marketCaps: [...ALL_MARKET_CAPS],
  sectors: [...ALL_SECTORS],
};

export function filterTrending(stocks: Stock[], filters: TrendingFilterState): ScoredStock[] {
  return stocks
    .map((s) => {
      const trendScore =
        s.return3m * 100 * 0.4 +
        s.returnVsSP500 * 100 * 0.3 +
        Math.max(0, 100 - s.pctFromHigh * 100) * 0.002 * 100 +
        Math.min(Math.max(s.volumeTrend - 1, 0), 1) * 15;
      return { ...s, score: Math.round(Math.max(0, trendScore)) };
    })
    .filter((s) => {
      if (s.return3m * 100 < filters.return3mMin) return false;
      if (s.return1m * 100 < filters.return1mMin) return false;
      if (s.pctFromHigh * 100 > filters.pctFromHighMax) return false;
      if (filters.volumeTrendMin > 0 && s.volumeTrend > 0 && s.volumeTrend < filters.volumeTrendMin) return false;
      if (filters.marketCaps.length && !filters.marketCaps.includes(s.marketCap)) return false;
      if (filters.sectors.length && !filters.sectors.includes(s.sector)) return false;
      return true;
    });
}

// ─── Custom Screener ──────────────────────────────────────────────────────────
// Universe: deduplicated union of all 7 strategy ticker pools (~205 names).
// Domains are opt-in: enabling a domain activates its sliders; disabled domains
// impose no constraints so the full universe shows through by default.

export type CustomScreenerDomain =
  | "valuation"
  | "growth"
  | "profitability"
  | "health"
  | "momentum"
  | "signals";

export interface CustomScreenerFilters {
  enabledDomains: CustomScreenerDomain[];
  // Domain 1 — Valuation
  trailingPEMax: number;
  forwardPEMax: number;
  pegMax: number;
  pbMax: number;
  evToEbitdaMax: number;
  dividendYieldMin: number;
  // Domain 2 — Growth
  epsGrowth5yrMin: number;
  revenueGrowth3yrMin: number;
  // Domain 3 — Profitability & Quality
  roeMin: number;
  grossMarginMin: number;
  operatingMarginMin: number;
  netMarginMin: number;
  fcfYieldMin: number;
  // Domain 4 — Financial Health
  debtEqMax: number;
  currentRatioMin: number;
  payoutRatioMax: number;
  // Domain 5 — Momentum & Technicals
  return52wMin: number;
  return3mMin: number;
  return1mMin: number;
  returnVsSP500Min: number;
  pctFromHighMax: number;
  volumeTrendMin: number;
  // Domain 6 — Special Signals
  shortFloatMax: number;
  analystRatingMax: number;
  // Global
  marketCaps: string[];
  sectors: string[];
}

export const defaultCustomScreenerFilters: CustomScreenerFilters = {
  enabledDomains: [],
  // Valuation — slider ceilings (nothing filtered by default)
  trailingPEMax: 200,
  forwardPEMax: 100,
  pegMax: 5,
  pbMax: 10,
  evToEbitdaMax: 50,
  dividendYieldMin: 0,
  // Growth — slider floors
  epsGrowth5yrMin: -100,
  revenueGrowth3yrMin: -100,
  // Profitability — slider floors
  roeMin: -100,
  grossMarginMin: 0,
  operatingMarginMin: -50,
  netMarginMin: -50,
  fcfYieldMin: -20,
  // Health — slider extremes
  debtEqMax: 20,
  currentRatioMin: 0,
  payoutRatioMax: 999,
  // Momentum — slider floors / ceilings
  return52wMin: -100,
  return3mMin: -100,
  return1mMin: -20,
  returnVsSP500Min: -100,
  pctFromHighMax: 100,
  volumeTrendMin: 0,
  // Signals — slider extremes
  shortFloatMax: 60,
  analystRatingMax: 5,
  // Global
  marketCaps: [...ALL_MARKET_CAPS],
  sectors: [...ALL_SECTORS],
};

export function filterCustomScreener(stocks: Stock[], filters: CustomScreenerFilters): Stock[] {
  const { enabledDomains } = filters;
  return stocks.filter((s) => {
    if (filters.marketCaps.length && !filters.marketCaps.includes(s.marketCap)) return false;
    if (filters.sectors.length && !filters.sectors.includes(s.sector)) return false;

    if (enabledDomains.includes("valuation")) {
      if (s.trailingPE > 0 && s.trailingPE > filters.trailingPEMax) return false;
      if (s.forwardPE > 0 && s.forwardPE > filters.forwardPEMax) return false;
      if (s.pegRatio > 0 && s.pegRatio > filters.pegMax) return false;
      if (s.priceToBook > 0 && s.priceToBook > filters.pbMax) return false;
      if (s.evToEbitda > 0 && s.evToEbitda > filters.evToEbitdaMax) return false;
      if (s.dividendYield * 100 < filters.dividendYieldMin) return false;
    }

    if (enabledDomains.includes("growth")) {
      if (s.epsGrowth5yr * 100 < filters.epsGrowth5yrMin) return false;
      if (s.revenueGrowth3yr * 100 < filters.revenueGrowth3yrMin) return false;
    }

    if (enabledDomains.includes("profitability")) {
      if (s.roe * 100 < filters.roeMin) return false;
      if (s.grossMargin * 100 < filters.grossMarginMin) return false;
      if (s.operatingMargin * 100 < filters.operatingMarginMin) return false;
      if (s.netMargin * 100 < filters.netMarginMin) return false;
      if (s.fcfYield * 100 < filters.fcfYieldMin) return false;
    }

    if (enabledDomains.includes("health")) {
      if (s.debtToEquity > 0 && s.debtToEquity > filters.debtEqMax) return false;
      if (s.currentRatio > 0 && s.currentRatio < filters.currentRatioMin) return false;
      if (s.payoutRatio > 0 && s.payoutRatio * 100 > filters.payoutRatioMax) return false;
    }

    if (enabledDomains.includes("momentum")) {
      if (s.return52w * 100 < filters.return52wMin) return false;
      if (s.return3m * 100 < filters.return3mMin) return false;
      if (s.return1m * 100 < filters.return1mMin) return false;
      if (s.returnVsSP500 * 100 < filters.returnVsSP500Min) return false;
      if (s.pctFromHigh * 100 > filters.pctFromHighMax) return false;
      if (filters.volumeTrendMin > 0 && s.volumeTrend > 0 && s.volumeTrend < filters.volumeTrendMin) return false;
    }

    if (enabledDomains.includes("signals")) {
      if (s.shortPercentOfFloat * 100 > filters.shortFloatMax) return false;
      if (s.analystRating > 0 && s.analystRating > filters.analystRatingMax) return false;
    }

    return true;
  });
}
