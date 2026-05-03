import { useState, useMemo } from "react";
import type { ReactNode } from "react";
import type { ScoredStock } from "@/lib/screener";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowDown, ArrowUp } from "lucide-react";

export interface ColumnDef {
  key: string;
  header: string;
  align?: "left" | "right" | "center";
  sortKey?: string;
  render: (stock: ScoredStock & { rank: number }) => ReactNode;
}

type SortConfig = { key: string; direction: "asc" | "desc" };

interface TabStockTableProps {
  stocks: ScoredStock[];
  columns: ColumnDef[];
  /**
   * Initial sort column.
   * Pass `null` to preserve the incoming order (server's primary-driver order).
   * The user can still click any column header to sort interactively.
   */
  defaultSort: SortConfig | null;
}

export function TabStockTable({ stocks, columns, defaultSort }: TabStockTableProps) {
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(defaultSort);

  const rankedAndSorted = useMemo(() => {
    if (!sortConfig) {
      // No client-side sort: preserve incoming order = server's primary-driver ranking.
      // Rank 1 = best by primary driver (position 0 in the pre-ranked array).
      return stocks.map((s, i) => ({ ...s, rank: i + 1 }));
    }

    // When the user picks a sort column, rank by score first, then re-order by chosen key.
    const ranked = [...stocks]
      .sort((a, b) => b.score - a.score)
      .map((s, i) => ({ ...s, rank: i + 1 }));

    ranked.sort((a, b) => {
      const aVal = (a as Record<string, unknown>)[sortConfig.key];
      const bVal = (b as Record<string, unknown>)[sortConfig.key];
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      if (aVal < bVal) return sortConfig.direction === "asc" ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });
    return ranked;
  }, [stocks, sortConfig]);

  const requestSort = (key: string | undefined) => {
    if (!key) return;
    setSortConfig((prev) => ({
      key,
      direction: prev?.key === key && prev.direction === "desc" ? "asc" : "desc",
    }));
  };

  const getSortIcon = (key: string | undefined) => {
    if (!key || !sortConfig || sortConfig.key !== key) return null;
    return sortConfig.direction === "asc" ? (
      <ArrowUp className="w-3 h-3 inline ml-1" />
    ) : (
      <ArrowDown className="w-3 h-3 inline ml-1" />
    );
  };

  if (stocks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 border border-border border-dashed rounded-lg bg-card/50">
        <p className="text-muted-foreground font-medium">
          No stocks match your current criteria.
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          Try loosening the filters.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border bg-card overflow-hidden" data-testid="tab-stock-table">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader className="bg-muted/50 whitespace-nowrap">
            <TableRow>
              {columns.map((col) => (
                <TableHead
                  key={col.key}
                  className={[
                    col.sortKey ? "cursor-pointer select-none" : "",
                    col.align === "right"
                      ? "text-right"
                      : col.align === "center"
                        ? "text-center"
                        : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => requestSort(col.sortKey)}
                >
                  {col.header}
                  {getSortIcon(col.sortKey)}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rankedAndSorted.map((stock) => (
              <TableRow
                key={stock.ticker}
                className="hover:bg-muted/30 transition-colors"
              >
                {columns.map((col) => (
                  <TableCell
                    key={col.key}
                    className={
                      col.align === "right"
                        ? "text-right"
                        : col.align === "center"
                          ? "text-center"
                          : ""
                    }
                  >
                    {col.render(stock)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
