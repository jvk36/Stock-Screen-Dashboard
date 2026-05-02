import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { ALL_SECTORS, ALL_MARKET_CAPS } from "@/lib/screener";

export type FilterControl =
  | { type: "slider-min"; field: string; label: string; min: number; max: number; step: number; format: (v: number) => string }
  | { type: "slider-max"; field: string; label: string; min: number; max: number; step: number; format: (v: number) => string }
  | { type: "market-caps" }
  | { type: "sectors" };

interface TabFilterPanelProps {
  controls: FilterControl[];
  filters: Record<string, unknown>;
  setFilters: (f: Record<string, unknown>) => void;
  defaultFilters: Record<string, unknown>;
  totalStocks: number;
  filteredCount: number;
}

export function TabFilterPanel({
  controls,
  filters,
  setFilters,
  defaultFilters,
  totalStocks,
  filteredCount,
}: TabFilterPanelProps) {
  const marketCaps = (filters.marketCaps as string[]) ?? [];
  const sectors = (filters.sectors as string[]) ?? [];
  const allSectorsSelected = sectors.length === ALL_SECTORS.length;

  const toggleMarketCap = (mc: string) => {
    const next = marketCaps.includes(mc)
      ? marketCaps.filter((c) => c !== mc)
      : [...marketCaps, mc];
    setFilters({ ...filters, marketCaps: next });
  };

  const toggleSector = (sector: string) => {
    const next = sectors.includes(sector)
      ? sectors.filter((s) => s !== sector)
      : [...sectors, sector];
    setFilters({ ...filters, sectors: next });
  };

  return (
    <div className="w-full flex flex-col gap-6" data-testid="tab-filter-panel">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Filters</h2>
        <Button
          variant="link"
          onClick={() => setFilters(defaultFilters)}
          className="text-muted-foreground hover:text-primary px-0 h-auto"
        >
          Reset
        </Button>
      </div>

      <div className="text-sm text-muted-foreground pb-2 border-b border-border">
        Showing {filteredCount} of {totalStocks} stocks
      </div>

      <div className="space-y-6">
        {controls.map((control, i) => {
          if (control.type === "slider-min") {
            const value = (filters[control.field] as number) ?? control.min;
            return (
              <div key={`${control.field}-${i}`} className="space-y-3">
                <div className="flex justify-between items-center">
                  <Label>{control.label}</Label>
                  <span className="text-sm font-medium text-foreground">
                    &ge; {control.format(value)}
                  </span>
                </div>
                <Slider
                  value={[value]}
                  min={control.min}
                  max={control.max}
                  step={control.step}
                  onValueChange={([v]) =>
                    setFilters({ ...filters, [control.field]: v })
                  }
                />
              </div>
            );
          }

          if (control.type === "slider-max") {
            const value = (filters[control.field] as number) ?? control.max;
            return (
              <div key={`${control.field}-${i}`} className="space-y-3">
                <div className="flex justify-between items-center">
                  <Label>{control.label}</Label>
                  <span className="text-sm font-medium text-foreground">
                    &le; {control.format(value)}
                  </span>
                </div>
                <Slider
                  value={[value]}
                  min={control.min}
                  max={control.max}
                  step={control.step}
                  onValueChange={([v]) =>
                    setFilters({ ...filters, [control.field]: v })
                  }
                />
              </div>
            );
          }

          if (control.type === "market-caps") {
            return (
              <div key={`market-caps-${i}`} className="space-y-3">
                <Label className="mb-2 block">Market Cap</Label>
                <div className="space-y-2">
                  {ALL_MARKET_CAPS.map((mc) => (
                    <div key={mc} className="flex items-center space-x-2">
                      <Checkbox
                        id={`tab-mc-${mc}`}
                        checked={marketCaps.includes(mc)}
                        onCheckedChange={() => toggleMarketCap(mc)}
                      />
                      <label
                        htmlFor={`tab-mc-${mc}`}
                        className="text-sm text-muted-foreground cursor-pointer leading-none"
                      >
                        {mc}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            );
          }

          if (control.type === "sectors") {
            return (
              <div key={`sectors-${i}`} className="space-y-3">
                <div className="flex items-center justify-between mb-2">
                  <Label>Sector</Label>
                  <Button
                    variant="link"
                    className="text-xs h-auto p-0 text-muted-foreground"
                    onClick={() =>
                      setFilters({
                        ...filters,
                        sectors: allSectorsSelected ? [] : [...ALL_SECTORS],
                      })
                    }
                  >
                    {allSectorsSelected ? "Deselect All" : "Select All"}
                  </Button>
                </div>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                  {ALL_SECTORS.map((sector) => (
                    <div key={sector} className="flex items-center space-x-2">
                      <Checkbox
                        id={`tab-sector-${sector}`}
                        checked={sectors.includes(sector)}
                        onCheckedChange={() => toggleSector(sector)}
                      />
                      <label
                        htmlFor={`tab-sector-${sector}`}
                        className="text-sm text-muted-foreground cursor-pointer leading-none"
                      >
                        {sector}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            );
          }

          return null;
        })}
      </div>
    </div>
  );
}
