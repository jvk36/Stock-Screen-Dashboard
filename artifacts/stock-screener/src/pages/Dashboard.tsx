import { useState, useMemo } from "react";
import { FilterPanel } from "@/components/FilterPanel";
import { StockTable } from "@/components/StockTable";
import { defaultFilters, filterStocks } from "@/lib/screener";
import type { Stock } from "@/lib/screener";
import { Badge } from "@/components/ui/badge";
import { useGetStocks, getGetStocksQueryKey } from "@workspace/api-client-react";
import { mockStocks } from "@/data/mockStocks";

type DataMode = "live" | "demo-fallback" | "loading";

export default function Dashboard() {
  const [filters, setFilters] = useState(defaultFilters);

  const { data, isLoading, isError, error } = useGetStocks({
    query: {
      queryKey: getGetStocksQueryKey(),
      staleTime: 5 * 60 * 1000,
      // Never retry on error — 5xx errors (quota exhausted, misconfigured)
      // waste the daily API quota if retried automatically.
      retry: false,
    },
  });

  // Determine data mode and canonical stocks source.
  // A successful API response (data !== undefined) is always authoritative —
  // even if it returns an empty array. Mock fallback is only used when the
  // request fails outright (network error, 5xx, etc.).
  const { allStocks, dataMode, errorKind } = useMemo(() => {
    if (isLoading) {
      return { allStocks: [] as Stock[], dataMode: "loading" as DataMode, errorKind: null };
    }
    if (data !== undefined) {
      // Successful response — treat as live data even if stocks is empty
      return {
        allStocks: (data.stocks ?? []) as Stock[],
        dataMode: "live" as DataMode,
        errorKind: null,
      };
    }
    // Request failed — determine why and fall back to demo data
    const status = (error as { status?: number } | null)?.status;
    const kind =
      status === 503 ? "unavailable"
      : status === 500 ? "server-error"
      : isError ? "unknown"
      : "no-data";
    return { allStocks: mockStocks, dataMode: "demo-fallback" as DataMode, errorKind: kind };
  }, [isLoading, data, isError, error]);

  const filteredStocks = useMemo(() => {
    return filterStocks(allStocks, filters);
  }, [allStocks, filters]);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="border-b border-border bg-card">
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
        <div className="px-6 flex gap-6 text-sm border-t border-border/50">
          <div className="py-3 font-medium text-primary border-b-2 border-primary px-1">
            GARP
          </div>
          <div className="py-3 text-muted-foreground px-1 flex items-center gap-2 cursor-not-allowed">
            Value
            <Badge variant="secondary" className="text-[9px] h-4 px-1 py-0">Coming Soon</Badge>
          </div>
          <div className="py-3 text-muted-foreground px-1 flex items-center gap-2 cursor-not-allowed">
            Momentum
            <Badge variant="secondary" className="text-[9px] h-4 px-1 py-0">Coming Soon</Badge>
          </div>
          <div className="py-3 text-muted-foreground px-1 flex items-center gap-2 cursor-not-allowed">
            Quality
            <Badge variant="secondary" className="text-[9px] h-4 px-1 py-0">Coming Soon</Badge>
          </div>
          <div className="py-3 text-muted-foreground px-1 flex items-center gap-2 cursor-not-allowed">
            Dividend
            <Badge variant="secondary" className="text-[9px] h-4 px-1 py-0">Coming Soon</Badge>
          </div>
        </div>
      </header>

      <main className="flex-1 p-6 flex flex-col gap-6 max-w-[1600px] mx-auto w-full">
        <div className="bg-primary/10 border border-primary/20 rounded-lg p-5 flex gap-4 items-start shadow-sm">
          <div className="text-primary font-serif text-4xl leading-none mt-1">"</div>
          <div>
            <p className="text-foreground/90 font-medium text-sm leading-relaxed max-w-4xl">
              At ~16% annual EPS growth, a stock compounds to 100&times; in ~30 years &mdash; at 20%, it takes just 25.
              The GARP screener surfaces companies on this trajectory &mdash; growing fast enough to be transformative,
              priced reasonably enough to buy today.
            </p>
          </div>
        </div>

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
      </main>
    </div>
  );
}
