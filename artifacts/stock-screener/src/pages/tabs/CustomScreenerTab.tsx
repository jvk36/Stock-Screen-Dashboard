import { useState, useMemo } from "react";
import type { Stock, ScoredStock, StrategyStocks } from "@/lib/screener";
import {
  filterCustomScreener,
  defaultCustomScreenerFilters,
  ALL_MARKET_CAPS,
  ALL_SECTORS,
} from "@/lib/screener";
import type { CustomScreenerFilters, CustomScreenerDomain } from "@/lib/screener";
import { StrategyBanner } from "@/components/StrategyBanner";
import { TabStockTable, type ColumnDef } from "@/components/TabStockTable";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const BANNER =
  "Start from a blank canvas. Enable the dimensions that matter to you — valuation, growth, profitability, \
financial health, momentum, or market signals — and build a filter profile that precisely matches your investment style. \
All filters start fully open; tighten only what you care about.";

// ─── Domain Definitions ───────────────────────────────────────────────────────

type SliderDef =
  | { type: "min"; field: keyof CustomScreenerFilters; label: string; hint: string; min: number; max: number; step: number; format: (v: number) => string }
  | { type: "max"; field: keyof CustomScreenerFilters; label: string; hint: string; min: number; max: number; step: number; format: (v: number) => string };

interface DomainDef {
  id: CustomScreenerDomain;
  number: string;
  title: string;
  subtitle: string;
  color: string;
  sliders: SliderDef[];
}

const DOMAINS: DomainDef[] = [
  {
    id: "valuation",
    number: "1",
    title: "Valuation",
    subtitle: "Am I paying a fair price?",
    color: "text-blue-400",
    sliders: [
      { type: "max", field: "trailingPEMax",    label: "P/E (Trailing)",  hint: "Value <10x · S&P ~22x · Growth >40x",      min: 0, max: 200, step: 5,    format: (v) => v >= 200 ? "No limit" : `${v}x` },
      { type: "max", field: "forwardPEMax",     label: "Forward P/E",     hint: "Value <12x · Fair 15–25x · Rich >35x",     min: 0, max: 100, step: 5,    format: (v) => v >= 100 ? "No limit" : `${v}x` },
      { type: "max", field: "pegMax",           label: "PEG Ratio",       hint: "GARP zone <1.5 · Expensive >3",            min: 0, max: 5,   step: 0.1,  format: (v) => v >= 5 ? "No limit" : `${v.toFixed(1)}x` },
      { type: "max", field: "pbMax",            label: "Price / Book",    hint: "Asset-heavy value <1 · Capital-light 3–8x", min: 0, max: 10,  step: 0.5,  format: (v) => v >= 10 ? "No limit" : `${v.toFixed(1)}x` },
      { type: "max", field: "evToEbitdaMax",    label: "EV / EBITDA",     hint: "Value <8x · Fair 8–15x · Rich >20x",       min: 0, max: 50,  step: 1,    format: (v) => v >= 50 ? "No limit" : `${v}x` },
      { type: "min", field: "dividendYieldMin", label: "Dividend Yield",  hint: "Income focus >3% · Growers 1–3%",          min: 0, max: 10,  step: 0.25, format: (v) => v <= 0 ? "No min" : `${v.toFixed(2)}%` },
    ],
  },
  {
    id: "growth",
    number: "2",
    title: "Growth",
    subtitle: "How fast is this business growing?",
    color: "text-green-400",
    sliders: [
      { type: "min", field: "epsGrowth5yrMin",      label: "EPS CAGR 5yr",      hint: "GARP floor 15% · Hypergrowth >30%",  min: -100, max: 80, step: 5, format: (v) => v <= -100 ? "No min" : `${v >= 0 ? "+" : ""}${v}%` },
      { type: "min", field: "revenueGrowth3yrMin",  label: "Revenue CAGR 3yr",  hint: "Healthy >10% · Hyper >30%",          min: -100, max: 80, step: 5, format: (v) => v <= -100 ? "No min" : `${v >= 0 ? "+" : ""}${v}%` },
    ],
  },
  {
    id: "profitability",
    number: "3",
    title: "Profitability & Quality",
    subtitle: "Is the business fundamentally excellent?",
    color: "text-purple-400",
    sliders: [
      { type: "min", field: "roeMin",              label: "Return on Equity",   hint: "Good >15% · Exceptional >30%",       min: -100, max: 100, step: 5, format: (v) => v <= -100 ? "No min" : `${v}%` },
      { type: "min", field: "grossMarginMin",      label: "Gross Margin",       hint: "SaaS/Pharma >70% · Retail 25–40%",   min: 0,    max: 100, step: 5, format: (v) => `${v}%` },
      { type: "min", field: "operatingMarginMin",  label: "Operating Margin",   hint: "Strong >20% · Mediocre <10%",        min: -50,  max: 50,  step: 5, format: (v) => v <= -50 ? "No min" : `${v}%` },
      { type: "min", field: "netMarginMin",        label: "Net Margin",         hint: "Strong >15% · Thin <5%",             min: -50,  max: 40,  step: 2, format: (v) => v <= -50 ? "No min" : `${v}%` },
      { type: "min", field: "fcfYieldMin",         label: "FCF Yield",          hint: "Value >5% · Good 2–5%",              min: -20,  max: 20,  step: 1, format: (v) => v <= -20 ? "No min" : `${v}%` },
    ],
  },
  {
    id: "health",
    number: "4",
    title: "Financial Health",
    subtitle: "Can it survive and compound?",
    color: "text-amber-400",
    sliders: [
      { type: "max", field: "debtEqMax",       label: "Debt / Equity",  hint: "Conservative <1x · Investment grade <3x",  min: 0,   max: 20,  step: 0.5, format: (v) => v >= 20 ? "No limit" : `${v.toFixed(1)}x` },
      { type: "min", field: "currentRatioMin", label: "Current Ratio",  hint: "Healthy >1.5 · Distressed <1",             min: 0,   max: 5,   step: 0.25, format: (v) => v <= 0 ? "No min" : `${v.toFixed(2)}x` },
      { type: "max", field: "payoutRatioMax",  label: "Payout Ratio",   hint: "Sustainable <60% · REITs can exceed 100%", min: 0,   max: 200, step: 10,  format: (v) => v >= 200 ? "No limit" : `${v}%` },
    ],
  },
  {
    id: "momentum",
    number: "5",
    title: "Momentum & Technicals",
    subtitle: "What is the market doing with this stock?",
    color: "text-cyan-400",
    sliders: [
      { type: "min", field: "return52wMin",      label: "52-Week Return",       hint: "Strong >30% · Recovering 0–30%",     min: -100, max: 200, step: 10, format: (v) => v <= -100 ? "No min" : `${v >= 0 ? "+" : ""}${v}%` },
      { type: "min", field: "return3mMin",       label: "3-Month Return",       hint: "Momentum >10% · Recovering 0–10%",   min: -100, max: 100, step: 5,  format: (v) => v <= -100 ? "No min" : `${v >= 0 ? "+" : ""}${v}%` },
      { type: "min", field: "return1mMin",       label: "1-Month Return",       hint: "Trending >5%",                       min: -20,  max: 50,  step: 2,  format: (v) => v <= -20 ? "No min" : `${v >= 0 ? "+" : ""}${v}%` },
      { type: "min", field: "returnVsSP500Min",  label: "vs. S&P 500",          hint: "Outperforming >0% vs index",         min: -100, max: 100, step: 5,  format: (v) => v <= -100 ? "No min" : `${v >= 0 ? "+" : ""}${v}%` },
      { type: "max", field: "pctFromHighMax",    label: "% Below 52wk High",    hint: "Near highs <5% · Value >40% off",    min: 0,    max: 100, step: 5,  format: (v) => v >= 100 ? "No limit" : `${v}%` },
      { type: "min", field: "volumeTrendMin",    label: "Volume Trend",         hint: "Breakout signal >1.5x avg",          min: 0,    max: 3,   step: 0.1, format: (v) => v <= 0 ? "No min" : `${v.toFixed(1)}x avg` },
    ],
  },
  {
    id: "signals",
    number: "6",
    title: "Special Signals",
    subtitle: "Confirming signals beyond the numbers",
    color: "text-rose-400",
    sliders: [
      { type: "max", field: "shortFloatMax",    label: "Short Interest % Float", hint: "Risk signal >10% · Squeeze setup >20%", min: 0, max: 60, step: 1, format: (v) => v >= 60 ? "No limit" : `${v}%` },
      { type: "max", field: "analystRatingMax", label: "Analyst Rating",         hint: "1=Strong Buy · 3=Hold · 5=Strong Sell", min: 1, max: 5,  step: 0.5, format: (v) => {
          if (v >= 5) return "No limit";
          if (v <= 1.5) return "Buy or better";
          if (v <= 2.5) return "Buy or better";
          if (v <= 3.5) return "Hold or better";
          return "Sell or better";
        }
      },
    ],
  },
];

// ─── Table Columns ────────────────────────────────────────────────────────────

const pct = (v: number, good = 0.1, great = 0.3) =>
  v >= great ? "text-green-400 font-semibold" : v >= good ? "text-green-400" : v < 0 ? "text-red-400" : "text-muted-foreground";

const COLUMNS: ColumnDef[] = [
  {
    key: "ticker", header: "Ticker", sortKey: "ticker",
    render: (s) => <span className="font-bold font-mono text-foreground">{s.ticker}</span>,
  },
  {
    key: "company", header: "Company", sortKey: "company",
    render: (s) => <span className="text-sm text-muted-foreground truncate max-w-[130px] block">{s.company}</span>,
  },
  {
    key: "sector", header: "Sector",
    render: (s) => <Badge variant="outline" className="text-[10px] font-normal whitespace-nowrap bg-muted/20">{s.sector}</Badge>,
  },
  {
    key: "marketCap", header: "Cap", sortKey: "marketCap",
    render: (s) => <span className="text-xs text-muted-foreground">{s.marketCap}</span>,
  },
  {
    key: "price", header: "Price", align: "right", sortKey: "price",
    render: (s) => <span className="font-mono text-sm text-foreground">{s.price > 0 ? `$${s.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}</span>,
  },
  // Valuation
  {
    key: "trailingPE", header: "P/E", align: "right", sortKey: "trailingPE",
    render: (s) => <span className="font-mono text-sm text-muted-foreground">{s.trailingPE > 0 ? s.trailingPE.toFixed(1) : "—"}</span>,
  },
  {
    key: "forwardPE", header: "Fwd P/E", align: "right", sortKey: "forwardPE",
    render: (s) => <span className="font-mono text-sm text-muted-foreground">{s.forwardPE > 0 ? s.forwardPE.toFixed(1) : "—"}</span>,
  },
  {
    key: "pegRatio", header: "PEG", align: "right", sortKey: "pegRatio",
    render: (s) => <span className={`font-mono text-sm ${s.pegRatio > 0 && s.pegRatio <= 1.5 ? "text-green-400" : s.pegRatio > 3 ? "text-amber-400" : "text-muted-foreground"}`}>{s.pegRatio > 0 ? s.pegRatio.toFixed(2) : "—"}</span>,
  },
  // Growth
  {
    key: "epsGrowth5yr", header: "EPS Gr 5yr", align: "right", sortKey: "epsGrowth5yr",
    render: (s) => {
      const v = s.epsGrowth5yr;
      return <span className={`font-mono text-sm ${pct(v, 0.05, 0.15)}`}>{v !== 0 ? `${v > 0 ? "+" : ""}${(v * 100).toFixed(1)}%` : "—"}</span>;
    },
  },
  {
    key: "revenueGrowth3yr", header: "Rev Gr 3yr", align: "right", sortKey: "revenueGrowth3yr",
    render: (s) => {
      const v = s.revenueGrowth3yr;
      return <span className={`font-mono text-sm ${pct(v, 0.05, 0.15)}`}>{v !== 0 ? `${v > 0 ? "+" : ""}${(v * 100).toFixed(1)}%` : "—"}</span>;
    },
  },
  // Profitability
  {
    key: "roe", header: "ROE", align: "right", sortKey: "roe",
    render: (s) => {
      const v = s.roe;
      return <span className={`font-mono text-sm ${pct(v, 0.10, 0.20)}`}>{v !== 0 ? `${(v * 100).toFixed(1)}%` : "—"}</span>;
    },
  },
  {
    key: "grossMargin", header: "Gross Mgn", align: "right", sortKey: "grossMargin",
    render: (s) => {
      const v = s.grossMargin;
      return <span className={`font-mono text-sm ${pct(v, 0.30, 0.60)}`}>{v > 0 ? `${(v * 100).toFixed(1)}%` : "—"}</span>;
    },
  },
  {
    key: "netMargin", header: "Net Mgn", align: "right", sortKey: "netMargin",
    render: (s) => {
      const v = s.netMargin;
      return <span className={`font-mono text-sm ${v < 0 ? "text-red-400" : pct(v, 0.05, 0.15)}`}>{v !== 0 ? `${(v * 100).toFixed(1)}%` : "—"}</span>;
    },
  },
  // Health
  {
    key: "debtToEquity", header: "D/E", align: "right", sortKey: "debtToEquity",
    render: (s) => <span className={`font-mono text-sm ${s.debtToEquity > 3 ? "text-amber-400" : s.debtToEquity > 0 ? "text-foreground" : "text-muted-foreground"}`}>{s.debtToEquity > 0 ? `${s.debtToEquity.toFixed(1)}x` : "—"}</span>,
  },
  {
    key: "currentRatio", header: "Cur Ratio", align: "right", sortKey: "currentRatio",
    render: (s) => <span className={`font-mono text-sm ${s.currentRatio >= 1.5 ? "text-green-400" : s.currentRatio > 0 ? "text-amber-400" : "text-muted-foreground"}`}>{s.currentRatio > 0 ? `${s.currentRatio.toFixed(2)}x` : "—"}</span>,
  },
  // Momentum
  {
    key: "return1m", header: "1m Ret", align: "right", sortKey: "return1m",
    render: (s) => {
      const v = s.return1m;
      return <span className={`font-mono text-sm ${v > 0.05 ? "text-green-400 font-semibold" : v > 0 ? "text-green-400" : "text-red-400"}`}>{v !== 0 ? `${v > 0 ? "+" : ""}${(v * 100).toFixed(1)}%` : "—"}</span>;
    },
  },
  {
    key: "return3m", header: "3m Ret", align: "right", sortKey: "return3m",
    render: (s) => {
      const v = s.return3m;
      return <span className={`font-mono text-sm ${v > 0.1 ? "text-green-400 font-semibold" : v > 0 ? "text-green-400" : "text-red-400"}`}>{v !== 0 ? `${v > 0 ? "+" : ""}${(v * 100).toFixed(1)}%` : "—"}</span>;
    },
  },
  {
    key: "return52w", header: "52w Ret", align: "right", sortKey: "return52w",
    render: (s) => {
      const v = s.return52w;
      return <span className={`font-mono text-sm ${v > 0.2 ? "text-green-400 font-semibold" : v > 0 ? "text-green-400" : "text-red-400"}`}>{v !== 0 ? `${v > 0 ? "+" : ""}${(v * 100).toFixed(1)}%` : "—"}</span>;
    },
  },
  // Income & Signals
  {
    key: "dividendYield", header: "Div Yld", align: "right", sortKey: "dividendYield",
    render: (s) => <span className="font-mono text-sm text-muted-foreground">{s.dividendYield > 0 ? `${(s.dividendYield * 100).toFixed(2)}%` : "—"}</span>,
  },
  {
    key: "shortPercentOfFloat", header: "Short%", align: "right", sortKey: "shortPercentOfFloat",
    render: (s) => <span className={`font-mono text-sm ${s.shortPercentOfFloat > 0.15 ? "text-amber-400" : s.shortPercentOfFloat > 0.1 ? "text-foreground" : "text-muted-foreground"}`}>{s.shortPercentOfFloat > 0 ? `${(s.shortPercentOfFloat * 100).toFixed(1)}%` : "—"}</span>,
  },
  {
    key: "analystRating", header: "Analyst", align: "right", sortKey: "analystRating",
    render: (s) => {
      if (!s.analystRating) return <span className="text-muted-foreground text-sm">—</span>;
      const r = s.analystRating;
      const label = r <= 1.5 ? "Strong Buy" : r <= 2.5 ? "Buy" : r <= 3.5 ? "Hold" : r <= 4.5 ? "Sell" : "Strong Sell";
      const color = r <= 2 ? "text-green-400" : r <= 3 ? "text-foreground" : "text-red-400";
      return <span className={`text-xs font-medium ${color}`}>{label}</span>;
    },
  },
];

// ─── Custom Filter Panel ──────────────────────────────────────────────────────

function SliderRow({
  def,
  value,
  onChange,
}: {
  def: SliderDef;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <div>
          <Label className="text-xs text-foreground">{def.label}</Label>
          <p className="text-[10px] text-muted-foreground/60 leading-tight mt-0.5">{def.hint}</p>
        </div>
        <span className="text-xs font-medium text-foreground ml-2 shrink-0">
          {def.type === "min" ? "≥ " : "≤ "}{def.format(value)}
        </span>
      </div>
      <Slider
        value={[value]}
        min={def.min}
        max={def.max}
        step={def.step}
        onValueChange={([v]) => onChange(v)}
      />
    </div>
  );
}

function CustomFilterPanel({
  filters,
  setFilters,
  totalStocks,
  filteredCount,
}: {
  filters: CustomScreenerFilters;
  setFilters: (f: CustomScreenerFilters) => void;
  totalStocks: number;
  filteredCount: number;
}) {
  const toggleDomain = (id: CustomScreenerDomain) => {
    setFilters({
      ...filters,
      enabledDomains: filters.enabledDomains.includes(id)
        ? filters.enabledDomains.filter((d) => d !== id)
        : [...filters.enabledDomains, id],
    });
  };

  const updateSlider = (field: keyof CustomScreenerFilters, value: number) => {
    setFilters({ ...filters, [field]: value });
  };

  const toggleMarketCap = (mc: string) => {
    const next = filters.marketCaps.includes(mc)
      ? filters.marketCaps.filter((c) => c !== mc)
      : [...filters.marketCaps, mc];
    setFilters({ ...filters, marketCaps: next });
  };

  const toggleSector = (sector: string) => {
    const next = filters.sectors.includes(sector)
      ? filters.sectors.filter((s) => s !== sector)
      : [...filters.sectors, sector];
    setFilters({ ...filters, sectors: next });
  };

  const allSectors = filters.sectors.length === ALL_SECTORS.length;

  return (
    <div className="w-full flex flex-col gap-4" data-testid="custom-filter-panel">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Filters</h2>
        <Button
          variant="link"
          onClick={() => setFilters(defaultCustomScreenerFilters)}
          className="text-muted-foreground hover:text-primary px-0 h-auto"
        >
          Reset
        </Button>
      </div>

      <div className="text-sm text-muted-foreground pb-2 border-b border-border">
        Showing {filteredCount} of {totalStocks} stocks
      </div>

      {/* Domain Cards */}
      <div className="space-y-2">
        {DOMAINS.map((domain) => {
          const enabled = filters.enabledDomains.includes(domain.id);
          return (
            <div
              key={domain.id}
              className={[
                "rounded-lg border transition-all duration-150",
                enabled
                  ? "border-primary/30 bg-primary/5"
                  : "border-border bg-card/30",
              ].join(" ")}
            >
              {/* Toggle Row */}
              <div
                className="flex items-center gap-3 px-3 py-2.5 cursor-pointer select-none"
                onClick={() => toggleDomain(domain.id)}
              >
                <Checkbox
                  checked={enabled}
                  onCheckedChange={() => toggleDomain(domain.id)}
                  className="pointer-events-none shrink-0"
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-xs font-bold ${domain.color}`}>{domain.number}</span>
                    <span className={`text-sm font-medium ${enabled ? "text-foreground" : "text-muted-foreground"}`}>
                      {domain.title}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground/60 leading-tight">{domain.subtitle}</p>
                </div>
              </div>

              {/* Sliders — shown only when enabled */}
              {enabled && (
                <div className="px-3 pb-3 space-y-4 border-t border-border/40">
                  <div className="h-2" />
                  {domain.sliders.map((slider) => (
                    <SliderRow
                      key={String(slider.field)}
                      def={slider}
                      value={filters[slider.field] as number}
                      onChange={(v) => updateSlider(slider.field, v)}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Market Cap */}
      <div className="space-y-2 pt-2 border-t border-border">
        <Label className="text-sm">Market Cap</Label>
        <div className="space-y-1.5">
          {ALL_MARKET_CAPS.map((mc) => (
            <div key={mc} className="flex items-center gap-2">
              <Checkbox
                id={`cust-mc-${mc}`}
                checked={filters.marketCaps.includes(mc)}
                onCheckedChange={() => toggleMarketCap(mc)}
              />
              <label htmlFor={`cust-mc-${mc}`} className="text-sm text-muted-foreground cursor-pointer">
                {mc}
              </label>
            </div>
          ))}
        </div>
      </div>

      {/* Sector */}
      <div className="space-y-2 border-t border-border pt-2">
        <div className="flex items-center justify-between">
          <Label className="text-sm">Sector</Label>
          <Button
            variant="link"
            className="text-xs h-auto p-0 text-muted-foreground"
            onClick={() =>
              setFilters({
                ...filters,
                sectors: allSectors ? [] : [...ALL_SECTORS],
              })
            }
          >
            {allSectors ? "Deselect All" : "Select All"}
          </Button>
        </div>
        <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
          {ALL_SECTORS.map((sector) => (
            <div key={sector} className="flex items-center gap-2">
              <Checkbox
                id={`cust-sector-${sector}`}
                checked={filters.sectors.includes(sector)}
                onCheckedChange={() => toggleSector(sector)}
              />
              <label htmlFor={`cust-sector-${sector}`} className="text-sm text-muted-foreground cursor-pointer leading-snug">
                {sector}
              </label>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main Tab ─────────────────────────────────────────────────────────────────

export function CustomScreenerTab({ strategies }: { strategies: StrategyStocks }) {
  const [filters, setFilters] = useState<CustomScreenerFilters>(defaultCustomScreenerFilters);

  const allStocks = useMemo(() => {
    const seen = new Set<string>();
    const out: Stock[] = [];
    for (const key of Object.keys(strategies) as (keyof StrategyStocks)[]) {
      for (const s of strategies[key]) {
        if (!seen.has((s as Stock).ticker)) {
          seen.add((s as Stock).ticker);
          out.push(s as Stock);
        }
      }
    }
    return out.sort((a, b) => a.ticker.localeCompare(b.ticker));
  }, [strategies]);

  const filteredStocks = useMemo(
    () => filterCustomScreener(allStocks, filters),
    [allStocks, filters]
  );

  const scoredStocks: ScoredStock[] = useMemo(
    () => filteredStocks.map((s) => ({ ...s, score: 0 })),
    [filteredStocks]
  );

  return (
    <div className="flex flex-col gap-6">
      <StrategyBanner quote={BANNER} />
      <div className="flex flex-col lg:flex-row gap-8 items-start">
        <aside className="w-full lg:w-80 shrink-0">
          <CustomFilterPanel
            filters={filters}
            setFilters={setFilters}
            totalStocks={allStocks.length}
            filteredCount={filteredStocks.length}
          />
        </aside>
        <div className="flex-1 min-w-0 w-full">
          <TabStockTable
            stocks={scoredStocks}
            columns={COLUMNS}
            defaultSort={{ key: "ticker", direction: "asc" }}
          />
        </div>
      </div>
    </div>
  );
}
