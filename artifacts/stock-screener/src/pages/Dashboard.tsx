import { useState, useMemo } from "react";
import { FilterPanel } from "@/components/FilterPanel";
import { StockTable } from "@/components/StockTable";
import { StrategyBanner } from "@/components/StrategyBanner";
import { defaultFilters, filterStocks } from "@/lib/screener";
import type { Stock } from "@/lib/screener";
import { useGetStocks, getGetStocksQueryKey } from "@workspace/api-client-react";
import { mockStocks } from "@/data/mockStocks";
import { DeepValueTab } from "@/pages/tabs/DeepValueTab";
import { MomentumTab } from "@/pages/tabs/MomentumTab";
import { QualityTab } from "@/pages/tabs/QualityTab";
import { DividendTab } from "@/pages/tabs/DividendTab";
import { AsymmetricTab } from "@/pages/tabs/AsymmetricTab";
import { TrendingTab } from "@/pages/tabs/TrendingTab";

type DataMode = "live" | "demo-fallback" | "loading";

type TabId = "garp" | "deep-value" | "momentum" | "quality" | "dividend" | "asymmetric" | "trending";

const TABS: { id: TabId; label: string }[] = [
  { id: "garp",       label: "GARP" },
  { id: "deep-value", label: "Deep Value" },
  { id: "momentum",   label: "Momentum" },
  { id: "quality",    label: "Quality" },
  { id: "dividend",   label: "Dividend" },
  { id: "asymmetric", label: "Asymmetric" },
  { id: "trending",   label: "Trending" },
];

const GARP_BANNER =
  "At ~16% annual EPS growth, a stock compounds to 100\u00d7 in ~30 years \u2014 at 20%, it takes just 25. \
The GARP screener surfaces companies on this trajectory \u2014 growing fast enough to be transformative, \
priced reasonably enough to buy today.";

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<TabId>("garp");
  const [filters, setFilters] = useState(defaultFilters);

  const { data, isLoading, isError, error } = useGetStocks({
    query: {
      queryKey: getGetStocksQueryKey(),
      staleTime: 5 * 60 * 1000,
      retry: false,
    },
  });

  const { allStocks, dataMode, errorKind } = useMemo(() => {
    if (isLoading) {
      return { allStocks: [] as Stock[], dataMode: "loading" as DataMode, errorKind: null };
    }
    if (data !== undefined) {
      return {
        allStocks: (data.stocks ?? []) as Stock[],
        dataMode: "live" as DataMode,
        errorKind: null,
      };
    }
    const status = (error as { status?: number } | null)?.status;
    const kind =
      status === 503 ? "unavailable"
      : status === 500 ? "server-error"
      : isError ? "unknown"
      : "no-data";
    return { allStocks: mockStocks, dataMode: "demo-fallback" as DataMode, errorKind: kind };
  }, [isLoading, data, isError, error]);

  const filteredStocks = useMemo(() => filterStocks(allStocks, filters), [allStocks, filters]);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="border-b border-border bg-card sticky top-0 z-10">
        <div className="px-6 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-primary inline-block" />
            Stock Screener
          </h1>
          <div className="flex items-center gap-2 text-xs">
            {dataMode === "loading" && (
              <span className="text-muted-foreground flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse inline-block" />
                Checking for live data…
              </span>
            )}
            {dataMode === "live" && (
              <span className="text-muted-foreground flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                Live data
                {data?.cachedAt && (
                  <span className="text-muted-foreground/60">
                    · refreshed {new Date(data.cachedAt).toLocaleDateString()}
                  </span>
                )}
              </span>
            )}
            {dataMode === "demo-fallback" && errorKind === "unavailable" && (
              <span className="text-muted-foreground flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-orange-400 inline-block" />
                Demo data · API quota exhausted or not configured
              </span>
            )}
            {dataMode === "demo-fallback" && errorKind !== "unavailable" && (
              <span className="text-muted-foreground flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-orange-400 inline-block" />
                Demo data · live data unavailable
              </span>
            )}
          </div>
        </div>

        {/* ── Tab bar ─────────────────────────────────────────────────── */}
        <div className="px-6 flex gap-1 text-sm border-t border-border/50 overflow-x-auto scrollbar-none">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={[
                "py-3 px-3 font-medium whitespace-nowrap transition-colors border-b-2",
                activeTab === tab.id
                  ? "text-primary border-primary"
                  : "text-muted-foreground border-transparent hover:text-foreground",
              ].join(" ")}
              data-testid={`tab-${tab.id}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      {/* ── Main content ────────────────────────────────────────────────── */}
      <main className="flex-1 p-6 flex flex-col gap-6 max-w-[1600px] mx-auto w-full">
        {/* GARP */}
        {activeTab === "garp" && (
          <>
            <StrategyBanner quote={GARP_BANNER} />
            <div className="flex flex-col lg:flex-row gap-8 items-start">
              <aside className="w-full lg:w-72 shrink-0">
                <FilterPanel
                  filters={filters}
                  setFilters={setFilters}
                  defaultFilters={defaultFilters}
                  totalStocks={allStocks.length}
                  filteredCount={filteredStocks.length}
                />
              </aside>
              <div className="flex-1 min-w-0 w-full">
                <StockTable stocks={filteredStocks} />
              </div>
            </div>
          </>
        )}

        {activeTab === "deep-value"  && <DeepValueTab  stocks={allStocks} />}
        {activeTab === "momentum"    && <MomentumTab   stocks={allStocks} />}
        {activeTab === "quality"     && <QualityTab    stocks={allStocks} />}
        {activeTab === "dividend"    && <DividendTab   stocks={allStocks} />}
        {activeTab === "asymmetric"  && <AsymmetricTab stocks={allStocks} />}
        {activeTab === "trending"    && <TrendingTab   stocks={allStocks} />}
      </main>
    </div>
  );
}
