import { useState, useMemo } from "react";
import type { Stock, ScoredStock } from "@/lib/screener";
import { filterMomentum, defaultMomentumFilters } from "@/lib/screener";
import { StrategyBanner } from "@/components/StrategyBanner";
import { TabFilterPanel, type FilterControl } from "@/components/TabFilterPanel";
import { TabStockTable, type ColumnDef } from "@/components/TabStockTable";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

const BANNER =
  "Trend is your friend until it bends. Momentum investing exploits a well-documented anomaly: \
stocks that have outperformed tend to continue outperforming over the next 3–12 months. \
This screener surfaces leaders — companies beating the market with price and earnings momentum.";

const FILTER_CONTROLS: FilterControl[] = [
  { type: "slider-min", field: "return52wMin", label: "52-Week Return (Min)", min: -30, max: 100, step: 5, format: (v) => `${v}%` },
  { type: "slider-min", field: "returnVsSP500Min", label: "vs. S&P 500 (Min)", min: -30, max: 60, step: 5, format: (v) => `${v >= 0 ? "+" : ""}${v}%` },
  { type: "slider-min", field: "return3mMin", label: "3-Month Return (Min)", min: -20, max: 50, step: 5, format: (v) => `${v}%` },
  { type: "slider-max", field: "pctFromHighMax", label: "% Below 52wk High (Max)", min: 0, max: 50, step: 5, format: (v) => `${v}%` },
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
    key: "return52w", header: "52w Ret", align: "right", sortKey: "return52w",
    render: (s) => (
      <span className={`font-mono text-sm ${pctColor(s.return52w)}`}>
        {s.return52w !== 0 ? `${s.return52w > 0 ? "+" : ""}${(s.return52w * 100).toFixed(1)}%` : "—"}
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
    key: "return3m", header: "3m Ret", align: "right", sortKey: "return3m",
    render: (s) => (
      <span className={`font-mono text-sm ${pctColor(s.return3m)}`}>
        {s.return3m !== 0 ? `${s.return3m > 0 ? "+" : ""}${(s.return3m * 100).toFixed(1)}%` : "—"}
      </span>
    ),
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
    key: "pctFromHigh", header: "% fr. High", align: "right", sortKey: "pctFromHigh",
    render: (s) => (
      <span className={`font-mono text-sm ${s.pctFromHigh <= 0.05 ? "text-green-400" : s.pctFromHigh <= 0.2 ? "text-amber-400" : "text-red-400"}`}>
        {s.pctFromHigh > 0 ? `${(s.pctFromHigh * 100).toFixed(1)}%` : s.pctFromHigh === 0 ? "—" : "ATH"}
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

export function MomentumTab({ stocks }: { stocks: Stock[] }) {
  const [filters, setFilters] = useState(defaultMomentumFilters);
  const filteredStocks: ScoredStock[] = useMemo(
    () => filterMomentum(stocks, filters),
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
            setFilters={(f) => setFilters(f as typeof defaultMomentumFilters)}
            defaultFilters={defaultMomentumFilters as unknown as Record<string, unknown>}
            totalStocks={stocks.length}
            filteredCount={filteredStocks.length}
          />
        </aside>
        <div className="flex-1 min-w-0 w-full">
          <TabStockTable
            stocks={filteredStocks}
            columns={COLUMNS}
            defaultSort={{ key: "return52w", direction: "desc" }}
          />
        </div>
      </div>
    </div>
  );
}
