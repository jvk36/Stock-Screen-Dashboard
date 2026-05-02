import { useState, useMemo } from "react";
import type { Stock, ScoredStock } from "@/lib/screener";
import { filterQuality, defaultQualityFilters } from "@/lib/screener";
import { StrategyBanner } from "@/components/StrategyBanner";
import { TabFilterPanel, type FilterControl } from "@/components/TabFilterPanel";
import { TabStockTable, type ColumnDef } from "@/components/TabStockTable";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

const BANNER =
  "It is far better to buy a wonderful company at a fair price than a fair company at a wonderful price. \u2014 Warren Buffett. \
Quality investing targets durable competitive advantages: high returns on capital, fat margins, strong balance sheets, \
and businesses that compound value year after year.";

const FILTER_CONTROLS: FilterControl[] = [
  { type: "slider-min", field: "roeMin", label: "Return on Equity (Min)", min: 0, max: 60, step: 5, format: (v) => `${v}%` },
  { type: "slider-min", field: "roaMin", label: "Return on Assets (Min)", min: 0, max: 30, step: 2, format: (v) => `${v}%` },
  { type: "slider-min", field: "operatingMarginMin", label: "Operating Margin (Min)", min: 0, max: 50, step: 5, format: (v) => `${v}%` },
  { type: "slider-min", field: "grossMarginMin", label: "Gross Margin (Min)", min: 0, max: 80, step: 5, format: (v) => `${v}%` },
  { type: "slider-min", field: "currentRatioMin", label: "Current Ratio (Min)", min: 0, max: 5, step: 0.25, format: (v) => `${v.toFixed(2)}x` },
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
    key: "roe", header: "ROE", align: "right", sortKey: "roe",
    render: (s) => (
      <span className={`font-mono text-sm ${s.roe >= 0.3 ? "text-green-400 font-semibold" : s.roe >= 0.15 ? "text-foreground" : "text-muted-foreground"}`}>
        {s.roe !== 0 ? `${(s.roe * 100).toFixed(1)}%` : "—"}
      </span>
    ),
  },
  {
    key: "returnOnAssets", header: "ROA", align: "right", sortKey: "returnOnAssets",
    render: (s) => (
      <span className={`font-mono text-sm ${s.returnOnAssets >= 0.1 ? "text-green-400 font-semibold" : s.returnOnAssets > 0 ? "text-foreground" : "text-muted-foreground"}`}>
        {s.returnOnAssets !== 0 ? `${(s.returnOnAssets * 100).toFixed(1)}%` : "—"}
      </span>
    ),
  },
  {
    key: "operatingMargin", header: "Op. Margin", align: "right", sortKey: "operatingMargin",
    render: (s) => (
      <span className={`font-mono text-sm ${s.operatingMargin >= 0.2 ? "text-green-400 font-semibold" : s.operatingMargin > 0 ? "text-foreground" : "text-muted-foreground"}`}>
        {s.operatingMargin !== 0 ? `${(s.operatingMargin * 100).toFixed(1)}%` : "—"}
      </span>
    ),
  },
  {
    key: "grossMargin", header: "Gross Margin", align: "right", sortKey: "grossMargin",
    render: (s) => (
      <span className={`font-mono text-sm ${s.grossMargin >= 0.5 ? "text-green-400 font-semibold" : s.grossMargin > 0 ? "text-foreground" : "text-muted-foreground"}`}>
        {s.grossMargin !== 0 ? `${(s.grossMargin * 100).toFixed(1)}%` : "—"}
      </span>
    ),
  },
  {
    key: "currentRatio", header: "Curr. Ratio", align: "right", sortKey: "currentRatio",
    render: (s) => (
      <span className={`font-mono text-sm ${s.currentRatio >= 2 ? "text-green-400" : s.currentRatio >= 1 ? "text-foreground" : s.currentRatio > 0 ? "text-red-400" : "text-muted-foreground"}`}>
        {s.currentRatio > 0 ? `${s.currentRatio.toFixed(2)}x` : "—"}
      </span>
    ),
  },
  {
    key: "debtToEquity", header: "D/E", align: "right", sortKey: "debtToEquity",
    render: (s) => (
      <span className={`font-mono text-sm ${s.debtToEquity > 2 ? "text-red-400" : s.debtToEquity > 0 ? "text-foreground" : "text-muted-foreground"}`}>
        {s.debtToEquity > 0 ? s.debtToEquity.toFixed(2) : "—"}
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

export function QualityTab({ stocks }: { stocks: Stock[] }) {
  const [filters, setFilters] = useState(defaultQualityFilters);
  const filteredStocks: ScoredStock[] = useMemo(
    () => filterQuality(stocks, filters),
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
            setFilters={(f) => setFilters(f as typeof defaultQualityFilters)}
            defaultFilters={defaultQualityFilters as unknown as Record<string, unknown>}
            totalStocks={stocks.length}
            filteredCount={filteredStocks.length}
          />
        </aside>
        <div className="flex-1 min-w-0 w-full">
          <TabStockTable
            stocks={filteredStocks}
            columns={COLUMNS}
            defaultSort={{ key: "score", direction: "desc" }}
          />
        </div>
      </div>
    </div>
  );
}
