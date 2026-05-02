import { useState, useMemo } from "react";
import { FilterPanel } from "@/components/FilterPanel";
import { StockTable } from "@/components/StockTable";
import { mockStocks } from "@/data/mockStocks";
import { defaultFilters, filterStocks } from "@/lib/screener";
import { Badge } from "@/components/ui/badge";

export default function Dashboard() {
  const [filters, setFilters] = useState(defaultFilters);

  const filteredStocks = useMemo(() => {
    return filterStocks(mockStocks, filters);
  }, [filters]);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header Bar */}
      <header className="border-b border-border bg-card">
        <div className="px-6 py-4">
          <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-primary inline-block"></span>
            Stock Screener
          </h1>
        </div>
        {/* Tab Row */}
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
        {/* 100-Bagger Banner */}
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

        {/* Two Column Layout */}
        <div className="flex flex-col lg:flex-row gap-8 items-start">
          <aside className="w-full lg:w-72 shrink-0">
            <FilterPanel 
              filters={filters} 
              setFilters={setFilters} 
              defaultFilters={defaultFilters}
              totalStocks={mockStocks.length}
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
