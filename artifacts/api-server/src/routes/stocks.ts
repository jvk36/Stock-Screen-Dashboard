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

const TICKERS = [
  // ── Technology ──────────────────────────────────────────────────────────
  "AAPL", "MSFT", "NVDA", "AVGO", "ADBE", "CRM", "AMD",
  "QCOM", "TXN", "AMAT", "MRVL", "PANW", "CRWD", "SNPS", "CDNS",
  "NOW", "WDAY", "FTNT", "DDOG", "ZS", "NET", "MDB",
  // ── Communication / Consumer ─────────────────────────────────────────────
  "AMZN", "GOOGL", "META", "NFLX", "COST", "MCD", "NKE", "LULU", "CMG",
  // ── Financials ───────────────────────────────────────────────────────────
  "JPM", "V", "MA", "AXP", "BLK", "SPGI", "MCO", "GS", "MS",
  // ── Health Care ──────────────────────────────────────────────────────────
  "UNH", "LLY", "ABBV", "TMO", "DHR", "ISRG", "DXCM",
  "JNJ", "ABT", "MDT",
  // ── Industrials ──────────────────────────────────────────────────────────
  "HON", "CAT", "DE", "RTX", "UPS", "MMM", "LOW",
  // ── Energy ───────────────────────────────────────────────────────────────
  "XOM", "CVX", "COP",
  // ── Consumer Staples / Dividend ──────────────────────────────────────────
  "DIS", "PG", "KO", "PEP", "WMT", "HD",
  "MO", "T", "VZ",
  // ── Real Estate ──────────────────────────────────────────────────────────
  "AMT", "EQIX", "PLD", "O",
  // ── Materials / Utilities ────────────────────────────────────────────────
  "LIN", "APD",
  "NEE", "DUK", "D",
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

async function fetchLiveStocks(): Promise<StockData[]> {
  logger.info(
    { count: TICKERS.length },
    "Phase 1 — fetching quoteSummary from Yahoo Finance"
  );

  const rawResults: (StockData | null)[] = new Array(TICKERS.length).fill(null);
  let idx = 0;

  async function summaryWorker() {
    while (idx < TICKERS.length) {
      const i = idx++;
      rawResults[i] = await fetchOneTicker(TICKERS[i]!);
      await sleep(250);
    }
  }

  await Promise.all(Array.from({ length: 5 }, summaryWorker));

  const stocks = rawResults.filter((s): s is StockData => s !== null);
  logger.info(
    { total: TICKERS.length, succeeded: stocks.length },
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
  cachedAt: string;
  fetchedAt: number;
}

let cache: CacheEntry | null = null;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

async function getStocks(): Promise<CacheEntry> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) {
    logger.debug("Returning cached stock data");
    return cache;
  }

  logger.info("Cache miss — fetching fresh data from Yahoo Finance");
  const stocks = await fetchLiveStocks();
  cache = {
    stocks,
    cachedAt: new Date().toISOString(),
    fetchedAt: now,
  };
  return cache;
}

router.get("/stocks", async (_req, res) => {
  try {
    const result = await getStocks();
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
