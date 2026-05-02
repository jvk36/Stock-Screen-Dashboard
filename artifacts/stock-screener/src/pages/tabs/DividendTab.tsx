import { useState, useMemo } from "react";
import type { Stock, ScoredStock } from "@/lib/screener";
import { filterDividend, defaultDividendFilters } from "@/lib/screener";
import { StrategyBanner } from "@/components/StrategyBanner";
import { TabFilterPanel, type FilterControl } from "@/components/TabFilterPanel";
import { TabStockTable, type ColumnDef } from "@/components/TabStockTable";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

const BANNER =
  "Do you know the only thing that gives me pleasure? It\u2019s to see my dividends coming in. \u2014 John D. Rockefeller. \
Dividend Growth investing targets companies that reliably raise their payouts year after year \u2014 \
compounding income while building a margin of safety against capital loss.";

const FILTER_CONTROLS: FilterControl[] = [
  { type: "slider-min", field: "dividendYieldMin", label: "Dividend Yield (Min)", min: 0, max: 10, step: 0.25, format: (v) => `${v.toFixed(2)}%` },
  { type: "slider-max", field: "payoutRatioMax", label: "Payout Ratio (Max)", min: 10, max: 100, step: 5, format: (v) => `${v}%` },
  { type: "slider-min", field: "fiveYearAvgYieldMin", label: "5-Year Avg Yield (Min)", min: 0, max: 8, step: 0.25, format: (v) => `${v.toFixed(2)}%` },
  { type: "slider-min", field: "epsGrowthMin", label: "EPS Growth (Min)", min: -10, max: 20, step: 1, format: (v) => `${v}%` },
  { type: "slider-max", field: "debtEqMax", label: "Debt / Equity (Max)", min: 0, max: 5, step: 0.1, format: (v) => `${v.toFixed(1)}x` },
  { type: "market-caps" },
  { type: "sectors" },
];

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
    key: "dividendYield", header: "Div Yield", align: "right", sortKey: "dividendYield",
    render: (s) => (
      <span className={`font-mono text-sm font-semibold ${s.dividendYield >= 0.04 ? "text-green-400" : s.dividendYield >= 0.02 ? "text-foreground" : "text-muted-foreground"}`}>
        {s.dividendYield > 0 ? `${(s.dividendYield * 100).toFixed(2)}%` : "—"}
      </span>
    ),
  },
  {
    key: "dividendRate", header: "Div / Share", align: "right", sortKey: "dividendRate",
    render: (s) => (
      <span className="font-mono text-sm text-foreground">
        {s.dividendRate > 0 ? `$${s.dividendRate.toFixed(2)}` : "—"}
      </span>
    ),
  },
  {
    key: "payoutRatio", header: "Payout", align: "right", sortKey: "payoutRatio",
    render: (s) => (
      <span className={`font-mono text-sm ${s.payoutRatio > 0.8 ? "text-red-400" : s.payoutRatio > 0.6 ? "text-amber-400" : s.payoutRatio > 0 ? "text-green-400" : "text-muted-foreground"}`}>
        {s.payoutRatio > 0 ? `${(s.payoutRatio * 100).toFixed(0)}%` : "—"}
      </span>
    ),
  },
  {
    key: "fiveYearAvgDividendYield", header: "5yr Avg", align: "right", sortKey: "fiveYearAvgDividendYield",
    render: (s) => (
      <span className="font-mono text-sm text-muted-foreground">
        {s.fiveYearAvgDividendYield > 0 ? `${(s.fiveYearAvgDividendYield * 100).toFixed(2)}%` : "—"}
      </span>
    ),
  },
  {
    key: "epsGrowth5yr", header: "EPS Growth", align: "right", sortKey: "epsGrowth5yr",
    render: (s) => (
      <span className={`font-mono text-sm ${s.epsGrowth5yr >= 0.1 ? "text-green-400" : s.epsGrowth5yr >= 0 ? "text-foreground" : "text-red-400"}`}>
        {s.epsGrowth5yr !== 0 ? `${s.epsGrowth5yr > 0 ? "+" : ""}${(s.epsGrowth5yr * 100).toFixed(1)}%` : "—"}
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

export function DividendTab({ stocks }: { stocks: Stock[] }) {
  const [filters, setFilters] = useState(defaultDividendFilters);
  const filteredStocks: ScoredStock[] = useMemo(
    () => filterDividend(stocks, filters),
    [stocks, filters]
  );

  return (
    <div className="flex flex-col gap-6">
      <StrategyBanner quote={BANNER} />
      <div className="flex flex-col lg:flex-row gap-8 items-start">
        <aside className="w-full lg:w-72 shrink-0">
          <TabFilterPanel
            controls={FILTER_CONTROLS}
            filters={filters as unknown as Record<string, unknown>}
            setFilters={(f) => setFilters(f as typeof defaultDividendFilters)}
            defaultFilters={defaultDividendFilters as unknown as Record<string, unknown>}
            totalStocks={stocks.length}
            filteredCount={filteredStocks.length}
          />
        </aside>
        <div className="flex-1 min-w-0 w-full">
          <TabStockTable
            stocks={filteredStocks}
            columns={COLUMNS}
            defaultSort={{ key: "dividendYield", direction: "desc" }}
          />
        </div>
      </div>
    </div>
  );
}
