import { useState, useMemo } from "react";
import { Stock } from "../lib/screener";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ArrowDown, ArrowUp, Hourglass } from "lucide-react";

interface StockTableProps {
  stocks: Stock[];
}

type SortConfig = {
  key: keyof Stock | "rank";
  direction: "asc" | "desc";
};

export function StockTable({ stocks }: StockTableProps) {
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: "hundredBaggerScore", direction: "desc" });

  const sortedStocks = useMemo(() => {
    let sortableItems = [...stocks];

    // Pre-calculate ranks based on default score sort
    const rankedItems = [...stocks].sort((a, b) => b.hundredBaggerScore - a.hundredBaggerScore).map((s, i) => ({ ...s, rank: i + 1 }));

    if (sortConfig !== null) {
      rankedItems.sort((a, b) => {
        if (a[sortConfig.key] < b[sortConfig.key]) {
          return sortConfig.direction === "asc" ? -1 : 1;
        }
        if (a[sortConfig.key] > b[sortConfig.key]) {
          return sortConfig.direction === "asc" ? 1 : -1;
        }
        return 0;
      });
    }
    return rankedItems;
  }, [stocks, sortConfig]);

  const requestSort = (key: keyof Stock | "rank") => {
    let direction: "asc" | "desc" = "desc";
    if (sortConfig.key === key && sortConfig.direction === "desc") {
      direction = "asc";
    }
    setSortConfig({ key, direction });
  };

  const getSortIcon = (key: keyof Stock | "rank") => {
    if (sortConfig.key !== key) return null;
    return sortConfig.direction === "asc" ? <ArrowUp className="w-3 h-3 inline ml-1" /> : <ArrowDown className="w-3 h-3 inline ml-1" />;
  };

  const formatPct = (val: number) => `${(val * 100).toFixed(1)}%`;
  const formatDec = (val: number) => val.toFixed(2);

  if (stocks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 border border-border border-dashed rounded-lg bg-card/50">
        <p className="text-muted-foreground font-medium">No stocks match your current criteria.</p>
        <p className="text-sm text-muted-foreground mt-1">Try loosening the filters.</p>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border bg-card overflow-hidden" data-testid="stock-table">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader className="bg-muted/50 whitespace-nowrap">
            <TableRow>
              <TableHead className="text-right cursor-pointer" onClick={() => requestSort("price")}>Price {getSortIcon("price")}</TableHead>
              <TableHead className="cursor-pointer w-20" onClick={() => requestSort("ticker")}>Ticker {getSortIcon("ticker")}</TableHead>
              <TableHead className="cursor-pointer min-w-[150px]" onClick={() => requestSort("company")}>Company {getSortIcon("company")}</TableHead>
              <TableHead className="cursor-pointer" onClick={() => requestSort("sector")}>Sector {getSortIcon("sector")}</TableHead>
              <TableHead className="cursor-pointer" onClick={() => requestSort("marketCap")}>Cap {getSortIcon("marketCap")}</TableHead>
              <TableHead className="text-right cursor-pointer" onClick={() => requestSort("epsGrowth5yr")}>EPS Growth {getSortIcon("epsGrowth5yr")}</TableHead>
              <TableHead className="text-right cursor-pointer" onClick={() => requestSort("pegRatio")}>PEG {getSortIcon("pegRatio")}</TableHead>
              <TableHead className="text-right cursor-pointer" onClick={() => requestSort("forwardPE")}>Fwd P/E {getSortIcon("forwardPE")}</TableHead>
              <TableHead className="text-right cursor-pointer" onClick={() => requestSort("revenueGrowth3yr")}>Rev Growth {getSortIcon("revenueGrowth3yr")}</TableHead>
              <TableHead className="text-right cursor-pointer" onClick={() => requestSort("roe")}>ROE {getSortIcon("roe")}</TableHead>
              <TableHead className="text-right cursor-pointer" onClick={() => requestSort("netMargin")}>Margin {getSortIcon("netMargin")}</TableHead>
              <TableHead className="text-right cursor-pointer" onClick={() => requestSort("debtToEquity")}>D/E {getSortIcon("debtToEquity")}</TableHead>
              <TableHead className="text-right cursor-pointer" onClick={() => requestSort("yearsTo100x")}>
                <Hourglass className="w-3 h-3 inline mr-1" />
                Yrs to 100x {getSortIcon("yearsTo100x")}
              </TableHead>
              <TableHead className="cursor-pointer w-24" onClick={() => requestSort("hundredBaggerScore")}>Score {getSortIcon("hundredBaggerScore")}</TableHead>
              <TableHead className="text-center min-w-[100px]">Compounder</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedStocks.map((stock) => (
              <TableRow key={stock.ticker} className="hover:bg-muted/30 transition-colors">
                <TableCell className="text-right font-mono text-sm text-foreground">{stock.price > 0 ? `$${stock.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}</TableCell>
                <TableCell className="font-bold text-foreground font-mono">{stock.ticker}</TableCell>
                <TableCell className="text-sm text-muted-foreground truncate max-w-[150px]">{stock.company}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-[10px] font-normal whitespace-nowrap bg-muted/20">{stock.sector}</Badge>
                </TableCell>
                <TableCell>
                  <span className="text-xs text-muted-foreground">{stock.marketCap}</span>
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  <span className={stock.epsGrowth5yr >= 0.16 ? "text-primary font-bold" : stock.epsGrowth5yr >= 0.12 ? "text-amber-500" : "text-muted-foreground"}>
                    {formatPct(stock.epsGrowth5yr)}
                  </span>
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  <span className={stock.pegRatio <= 1.0 ? "text-primary" : "text-foreground"}>
                    {formatDec(stock.pegRatio)}
                  </span>
                </TableCell>
                <TableCell className="text-right font-mono text-sm text-foreground">{formatDec(stock.forwardPE)}</TableCell>
                <TableCell className="text-right font-mono text-sm text-muted-foreground">{formatPct(stock.revenueGrowth3yr)}</TableCell>
                <TableCell className="text-right font-mono text-sm text-muted-foreground">{formatPct(stock.roe)}</TableCell>
                <TableCell className="text-right font-mono text-sm text-muted-foreground">{formatPct(stock.netMargin)}</TableCell>
                <TableCell className="text-right font-mono text-sm text-muted-foreground">{formatDec(stock.debtToEquity)}</TableCell>
                <TableCell className="text-right font-mono text-sm font-semibold text-foreground">
                  {formatDec(stock.yearsTo100x)}y
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Progress value={stock.hundredBaggerScore} className="h-2 w-full bg-muted" indicatorClassName={stock.hundredBaggerScore > 80 ? "bg-primary" : stock.hundredBaggerScore > 60 ? "bg-amber-500" : "bg-muted-foreground"} />
                    <span className="text-xs font-mono text-muted-foreground w-6 text-right">{stock.hundredBaggerScore}</span>
                  </div>
                </TableCell>
                <TableCell className="text-center" data-testid={`compounder-${stock.ticker}`}>
                  {stock.consecutiveYearsAbove16 >= 5 && (
                    <Badge className="bg-orange-500/15 text-orange-400 border border-orange-500/30 hover:bg-orange-500/20 text-[10px] font-semibold tracking-wide px-2 py-0.5 whitespace-nowrap" title={`${stock.consecutiveYearsAbove16} consecutive years above 16% EPS growth`}>
                      Compounder
                    </Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
