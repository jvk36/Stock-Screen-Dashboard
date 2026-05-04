import { useState, useMemo, useRef } from "react";
import type { Stock } from "@/lib/screener";
import { useGetStocks, getGetStocksQueryKey } from "@workspace/api-client-react";
import { Search, X } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

// ─── Types ────────────────────────────────────────────────────────────────────

type Assessment = "excellent" | "good" | "ok" | "weak" | "na";

interface MetricRow {
  label: string;
  value: string;
  assessment: Assessment;
}

interface StrategyFit {
  id: string;
  name: string;
  score: number;
  qualifies: boolean;
  qualifier: string;
  metrics: MetricRow[];
}

// ─── Formatters ───────────────────────────────────────────────────────────────

const pct  = (v: number) => `${(v * 100).toFixed(1)}%`;
const dec  = (v: number, d = 2) => v.toFixed(d);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// ─── Assessment styles ────────────────────────────────────────────────────────

const ASSESSMENT_STYLES: Record<Assessment, string> = {
  excellent: "bg-emerald-50 text-emerald-700 border-emerald-200",
  good:      "bg-green-50  text-green-700  border-green-200",
  ok:        "bg-amber-50  text-amber-700  border-amber-200",
  weak:      "bg-red-50    text-red-600    border-red-200",
  na:        "bg-muted     text-muted-foreground border-border",
};

const ASSESSMENT_LABELS: Record<Assessment, string> = {
  excellent: "Excellent",
  good:      "Good",
  ok:        "Fair",
  weak:      "Weak",
  na:        "N/A",
};

// Coloured strategy name labels
const STRATEGY_COLOR: Record<string, string> = {
  "garp":             "text-blue-600",
  "deep-value":       "text-amber-600",
  "momentum":         "text-purple-600",
  "quality":          "text-emerald-700",
  "dividend-growth":  "text-teal-600",
  "asymmetric":       "text-orange-600",
  "trending":         "text-rose-500",
};

function scoreTextColor(s: number) {
  return s >= 70 ? "text-emerald-600" : s >= 45 ? "text-amber-600" : "text-red-500";
}
function scoreBarColor(s: number) {
  return s >= 70 ? "bg-emerald-500" : s >= 45 ? "bg-amber-400" : "bg-red-400";
}

// ─── Scorers ──────────────────────────────────────────────────────────────────

function garpFit(s: Stock): StrategyFit {
  const epsScore =
    s.epsGrowth5yr >= 0.25 ? 40 :
    s.epsGrowth5yr >= 0.16 ? 30 + ((s.epsGrowth5yr - 0.16) / 0.09) * 10 :
    s.epsGrowth5yr >= 0.12 ? 20 + ((s.epsGrowth5yr - 0.12) / 0.04) * 10 :
    Math.max(0, (s.epsGrowth5yr / 0.12) * 20);

  const pegScore = s.pegRatio <= 0 ? 0 :
    s.pegRatio <= 0.75 ? 25 : s.pegRatio <= 1.5 ? 20 :
    s.pegRatio <= 2.0  ? 14 : s.pegRatio <= 3.0 ? 7 : 0;

  const peScore = s.forwardPE <= 0 ? 0 :
    s.forwardPE <= 15 ? 20 : s.forwardPE <= 25 ? 16 :
    s.forwardPE <= 35 ? 11 : s.forwardPE <= 50 ? 5 : 0;

  const revScore =
    s.revenueGrowth3yr >= 0.20 ? 15 : s.revenueGrowth3yr >= 0.10 ? 10 :
    s.revenueGrowth3yr >= 0.05 ? 5 : 0;

  return {
    id: "garp", name: "GARP",
    score: Math.round(clamp(epsScore + pegScore + peScore + revScore, 0, 100)),
    qualifies: s.epsGrowth5yr >= 0.12 && s.forwardPE > 0 && s.forwardPE <= 50 && s.pegRatio > 0 && s.pegRatio <= 3 && s.revenueGrowth3yr >= 0.08,
    qualifier: "EPS ≥ 12%, Fwd P/E ≤ 50, PEG ≤ 3, Rev growth ≥ 8%",
    metrics: [
      { label: "EPS Growth (5yr)", value: pct(s.epsGrowth5yr),
        assessment: s.epsGrowth5yr >= 0.20 ? "excellent" : s.epsGrowth5yr >= 0.12 ? "good" : s.epsGrowth5yr >= 0.06 ? "ok" : "weak" },
      { label: "PEG Ratio", value: s.pegRatio > 0 ? dec(s.pegRatio) : "N/A",
        assessment: s.pegRatio <= 0 ? "na" : s.pegRatio <= 1 ? "excellent" : s.pegRatio <= 2 ? "good" : s.pegRatio <= 3 ? "ok" : "weak" },
      { label: "Fwd P/E", value: s.forwardPE > 0 ? dec(s.forwardPE) : "N/A",
        assessment: s.forwardPE <= 0 ? "na" : s.forwardPE <= 20 ? "excellent" : s.forwardPE <= 30 ? "good" : s.forwardPE <= 45 ? "ok" : "weak" },
      { label: "Revenue Growth (3yr)", value: pct(s.revenueGrowth3yr),
        assessment: s.revenueGrowth3yr >= 0.15 ? "excellent" : s.revenueGrowth3yr >= 0.08 ? "good" : s.revenueGrowth3yr >= 0.03 ? "ok" : "weak" },
    ],
  };
}

function deepValueFit(s: Stock): StrategyFit {
  const pbScore = s.priceToBook <= 0 ? 0 :
    s.priceToBook <= 0.75 ? 35 : s.priceToBook <= 1.5 ? 28 :
    s.priceToBook <= 2.5  ? 18 : s.priceToBook <= 4   ? 7  : 0;

  const evScore = s.evToEbitda <= 0 ? 0 :
    s.evToEbitda <= 6  ? 35 : s.evToEbitda <= 10 ? 28 :
    s.evToEbitda <= 14 ? 18 : s.evToEbitda <= 20 ? 7  : 0;

  const fcfScore =
    s.fcfYield >= 0.10 ? 30 : s.fcfYield >= 0.06 ? 22 :
    s.fcfYield >= 0.03 ? 12 : s.fcfYield >  0    ? 5  : 0;

  return {
    id: "deep-value", name: "Deep Value",
    score: Math.round(clamp(pbScore + evScore + fcfScore, 0, 100)),
    qualifies: (s.priceToBook > 0 && s.priceToBook <= 2.5) || (s.evToEbitda > 0 && s.evToEbitda <= 12) || s.fcfYield >= 0.05,
    qualifier: "P/B ≤ 2.5, or EV/EBITDA ≤ 12, or FCF yield ≥ 5%",
    metrics: [
      { label: "Price / Book", value: s.priceToBook > 0 ? dec(s.priceToBook) : "N/A",
        assessment: s.priceToBook <= 0 ? "na" : s.priceToBook <= 1 ? "excellent" : s.priceToBook <= 2 ? "good" : s.priceToBook <= 3 ? "ok" : "weak" },
      { label: "EV / EBITDA", value: s.evToEbitda > 0 ? dec(s.evToEbitda) : "N/A",
        assessment: s.evToEbitda <= 0 ? "na" : s.evToEbitda <= 8 ? "excellent" : s.evToEbitda <= 12 ? "good" : s.evToEbitda <= 18 ? "ok" : "weak" },
      { label: "FCF Yield", value: pct(s.fcfYield),
        assessment: s.fcfYield >= 0.08 ? "excellent" : s.fcfYield >= 0.04 ? "good" : s.fcfYield >= 0.01 ? "ok" : "weak" },
      { label: "Trailing P/E", value: s.trailingPE > 0 ? dec(s.trailingPE) : "N/A",
        assessment: s.trailingPE <= 0 ? "na" : s.trailingPE <= 12 ? "excellent" : s.trailingPE <= 18 ? "good" : s.trailingPE <= 25 ? "ok" : "weak" },
    ],
  };
}

function momentumFit(s: Stock): StrategyFit {
  const relScore =
    s.returnVsSP500 >= 0.30 ? 40 : s.returnVsSP500 >= 0.15 ? 32 :
    s.returnVsSP500 >= 0.05 ? 24 : s.returnVsSP500 >= 0    ? 14 : 0;

  const r3Score =
    s.return3m >= 0.20 ? 35 : s.return3m >= 0.10 ? 28 :
    s.return3m >= 0.03 ? 18 : s.return3m >= 0    ? 10 : 0;

  const r1Score =
    s.return1m >= 0.10 ? 25 : s.return1m >= 0.05 ? 20 :
    s.return1m >= 0    ? 12 : 0;

  return {
    id: "momentum", name: "Momentum",
    score: Math.round(clamp(relScore + r3Score + r1Score, 0, 100)),
    qualifies: s.returnVsSP500 > 0 && s.return3m > 0,
    qualifier: "Beating S&P 500 and positive 3-month return",
    metrics: [
      { label: "vs S&P 500 (52w)", value: pct(s.returnVsSP500),
        assessment: s.returnVsSP500 >= 0.20 ? "excellent" : s.returnVsSP500 >= 0.05 ? "good" : s.returnVsSP500 >= 0 ? "ok" : "weak" },
      { label: "3-Month Return", value: pct(s.return3m),
        assessment: s.return3m >= 0.12 ? "excellent" : s.return3m >= 0.04 ? "good" : s.return3m >= 0 ? "ok" : "weak" },
      { label: "1-Month Return", value: pct(s.return1m),
        assessment: s.return1m >= 0.07 ? "excellent" : s.return1m >= 0.02 ? "good" : s.return1m >= 0 ? "ok" : "weak" },
      { label: "52-Week Return", value: pct(s.return52w),
        assessment: s.return52w >= 0.30 ? "excellent" : s.return52w >= 0.10 ? "good" : s.return52w >= 0 ? "ok" : "weak" },
    ],
  };
}

function qualityFit(s: Stock): StrategyFit {
  const roeScore =
    s.roe >= 0.40 ? 40 : s.roe >= 0.25 ? 32 :
    s.roe >= 0.15 ? 22 : s.roe >= 0.08 ? 10 : 0;

  const gmScore =
    s.grossMargin >= 0.65 ? 35 : s.grossMargin >= 0.45 ? 28 :
    s.grossMargin >= 0.30 ? 18 : s.grossMargin >= 0.15 ? 8  : 0;

  const deScore =
    s.debtToEquity <= 0.25 ? 25 : s.debtToEquity <= 0.75 ? 20 :
    s.debtToEquity <= 1.5  ? 13 : s.debtToEquity <= 2.5  ? 5  : 0;

  return {
    id: "quality", name: "Quality",
    score: Math.round(clamp(roeScore + gmScore + deScore, 0, 100)),
    qualifies: s.roe >= 0.15 && s.grossMargin >= 0.30 && s.debtToEquity <= 2.0,
    qualifier: "ROE ≥ 15%, gross margin ≥ 30%, D/E ≤ 2",
    metrics: [
      { label: "Return on Equity", value: pct(s.roe),
        assessment: s.roe >= 0.30 ? "excellent" : s.roe >= 0.15 ? "good" : s.roe >= 0.08 ? "ok" : "weak" },
      { label: "Gross Margin", value: pct(s.grossMargin),
        assessment: s.grossMargin >= 0.55 ? "excellent" : s.grossMargin >= 0.35 ? "good" : s.grossMargin >= 0.20 ? "ok" : "weak" },
      { label: "Debt / Equity", value: dec(s.debtToEquity),
        assessment: s.debtToEquity <= 0.5 ? "excellent" : s.debtToEquity <= 1.2 ? "good" : s.debtToEquity <= 2.0 ? "ok" : "weak" },
      { label: "Operating Margin", value: pct(s.operatingMargin),
        assessment: s.operatingMargin >= 0.25 ? "excellent" : s.operatingMargin >= 0.12 ? "good" : s.operatingMargin >= 0.05 ? "ok" : "weak" },
    ],
  };
}

function dividendGrowthFit(s: Stock): StrategyFit {
  const yieldScore =
    s.dividendYield >= 0.05 ? 40 : s.dividendYield >= 0.035 ? 32 :
    s.dividendYield >= 0.02 ? 22 : s.dividendYield >  0     ? 10 : 0;

  const payoutScore = s.dividendYield <= 0 ? 0 :
    s.payoutRatio <= 0.30 ? 35 : s.payoutRatio <= 0.50 ? 28 :
    s.payoutRatio <= 0.70 ? 18 : s.payoutRatio <= 0.85 ? 8  : 0;

  const epsScore =
    s.epsGrowth5yr >= 0.10 ? 25 : s.epsGrowth5yr >= 0.05 ? 18 :
    s.epsGrowth5yr >= 0    ? 8  : 0;

  return {
    id: "dividend-growth", name: "Dividend Growth",
    score: Math.round(clamp(yieldScore + payoutScore + epsScore, 0, 100)),
    qualifies: s.dividendYield > 0 && s.payoutRatio <= 0.80 && s.epsGrowth5yr >= 0,
    qualifier: "Pays dividend, payout ≤ 80%, earnings not declining",
    metrics: [
      { label: "Dividend Yield", value: s.dividendYield > 0 ? pct(s.dividendYield) : "No dividend",
        assessment: s.dividendYield <= 0 ? "weak" : s.dividendYield >= 0.04 ? "excellent" : s.dividendYield >= 0.02 ? "good" : "ok" },
      { label: "Payout Ratio", value: s.dividendYield > 0 ? pct(s.payoutRatio) : "N/A",
        assessment: s.dividendYield <= 0 ? "na" : s.payoutRatio <= 0.40 ? "excellent" : s.payoutRatio <= 0.60 ? "good" : s.payoutRatio <= 0.80 ? "ok" : "weak" },
      { label: "EPS Growth (5yr)", value: pct(s.epsGrowth5yr),
        assessment: s.epsGrowth5yr >= 0.10 ? "excellent" : s.epsGrowth5yr >= 0.04 ? "good" : s.epsGrowth5yr >= 0 ? "ok" : "weak" },
      { label: "5yr Avg Yield", value: s.fiveYearAvgDividendYield > 0 ? pct(s.fiveYearAvgDividendYield) : "N/A",
        assessment: s.fiveYearAvgDividendYield <= 0 ? "na" : s.fiveYearAvgDividendYield >= 0.03 ? "good" : "ok" },
    ],
  };
}

function asymmetricFit(s: Stock): StrategyFit {
  const discountScore =
    s.pctFromHigh >= 0.50 ? 40 : s.pctFromHigh >= 0.30 ? 32 :
    s.pctFromHigh >= 0.15 ? 22 : s.pctFromHigh >= 0.05 ? 8  : 0;

  const ratingScore = s.analystRating === 0 ? 20 :
    s.analystRating <= 1.2 ? 40 : s.analystRating <= 1.8 ? 32 :
    s.analystRating <= 2.5 ? 22 : s.analystRating <= 3.0 ? 10 : 0;

  const shortScore =
    s.shortPercentOfFloat >= 0.20 ? 20 : s.shortPercentOfFloat >= 0.10 ? 14 :
    s.shortPercentOfFloat >= 0.05 ? 8  : 0;

  const analystLabel =
    s.analystRating === 0   ? "No data"      :
    s.analystRating <= 1.5  ? "Strong Buy"   :
    s.analystRating <= 2.0  ? "Buy"          :
    s.analystRating <= 2.5  ? "Moderate Buy" :
    s.analystRating <= 3.5  ? "Hold"         : "Sell";

  return {
    id: "asymmetric", name: "Asymmetric",
    score: Math.round(clamp(discountScore + ratingScore + shortScore, 0, 100)),
    qualifies: s.pctFromHigh >= 0.15 && (s.analystRating === 0 || s.analystRating <= 2.5),
    qualifier: "≥ 15% off 52w high, analyst rating Buy or better",
    metrics: [
      { label: "% Below 52w High", value: pct(s.pctFromHigh),
        assessment: s.pctFromHigh >= 0.35 ? "excellent" : s.pctFromHigh >= 0.15 ? "good" : s.pctFromHigh >= 0.05 ? "ok" : "weak" },
      { label: "Analyst Consensus", value: `${dec(s.analystRating, 1)} · ${analystLabel}`,
        assessment: s.analystRating === 0 ? "na" : s.analystRating <= 1.5 ? "excellent" : s.analystRating <= 2.5 ? "good" : s.analystRating <= 3 ? "ok" : "weak" },
      { label: "Short Interest", value: pct(s.shortPercentOfFloat),
        assessment: s.shortPercentOfFloat >= 0.15 ? "excellent" : s.shortPercentOfFloat >= 0.07 ? "good" : "ok" },
      { label: "52-Week Return", value: pct(s.return52w),
        assessment: s.return52w <= -0.20 ? "excellent" : s.return52w <= 0 ? "good" : "ok" },
    ],
  };
}

function trendingFit(s: Stock): StrategyFit {
  const r1Score =
    s.return1m >= 0.15 ? 45 : s.return1m >= 0.08 ? 35 :
    s.return1m >= 0.03 ? 22 : s.return1m >= 0    ? 10 : 0;

  const r3Score =
    s.return3m >= 0.20 ? 35 : s.return3m >= 0.10 ? 28 :
    s.return3m >= 0.03 ? 16 : s.return3m >= 0    ? 8  : 0;

  const volScore =
    s.volumeTrend >= 1.5 ? 20 : s.volumeTrend >= 1.2 ? 15 :
    s.volumeTrend >= 1.0 ? 8  : 0;

  return {
    id: "trending", name: "Trending",
    score: Math.round(clamp(r1Score + r3Score + volScore, 0, 100)),
    qualifies: s.return1m > 0 && s.return3m > 0 && s.volumeTrend > 1.0,
    qualifier: "Positive 1-month & 3-month, volume trend above 1×",
    metrics: [
      { label: "1-Month Return", value: pct(s.return1m),
        assessment: s.return1m >= 0.10 ? "excellent" : s.return1m >= 0.03 ? "good" : s.return1m >= 0 ? "ok" : "weak" },
      { label: "3-Month Return", value: pct(s.return3m),
        assessment: s.return3m >= 0.15 ? "excellent" : s.return3m >= 0.05 ? "good" : s.return3m >= 0 ? "ok" : "weak" },
      { label: "Volume Trend", value: `${dec(s.volumeTrend)}×`,
        assessment: s.volumeTrend >= 1.4 ? "excellent" : s.volumeTrend >= 1.1 ? "good" : s.volumeTrend >= 1.0 ? "ok" : "weak" },
      { label: "52-Week Return", value: pct(s.return52w),
        assessment: s.return52w >= 0.30 ? "excellent" : s.return52w >= 0.10 ? "good" : s.return52w >= 0 ? "ok" : "weak" },
    ],
  };
}

function computeAllFits(stock: Stock): StrategyFit[] {
  return [
    garpFit(stock),
    deepValueFit(stock),
    momentumFit(stock),
    qualityFit(stock),
    dividendGrowthFit(stock),
    asymmetricFit(stock),
    trendingFit(stock),
  ];
}

// ─── Strategy card ────────────────────────────────────────────────────────────

function StrategyCard({ fit }: { fit: StrategyFit }) {
  const nameColor = STRATEGY_COLOR[fit.id] ?? "text-primary";
  const textColor = scoreTextColor(fit.score);
  const barColor  = scoreBarColor(fit.score);

  return (
    <div className="bg-card border border-border rounded-xl p-5 flex flex-col gap-3 shadow-sm">
      {/* Header row */}
      <div className="flex items-center justify-between gap-2">
        <span className={`font-semibold text-sm tracking-wide ${nameColor}`}>{fit.name}</span>
        {fit.qualifies ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
            ✓ Qualifies
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[10px] font-normal px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
            Doesn't qualify
          </span>
        )}
      </div>

      {/* Score */}
      <div className="flex items-end gap-2">
        <span className={`text-4xl font-bold font-mono leading-none ${textColor}`}>{fit.score}</span>
        <span className="text-sm text-muted-foreground mb-0.5">/ 100</span>
      </div>
      <Progress value={fit.score} className="h-1.5 bg-muted" indicatorClassName={barColor} />

      {/* Qualifier criteria */}
      <p className="text-[11px] text-muted-foreground leading-relaxed">{fit.qualifier}</p>

      {/* Metric rows */}
      <div className="flex flex-col divide-y divide-border/60 mt-1">
        {fit.metrics.map((m) => (
          <div key={m.label} className="flex items-center justify-between py-2 gap-2">
            <span className="text-xs text-muted-foreground">{m.label}</span>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-xs font-mono font-semibold text-foreground">{m.value}</span>
              <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border ${ASSESSMENT_STYLES[m.assessment]}`}>
                {ASSESSMENT_LABELS[m.assessment]}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main tab ─────────────────────────────────────────────────────────────────

export function StockAnalyzerTab() {
  const [query, setQuery]               = useState("");
  const [selectedStock, setSelectedStock] = useState<Stock | null>(null);
  const [showDropdown, setShowDropdown]  = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useGetStocks({
    query: {
      queryKey: getGetStocksQueryKey(),
      staleTime: 5 * 60 * 1000,
    },
  });

  const allStocks: Stock[] = (data?.stocks ?? []) as Stock[];

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return allStocks
      .filter(
        (s) =>
          s.ticker.toLowerCase().startsWith(q) ||
          s.company.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [allStocks, query]);

  const fits = useMemo(
    () => (selectedStock ? computeAllFits(selectedStock) : null),
    [selectedStock]
  );

  function handleSelect(stock: Stock) {
    setSelectedStock(stock);
    setQuery(stock.ticker);
    setShowDropdown(false);
  }

  function handleClear() {
    setSelectedStock(null);
    setQuery("");
    setShowDropdown(false);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value.toUpperCase();
    setQuery(v);
    if (selectedStock && v !== selectedStock.ticker) setSelectedStock(null);
    setShowDropdown(true);
  }

  return (
    <div className="flex flex-col gap-6 max-w-5xl">

      {/* ── Intro ─────────────────────────────────────────────────────────── */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-1">Stock Analyzer</h2>
        <p className="text-sm text-muted-foreground">
          Search any stock in our universe to see how it scores across all 7 investment strategies.
        </p>
      </div>

      {/* ── Search ────────────────────────────────────────────────────────── */}
      <div className="relative max-w-lg">
        <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 shadow-sm focus-within:ring-2 focus-within:ring-ring/30 focus-within:border-primary transition-shadow">
          <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={handleInputChange}
            onFocus={() => query && setShowDropdown(true)}
            onBlur={() => setTimeout(() => setShowDropdown(false), 160)}
            placeholder={isLoading ? "Loading stocks…" : "Search ticker or company name…"}
            disabled={isLoading}
            className="flex-1 py-3 bg-transparent outline-none text-sm text-foreground placeholder:text-muted-foreground disabled:opacity-50"
            autoComplete="off"
            spellCheck={false}
          />
          {(query || selectedStock) && (
            <button
              onClick={handleClear}
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Clear"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Autocomplete dropdown */}
        {showDropdown && suggestions.length > 0 && (
          <div className="absolute z-20 top-full mt-1 w-full bg-card border border-border rounded-lg shadow-md overflow-hidden">
            {suggestions.map((stock) => (
              <button
                key={stock.ticker}
                onMouseDown={() => handleSelect(stock)}
                className="w-full px-4 py-2.5 text-left flex items-center gap-3 hover:bg-muted/60 transition-colors"
              >
                <span className="font-mono font-bold text-sm text-foreground w-14 shrink-0">{stock.ticker}</span>
                <span className="text-sm text-muted-foreground truncate flex-1">{stock.company}</span>
                <span className="text-xs text-muted-foreground/70 shrink-0">{stock.marketCap}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Selected stock header ──────────────────────────────────────────── */}
      {selectedStock && (
        <div className="flex items-start justify-between gap-4 p-4 bg-card border border-border rounded-xl shadow-sm">
          <div>
            <div className="flex items-baseline gap-3">
              <span className="text-2xl font-bold font-mono text-foreground">{selectedStock.ticker}</span>
              <Badge variant="outline" className="text-xs font-normal">{selectedStock.sector}</Badge>
              <Badge variant="outline" className="text-xs font-normal">{selectedStock.marketCap}-cap</Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">{selectedStock.company}</p>
          </div>
          <div className="text-right shrink-0">
            <div className="text-2xl font-mono font-semibold text-foreground">
              {selectedStock.price > 0
                ? `$${selectedStock.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : "—"}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">Current price</p>
          </div>
        </div>
      )}

      {/* ── Strategy fit cards ────────────────────────────────────────────── */}
      {fits && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {fits.map((fit) => (
            <StrategyCard key={fit.id} fit={fit} />
          ))}
        </div>
      )}

      {/* ── Empty state ───────────────────────────────────────────────────── */}
      {!selectedStock && !isLoading && (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
          <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
            <Search className="w-6 h-6 text-muted-foreground" />
          </div>
          <p className="font-medium text-foreground">Search for a stock to analyze</p>
          <p className="text-sm text-muted-foreground max-w-sm">
            Type a ticker (e.g. AAPL) or company name to see its fit score across all 7 investment strategies — GARP, Deep Value, Momentum, Quality, Dividend Growth, Asymmetric, and Trending.
          </p>
        </div>
      )}

      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            <p className="text-sm text-muted-foreground">Loading stock data…</p>
          </div>
        </div>
      )}
    </div>
  );
}
