import { useState, useMemo } from "react";
import type { Stock, ScoredStock } from "@/lib/screener";
import { filterDeepValue, defaultDeepValueFilters } from "@/lib/screener";
import { StrategyBanner } from "@/components/StrategyBanner";
import { PrimaryDriverBadge } from "@/components/PrimaryDriverBadge";
import { TabFilterPanel, type FilterControl } from "@/components/TabFilterPanel";
import { TabStockTable, type ColumnDef } from "@/components/TabStockTable";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

const BANNER =
  "The best business to own is one that over an extended period can employ large amounts of incremental capital at very high rates of return. \
The second-best business is one that requires no capital. \u2014 Warren Buffett. \
Deep Value identifies stocks priced below intrinsic worth: low multiples, strong cash flow, and a margin of safety baked in.";

const FILTER_CONTROLS: FilterControl[] = [
  { type: "slider-max", field: "trailingPEMax", label: "Trailing P/E (Max)", min: 5, max: 200, step: 5, format: (v) => v >= 200 ? "No limit" : `${v}x` },
  { type: "slider-max", field: "pbMax", label: "Price / Book (Max)", min: 0.5, max: 20, step: 0.5, format: (v) => v >= 20 ? "No limit" : `${v.toFixed(1)}x` },
  { type: "slider-max", field: "evToEbitdaMax", label: "EV / EBITDA (Max)", min: 2, max: 100, step: 2, format: (v) => v >= 100 ? "No limit" : `${v}x` },
  { type: "slider-min", field: "fcfYieldMin", label: "FCF Yield (Min)", min: -20, max: 15, step: 0.5, format: (v) => v <= -20 ? "No min" : `${v.toFixed(1)}%` },
  { type: "slider-min", field: "netMarginMin", label: "Net Margin (Min)", min: -50, max: 30, step: 1, format: (v) => v <= -50 ? "No min" : `${v}%` },
  { type: "slider-max", field: "debtEqMax", label: "Debt / Equity (Max)", min: 0, max: 20, step: 1, format: (v) => v >= 20 ? "No limit" : `${v.toFixed(0)}x` },
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
    key: "trailingPE", header: "P/E", align: "right", sortKey: "trailingPE",
    render: (s) => (
      <span className={`font-mono text-sm ${s.trailingPE > 0 && s.trailingPE <= 15 ? "text-green-400 font-semibold" : s.trailingPE > 25 ? "text-red-400" : "text-foreground"}`}>
        {s.trailingPE > 0 ? `${s.trailingPE.toFixed(1)}x` : "—"}
      </span>
    ),
  },
  {
    key: "priceToBook", header: "P/B", align: "right", sortKey: "priceToBook",
    render: (s) => (
      <span className={`font-mono text-sm ${s.priceToBook > 0 && s.priceToBook <= 2 ? "text-green-400 font-semibold" : s.priceToBook > 5 ? "text-red-400" : "text-foreground"}`}>
        {s.priceToBook > 0 ? `${s.priceToBook.toFixed(2)}x` : "—"}
      </span>
    ),
  },
  {
    key: "evToEbitda", header: "EV/EBITDA", align: "right", sortKey: "evToEbitda",
    render: (s) => (
      <span className={`font-mono text-sm ${s.evToEbitda > 0 && s.evToEbitda <= 10 ? "text-green-400 font-semibold" : s.evToEbitda > 20 ? "text-red-400" : "text-foreground"}`}>
        {s.evToEbitda > 0 ? `${s.evToEbitda.toFixed(1)}x` : "—"}
      </span>
    ),
  },
  {
    key: "fcfYield", header: "FCF Yield", align: "right", sortKey: "fcfYield",
    render: (s) => (
      <span className={`font-mono text-sm ${s.fcfYield >= 0.05 ? "text-green-400 font-semibold" : s.fcfYield > 0 ? "text-foreground" : "text-muted-foreground"}`}>
        {s.fcfYield > 0 ? `${(s.fcfYield * 100).toFixed(1)}%` : "—"}
      </span>
    ),
  },
  {
    key: "netMargin", header: "Net Margin", align: "right", sortKey: "netMargin",
    render: (s) => (
      <span className={`font-mono text-sm ${s.netMargin >= 0.2 ? "text-green-400" : s.netMargin > 0 ? "text-foreground" : "text-muted-foreground"}`}>
        {s.netMargin !== 0 ? `${(s.netMargin * 100).toFixed(1)}%` : "—"}
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

export function DeepValueTab({ stocks }: { stocks: Stock[] }) {
  const [filters, setFilters] = useState(defaultDeepValueFilters);
  const filteredStocks: ScoredStock[] = useMemo(
    () => filterDeepValue(stocks, filters),
    [stocks, filters]
  );

  return (
    <div className="flex flex-col gap-6">
      <StrategyBanner quote={BANNER} />
      <PrimaryDriverBadge
        driver="Price-to-Book"
        description="Lowest P/B first — stocks trading most below book value"
      />
      <div className="flex flex-col lg:flex-row gap-8 items-start">
        <aside className="w-full lg:w-72 shrink-0">
          <TabFilterPanel
            controls={FILTER_CONTROLS}
            filters={filters as unknown as Record<string, unknown>}
            setFilters={(f) => setFilters(f as typeof defaultDeepValueFilters)}
            defaultFilters={defaultDeepValueFilters as unknown as Record<string, unknown>}
            totalStocks={stocks.length}
            filteredCount={filteredStocks.length}
          />
        </aside>
        <div className="flex-1 min-w-0 w-full">
          <TabStockTable
            stocks={filteredStocks}
            columns={COLUMNS}
            defaultSort={{ key: "priceToBook", direction: "asc" }}
          />
        </div>
      </div>
    </div>
  );
}
