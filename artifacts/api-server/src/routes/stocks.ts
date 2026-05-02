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
  "AAPL", "MSFT", "NVDA", "AVGO", "ADBE", "CRM", "AMD",
  "QCOM", "TXN", "AMAT", "MRVL", "PANW", "CRWD", "SNPS", "CDNS",
  "NOW", "WDAY", "FTNT", "DDOG", "ZS", "NET", "MDB",
  "AMZN", "GOOGL", "META", "NFLX", "COST", "MCD", "NKE", "LULU", "CMG",
  "JPM", "V", "MA", "AXP", "BLK", "SPGI", "MCO", "GS", "MS",
  "UNH", "LLY", "ABBV", "TMO", "DHR", "ISRG", "DXCM",
  "HON", "CAT", "DE", "RTX", "UPS",
  "XOM", "CVX", "COP",
  "DIS", "PG", "KO", "PEP",
  "AMT", "EQIX", "PLD",
  "LIN", "APD",
  "NEE", "DUK",
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

    const price = result.price as {
      longName?: string;
      shortName?: string;
      marketCap?: number;
    } | null;

    const company = price?.longName ?? price?.shortName ?? ticker;
    const marketCapRaw =
      price?.marketCap ??
      (result.summaryDetail as { marketCap?: number } | null)?.marketCap;
    if (!marketCapRaw || marketCapRaw <= 0) return null;

    const stats = result.defaultKeyStatistics as {
      pegRatio?: number;
      forwardEps?: number;
    } | null;
    const detail = result.summaryDetail as {
      forwardPE?: number;
      trailingPE?: number;
    } | null;

    const pegRatio = stats?.pegRatio ?? 0;
    const forwardPE = detail?.forwardPE ?? 0;

    if (!pegRatio || pegRatio <= 0 || !forwardPE || forwardPE <= 0) return null;

    const financials = result.financialData as {
      earningsGrowth?: number;
      revenueGrowth?: number;
      returnOnEquity?: number;
      profitMargins?: number;
      debtToEquity?: number;
    } | null;

    // earningsGrowth is TTM YoY earnings growth — best available free proxy for EPS growth
    const epsGrowth5yr = financials?.earningsGrowth ?? 0;
    // Mark 1 consecutive year above 16% if the current TTM growth clears the bar
    const consecutiveYearsAbove16 = epsGrowth5yr >= 0.16 ? 1 : 0;

    const revenueGrowth3yr = financials?.revenueGrowth ?? 0;
    const roe = financials?.returnOnEquity ?? 0;
    const netMargin = financials?.profitMargins ?? 0;
    const deRaw = financials?.debtToEquity;
    // Yahoo Finance returns D/E as a percentage (e.g. 183.5 → ratio 1.835)
    const debtToEquity =
      deRaw != null && deRaw > 0 ? round2(deRaw / 100) : 0;

    return calculateMetrics({
      ticker,
      company,
      sector: normalizeSector(sector),
      marketCap: classifyMarketCap(marketCapRaw),
      epsGrowth5yr: round4(epsGrowth5yr),
      consecutiveYearsAbove16,
      pegRatio: round2(pegRatio),
      forwardPE: round2(forwardPE),
      revenueGrowth3yr: round4(revenueGrowth3yr),
      roe: round4(roe),
      netMargin: round4(netMargin),
      debtToEquity,
    });
  } catch (err) {
    logger.warn({ ticker, err: (err as Error).message }, "Skipping ticker");
    return null;
  }
}

async function fetchLiveStocks(): Promise<StockData[]> {
  logger.info({ count: TICKERS.length }, "Fetching stock data from Yahoo Finance");

  const results: (StockData | null)[] = new Array(TICKERS.length).fill(null);
  let index = 0;

  // 5 concurrent workers, 250 ms gap between each ticker within a worker
  async function worker() {
    while (index < TICKERS.length) {
      const i = index++;
      results[i] = await fetchOneTicker(TICKERS[i]!);
      await sleep(250);
    }
  }

  await Promise.all(Array.from({ length: 5 }, worker));

  const stocks = results.filter((s): s is StockData => s !== null);
  logger.info(
    { total: TICKERS.length, succeeded: stocks.length },
    "Finished fetching stock data from Yahoo Finance"
  );
  return stocks;
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
