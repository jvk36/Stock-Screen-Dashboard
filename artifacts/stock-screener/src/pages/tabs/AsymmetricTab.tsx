import { useState, useMemo } from "react";
import type { Stock, ScoredStock } from "@/lib/screener";
import { filterAsymmetric, defaultAsymmetricFilters } from "@/lib/screener";
import { StrategyBanner } from "@/components/StrategyBanner";
import { TabFilterPanel, type FilterControl } from "@/components/TabFilterPanel";
import { TabStockTable, type ColumnDef } from "@/components/TabStockTable";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

const BANNER =
  "The ideal opportunity is when you\u2019re getting paid to wait while an option-like payoff is embedded in the stock price. \
Asymmetric Opportunities targets stocks that have sold off sharply from their highs, trade at reasonable valuations, \
and carry catalysts \u2014 analyst conviction and/or elevated short interest setting up a squeeze.";

const analystLabel = (r: number) => {
  if (r === 0) return "N/A";
  if (r <= 1.5) return "Strong Buy";
  if (r <= 2.5) return "Buy";
  if (r <= 3.5) return "Hold";
  if (r <= 4.5) return "Sell";
  return "Strong Sell";
};

const analystColor = (r: number) => {
  if (r === 0) return "text-muted-foreground";
  if (r <= 2.0) return "text-green-400 font-semibold";
  if (r <= 2.5) return "text-green-400";
  if (r <= 3.5) return "text-foreground";
  return "text-red-400";
};

const FILTER_CONTROLS: FilterControl[] = [
  { type: "slider-min", field: "pctFromHighMin", label: "% Below 52wk High (Min)", min: 0, max: 80, step: 5, format: (v) => `${v}%` },
  { type: "slider-max", field: "evToEbitdaMax", label: "EV / EBITDA (Max)", min: 5, max: 50, step: 1, format: (v) => `${v}x` },
  { type: "slider-max", field: "trailingPEMax", label: "Trailing P/E (Max)", min: 5, max: 60, step: 1, format: (v) => `${v}x` },
  {
    type: "slider-max", field: "analystRatingMax", label: "Analyst Rating (Max)", min: 1, max: 5, step: 0.5,
    format: (v) => `${v.toFixed(1)} (${analystLabel(v)})`,
  },
  { type: "slider-min", field: "shortFloatMin", label: "Short Float % (Min)", min: 0, max: 30, step: 1, format: (v) => `${v}%` },
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
    render: (s) => <span className="text-sm text-muted-foreground truncate max-w-[130px] block">{s.company}</span>,
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
    key: "pctFromHigh", header: "% fr. High", align: "right", sortKey: "pctFromHigh",
    render: (s) => (
      <span className={`font-mono text-sm font-semibold ${s.pctFromHigh >= 0.4 ? "text-red-400" : s.pctFromHigh >= 0.2 ? "text-amber-400" : s.pctFromHigh > 0 ? "text-foreground" : "text-muted-foreground"}`}>
        {s.pctFromHigh > 0 ? `${(s.pctFromHigh * 100).toFixed(1)}%` : "—"}
      </span>
    ),
  },
  {
    key: "trailingPE", header: "P/E", align: "right", sortKey: "trailingPE",
    render: (s) => (
      <span className={`font-mono text-sm ${s.trailingPE > 0 && s.trailingPE <= 15 ? "text-green-400" : s.trailingPE > 25 ? "text-red-400" : "text-foreground"}`}>
        {s.trailingPE > 0 ? `${s.trailingPE.toFixed(1)}x` : "—"}
      </span>
    ),
  },
  {
    key: "evToEbitda", header: "EV/EBITDA", align: "right", sortKey: "evToEbitda",
    render: (s) => (
      <span className={`font-mono text-sm ${s.evToEbitda > 0 && s.evToEbitda <= 10 ? "text-green-400" : s.evToEbitda > 20 ? "text-red-400" : "text-foreground"}`}>
        {s.evToEbitda > 0 ? `${s.evToEbitda.toFixed(1)}x` : "—"}
      </span>
    ),
  },
  {
    key: "analystRating", header: "Analyst", align: "right", sortKey: "analystRating",
    render: (s) => (
      <span className={`font-mono text-sm ${analystColor(s.analystRating)}`}>
        {s.analystRating > 0 ? analystLabel(s.analystRating) : "—"}
      </span>
    ),
  },
  {
    key: "shortPercentOfFloat", header: "Short %", align: "right", sortKey: "shortPercentOfFloat",
    render: (s) => (
      <span className={`font-mono text-sm ${s.shortPercentOfFloat >= 0.15 ? "text-amber-400 font-semibold" : s.shortPercentOfFloat > 0 ? "text-foreground" : "text-muted-foreground"}`}>
        {s.shortPercentOfFloat > 0 ? `${(s.shortPercentOfFloat * 100).toFixed(1)}%` : "—"}
      </span>
    ),
  },
  {
    key: "catalyst", header: "Catalyst", align: "center",
    render: (s) => {
      const hasBuy = s.analystRating > 0 && s.analystRating <= 2.5;
      const hasShort = s.shortPercentOfFloat * 100 >= 10;
      if (hasBuy && hasShort)
        return <Badge className="bg-green-500/15 text-green-400 border-green-500/30 text-[10px] px-2">Dual Signal</Badge>;
      if (hasBuy)
        return <Badge className="bg-blue-500/15 text-blue-400 border-blue-500/30 text-[10px] px-2">Buy Rated</Badge>;
      if (hasShort)
        return <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 text-[10px] px-2">High Short</Badge>;
      return <Badge className="bg-muted/20 text-muted-foreground border-border text-[10px] px-2">Value Only</Badge>;
    },
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

export function AsymmetricTab({ stocks }: { stocks: Stock[] }) {
  const [filters, setFilters] = useState(defaultAsymmetricFilters);
  const filteredStocks: ScoredStock[] = useMemo(
    () => filterAsymmetric(stocks, filters),
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
            setFilters={(f) => setFilters(f as typeof defaultAsymmetricFilters)}
            defaultFilters={defaultAsymmetricFilters as unknown as Record<string, unknown>}
            totalStocks={stocks.length}
            filteredCount={filteredStocks.length}
          />
        </aside>
        <div className="flex-1 min-w-0 w-full">
          <TabStockTable
            stocks={filteredStocks}
            columns={COLUMNS}
            defaultSort={{ key: "pctFromHigh", direction: "desc" }}
          />
        </div>
      </div>
    </div>
  );
}
