import { Router, type IRouter } from "express";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const FMP_BASE = "https://financialmodelingprep.com/stable";

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

const UNIQUE_TICKERS = [...new Set(TICKERS)];

// Maps FMP sector names → screener UI taxonomy
const SECTOR_MAP: Record<string, string> = {
  "Technology":                     "Information Technology",
  "Information Technology":         "Information Technology",
  "Healthcare":                     "Health Care",
  "Health Care":                    "Health Care",
  "Financial Services":             "Financials",
  "Financials":                     "Financials",
  "Finance":                        "Financials",
  "Consumer Cyclical":              "Consumer Discretionary",
  "Consumer Discretionary":         "Consumer Discretionary",
  "Consumer Defensive":             "Consumer Staples",
  "Consumer Staples":               "Consumer Staples",
  "Communication Services":         "Communication Services",
  "Industrials":                    "Industrials",
  "Industrial":                     "Industrials",
  "Energy":                         "Energy",
  "Utilities":                      "Utilities",
  "Utility":                        "Utilities",
  "Real Estate":                    "Real Estate",
  "Basic Materials":                "Materials",
  "Materials":                      "Materials",
};

function normalizeSector(raw: string): string {
  return SECTOR_MAP[raw] ?? raw;
}

class QuotaExhaustedError extends Error {
  constructor() {
    super("FMP API quota exhausted for today");
    this.name = "QuotaExhaustedError";
  }
}

async function fmpGet(path: string, apiKey: string): Promise<unknown> {
  const sep = path.includes("?") ? "&" : "?";
  const url = `${FMP_BASE}${path}${sep}apikey=${apiKey}`;
  const res = await fetch(url);

  if (res.status === 429) {
    throw new QuotaExhaustedError();
  }
  if (!res.ok) {
    throw new Error(`FMP ${res.status} for ${path}`);
  }

  const data = await res.json() as unknown;
  if (
    data &&
    typeof data === "object" &&
    !Array.isArray(data)
  ) {
    const obj = data as Record<string, string>;
    const msg = obj["Error Message"] ?? obj["error"] ?? "";
    if (msg.toLowerCase().includes("limit reach") || msg.toLowerCase().includes("limit reached")) {
      throw new QuotaExhaustedError();
    }
    if (msg) {
      throw new Error(`FMP error: ${msg}`);
    }
  }
  return data;
}

interface FmpProfile {
  symbol: string;
  companyName: string;
  sector: string;
  marketCap: number;
  isEtf?: boolean;
  isFund?: boolean;
}

interface FmpRatiosTtm {
  symbol: string;
  priceToEarningsRatioTTM?: number;
  priceToEarningsGrowthRatioTTM?: number;
  netProfitMarginTTM?: number;
  debtToEquityRatioTTM?: number;
}

interface FmpKeyMetrics {
  symbol: string;
  returnOnEquity?: number;
}

interface FmpGrowth {
  symbol: string;
  date: string;
  epsgrowth?: number;
  revenueGrowth?: number;
}

async function fetchLiveStocks(apiKey: string): Promise<StockData[]> {
  const symbolsParam = UNIQUE_TICKERS.join(",");

  logger.info({ count: UNIQUE_TICKERS.length }, "Bulk-fetching stock data from FMP (4 calls total)");

  // Sequential bulk calls — 4 requests total, one per data type.
  // Using sequential rather than parallel to stay within rate limits.
  const profileRaw = await fmpGet(`/profile?symbol=${symbolsParam}`, apiKey);
  const ratiosRaw = await fmpGet(`/ratios-ttm?symbol=${symbolsParam}`, apiKey);
  const metricsRaw = await fmpGet(`/key-metrics?symbol=${symbolsParam}`, apiKey);
  const growthRaw = await fmpGet(`/financial-growth?symbol=${symbolsParam}`, apiKey);

  const profiles = (Array.isArray(profileRaw) ? profileRaw as FmpProfile[] : [])
    .reduce<Record<string, FmpProfile>>((m, p) => { m[p.symbol] = p; return m; }, {});

  const ratiosTtm = (Array.isArray(ratiosRaw) ? ratiosRaw as FmpRatiosTtm[] : [])
    .reduce<Record<string, FmpRatiosTtm>>((m, r) => { m[r.symbol] = r; return m; }, {});

  const keyMetrics = (Array.isArray(metricsRaw) ? metricsRaw as FmpKeyMetrics[] : [])
    .reduce<Record<string, FmpKeyMetrics>>((m, r) => {
      if (!m[r.symbol]) m[r.symbol] = r;
      return m;
    }, {});

  const growthByTicker = (Array.isArray(growthRaw) ? growthRaw as FmpGrowth[] : [])
    .reduce<Record<string, FmpGrowth[]>>((m, g) => {
      (m[g.symbol] ??= []).push(g);
      return m;
    }, {});

  const stocks: StockData[] = [];
  let skipped = 0;

  for (const ticker of UNIQUE_TICKERS) {
    const profile = profiles[ticker];
    if (!profile || profile.isEtf || profile.isFund || !profile.sector) {
      skipped++;
      continue;
    }

    const ratios = ratiosTtm[ticker] ?? {};
    const metrics = keyMetrics[ticker] ?? {};
    const growthArr = (growthByTicker[ticker] ?? []).slice(0, 5);

    const epsGrowthValues = growthArr
      .map((g) => g.epsgrowth)
      .filter((v): v is number => v != null && Number.isFinite(v));

    const revGrowthValues = growthArr
      .slice(0, 3)
      .map((g) => g.revenueGrowth)
      .filter((v): v is number => v != null && Number.isFinite(v));

    const epsGrowth5yr =
      epsGrowthValues.length > 0
        ? epsGrowthValues.reduce((a, b) => a + b, 0) / epsGrowthValues.length
        : 0;

    const revenueGrowth3yr =
      revGrowthValues.length > 0
        ? revGrowthValues.reduce((a, b) => a + b, 0) / revGrowthValues.length
        : 0;

    let consecutiveYearsAbove16 = 0;
    for (const g of growthArr) {
      if ((g.epsgrowth ?? 0) >= 0.16) consecutiveYearsAbove16++;
      else break;
    }

    const pegRatio = ratios.priceToEarningsGrowthRatioTTM ?? 0;
    const forwardPE = ratios.priceToEarningsRatioTTM ?? 0;
    const netMargin = ratios.netProfitMarginTTM ?? 0;
    const debtToEquity = ratios.debtToEquityRatioTTM ?? 0;
    const roe = metrics.returnOnEquity ?? 0;

    if (pegRatio <= 0 || forwardPE <= 0) {
      skipped++;
      continue;
    }

    stocks.push(calculateMetrics({
      ticker,
      company: profile.companyName,
      sector: normalizeSector(profile.sector),
      marketCap: classifyMarketCap(profile.marketCap ?? 0),
      epsGrowth5yr: round4(epsGrowth5yr),
      consecutiveYearsAbove16,
      pegRatio: round2(pegRatio),
      forwardPE: round2(forwardPE),
      revenueGrowth3yr: round4(revenueGrowth3yr),
      roe: round4(roe),
      netMargin: round4(netMargin),
      debtToEquity: round2(Math.abs(debtToEquity)),
    }));
  }

  logger.info(
    { total: UNIQUE_TICKERS.length, succeeded: stocks.length, skipped },
    "Finished assembling stock data"
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

async function getStocks(apiKey: string): Promise<CacheEntry> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) {
    logger.debug("Returning cached stock data");
    return cache;
  }

  logger.info("Cache miss — fetching fresh stock data from FMP");
  const stocks = await fetchLiveStocks(apiKey);
  cache = {
    stocks,
    cachedAt: new Date().toISOString(),
    fetchedAt: now,
  };
  return cache;
}

router.get("/stocks", async (_req, res) => {
  const apiKey = process.env["FMP_API_KEY"];

  if (!apiKey) {
    res.status(503).json({
      error: "not_configured",
      message:
        "FMP_API_KEY is not set. Please add a Financial Modeling Prep API key.",
    });
    return;
  }

  try {
    const result = await getStocks(apiKey);
    res.json({
      stocks: result.stocks,
      cachedAt: result.cachedAt,
      source: "financial-modeling-prep",
    });
  } catch (err) {
    if (err instanceof QuotaExhaustedError) {
      logger.warn("FMP daily quota exhausted — returning quota_exhausted status");
      // Return stale cache if available, otherwise quota_exhausted so frontend can fall back
      if (cache) {
        logger.info("Serving stale cache due to quota exhaustion");
        res.json({
          stocks: cache.stocks,
          cachedAt: cache.cachedAt,
          source: "financial-modeling-prep",
        });
      } else {
        res.status(503).json({
          error: "quota_exhausted",
          message: "FMP free tier daily quota is exhausted. Data will refresh tomorrow.",
        });
      }
    } else {
      logger.error({ err }, "Failed to fetch stocks from FMP");
      res.status(500).json({
        error: "fetch_failed",
        message: "Failed to fetch stock data from the financial data provider.",
      });
    }
  }
});

export function invalidateCache() {
  cache = null;
}

export default router;
