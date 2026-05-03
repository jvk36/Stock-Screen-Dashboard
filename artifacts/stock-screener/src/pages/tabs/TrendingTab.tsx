import { useState, useMemo } from "react";
import type { Stock, ScoredStock } from "@/lib/screener";
import { filterTrending, defaultTrendingFilters } from "@/lib/screener";
import { StrategyBanner } from "@/components/StrategyBanner";
import { PrimaryDriverBadge } from "@/components/PrimaryDriverBadge";
import { TabFilterPanel, type FilterControl } from "@/components/TabFilterPanel";
import { TabStockTable, type ColumnDef } from "@/components/TabStockTable";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

const BANNER =
  "Price is the most efficient aggregator of information about a stock that exists. When price trends upward with expanding volume, \
the market is voting with real money. \
The Trending screener captures short-term price-action leaders \u2014 stocks near their 52-week highs with accelerating momentum.";

const FILTER_CONTROLS: FilterControl[] = [
  { type: "slider-min", field: "return3mMin", label: "3-Month Return (Min)", min: -20, max: 60, step: 5, format: (v) => `${v}%` },
  { type: "slider-min", field: "return1mMin", label: "1-Month Return (Min)", min: -10, max: 30, step: 2, format: (v) => `${v}%` },
  { type: "slider-max", field: "pctFromHighMax", label: "% Below 52wk High (Max)", min: 0, max: 50, step: 5, format: (v) => `${v}%` },
  { type: "slider-min", field: "volumeTrendMin", label: "Volume Trend (Min)", min: 0, max: 3, step: 0.1, format: (v) => `${v.toFixed(1)}x avg` },
  { type: "market-caps" },
  { type: "sectors" },
];

const pctColor = (v: number) =>
  v > 0.1 ? "text-green-400 font-semibold" : v > 0 ? "text-green-400" : v < -0.1 ? "text-red-400" : v < 0 ? "text-red-400" : "text-muted-foreground";

const COLUMNS: ColumnDef[] = [
  {
    key: "price", header: "Price", align: "right", sortKey: "price",
    render: (s) => <span className="font-mono text-sm text-foreground">{s.price > 0 ? `$${s.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}</span>,
  },
  {
    key: "ticker", header: "Ticker", sortKey: "ticker",
    render: (s) => <span className="font-bold text-foreground font-mono">{s.ticker}</span>,
  },
  {
    key: "company", header: "Company", sortKey: "company",
    render: (s) => <span className="text-sm text-muted-foreground truncate max-w-[140px] block">{s.company}</span>,
  },
  {
    key: "sector", header: "Sector", sortKey: "sector",
    render: (s) => <Badge variant="outline" className="text-[10px] font-normal whitespace-nowrap bg-muted/20">{s.sector}</Badge>,
  },
  {
    key: "marketCap", header: "Cap", sortKey: "marketCap",
    render: (s) => <span className="text-xs text-muted-foreground">{s.marketCap}</span>,
  },
  {
    key: "return1m", header: "1m Ret", align: "right", sortKey: "return1m",
    render: (s) => (
      <span className={`font-mono text-sm ${pctColor(s.return1m)}`}>
        {s.return1m !== 0 ? `${s.return1m > 0 ? "+" : ""}${(s.return1m * 100).toFixed(1)}%` : "—"}
      </span>
    ),
  },
  {
    key: "return3m", header: "3m Ret", align: "right", sortKey: "return3m",
    render: (s) => (
      <span className={`font-mono text-sm ${pctColor(s.return3m)}`}>
        {s.return3m !== 0 ? `${s.return3m > 0 ? "+" : ""}${(s.return3m * 100).toFixed(1)}%` : "—"}
      </span>
    ),
  },
  {
    key: "returnVsSP500", header: "vs. S&P", align: "right", sortKey: "returnVsSP500",
    render: (s) => (
      <span className={`font-mono text-sm ${pctColor(s.returnVsSP500)}`}>
        {s.returnVsSP500 !== 0 ? `${s.returnVsSP500 > 0 ? "+" : ""}${(s.returnVsSP500 * 100).toFixed(1)}%` : "—"}
      </span>
    ),
  },
  {
    key: "pctFromHigh", header: "% fr. High", align: "right", sortKey: "pctFromHigh",
    render: (s) => (
      <span className={`font-mono text-sm ${s.pctFromHigh <= 0.05 ? "text-green-400 font-semibold" : s.pctFromHigh <= 0.15 ? "text-foreground" : "text-amber-400"}`}>
        {s.pctFromHigh > 0 ? `${(s.pctFromHigh * 100).toFixed(1)}%` : s.pctFromHigh === 0 ? "—" : "ATH"}
      </span>
    ),
  },
  {
    key: "volumeTrend", header: "Vol Trend", align: "right", sortKey: "volumeTrend",
    render: (s) => (
      <span className={`font-mono text-sm ${s.volumeTrend >= 1.5 ? "text-green-400 font-semibold" : s.volumeTrend >= 1.0 ? "text-foreground" : s.volumeTrend > 0 ? "text-muted-foreground" : "text-muted-foreground"}`}>
        {s.volumeTrend > 0 ? `${s.volumeTrend.toFixed(2)}x` : "—"}
      </span>
    ),
  },
  {
    key: "score", header: "Score", align: "right", sortKey: "score",
    render: (s) => (
      <div className="flex items-center gap-2 min-w-[80px]">
        <Progress value={s.score} className="h-2 w-full bg-muted"
          indicatorClassName={s.score > 70 ? "bg-primary" : s.score > 40 ? "bg-amber-500" : "bg-muted-foreground"} />
        <span className="text-xs font-mono text-muted-foreground w-6 text-right">{s.score}</span>
      </div>
    ),
  },
];

export function TrendingTab({ stocks }: { stocks: Stock[] }) {
  const [filters, setFilters] = useState(defaultTrendingFilters);
  const filteredStocks: ScoredStock[] = useMemo(
    () => filterTrending(stocks, filters),
    [stocks, filters]
  );

  return (
    <div className="flex flex-col gap-6">
      <StrategyBanner quote={BANNER} />
      <PrimaryDriverBadge
        driver="1-Month Return"
        description="Immediate heat — strongest price momentum over the past month"
      />
      <div className="flex flex-col lg:flex-row gap-8 items-start">
        <aside className="w-full lg:w-72 shrink-0">
          <TabFilterPanel
            controls={FILTER_CONTROLS}
            filters={filters as unknown as Record<string, unknown>}
            setFilters={(f) => setFilters(f as typeof defaultTrendingFilters)}
            defaultFilters={defaultTrendingFilters as unknown as Record<string, unknown>}
            totalStocks={stocks.length}
            filteredCount={filteredStocks.length}
          />
        </aside>
        <div className="flex-1 min-w-0 w-full">
          <TabStockTable
            stocks={filteredStocks}
            columns={COLUMNS}
            defaultSort={{ key: "return1m", direction: "desc" }}
          />
        </div>
      </div>
    </div>
  );
}
