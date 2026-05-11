import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ExternalLink } from "lucide-react";

// ─── API Response Types (mirrors artifacts/api-server/src/routes/events.ts) ──

interface IndexChangeEvent {
  ticker: string; company: string; index: string;
  action: "addition" | "exit";
  announcementDate: string; effectiveDate: string;
  priceAtAnnouncement: number; currentPrice: number | null; notes: string;
}
interface MAArbEvent {
  ticker: string; company: string; acquirer: string;
  dealValue: number; dealType: "all-cash" | "all-stock" | "cash + stock";
  cashPerShare: number; stockTerms: string;
  announcementDate: string; expectedCloseDate: string;
  status: string; currentPrice: number | null; notes: string;
}
interface MACancellationEvent {
  ticker: string; company: string; acquirer: string;
  dealPrice: number; dealType: string;
  announcementDate: string; cancellationDate: string;
  preDealPrice: number; currentPrice: number | null;
  reason: string; notes: string;
}
interface ActivistCampaignEvent {
  ticker: string; company: string; activist: string;
  stakePercent: number; filingDate: string; demands: string;
  priceAtFiling: number; currentPrice: number | null;
  status: string; outcome: string; notes: string;
}
interface SpinoffEvent {
  parentTicker: string; parentCompany: string;
  spinName: string; spinTicker: string; structure: string;
  announcementDate: string; expectedDate: string;
  status: string; parentPriceAtAnnouncement: number;
  currentParentPrice: number | null; spinCurrentPrice: number | null; notes: string;
}
interface BankruptcyEvent {
  ticker: string; company: string; sector: string;
  filingDate: string; chapter: string; status: string;
  preFilingPrice: number; currentPrice: number | null; notes: string;
}
interface EventsResponse {
  dataAsOf: string;
  indexChanges: IndexChangeEvent[];
  maArbitrage: MAArbEvent[];
  maCancellations: MACancellationEvent[];
  activistCampaigns: ActivistCampaignEvent[];
  spinoffs: SpinoffEvent[];
  bankruptcies: BankruptcyEvent[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const $$ = (v: number | null, dec = 2) =>
  v == null ? "—" : `$${v.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec })}`;

const pctFmt = (v: number) =>
  `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;

const pctColor = (v: number) =>
  v >= 5 ? "text-green-400 font-semibold" : v >= 0 ? "text-green-400" : v <= -10 ? "text-red-400 font-semibold" : "text-red-400";

const dateFmt = (iso: string) => {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
};

const mono = "font-mono text-sm";

// ─── Category Config ──────────────────────────────────────────────────────────

const CATEGORIES = [
  { id: "index-add",  label: "Index Additions",   color: "text-green-400" },
  { id: "index-exit", label: "Index Exits",        color: "text-red-400" },
  { id: "ma-arb",     label: "M&A Arbitrage",      color: "text-blue-400" },
  { id: "ma-cancel",  label: "M&A Cancellations",  color: "text-orange-400" },
  { id: "activist",   label: "Activist Campaigns", color: "text-purple-400" },
  { id: "spinoff",    label: "Spin-offs",           color: "text-cyan-400" },
  { id: "bankruptcy", label: "Bankruptcies",        color: "text-rose-400" },
] as const;

type CategoryId = typeof CATEGORIES[number]["id"];

// ─── Status Badges ────────────────────────────────────────────────────────────

type StatusVariant = "pending" | "active" | "resolved" | "partial" | "regulatory" | "completed" | "liquidating" | "reorganizing" | "announced" | "filed";

const STATUS_CONFIG: Record<StatusVariant, { label: string; cls: string }> = {
  pending:       { label: "Pending",          cls: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  active:        { label: "Active",           cls: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  announced:     { label: "Announced",        cls: "bg-blue-500/15 text-blue-300 border-blue-500/30" },
  regulatory:    { label: "Regulatory",       cls: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30" },
  partial:       { label: "Partial Win",      cls: "bg-blue-500/15 text-blue-300 border-blue-500/30" },
  resolved:      { label: "Resolved",         cls: "bg-green-500/15 text-green-300 border-green-500/30" },
  completed:     { label: "Completed",        cls: "bg-green-500/15 text-green-300 border-green-500/30" },
  reorganizing:  { label: "Reorganizing",     cls: "bg-orange-500/15 text-orange-300 border-orange-500/30" },
  liquidating:   { label: "Liquidating",      cls: "bg-red-500/15 text-red-300 border-red-500/30" },
  filed:         { label: "Filed",            cls: "bg-orange-500/15 text-orange-300 border-orange-500/30" },
};

function StatusBadge({ status }: { status: string }) {
  const mapped = status === "regulatory-review" ? "regulatory"
    : status === "shareholder-vote" ? "regulatory"
    : status === "plan-confirmed" ? "partial"
    : (status as StatusVariant);
  const cfg = STATUS_CONFIG[mapped] ?? { label: status, cls: "bg-muted text-muted-foreground border-border" };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

// ─── Index Changes Table ──────────────────────────────────────────────────────

function IndexChangesTable({ events }: { events: IndexChangeEvent[] }) {
  if (events.length === 0) return <EmptyState />;
  return (
    <div className="rounded-md border border-border overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>Ticker</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Index</TableHead>
              <TableHead className="text-right">Effective Date</TableHead>
              <TableHead className="text-right">Pre-Ann Price</TableHead>
              <TableHead className="text-right">Current Price</TableHead>
              <TableHead className="text-right">Return Since Ann</TableHead>
              <TableHead>Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate)).map((e) => {
              const ret = e.currentPrice != null
                ? ((e.currentPrice - e.priceAtAnnouncement) / e.priceAtAnnouncement) * 100
                : null;
              return (
                <TableRow key={e.ticker} className="hover:bg-muted/30">
                  <TableCell><span className="font-bold font-mono text-foreground">{e.ticker}</span></TableCell>
                  <TableCell><span className="text-sm text-muted-foreground">{e.company}</span></TableCell>
                  <TableCell><Badge variant="outline" className="text-[10px] bg-muted/20">{e.index}</Badge></TableCell>
                  <TableCell className="text-right"><span className={mono + " text-muted-foreground"}>{dateFmt(e.effectiveDate)}</span></TableCell>
                  <TableCell className="text-right"><span className={mono}>{$$(e.priceAtAnnouncement)}</span></TableCell>
                  <TableCell className="text-right"><span className={mono}>{$$(e.currentPrice)}</span></TableCell>
                  <TableCell className="text-right">
                    {ret != null ? <span className={pctColor(ret)}>{pctFmt(ret)}</span> : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell><span className="text-xs text-muted-foreground max-w-[220px] block leading-snug">{e.notes}</span></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ─── M&A Arbitrage Table ──────────────────────────────────────────────────────

function MAArbTable({ events }: { events: MAArbEvent[] }) {
  if (events.length === 0) return <EmptyState />;
  return (
    <div className="rounded-md border border-border overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>Target</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Acquirer</TableHead>
              <TableHead className="text-right">Deal Value</TableHead>
              <TableHead>Structure</TableHead>
              <TableHead className="text-right">Current Price</TableHead>
              <TableHead className="text-right">Spread $</TableHead>
              <TableHead className="text-right">Spread %</TableHead>
              <TableHead className="text-right">Expected Close</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.map((e) => {
              const spread = e.currentPrice != null ? e.dealValue - e.currentPrice : null;
              const spreadPct = spread != null && e.currentPrice != null ? (spread / e.currentPrice) * 100 : null;
              return (
                <TableRow key={e.ticker} className="hover:bg-muted/30">
                  <TableCell><span className="font-bold font-mono text-foreground">{e.ticker}</span></TableCell>
                  <TableCell><span className="text-sm text-muted-foreground">{e.company}</span></TableCell>
                  <TableCell><span className="text-sm text-muted-foreground">{e.acquirer}</span></TableCell>
                  <TableCell className="text-right">
                    <div className={mono}>{$$(e.dealValue)}</div>
                    {e.stockTerms && <div className="text-[10px] text-muted-foreground/70">{e.stockTerms}</div>}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-[10px] bg-muted/20 ${e.dealType === "all-cash" ? "text-green-400 border-green-500/30" : "text-blue-400 border-blue-500/30"}`}>
                      {e.dealType}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right"><span className={mono}>{$$(e.currentPrice)}</span></TableCell>
                  <TableCell className="text-right">
                    {spread != null
                      ? <span className={spread >= 0 ? "text-green-400 font-mono text-sm font-semibold" : "text-red-400 font-mono text-sm"}>{$$(spread)}</span>
                      : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-right">
                    {spreadPct != null
                      ? <span className={spreadPct >= 1 ? "text-green-400 font-semibold text-sm" : "text-muted-foreground text-sm"}>{pctFmt(spreadPct)}</span>
                      : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-right"><span className={mono + " text-muted-foreground"}>{e.expectedCloseDate}</span></TableCell>
                  <TableCell><StatusBadge status={e.status} /></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ─── M&A Cancellations Table ──────────────────────────────────────────────────

function MACancelTable({ events }: { events: MACancellationEvent[] }) {
  if (events.length === 0) return <EmptyState />;
  return (
    <div className="rounded-md border border-border overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>Ticker</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Acquirer</TableHead>
              <TableHead className="text-right">Deal Price</TableHead>
              <TableHead className="text-right">Pre-Deal Price</TableHead>
              <TableHead className="text-right">Current Price</TableHead>
              <TableHead className="text-right">vs Deal</TableHead>
              <TableHead className="text-right">vs Pre-Deal</TableHead>
              <TableHead className="text-right">Canceled</TableHead>
              <TableHead>Reason</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.map((e) => {
              const vsDeal = e.currentPrice != null ? ((e.currentPrice - e.dealPrice) / e.dealPrice) * 100 : null;
              const vsPreDeal = e.currentPrice != null ? ((e.currentPrice - e.preDealPrice) / e.preDealPrice) * 100 : null;
              return (
                <TableRow key={e.ticker} className="hover:bg-muted/30">
                  <TableCell><span className="font-bold font-mono text-foreground">{e.ticker}</span></TableCell>
                  <TableCell><span className="text-sm text-muted-foreground">{e.company}</span></TableCell>
                  <TableCell><span className="text-sm text-muted-foreground">{e.acquirer}</span></TableCell>
                  <TableCell className="text-right"><span className={mono}>{$$(e.dealPrice)}</span></TableCell>
                  <TableCell className="text-right"><span className={mono + " text-muted-foreground"}>{$$(e.preDealPrice)}</span></TableCell>
                  <TableCell className="text-right"><span className={mono}>{$$(e.currentPrice)}</span></TableCell>
                  <TableCell className="text-right">
                    {vsDeal != null ? <span className={pctColor(vsDeal)}>{pctFmt(vsDeal)}</span> : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-right">
                    {vsPreDeal != null ? <span className={pctColor(vsPreDeal)}>{pctFmt(vsPreDeal)}</span> : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-right"><span className={mono + " text-muted-foreground"}>{dateFmt(e.cancellationDate)}</span></TableCell>
                  <TableCell><span className="text-xs text-muted-foreground max-w-[200px] block leading-snug">{e.reason}</span></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ─── Activist Campaigns Table ─────────────────────────────────────────────────

function ActivistTable({ events }: { events: ActivistCampaignEvent[] }) {
  if (events.length === 0) return <EmptyState />;
  return (
    <div className="rounded-md border border-border overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>Target</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Activist</TableHead>
              <TableHead className="text-right">Stake %</TableHead>
              <TableHead className="text-right">Filed</TableHead>
              <TableHead className="text-right">Price at Filing</TableHead>
              <TableHead className="text-right">Current Price</TableHead>
              <TableHead className="text-right">Return</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Outcome / Demands</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.sort((a, b) => b.filingDate.localeCompare(a.filingDate)).map((e) => {
              const ret = e.currentPrice != null
                ? ((e.currentPrice - e.priceAtFiling) / e.priceAtFiling) * 100
                : null;
              return (
                <TableRow key={e.ticker} className="hover:bg-muted/30">
                  <TableCell><span className="font-bold font-mono text-foreground">{e.ticker}</span></TableCell>
                  <TableCell><span className="text-sm text-muted-foreground">{e.company}</span></TableCell>
                  <TableCell><span className="text-sm font-medium text-foreground">{e.activist}</span></TableCell>
                  <TableCell className="text-right"><span className={mono}>{e.stakePercent.toFixed(1)}%</span></TableCell>
                  <TableCell className="text-right"><span className={mono + " text-muted-foreground"}>{dateFmt(e.filingDate)}</span></TableCell>
                  <TableCell className="text-right"><span className={mono}>{$$(e.priceAtFiling)}</span></TableCell>
                  <TableCell className="text-right"><span className={mono}>{$$(e.currentPrice)}</span></TableCell>
                  <TableCell className="text-right">
                    {ret != null ? <span className={pctColor(ret)}>{pctFmt(ret)}</span> : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell><StatusBadge status={e.status} /></TableCell>
                  <TableCell>
                    <div className="max-w-[220px]">
                      <p className="text-xs text-foreground leading-snug">{e.outcome || e.demands}</p>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ─── Spin-offs Table ──────────────────────────────────────────────────────────

function SpinoffsTable({ events }: { events: SpinoffEvent[] }) {
  if (events.length === 0) return <EmptyState />;
  return (
    <div className="rounded-md border border-border overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>Parent</TableHead>
              <TableHead>Parent Company</TableHead>
              <TableHead>Spin-off Name</TableHead>
              <TableHead>Spin Ticker</TableHead>
              <TableHead className="text-right">Expected Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Parent @ Ann</TableHead>
              <TableHead className="text-right">Parent Now</TableHead>
              <TableHead className="text-right">Parent Return</TableHead>
              <TableHead className="text-right">Spin Price</TableHead>
              <TableHead>Structure</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.map((e) => {
              const parentRet = e.currentParentPrice != null
                ? ((e.currentParentPrice - e.parentPriceAtAnnouncement) / e.parentPriceAtAnnouncement) * 100
                : null;
              return (
                <TableRow key={`${e.parentTicker}-${e.spinName}`} className="hover:bg-muted/30">
                  <TableCell><span className="font-bold font-mono text-foreground">{e.parentTicker}</span></TableCell>
                  <TableCell><span className="text-sm text-muted-foreground">{e.parentCompany}</span></TableCell>
                  <TableCell><span className="text-sm text-foreground">{e.spinName}</span></TableCell>
                  <TableCell>
                    {e.spinTicker
                      ? <span className="font-bold font-mono text-cyan-400">{e.spinTicker}</span>
                      : <span className="text-muted-foreground text-xs">TBD</span>}
                  </TableCell>
                  <TableCell className="text-right"><span className={mono + " text-muted-foreground"}>{e.expectedDate}</span></TableCell>
                  <TableCell><StatusBadge status={e.status} /></TableCell>
                  <TableCell className="text-right"><span className={mono + " text-muted-foreground"}>{$$(e.parentPriceAtAnnouncement)}</span></TableCell>
                  <TableCell className="text-right"><span className={mono}>{$$(e.currentParentPrice)}</span></TableCell>
                  <TableCell className="text-right">
                    {parentRet != null ? <span className={pctColor(parentRet)}>{pctFmt(parentRet)}</span> : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-right">
                    {e.spinCurrentPrice != null
                      ? <span className={mono + " text-cyan-400"}>{$$(e.spinCurrentPrice)}</span>
                      : <span className="text-muted-foreground text-xs">Not yet trading</span>}
                  </TableCell>
                  <TableCell><span className="text-xs text-muted-foreground max-w-[180px] block leading-snug">{e.structure}</span></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ─── Bankruptcy Table ─────────────────────────────────────────────────────────

function BankruptcyTable({ events }: { events: BankruptcyEvent[] }) {
  if (events.length === 0) return <EmptyState />;
  return (
    <div className="rounded-md border border-border overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>Ticker</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Sector</TableHead>
              <TableHead className="text-right">Filed</TableHead>
              <TableHead>Chapter</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Pre-Filing Price</TableHead>
              <TableHead className="text-right">Current Price</TableHead>
              <TableHead className="text-right">Recovery %</TableHead>
              <TableHead>Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.sort((a, b) => b.filingDate.localeCompare(a.filingDate)).map((e) => {
              const recovery = e.currentPrice != null && e.preFilingPrice > 0
                ? (e.currentPrice / e.preFilingPrice) * 100
                : null;
              return (
                <TableRow key={e.ticker} className="hover:bg-muted/30">
                  <TableCell><span className="font-bold font-mono text-foreground">{e.ticker}</span></TableCell>
                  <TableCell><span className="text-sm text-muted-foreground">{e.company}</span></TableCell>
                  <TableCell><Badge variant="outline" className="text-[10px] bg-muted/20">{e.sector}</Badge></TableCell>
                  <TableCell className="text-right"><span className={mono + " text-muted-foreground"}>{dateFmt(e.filingDate)}</span></TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px] bg-orange-500/10 text-orange-300 border-orange-500/30">
                      {e.chapter}
                    </Badge>
                  </TableCell>
                  <TableCell><StatusBadge status={e.status} /></TableCell>
                  <TableCell className="text-right"><span className={mono + " text-muted-foreground"}>{$$(e.preFilingPrice)}</span></TableCell>
                  <TableCell className="text-right">
                    {e.currentPrice != null
                      ? <span className={mono}>{$$(e.currentPrice)}</span>
                      : <span className="text-xs text-muted-foreground">Delisted</span>}
                  </TableCell>
                  <TableCell className="text-right">
                    {recovery != null
                      ? <span className={recovery >= 50 ? "text-amber-400 font-semibold text-sm" : "text-red-400 text-sm"}>{recovery.toFixed(0)}%</span>
                      : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell><span className="text-xs text-muted-foreground max-w-[200px] block leading-snug">{e.notes}</span></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ─── Shared: Empty State ──────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex items-center justify-center h-32 border border-border border-dashed rounded-lg bg-card/30">
      <p className="text-muted-foreground text-sm">No events tracked in this category.</p>
    </div>
  );
}

// ─── Loading Skeleton ─────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-10 rounded bg-muted/40" />
      ))}
    </div>
  );
}

// ─── Category Header Info ─────────────────────────────────────────────────────

const CATEGORY_INFO: Record<CategoryId, { title: string; description: string; edgarLink?: string }> = {
  "index-add": {
    title: "Index Additions",
    description: "Stocks recently added to major indices (S&P 500, Nasdaq 100, etc.). Index inclusion triggers forced buying from passive funds, often driving price appreciation around the effective date.",
  },
  "index-exit": {
    title: "Index Exits",
    description: "Stocks recently removed from major indices. Removal triggers forced selling from passive funds and can create value opportunities if fundamentals remain intact.",
  },
  "ma-arb": {
    title: "M&A Arbitrage",
    description: "Announced acquisitions where the target is still trading at a discount to the deal price. The spread represents implied risk of deal failure. All-cash deals offer the cleanest spread; stock deals depend on acquirer valuation.",
  },
  "ma-cancel": {
    title: "M&A Cancellations",
    description: "Deals canceled, withdrawn, or terminated in the past 12 months. Post-cancellation dislocations can create opportunities — the target often overshoots to the downside and may trade below pre-deal levels.",
  },
  "activist": {
    title: "Active Activist Campaigns",
    description: "13D/13D-A filings from major activist investors including Elliott, Starboard Value, Carl Icahn, Pershing Square, and others. Activist campaigns often precede strategic changes that create shareholder value.",
    edgarLink: "https://efts.sec.gov/LATEST/search-index?forms=SC+13D&dateRange=custom&startdt=2024-01-01",
  },
  "spinoff": {
    title: "Spin-offs",
    description: "Announced and completed corporate separations. Both the parent and the spin-off can offer opportunities: parents often re-rate after shedding underperforming divisions; spins may be oversold by index funds that can't hold them.",
  },
  "bankruptcy": {
    title: "Bankruptcy Exits",
    description: "Companies in Chapter 11 reorganization. Ch. 11 gives companies breathing room to restructure while continuing operations. Some emerge as leaner, viable businesses — though equity is often worthless in liquidations.",
  },
};

// ─── Main Tab ─────────────────────────────────────────────────────────────────

export function EventMonitorTab() {
  const [activeCategory, setActiveCategory] = useState<CategoryId>("index-add");

  const { data, isLoading, isError, dataUpdatedAt } = useQuery<EventsResponse>({
    queryKey: ["events"],
    queryFn: () => fetch("/api/events").then((r) => {
      if (!r.ok) throw new Error(`Events API error: ${r.status}`);
      return r.json() as Promise<EventsResponse>;
    }),
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: 2,
  });

  const indexAdditions = data?.indexChanges.filter((e) => e.action === "addition") ?? [];
  const indexExits     = data?.indexChanges.filter((e) => e.action === "exit") ?? [];

  const categoryCounts: Record<CategoryId, number> = {
    "index-add":  indexAdditions.length,
    "index-exit": indexExits.length,
    "ma-arb":     data?.maArbitrage.length ?? 0,
    "ma-cancel":  data?.maCancellations.length ?? 0,
    "activist":   data?.activistCampaigns.length ?? 0,
    "spinoff":    data?.spinoffs.length ?? 0,
    "bankruptcy": data?.bankruptcies.length ?? 0,
  };

  const info = CATEGORY_INFO[activeCategory];

  return (
    <div className="flex flex-col gap-6">
      {/* Banner */}
      <div className="rounded-lg border border-border bg-card/60 px-5 py-4">
        <p className="text-sm text-muted-foreground leading-relaxed">
          Monitor high-conviction event-driven opportunities: index rebalances, M&A arbitrage spreads, activist
          campaigns, corporate spin-offs, and bankruptcy reorganizations — all enriched with live prices from Yahoo Finance.
        </p>
        <p className="text-xs text-muted-foreground/60 mt-2">
          Event metadata is manually curated from SEC EDGAR, company press releases, and financial news (data reflects known events as of early 2025).
          Prices are fetched live. Verify all details with primary sources before acting.
          {dataUpdatedAt > 0 && (
            <span> · Prices as of {new Date(dataUpdatedAt).toLocaleTimeString()}</span>
          )}
        </p>
      </div>

      {/* Category Pills */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={[
              "flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all border",
              activeCategory === cat.id
                ? "bg-primary/10 border-primary/40 text-foreground"
                : "border-border bg-card/40 text-muted-foreground hover:text-foreground hover:border-border/80",
            ].join(" ")}
          >
            <span className={activeCategory === cat.id ? cat.color : ""}>{cat.label}</span>
            {data && (
              <span className={[
                "text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                activeCategory === cat.id ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground",
              ].join(" ")}>
                {categoryCounts[cat.id]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Category Panel */}
      <div className="space-y-4">
        {/* Category description */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">{info.title}</h2>
            <p className="text-sm text-muted-foreground mt-0.5 max-w-3xl leading-relaxed">{info.description}</p>
          </div>
          {info.edgarLink && (
            <a
              href={info.edgarLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary shrink-0 mt-1"
            >
              <ExternalLink className="w-3 h-3" /> SEC EDGAR
            </a>
          )}
        </div>

        {/* Table */}
        {isLoading && <LoadingSkeleton />}
        {isError && (
          <div className="flex items-center justify-center h-32 border border-border border-dashed rounded-lg bg-card/30">
            <p className="text-muted-foreground text-sm">Failed to load event data. Please refresh and try again.</p>
          </div>
        )}
        {data && (
          <>
            {activeCategory === "index-add"  && <IndexChangesTable events={indexAdditions} />}
            {activeCategory === "index-exit" && <IndexChangesTable events={indexExits} />}
            {activeCategory === "ma-arb"     && <MAArbTable events={data.maArbitrage} />}
            {activeCategory === "ma-cancel"  && <MACancelTable events={data.maCancellations} />}
            {activeCategory === "activist"   && <ActivistTable events={data.activistCampaigns} />}
            {activeCategory === "spinoff"    && <SpinoffsTable events={data.spinoffs} />}
            {activeCategory === "bankruptcy" && <BankruptcyTable events={data.bankruptcies} />}
          </>
        )}
      </div>
    </div>
  );
}
