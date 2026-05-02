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
}

export interface ScoredStock extends Stock {
  score: number;
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
  trailingPEMax: 30,
  pbMax: 5,
  evToEbitdaMax: 20,
  fcfYieldMin: 0,
  netMarginMin: 0,
  debtEqMax: 3,
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
  return52wMin: 0,
  returnVsSP500Min: 0,
  return3mMin: 0,
  pctFromHighMax: 100,
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
  roeMin: 0,
  roaMin: 0,
  operatingMarginMin: 0,
  grossMarginMin: 0,
  currentRatioMin: 0,
  debtEqMax: 5,
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
  dividendYieldMin: 0,
  payoutRatioMax: 90,
  fiveYearAvgYieldMin: 0,
  epsGrowthMin: 0,
  debtEqMax: 5,
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
  pctFromHighMin: 10,
  evToEbitdaMax: 30,
  trailingPEMax: 30,
  analystRatingMax: 4,
  shortFloatMin: 0,
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
  return3mMin: 0,
  return1mMin: 0,
  pctFromHighMax: 100,
  volumeTrendMin: 0,
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
