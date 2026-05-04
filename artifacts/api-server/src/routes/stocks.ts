import { Router, type IRouter } from "express";
import { logger } from "../lib/logger";
import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance({
  suppressNotices: ["yahooSurvey"],
});

const router: IRouter = Router();

type MarketCapTier = "Mega" | "Large" | "Mid" | "Small" | "Micro";

function classifyMarketCap(mktCapUsd: number): MarketCapTier {
  if (mktCapUsd >= 200_000_000_000) return "Mega";
  if (mktCapUsd >= 10_000_000_000) return "Large";
  if (mktCapUsd >= 2_000_000_000) return "Mid";
  if (mktCapUsd >= 300_000_000) return "Small";
  return "Micro";
}

interface StockData {
  ticker: string;
  company: string;
  sector: string;
  marketCap: MarketCapTier;
  // GARP
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
  // Deep Value
  trailingPE: number;
  priceToBook: number;
  evToEbitda: number;
  fcfYield: number;
  // Quality
  returnOnAssets: number;
  grossMargin: number;
  operatingMargin: number;
  currentRatio: number;
  // Dividend Growth
  dividendYield: number;
  dividendRate: number;
  payoutRatio: number;
  fiveYearAvgDividendYield: number;
  // Momentum / Trending / Asymmetric
  return52w: number;
  returnVsSP500: number;
  return3m: number;
  return1m: number;
  pctFromHigh: number;
  volumeTrend: number;
  // Asymmetric
  shortPercentOfFloat: number;
  analystRating: number;
  // Price
  price: number;
}

export interface StockStrategies {
  garp: StockData[];
  deepValue: StockData[];
  momentum: StockData[];
  quality: StockData[];
  dividendGrowth: StockData[];
  asymmetric: StockData[];
  trending: StockData[];
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
function round4(n: number) {
  return Math.round(n * 10000) / 10000;
}

function calculateMetrics(
  stock: Omit<StockData, "yearsTo100x" | "hundredBaggerScore">
): StockData {
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

  const consistencyScore =
    Math.min(1.0, stock.consecutiveYearsAbove16 / 10) * 15;

  return {
    ...stock,
    yearsTo100x: round2(yearsTo100x),
    hundredBaggerScore: Math.round(
      epsScore + pegScore + roeScore + consistencyScore
    ),
  };
}

/**
 * Build seven strategy-specific ranked lists.
 * Each list is drawn exclusively from its own curated ticker set, then ranked
 * by that strategy's primary driver as specified.
 *
 * Primary drivers (user-specified):
 *   GARP          → EPS Growth − (1 / Fwd P/E)             [highest first]
 *   Deep Value    → Price / Book                            [lowest first]
 *   Momentum      → Return vs S&P 500 over 52 weeks        [highest first]
 *   Quality       → ROE × 0.6 + FCF Yield × 0.4 composite [highest first]
 *   Dividend Growth → Yield × (1 − Payout Ratio)          [highest first]
 *   Asymmetric    → −return52w × 0.4 + shortFloat × 0.4
 *                   + cheapPE × 0.2                        [highest first]
 *   Trending      → 1-month price return                   [highest first]
 */
function buildStrategies(
  stocks: StockData[],
  sets: {
    garp: Set<string>;
    deepValue: Set<string>;
    momentum: Set<string>;
    quality: Set<string>;
    dividendGrowth: Set<string>;
    asymmetric: Set<string>;
    trending: Set<string>;
  }
): StockStrategies {
  // ── GARP ────────────────────────────────────────────────────────────────
  // Primary driver: EPS Growth − (1 / Fwd P/E)
  const garp = stocks
    .filter((s) => sets.garp.has(s.ticker) && s.forwardPE > 0)
    .sort((a, b) => {
      const aScore = a.epsGrowth5yr - 1 / a.forwardPE;
      const bScore = b.epsGrowth5yr - 1 / b.forwardPE;
      return bScore - aScore;
    });

  // ── Deep Value ──────────────────────────────────────────────────────────
  // Primary driver: lowest Price / Book
  const deepValue = stocks
    .filter((s) => sets.deepValue.has(s.ticker) && s.priceToBook > 0)
    .sort((a, b) => a.priceToBook - b.priceToBook);

  // ── Momentum ────────────────────────────────────────────────────────────
  // Primary driver: strongest outperformance vs S&P 500 over past 52 weeks
  const momentum = stocks
    .filter((s) => sets.momentum.has(s.ticker))
    .sort((a, b) => b.returnVsSP500 - a.returnVsSP500);

  // ── Quality ─────────────────────────────────────────────────────────────
  // Primary driver: composite of ROE (60%) + FCF Yield (40%)
  // Normalise FCF yield to ROE scale (× 5 so a 5% FCF yield ≈ a 25% ROE contribution)
  const quality = stocks
    .filter((s) => sets.quality.has(s.ticker))
    .sort((a, b) => {
      const aScore = a.roe * 0.6 + a.fcfYield * 5 * 0.4;
      const bScore = b.roe * 0.6 + b.fcfYield * 5 * 0.4;
      return bScore - aScore;
    });

  // ── Dividend Growth ──────────────────────────────────────────────────────
  // Primary driver: Yield × (1 − Payout Ratio)
  const dividendGrowth = stocks
    .filter((s) => sets.dividendGrowth.has(s.ticker) && s.dividendYield > 0)
    .sort((a, b) => {
      const aScore = a.dividendYield * (1 - Math.min(a.payoutRatio, 1));
      const bScore = b.dividendYield * (1 - Math.min(b.payoutRatio, 1));
      return bScore - aScore;
    });

  // ── Asymmetric ───────────────────────────────────────────────────────────
  // Primary driver: low P/E (cheap) + worst 52-wk return (beaten down)
  //                + high short interest (squeeze potential)
  // LEAPS pricing not available from Yahoo Finance — omitted.
  const asymmetric = stocks
    .filter((s) => sets.asymmetric.has(s.ticker))
    .sort((a, b) => {
      function asym(s: StockData) {
        const downside   = Math.max(0, -s.return52w);           // 0-1, higher = more beaten down
        const squeeze    = s.shortPercentOfFloat;               // 0-0.5+, higher = more short squeeze potential
        const cheapPE    = s.trailingPE > 0 && s.trailingPE < 100
          ? Math.max(0, 1 - s.trailingPE / 100) : 0;           // 0-1, higher = cheaper P/E
        return downside * 0.4 + squeeze * 0.4 + cheapPE * 0.2;
      }
      return asym(b) - asym(a);
    });

  // ── Trending ────────────────────────────────────────────────────────────
  // Primary driver: highest 1-month price return
  const trending = stocks
    .filter((s) => sets.trending.has(s.ticker))
    .sort((a, b) => b.return1m - a.return1m);

  return { garp, deepValue, momentum, quality, dividendGrowth, asymmetric, trending };
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-strategy curated ticker universes.
// Each tab is seeded with natural fits for that strategy.
// Stocks can appear in multiple lists — they are deduplicated before fetching.
// Primary driver ranking is applied inside buildStrategies().
// ─────────────────────────────────────────────────────────────────────────────

/** GARP — Growth At Reasonable Price
 *  Primary driver: EPS Growth − (1 / Fwd P/E)  [highest wins]
 *  Universe: companies with demonstrated earnings & revenue growth
 *  at valuations that are not wildly stretched. */
const TICKERS_GARP = [
  // Mega-cap tech compounders
  "MSFT", "NVDA", "META", "GOOGL", "AMZN", "AAPL",
  // Enterprise / cloud software
  "CRM", "ADBE", "NOW", "INTU", "PANW", "CRWD", "NET", "DDOG", "ZS",
  // Semiconductors
  "AVGO", "AMD", "ANET", "MRVL", "ON",
  // High-growth tech
  "APP", "PLTR", "TTD", "HUBS",
  // Healthcare growth
  "UNH", "LLY", "ISRG", "VRTX", "REGN", "DXCM", "TMO", "ELV",
  // Financial data & exchanges
  "SPGI", "MCO", "V", "MA", "FICO",
  // Consumer & industrials growth
  "LULU", "CMG", "DECK", "BKNG", "AXON", "ROP", "CPRT", "NVR",
];

/** Deep Value — Lowest Price / Book
 *  Primary driver: P/B ratio ascending (cheapest first)
 *  Universe: asset-heavy, cyclical, or out-of-favour stocks trading
 *  at low multiples relative to their book value. */
const TICKERS_DEEP_VALUE = [
  // Major banks & diversified financials
  "JPM", "BAC", "C", "WFC", "GS", "MS", "USB", "PNC", "TFC",
  // Insurance & asset management
  "MET", "PRU", "AFL", "AIG", "AXP",
  // Regional banks
  "KEY", "RF", "ALLY", "FITB", "HBAN",
  // Energy majors & refiners
  "XOM", "CVX", "COP", "OXY", "DVN", "EOG", "VLO", "MPC", "PSX", "SLB",
  // Materials & metals
  "FCX", "NUE", "STLD", "CLF", "AA", "X",
  // Autos
  "F", "GM",
  // Telecom
  "VZ", "T",
  // Media / legacy tech
  "IBM", "WBD", "PARA",
  // Berkshire
  "BRK-B",
];

/** Momentum — Strongest vs S&P 500 over 52 weeks
 *  Primary driver: return vs S&P 500 (52w)  [highest wins]
 *  Universe: stocks that have demonstrated sustained outperformance
 *  vs the broad market over the past year. */
const TICKERS_MOMENTUM = [
  // AI & large-cap tech leaders
  "NVDA", "META", "MSFT", "GOOGL", "AMZN", "AAPL", "PLTR", "APP",
  // Cyber & cloud
  "PANW", "CRWD", "ANET", "AVGO", "TSM",
  // Defense / government tech
  "AXON", "KTOS", "LDOS", "CACI", "HWM", "GEV", "RTX",
  // Nuclear & power infrastructure
  "VST", "CEG", "NRG", "SMR", "NNE", "OKLO", "VRT",
  // Financials outperformers
  "GS", "JPM", "V", "MA", "COIN", "HOOD",
  // Industrials / infrastructure
  "PWR", "EME", "TPL",
  // Consumer momentum
  "CAVA", "DECK",
  // Healthcare outperformers
  "ELV", "VRTX",
  // Crypto-adjacent
  "MSTR",
];

/** Quality — Highest ROE + FCF
 *  Primary driver: ROE × 0.6 + FCF Yield × 0.4  [highest wins]
 *  Universe: wide-moat, capital-light businesses with durable
 *  competitive advantages and high returns on capital. */
const TICKERS_QUALITY = [
  // Mega-cap moats
  "AAPL", "MSFT", "GOOGL", "META", "NVDA",
  // Payment networks (exceptional ROE)
  "V", "MA", "AXP",
  // Financial data / exchanges
  "SPGI", "MCO", "ICE", "CME", "BLK", "MSCI", "BR",
  // Enterprise software (high margins + FCF)
  "ADBE", "CRM", "NOW", "INTU", "FICO",
  // Healthcare moats
  "UNH", "MCK", "ELV", "VRTX", "LLY",
  // Industrial compounders
  "CTAS", "ROP", "ODFL", "CPRT", "NVR", "AXON", "ISRG",
  // Consumer moats
  "LULU", "HD", "COST", "NKE", "BKNG",
];

/** Dividend Growth — Yield × (1 − Payout Ratio)
 *  Primary driver: dividendYield × (1 − payoutRatio)  [highest wins]
 *  Universe: established dividend payers with track records of
 *  consistent or growing distributions. */
const TICKERS_DIVIDEND_GROWTH = [
  // Consumer staples
  "PG", "KO", "PEP", "MO", "PM", "CL", "CHD", "KMB", "GIS", "HSY", "MDLZ", "SYY",
  // Healthcare
  "JNJ", "ABT", "MRK", "ABBV", "PFE", "BMY",
  // Utilities
  "NEE", "SO", "DUK", "AEP", "XEL", "WEC", "D", "ES",
  // Energy & midstream
  "XOM", "CVX", "WMB", "OKE", "EPD", "MPC", "PSX", "VLO",
  // Industrials
  "CAT", "DE", "EMR", "HON", "ITW", "MMM", "GPC", "FDX",
  // Financials
  "JPM", "BLK", "V", "MA", "AXP", "T", "IBM",
  // REITs
  "O", "AMT", "VICI", "SPG",
];

/** Asymmetric — Low P/E + worst 52-wk return + high short interest
 *  Primary driver: composite of beaten-down price, short squeeze
 *  potential, and cheap trailing earnings multiple  [highest wins]
 *  LEAPS pricing not available from Yahoo Finance — omitted.
 *  Universe: contrarian, heavily-shorted, or deeply out-of-favour
 *  stocks with potential for sharp reversals. */
const TICKERS_ASYMMETRIC = [
  // Beaten-down fintech / crypto
  "COIN", "MSTR", "HOOD", "SOFI", "AFRM", "UPST",
  // Chinese ADRs (cheap P/E, high short interest)
  "BABA", "JD", "BIDU", "NIO", "LI", "PDD",
  // Out-of-favour growth
  "SNAP", "PINS", "ETSY", "LYFT", "MTCH", "BMBL", "PARA", "WBD",
  // Turnaround plays
  "INTC", "CVS", "F", "GM",
  // Speculative / short-squeeze history
  "AMC", "GME", "BYND", "PLUG", "CHPT", "RIVN", "LCID",
  // Airline & cruise recovery
  "AAL", "UAL", "ALK", "CCL", "NCLH",
  // Deep cyclicals / materials
  "MP", "X", "AA",
];

/** Trending — Highest 1-month price return
 *  Primary driver: return1m  [highest wins]
 *  Universe: recent breakouts, momentum names, and thematic plays
 *  with strong short-term price action. */
const TICKERS_TRENDING = [
  // AI / compute
  "NVDA", "PLTR", "APP", "META", "SMCI", "SOUN", "BBAI", "AI",
  // Nuclear & power
  "OKLO", "SMR", "NNE", "GEV", "VST", "CEG", "VRT", "NRG",
  // Crypto / digital assets
  "COIN", "MSTR", "HOOD",
  // Space & defense tech
  "RKLB", "IONQ", "KTOS", "AXON", "ACHR",
  // Large-cap momentum
  "MSFT", "GOOGL", "AMZN", "TSLA", "AAPL", "AVGO", "TSM", "RDDT",
  // Industrial breakouts
  "HWM", "PWR", "EME",
  // Consumer & other
  "CAVA", "DECK", "ELF", "DUOL",
  // Quantum computing
  "QUBT", "RGTI", "QBTS",
];

const SECTOR_MAP: Record<string, string> = {
  "Technology":               "Information Technology",
  "Information Technology":   "Information Technology",
  "Healthcare":               "Health Care",
  "Health Care":              "Health Care",
  "Financial Services":       "Financials",
  "Financials":               "Financials",
  "Consumer Cyclical":        "Consumer Discretionary",
  "Consumer Discretionary":   "Consumer Discretionary",
  "Consumer Defensive":       "Consumer Staples",
  "Consumer Staples":         "Consumer Staples",
  "Communication Services":   "Communication Services",
  "Industrials":              "Industrials",
  "Energy":                   "Energy",
  "Utilities":                "Utilities",
  "Real Estate":              "Real Estate",
  "Basic Materials":          "Materials",
  "Materials":                "Materials",
};

function normalizeSector(raw: string): string {
  return SECTOR_MAP[raw] ?? raw;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

const YF_MODULES = [
  "assetProfile",
  "price",
  "summaryDetail",
  "defaultKeyStatistics",
  "financialData",
] as const;

async function fetchOneTicker(ticker: string): Promise<StockData | null> {
  try {
    const result = await yahooFinance.quoteSummary(
      ticker,
      { modules: [...YF_MODULES] },
      { validateResult: false }
    );

    const sector = (result.assetProfile as { sector?: string } | null)?.sector;
    if (!sector) return null;

    const priceAny = result.price as Record<string, unknown> | null;
    const company = (priceAny?.longName ?? priceAny?.shortName ?? ticker) as string;
    const marketCapRaw =
      (priceAny?.marketCap as number | undefined) ??
      ((result.summaryDetail as Record<string, unknown> | null)?.marketCap as number | undefined);
    if (!marketCapRaw || marketCapRaw <= 0) return null;

    const statsAny = result.defaultKeyStatistics as Record<string, unknown> | null;
    const detailAny = result.summaryDetail as Record<string, unknown> | null;
    const financialsAny = result.financialData as Record<string, unknown> | null;

    // ── GARP ──────────────────────────────────────────────────────────────
    const pegRatio = (statsAny?.pegRatio as number | undefined) ?? 0;
    const forwardPE = (detailAny?.forwardPE as number | undefined) ?? 0;
    if (!pegRatio || pegRatio <= 0 || !forwardPE || forwardPE <= 0) return null;

    const epsGrowth5yr = (financialsAny?.earningsGrowth as number | undefined) ?? 0;
    const consecutiveYearsAbove16 = epsGrowth5yr >= 0.16 ? 1 : 0;
    const revenueGrowth3yr = (financialsAny?.revenueGrowth as number | undefined) ?? 0;
    const roe = (financialsAny?.returnOnEquity as number | undefined) ?? 0;
    const netMargin = (financialsAny?.profitMargins as number | undefined) ?? 0;
    const deRaw = financialsAny?.debtToEquity as number | undefined;
    const debtToEquity = deRaw != null && deRaw > 0 ? round2(deRaw / 100) : 0;

    // ── Deep Value ─────────────────────────────────────────────────────────
    const trailingPE = round2((detailAny?.trailingPE as number | undefined) ?? 0);
    const priceToBook = round2((statsAny?.priceToBook as number | undefined) ?? 0);
    const evToEbitda = round2((statsAny?.enterpriseToEbitda as number | undefined) ?? 0);
    const freeCashflow = (financialsAny?.freeCashflow as number | undefined) ?? 0;
    const fcfYield = marketCapRaw > 0 && freeCashflow > 0
      ? round4(freeCashflow / marketCapRaw)
      : 0;

    // ── Quality ────────────────────────────────────────────────────────────
    const returnOnAssets = round4((financialsAny?.returnOnAssets as number | undefined) ?? 0);
    const grossMargin = round4((financialsAny?.grossMargins as number | undefined) ?? 0);
    const operatingMargin = round4((financialsAny?.operatingMargins as number | undefined) ?? 0);
    const currentRatio = round2((financialsAny?.currentRatio as number | undefined) ?? 0);

    // ── Dividend ───────────────────────────────────────────────────────────
    const dividendYield = round4((detailAny?.dividendYield as number | undefined) ?? 0);
    const dividendRate = round2((detailAny?.dividendRate as number | undefined) ?? 0);
    const payoutRatio = round4((detailAny?.payoutRatio as number | undefined) ?? 0);
    const fiveYearAvgDividendYield = round4(
      (detailAny?.fiveYearAvgDividendYield as number | undefined) ?? 0
    );

    // ── Momentum / Trending / Asymmetric ───────────────────────────────────
    // 52WeekChange starts with a number — access via bracket notation
    const statsRaw = statsAny as Record<string, unknown> | null;
    const return52w = round4((statsRaw?.["52WeekChange"] as number | undefined) ?? 0);
    const sp500Return52w = (statsRaw?.["SandP52WeekChange"] as number | undefined) ?? 0;
    const returnVsSP500 = round4(return52w - sp500Return52w);

    const regularMarketPrice = (priceAny?.regularMarketPrice as number | undefined) ?? 0;
    const fiftyTwoWeekHigh = (detailAny?.fiftyTwoWeekHigh as number | undefined) ?? 0;
    const pctFromHigh =
      fiftyTwoWeekHigh > 0 && regularMarketPrice > 0
        ? round4(1 - regularMarketPrice / fiftyTwoWeekHigh)
        : 0;

    const avgVol90d = (detailAny?.averageVolume as number | undefined) ?? 0;
    const avgVol10d =
      (detailAny?.averageVolume10days as number | undefined) ??
      (detailAny?.averageDailyVolume10Day as number | undefined) ??
      0;
    const volumeTrend = avgVol90d > 0 ? round2(avgVol10d / avgVol90d) : 0;

    // ── Asymmetric ─────────────────────────────────────────────────────────
    const shortPercentOfFloat = round4(
      (statsRaw?.shortPercentOfFloat as number | undefined) ?? 0
    );
    const analystRating = round2(
      (financialsAny?.recommendationMean as number | undefined) ?? 0
    );

    return calculateMetrics({
      ticker,
      company,
      sector: normalizeSector(sector),
      marketCap: classifyMarketCap(marketCapRaw),
      // GARP
      epsGrowth5yr: round4(epsGrowth5yr),
      consecutiveYearsAbove16,
      pegRatio: round2(pegRatio),
      forwardPE: round2(forwardPE),
      revenueGrowth3yr: round4(revenueGrowth3yr),
      roe: round4(roe),
      netMargin: round4(netMargin),
      debtToEquity,
      // Deep Value
      trailingPE,
      priceToBook,
      evToEbitda,
      fcfYield,
      // Quality
      returnOnAssets,
      grossMargin,
      operatingMargin,
      currentRatio,
      // Dividend
      dividendYield,
      dividendRate,
      payoutRatio,
      fiveYearAvgDividendYield,
      // Momentum / Trending / Asymmetric
      return52w,
      returnVsSP500,
      return3m: 0,
      return1m: 0,
      pctFromHigh,
      volumeTrend,
      shortPercentOfFloat,
      analystRating,
      price: round2(regularMarketPrice),
    });
  } catch (err) {
    logger.warn({ ticker, err: (err as Error).message }, "Skipping ticker");
    return null;
  }
}

async function fetchChartReturns(
  ticker: string
): Promise<{ return3m: number; return1m: number }> {
  try {
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    const result = await yahooFinance.chart(
      ticker,
      { period1: threeMonthsAgo, period2: new Date(), interval: "1mo" },
      { validateResult: false }
    );

    const quotes = (
      (result as Record<string, unknown>)?.quotes as Array<Record<string, unknown>> | undefined ?? []
    ).filter((q) => typeof q?.close === "number" && (q.close as number) > 0);

    if (quotes.length < 2) return { return3m: 0, return1m: 0 };

    const last = quotes[quotes.length - 1].close as number;
    const first = quotes[0].close as number;
    const prev = quotes[quotes.length - 2].close as number;

    return {
      return3m: first > 0 ? round4((last - first) / first) : 0,
      return1m: prev > 0 ? round4((last - prev) / prev) : 0,
    };
  } catch {
    return { return3m: 0, return1m: 0 };
  }
}

/**
 * Like fetchOneTicker but does NOT require pegRatio / forwardPE to be present,
 * so it can return data for any publicly listed stock, ETF-adjacent, or ticker
 * the user wants to look up (value stocks, dividend payers, etc.).
 */
async function fetchOneTickerLenient(ticker: string): Promise<StockData | null> {
  try {
    const result = await yahooFinance.quoteSummary(
      ticker,
      { modules: [...YF_MODULES] },
      { validateResult: false }
    );

    const priceAny = result.price as Record<string, unknown> | null;
    const company = (priceAny?.longName ?? priceAny?.shortName ?? ticker) as string;
    const marketCapRaw =
      (priceAny?.marketCap as number | undefined) ??
      ((result.summaryDetail as Record<string, unknown> | null)?.marketCap as number | undefined);
    if (!marketCapRaw || marketCapRaw <= 0) return null;

    const sector = (result.assetProfile as { sector?: string } | null)?.sector;

    const statsAny = result.defaultKeyStatistics as Record<string, unknown> | null;
    const detailAny = result.summaryDetail as Record<string, unknown> | null;
    const financialsAny = result.financialData as Record<string, unknown> | null;

    const pegRatio   = (statsAny?.pegRatio   as number | undefined) ?? 0;
    const forwardPE  = (detailAny?.forwardPE  as number | undefined) ?? 0;

    const epsGrowth5yr  = (financialsAny?.earningsGrowth  as number | undefined) ?? 0;
    const consecutiveYearsAbove16 = epsGrowth5yr >= 0.16 ? 1 : 0;
    const revenueGrowth3yr = (financialsAny?.revenueGrowth as number | undefined) ?? 0;
    const roe        = (financialsAny?.returnOnEquity  as number | undefined) ?? 0;
    const netMargin  = (financialsAny?.profitMargins   as number | undefined) ?? 0;
    const deRaw      = financialsAny?.debtToEquity as number | undefined;
    const debtToEquity = deRaw != null && deRaw > 0 ? round2(deRaw / 100) : 0;

    const trailingPE    = round2((detailAny?.trailingPE            as number | undefined) ?? 0);
    const priceToBook   = round2((statsAny?.priceToBook            as number | undefined) ?? 0);
    const evToEbitda    = round2((statsAny?.enterpriseToEbitda     as number | undefined) ?? 0);
    const freeCashflow  = (financialsAny?.freeCashflow             as number | undefined) ?? 0;
    const fcfYield = marketCapRaw > 0 && freeCashflow > 0
      ? round4(freeCashflow / marketCapRaw) : 0;

    const returnOnAssets   = round4((financialsAny?.returnOnAssets  as number | undefined) ?? 0);
    const grossMargin      = round4((financialsAny?.grossMargins     as number | undefined) ?? 0);
    const operatingMargin  = round4((financialsAny?.operatingMargins as number | undefined) ?? 0);
    const currentRatio     = round2((financialsAny?.currentRatio     as number | undefined) ?? 0);

    const dividendYield           = round4((detailAny?.dividendYield           as number | undefined) ?? 0);
    const dividendRate            = round2((detailAny?.dividendRate            as number | undefined) ?? 0);
    const payoutRatio             = round4((detailAny?.payoutRatio             as number | undefined) ?? 0);
    const fiveYearAvgDividendYield = round4((detailAny?.fiveYearAvgDividendYield as number | undefined) ?? 0);

    const statsRaw = statsAny as Record<string, unknown> | null;
    const return52w       = round4((statsRaw?.["52WeekChange"]      as number | undefined) ?? 0);
    const sp500Return52w  = (statsRaw?.["SandP52WeekChange"]        as number | undefined) ?? 0;
    const returnVsSP500   = round4(return52w - sp500Return52w);

    const regularMarketPrice = (priceAny?.regularMarketPrice as number | undefined) ?? 0;
    const fiftyTwoWeekHigh   = (detailAny?.fiftyTwoWeekHigh  as number | undefined) ?? 0;
    const pctFromHigh = fiftyTwoWeekHigh > 0 && regularMarketPrice > 0
      ? round4(1 - regularMarketPrice / fiftyTwoWeekHigh) : 0;

    const avgVol90d = (detailAny?.averageVolume            as number | undefined) ?? 0;
    const avgVol10d =
      (detailAny?.averageVolume10days          as number | undefined) ??
      (detailAny?.averageDailyVolume10Day      as number | undefined) ?? 0;
    const volumeTrend = avgVol90d > 0 ? round2(avgVol10d / avgVol90d) : 0;

    const shortPercentOfFloat = round4((statsRaw?.shortPercentOfFloat as number | undefined) ?? 0);
    const analystRating       = round2((financialsAny?.recommendationMean as number | undefined) ?? 0);

    return calculateMetrics({
      ticker,
      company,
      sector: normalizeSector(sector ?? "Other"),
      marketCap: classifyMarketCap(marketCapRaw),
      epsGrowth5yr: round4(epsGrowth5yr),
      consecutiveYearsAbove16,
      pegRatio: round2(pegRatio),
      forwardPE: round2(forwardPE),
      revenueGrowth3yr: round4(revenueGrowth3yr),
      roe: round4(roe),
      netMargin: round4(netMargin),
      debtToEquity,
      trailingPE,
      priceToBook,
      evToEbitda,
      fcfYield,
      returnOnAssets,
      grossMargin,
      operatingMargin,
      currentRatio,
      dividendYield,
      dividendRate,
      payoutRatio,
      fiveYearAvgDividendYield,
      return52w,
      returnVsSP500,
      return3m: 0,
      return1m: 0,
      pctFromHigh,
      volumeTrend,
      shortPercentOfFloat,
      analystRating,
      price: round2(regularMarketPrice),
    });
  } catch (err) {
    logger.warn({ ticker, err: (err as Error).message }, "Lenient lookup fetch failed");
    return null;
  }
}

// Deduplicated union of all per-strategy ticker lists — fetched once per cache cycle.
const ALL_TICKERS: string[] = [
  ...new Set([
    ...TICKERS_GARP,
    ...TICKERS_DEEP_VALUE,
    ...TICKERS_MOMENTUM,
    ...TICKERS_QUALITY,
    ...TICKERS_DIVIDEND_GROWTH,
    ...TICKERS_ASYMMETRIC,
    ...TICKERS_TRENDING,
  ]),
];

// Sets for O(1) membership lookup inside buildStrategies()
const STRATEGY_SETS = {
  garp:          new Set(TICKERS_GARP),
  deepValue:     new Set(TICKERS_DEEP_VALUE),
  momentum:      new Set(TICKERS_MOMENTUM),
  quality:       new Set(TICKERS_QUALITY),
  dividendGrowth: new Set(TICKERS_DIVIDEND_GROWTH),
  asymmetric:    new Set(TICKERS_ASYMMETRIC),
  trending:      new Set(TICKERS_TRENDING),
};

async function fetchLiveStocks(): Promise<StockData[]> {
  logger.info(
    { count: ALL_TICKERS.length },
    "Phase 1 — fetching quoteSummary from Yahoo Finance"
  );

  const rawResults: (StockData | null)[] = new Array(ALL_TICKERS.length).fill(null);
  let idx = 0;

  async function summaryWorker() {
    while (idx < ALL_TICKERS.length) {
      const i = idx++;
      // Use the lenient fetcher so Deep Value, Dividend, and Asymmetric
      // stocks without forward P/E / PEG are not silently dropped.
      rawResults[i] = await fetchOneTickerLenient(ALL_TICKERS[i]!);
      await sleep(250);
    }
  }

  await Promise.all(Array.from({ length: 5 }, summaryWorker));

  const stocks = rawResults.filter((s): s is StockData => s !== null);
  logger.info(
    { total: ALL_TICKERS.length, succeeded: stocks.length },
    "Phase 1 complete"
  );

  // Phase 2 — fetch 3-month / 1-month price returns from chart data
  logger.info({ count: stocks.length }, "Phase 2 — fetching chart returns");
  const updated = [...stocks];
  let chartIdx = 0;

  async function chartWorker() {
    while (chartIdx < updated.length) {
      const i = chartIdx++;
      const returns = await fetchChartReturns(updated[i]!.ticker);
      updated[i] = { ...updated[i]!, ...returns };
      await sleep(200);
    }
  }

  await Promise.all(Array.from({ length: 5 }, chartWorker));
  logger.info({ count: updated.length }, "Phase 2 complete — all stock data ready");

  return updated;
}

interface CacheEntry {
  stocks: StockData[];
  strategies: StockStrategies;
  cachedAt: string;
  fetchedAt: number;
}

let cache: CacheEntry | null = null;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// Singleton promise prevents duplicate concurrent fetches (race condition guard)
let cachePromise: Promise<CacheEntry> | null = null;

async function getStocksCache(): Promise<CacheEntry> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) {
    logger.debug("Returning cached stock data");
    return cache;
  }

  // If a fetch is already in flight, reuse it instead of starting a second one
  if (cachePromise) {
    logger.debug("Cache fetch already in progress — waiting for it");
    return cachePromise;
  }

  logger.info("Cache miss — fetching fresh data from Yahoo Finance");
  cachePromise = fetchLiveStocks()
    .then((stocks) => {
      cache = {
        stocks,
        strategies: buildStrategies(stocks, STRATEGY_SETS),
        cachedAt: new Date().toISOString(),
        fetchedAt: Date.now(),
      };
      cachePromise = null;
      return cache;
    })
    .catch((err) => {
      cachePromise = null;
      throw err;
    });

  return cachePromise;
}

// Pre-warm the cache immediately on startup so the first browser request is instant
setTimeout(() => {
  getStocksCache().catch((err) =>
    logger.warn({ err }, "Startup cache pre-warm failed — will retry on first request")
  );
}, 0);

router.get("/stocks/lookup/:ticker", async (req, res) => {
  const raw = (req.params as Record<string, string>).ticker ?? "";
  const ticker = raw.toUpperCase().replace(/[^A-Z0-9.\-]/g, "").slice(0, 10);
  if (!ticker) {
    return res.status(400).json({ error: "invalid_ticker", message: "Invalid ticker symbol." });
  }

  // Serve from main cache when available (instant, no extra YF call)
  if (cache) {
    const cached = cache.stocks.find((s) => s.ticker === ticker);
    if (cached) {
      return res.json({ stock: cached, source: "cache" });
    }
  }

  try {
    const [stockData, chartReturns] = await Promise.all([
      fetchOneTickerLenient(ticker),
      fetchChartReturns(ticker),
    ]);

    if (!stockData) {
      return res.status(404).json({
        error: "not_found",
        message: `No data found for "${ticker}". Double-check the ticker or try a US-listed stock.`,
      });
    }

    logger.info({ ticker }, "Ad-hoc stock lookup served from Yahoo Finance");
    return res.json({ stock: { ...stockData, ...chartReturns }, source: "yahoo-finance" });
  } catch (err) {
    logger.error({ ticker, err }, "Ad-hoc stock lookup failed");
    return res.status(500).json({ error: "fetch_failed", message: "Failed to fetch stock data. Please try again." });
  }
});

router.get("/stocks/strategies", async (_req, res) => {
  try {
    const result = await getStocksCache();
    res.json({
      strategies: result.strategies,
      cachedAt: result.cachedAt,
      source: "yahoo-finance",
    });
  } catch (err) {
    logger.error({ err }, "Failed to fetch stock strategies");
    res.status(500).json({
      error: "fetch_failed",
      message: "Failed to fetch stock strategy data from Yahoo Finance.",
    });
  }
});

router.get("/stocks", async (_req, res) => {
  try {
    const result = await getStocksCache();
    res.json({
      stocks: result.stocks,
      cachedAt: result.cachedAt,
      source: "yahoo-finance",
    });
  } catch (err) {
    logger.error({ err }, "Failed to fetch stocks from Yahoo Finance");
    res.status(500).json({
      error: "fetch_failed",
      message: "Failed to fetch stock data from Yahoo Finance.",
    });
  }
});

export function invalidateCache() {
  cache = null;
}

export default router;
