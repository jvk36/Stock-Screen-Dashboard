import { FilterState } from "../lib/screener";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";

interface FilterPanelProps {
  filters: FilterState;
  setFilters: (filters: FilterState) => void;
  defaultFilters: FilterState;
  totalStocks: number;
  filteredCount: number;
}

const allSectors = [
  "Information Technology",
  "Health Care",
  "Financials",
  "Consumer Discretionary",
  "Communication Services",
  "Industrials",
  "Consumer Staples",
  "Energy",
  "Utilities",
  "Real Estate",
  "Materials"
];

const allMarketCaps = ["Mega", "Large", "Mid", "Small", "Micro"];

export function FilterPanel({ filters, setFilters, defaultFilters, totalStocks, filteredCount }: FilterPanelProps) {
  
  const handleReset = () => setFilters(defaultFilters);

  const toggleMarketCap = (mc: string) => {
    const newCaps = filters.marketCaps.includes(mc)
      ? filters.marketCaps.filter(c => c !== mc)
      : [...filters.marketCaps, mc];
    setFilters({ ...filters, marketCaps: newCaps });
  };

  const toggleSector = (sector: string) => {
    let newSectors = [...filters.sectors];
    if (newSectors.includes(sector)) {
      newSectors = newSectors.filter(s => s !== sector);
    } else {
      newSectors.push(sector);
    }
    // If all selected, we can keep it as empty to represent "all" or explicit all
    setFilters({ ...filters, sectors: newSectors });
  };

  const toggleAllSectors = () => {
    if (filters.sectors.length === 0) {
      setFilters({ ...filters, sectors: [...allSectors] });
    } else {
      setFilters({ ...filters, sectors: [] });
    }
  };

  return (
    <div className="w-full flex flex-col gap-6" data-testid="filter-panel">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Filters</h2>
        <Button variant="link" onClick={handleReset} className="text-muted-foreground hover:text-primary px-0 h-auto" data-testid="button-reset-filters">
          Reset
        </Button>
      </div>
      <div className="text-sm text-muted-foreground pb-2 border-b border-border">
        Showing {filteredCount} of {totalStocks} stocks
      </div>

      <div className="space-y-6">
        {/* EPS Growth */}
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <Label>EPS Growth (5yr CAGR)</Label>
            <span className="text-sm font-medium text-foreground">&ge; {filters.epsGrowth}%</span>
          </div>
          <div className="relative pt-2 pb-6">
            <Slider
              value={[filters.epsGrowth]}
              min={0} max={35} step={1}
              onValueChange={([v]) => setFilters({ ...filters, epsGrowth: v })}
              data-testid="slider-eps-growth"
            />
            {/* 16% marker */}
            <div className="absolute left-[45.7%] top-8 w-[2px] h-3 bg-amber-500/50" title="100-bagger line (16%)"></div>
            <div className="absolute left-[41%] top-11 text-[10px] text-amber-500/70 font-mono">16% line</div>
          </div>
        </div>

        {/* PEG Ratio */}
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <Label>PEG Ratio</Label>
            <span className="text-sm font-medium text-foreground">{filters.pegMin.toFixed(1)} &ndash; {filters.pegMax.toFixed(1)}</span>
          </div>
          <Slider
            value={[filters.pegMin, filters.pegMax]}
            min={0} max={4} step={0.1}
            onValueChange={([min, max]) => setFilters({ ...filters, pegMin: min, pegMax: max })}
            data-testid="slider-peg-range"
          />
        </div>

        {/* Fwd P/E */}
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <Label>Forward P/E</Label>
            <span className="text-sm font-medium text-foreground">{filters.fwdPeMin} - {filters.fwdPeMax}</span>
          </div>
          <Slider
            value={[filters.fwdPeMin, filters.fwdPeMax]}
            min={0} max={60} step={1}
            onValueChange={([min, max]) => setFilters({ ...filters, fwdPeMin: min, fwdPeMax: max })}
            data-testid="slider-fwd-pe"
          />
        </div>

        {/* Revenue Growth */}
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <Label>Revenue Growth (3yr)</Label>
            <span className="text-sm font-medium text-foreground">&ge; {filters.revGrowth}%</span>
          </div>
          <Slider
            value={[filters.revGrowth]}
            min={0} max={30} step={1}
            onValueChange={([v]) => setFilters({ ...filters, revGrowth: v })}
            data-testid="slider-rev-growth"
          />
        </div>

        {/* ROE */}
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <Label>ROE</Label>
            <span className="text-sm font-medium text-foreground">&ge; {filters.roeMin}%</span>
          </div>
          <Slider
            value={[filters.roeMin]}
            min={0} max={40} step={1}
            onValueChange={([v]) => setFilters({ ...filters, roeMin: v })}
            data-testid="slider-roe"
          />
        </div>

        {/* Net Margin */}
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <Label>Net Margin</Label>
            <span className="text-sm font-medium text-foreground">&ge; {filters.netMarginMin}%</span>
          </div>
          <Slider
            value={[filters.netMarginMin]}
            min={0} max={30} step={1}
            onValueChange={([v]) => setFilters({ ...filters, netMarginMin: v })}
            data-testid="slider-net-margin"
          />
        </div>

        {/* Debt/Equity */}
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <Label>Debt/Equity (Max)</Label>
            <span className="text-sm font-medium text-foreground">&le; {filters.debtEqMax.toFixed(1)}</span>
          </div>
          <Slider
            value={[filters.debtEqMax]}
            min={0} max={3} step={0.1}
            onValueChange={([v]) => setFilters({ ...filters, debtEqMax: v })}
            data-testid="slider-debt-eq"
          />
        </div>

        {/* Market Cap */}
        <div className="space-y-3">
          <Label className="mb-2 block">Market Cap</Label>
          <div className="space-y-2">
            {allMarketCaps.map(mc => (
              <div key={mc} className="flex items-center space-x-2">
                <Checkbox 
                  id={`mc-${mc}`} 
                  checked={filters.marketCaps.includes(mc)}
                  onCheckedChange={() => toggleMarketCap(mc)}
                  data-testid={`checkbox-mc-${mc}`}
                />
                <label htmlFor={`mc-${mc}`} className="text-sm text-muted-foreground cursor-pointer leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                  {mc}
                </label>
              </div>
            ))}
          </div>
        </div>

        {/* Sector */}
        <div className="space-y-3">
          <div className="flex items-center justify-between mb-2">
            <Label>Sector</Label>
            <Button variant="link" className="text-xs h-auto p-0 text-muted-foreground" onClick={toggleAllSectors}>
              {filters.sectors.length === 0 ? "Deselect All" : "Select All"}
            </Button>
          </div>
          <div className="space-y-2 max-h-48 overflow-y-auto pr-2 scrollbar-thin">
            {allSectors.map(sector => {
              const isChecked = filters.sectors.length === 0 || filters.sectors.includes(sector);
              return (
                <div key={sector} className="flex items-center space-x-2">
                  <Checkbox 
                    id={`sector-${sector}`} 
                    checked={isChecked}
                    onCheckedChange={() => {
                      if (filters.sectors.length === 0) {
                        setFilters({ ...filters, sectors: allSectors.filter(s => s !== sector) });
                      } else {
                        toggleSector(sector);
                      }
                    }}
                    data-testid={`checkbox-sector-${sector.replace(/\s/g, '-')}`}
                  />
                  <label htmlFor={`sector-${sector}`} className="text-sm text-muted-foreground cursor-pointer leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                    {sector}
                  </label>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
