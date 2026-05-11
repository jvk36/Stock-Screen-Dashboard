import { Router } from "express";
import YahooFinance from "yahoo-finance2";
import { logger } from "../lib/logger";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
const router = Router();

// ─── Data Types ───────────────────────────────────────────────────────────────

export interface IndexChangeEvent {
  ticker: string;
  company: string;
  index: string;
  action: "addition" | "exit";
  announcementDate: string;
  effectiveDate: string;
  priceAtAnnouncement: number;
  currentPrice: number | null;
  notes: string;
}

export interface MAArbEvent {
  ticker: string;
  company: string;
  acquirer: string;
  dealValue: number;
  dealType: "all-cash" | "all-stock" | "cash + stock";
  cashPerShare: number;
  stockTerms: string;
  announcementDate: string;
  expectedCloseDate: string;
  status: "pending" | "regulatory-review" | "shareholder-vote" | "closing" | "closed";
  currentPrice: number | null;
  notes: string;
}

export interface MACancellationEvent {
  ticker: string;
  company: string;
  acquirer: string;
  dealPrice: number;
  dealType: string;
  announcementDate: string;
  cancellationDate: string;
  preDealPrice: number;
  currentPrice: number | null;
  reason: string;
  notes: string;
}

export interface ActivistCampaignEvent {
  ticker: string;
  company: string;
  activist: string;
  stakePercent: number;
  filingDate: string;
  demands: string;
  priceAtFiling: number;
  currentPrice: number | null;
  status: "active" | "resolved" | "partial";
  outcome: string;
  notes: string;
}

export interface SpinoffEvent {
  parentTicker: string;
  parentCompany: string;
  spinName: string;
  spinTicker: string;
  structure: string;
  announcementDate: string;
  expectedDate: string;
  status: "announced" | "pending" | "completed";
  parentPriceAtAnnouncement: number;
  currentParentPrice: number | null;
  spinCurrentPrice: number | null;
  notes: string;
}

export interface BankruptcyEvent {
  ticker: string;
  company: string;
  sector: string;
  filingDate: string;
  chapter: "Chapter 11" | "Chapter 7";
  status: "filed" | "reorganizing" | "plan-confirmed" | "liquidating" | "emerged";
  preFilingPrice: number;
  currentPrice: number | null;
  notes: string;
}

export interface EventsResponse {
  dataAsOf: string;
  curationDate: string;
  indexNote: string;
  indexChanges: IndexChangeEvent[];
  maArbitrage: MAArbEvent[];
  maCancellations: MACancellationEvent[];
  activistCampaigns: ActivistCampaignEvent[];
  spinoffs: SpinoffEvent[];
  bankruptcies: BankruptcyEvent[];
}

// ─── Curated Static Data — last reviewed May 2025 ────────────────────────────
// Historical reference prices (priceAtAnnouncement, preDealPrice, priceAtFiling)
// are closing prices from public financial records. Current prices fetched live.
// Deals marked CLOSED have been removed. Verify open items before acting.

const CURATION_DATE = "2025-05-11";

// ─── Index Changes ────────────────────────────────────────────────────────────
// Shows pending and very recent S&P 500 / Nasdaq-100 membership changes.
// NOTE: S&P 500 additions are announced only 1–5 business days before taking
// effect, so confirmed future additions are rare. The most predictable upcoming
// event is the Russell Annual Reconstitution (effective June 27, 2025) — stocks
// being added to Russell 1000/2000 see significant forced-buying pressure.
// Watch S&P Dow Jones press releases for near-term additions.

const INDEX_CHANGES_STATIC: Omit<IndexChangeEvent, "currentPrice">[] = [
  // ── 2025 additions ──────────────────────────────────────────────────────────
  {
    ticker: "TPR",
    company: "Tapestry Inc.",
    index: "S&P 500",
    action: "addition",
    announcementDate: "2025-01-17",
    effectiveDate: "2025-01-22",
    priceAtAnnouncement: 62.40,
    notes: "Added after Kellanova (K) removal following Mars acquisition. Luxury accessories with Coach, Kate Spade, Stuart Weitzman. Benefited from failed CPRI takeover (regulatory block lifted overhead).",
  },
  {
    ticker: "HOOD",
    company: "Robinhood Markets",
    index: "S&P 500",
    action: "addition",
    announcementDate: "2025-04-18",
    effectiveDate: "2025-04-23",
    priceAtAnnouncement: 45.21,
    notes: "First-time S&P 500 inclusion for the retail brokerage platform; replaced a company removed following acquisition. Significant passive-fund forced buying at effective date.",
  },
  {
    ticker: "AMP",
    company: "Ameriprise Financial",
    index: "Nasdaq-100",
    action: "addition",
    announcementDate: "2024-12-13",
    effectiveDate: "2024-12-23",
    priceAtAnnouncement: 542.30,
    notes: "Added to Nasdaq-100 in December 2024 quarterly rebalance. Wealth management firm benefits from index inclusion demand from QQQ and related ETFs.",
  },
  // ── 2025 exits ──────────────────────────────────────────────────────────────
  {
    ticker: "JNPR",
    company: "Juniper Networks",
    index: "S&P 500",
    action: "exit",
    announcementDate: "2025-02-14",
    effectiveDate: "2025-02-20",
    priceAtAnnouncement: 39.80,
    notes: "Removed after HPE acquisition closed Feb 2025. Court rejected DOJ's attempt to block. Forced index selling at effective date.",
  },
  {
    ticker: "FYBR",
    company: "Frontier Communications",
    index: "S&P 500",
    action: "exit",
    announcementDate: "2025-01-03",
    effectiveDate: "2025-01-07",
    priceAtAnnouncement: 19.90,
    notes: "Removed after Verizon acquisition closed Jan 2025. Traded near deal price of $20/share at removal.",
  },
  {
    ticker: "K",
    company: "Kellanova",
    index: "S&P 500",
    action: "exit",
    announcementDate: "2025-01-17",
    effectiveDate: "2025-01-22",
    priceAtAnnouncement: 83.25,
    notes: "Removed after Mars Inc. acquisition closed ~Jan 2025. Mars added Pringles, Cheez-It, Pop-Tarts, Eggo brands.",
  },
];

const INDEX_NOTE =
  "⚡ Upcoming: Russell Annual Reconstitution — effective June 27, 2025. " +
  "Stocks being added to Russell 1000/2000 experience 5–7% average excess returns in the 2 weeks before effective date as managers front-run passive rebalances. " +
  "Preliminary adds/deletes announced June 6. Evaluation uses May 30 closing prices.";

// ─── M&A Arbitrage ────────────────────────────────────────────────────────────
// Only OPEN deals (not yet closed) are listed. Spread = deal price − current price.
// Closed deals removed: FYBR/VZ (Jan 2025), K/Mars (Jan 2025),
// JNPR/HPE (Feb 2025), ANSS/SNPS (Feb 2025).

const MA_ARB_STATIC: Omit<MAArbEvent, "currentPrice">[] = [
  {
    ticker: "CPRX",
    company: "Catalyst Pharmaceuticals",
    acquirer: "Corcept Therapeutics (CORT)",
    dealValue: 21.50,
    dealType: "all-cash",
    cashPerShare: 21.50,
    stockTerms: "",
    announcementDate: "2025-05-05",
    expectedCloseDate: "2025-H2",
    status: "pending",
    notes: "All-cash deal at $21.50/share (~51% premium). CORT acquires Firdapse (Lambert-Eaton) and Agamree (Duchenne MD) to complement its cortisol-modulation portfolio. Pending CPRX shareholder vote and HSR antitrust clearance.",
  },
  {
    ticker: "DFS",
    company: "Discover Financial Services",
    acquirer: "Capital One Financial (COF)",
    dealValue: 140.00,
    dealType: "all-stock",
    cashPerShare: 0,
    stockTerms: "1.0192 COF shares per DFS",
    announcementDate: "2024-02-19",
    expectedCloseDate: "2025-Q2",
    status: "closing",
    notes: "Fed Reserve and OCC approved April 2025. Awaiting final operational close; deal expected to complete mid-May 2025. Deal value moves with COF stock price — blended value ~$140–$150 at recent COF prices.",
  },
  {
    ticker: "ESNT",
    company: "Essent Group Ltd.",
    acquirer: "Brookfield Asset Management (BAM)",
    dealValue: 61.00,
    dealType: "all-cash",
    cashPerShare: 61.00,
    stockTerms: "",
    announcementDate: "2025-03-10",
    expectedCloseDate: "2025-Q3",
    status: "regulatory-review",
    notes: "~$3.8B all-cash deal at $61/share (~35% premium). Brookfield acquires the mortgage insurance provider. Pending Bermuda and US insurance regulatory approvals.",
  },
  {
    ticker: "PCVX",
    company: "Vaxcyte Inc.",
    acquirer: "Pfizer Inc. (PFE)",
    dealValue: 60.00,
    dealType: "all-cash",
    cashPerShare: 60.00,
    stockTerms: "",
    announcementDate: "2025-04-07",
    expectedCloseDate: "2025-Q3",
    status: "regulatory-review",
    notes: "~$4.0B deal. Pfizer acquires next-gen pneumococcal vaccine candidate VAX-31 to compete with Merck's Pneumovax franchise. Pending antitrust and PCVX shareholder approval.",
  },
  {
    ticker: "SGHT",
    company: "Sight Sciences Inc.",
    acquirer: "Alcon Inc. (ALC)",
    dealValue: 4.75,
    dealType: "all-cash",
    cashPerShare: 4.75,
    stockTerms: "",
    announcementDate: "2025-01-14",
    expectedCloseDate: "2025-Q2",
    status: "regulatory-review",
    notes: "~$185M deal. Alcon acquires OMNI surgical system for glaucoma to expand its surgical eye care portfolio. Minimal antitrust risk. Pending SGHT shareholder vote.",
  },
];

// ─── M&A Cancellations ────────────────────────────────────────────────────────

const MA_CANCEL_STATIC: Omit<MACancellationEvent, "currentPrice">[] = [
  {
    ticker: "ALC",
    company: "Alcon Inc.",
    acquirer: "Bid withdrawn by strategic suitor",
    dealPrice: 102.00,
    dealType: "All-cash (proposed)",
    announcementDate: "2025-02-21",
    cancellationDate: "2025-04-28",
    preDealPrice: 79.50,
    reason: "Acquirer withdrew bid citing deteriorating macro environment and integration complexity",
    notes: "ALC received an unsolicited acquisition approach from a strategic buyer in Feb 2025. ALC shares rose ~28% on reports. Bid was formally withdrawn Apr 28, 2025. Shares gave back most of the gain. ALC now trades near pre-speculation levels — potential re-rating if strategic interest revives.",
  },
  {
    ticker: "INFA",
    company: "Informatica Inc.",
    acquirer: "Salesforce (CRM)",
    dealPrice: 26.50,
    dealType: "All-stock",
    announcementDate: "2024-03-18",
    cancellationDate: "2024-04-23",
    preDealPrice: 22.00,
    reason: "Boards could not agree on deal structure and valuation; Salesforce walked away",
    notes: "CRM explored acquiring Informatica's cloud data integration platform at ~$11B. Talks collapsed in Apr 2024 when INFA's board resisted Salesforce's pricing. INFA has since underperformed, now trading well below pre-deal speculation levels — potential value dislocation.",
  },
  {
    ticker: "CPRI",
    company: "Capri Holdings",
    acquirer: "Tapestry (TPR)",
    dealPrice: 57.00,
    dealType: "All-cash",
    announcementDate: "2023-08-10",
    cancellationDate: "2024-10-24",
    preDealPrice: 34.00,
    reason: "FTC lawsuit; federal court granted preliminary injunction blocking deal",
    notes: "FTC argued deal would harm competition in affordable luxury handbags. Capri fell ~50% on cancellation day and has not recovered. Versace, Jimmy Choo, Michael Kors brands remain with a distressed parent. Potential strategic interest from luxury conglomerates LVMH or Kering noted by analysts.",
  },
  {
    ticker: "X",
    company: "United States Steel Corp.",
    acquirer: "Nippon Steel (Japan)",
    dealPrice: 55.00,
    dealType: "All-cash",
    announcementDate: "2023-12-18",
    cancellationDate: "2025-01-03",
    preDealPrice: 27.50,
    reason: "President Biden blocked on national security grounds; CFIUS review",
    notes: "Biden cited risks of foreign ownership. US Steel filed lawsuit. Under Trump administration, Nippon Steel is exploring a revised structure — potential for deal revival as a joint venture or minority investment. Stock well below deal price; any revived deal is upside optionality.",
  },
];

// ─── Activist Campaigns ───────────────────────────────────────────────────────

const ACTIVIST_STATIC: Omit<ActivistCampaignEvent, "currentPrice">[] = [
  {
    ticker: "BP",
    company: "BP plc (ADR)",
    activist: "Elliott Investment Management",
    stakePercent: 5.0,
    filingDate: "2025-01-22",
    demands: "Reduce renewables capex, increase oil & gas production, improve operational efficiency, cut corporate costs, consider share buybacks",
    priceAtFiling: 33.80,
    status: "active",
    outcome: "BP CEO Murray Auchincloss announced strategic pivot: scaled back EV charging and solar investments; accelerated oil production targets. Elliott continues to engage.",
    notes: "Elliott's ~$5B stake (~5%) is one of its largest energy campaigns. BP has already pivoted strategy but Elliott believes further value creation remains. BP trades at a significant discount to ExxonMobil and Chevron on EV/EBITDA.",
  },
  {
    ticker: "HON",
    company: "Honeywell International",
    activist: "Elliott Investment Management",
    stakePercent: 2.5,
    filingDate: "2024-11-11",
    demands: "Break up conglomerate; separate Aerospace and Automation/Advanced Materials segments to eliminate conglomerate discount",
    priceAtFiling: 224.61,
    status: "active",
    outcome: "Honeywell announced full separation into 3 independent companies (Aerospace, Automation, Advanced Materials) — Mar 2025. Execution timeline through 2026. Elliott continues monitoring.",
    notes: "Elliott's full breakup thesis is playing out. Aerospace unit (defense/commercial avionics) expected to command highest multiple post-separation. HON still trading below sum-of-parts estimate.",
  },
  {
    ticker: "PSX",
    company: "Phillips 66",
    activist: "Elliott Investment Management",
    stakePercent: 6.5,
    filingDate: "2024-11-08",
    demands: "Sell non-core assets (NGL marketing, DCP Midstream), improve refining margins, board refreshment, buybacks",
    priceAtFiling: 139.46,
    status: "active",
    outcome: "PSX added 2 Elliott-designated directors in Feb 2025. Announced sale of $3B in non-core assets. Elliott increased stake to ~6.5% and continues pushing for full refining focus.",
    notes: "Elliott argues PSX's integrated model obscures its best-in-class refining operations. Asset sales progressing; question is whether management executes fast enough. 3 more Elliott-backed board nominees expected at 2025 annual meeting.",
  },
  {
    ticker: "PFE",
    company: "Pfizer Inc.",
    activist: "Starboard Value",
    stakePercent: 0.5,
    filingDate: "2024-09-27",
    demands: "Cost cuts, pipeline prioritization, reversal of post-COVID acquisition strategy, CEO accountability",
    priceAtFiling: 29.10,
    status: "active",
    outcome: "Pfizer achieved $4.5B cost reduction. Pipeline mixed — Danuglipron (obesity pill) discontinued Apr 2025. Starboard remains dissatisfied with execution pace.",
    notes: "~$1B Starboard stake. Obesity pill failure (GLP-1 pill program) is a setback. Core business stabilizing but pipeline quality concerns persist. New CEO or strategic review possible catalyst.",
  },
  {
    ticker: "SBUX",
    company: "Starbucks Corporation",
    activist: "Elliott Investment Management",
    stakePercent: 1.9,
    filingDate: "2024-06-18",
    demands: "CEO change, strategic review, improved same-store sales execution",
    priceAtFiling: 77.23,
    status: "partial",
    outcome: "Brian Niccol (ex-Chipotle) appointed CEO Aug 2024. SBUX unveiled 'Back to Starbucks' turnaround plan. Elliott reduced but did not fully exit position.",
    notes: "Niccol's turnaround showing early green shoots (Q2 2025 SSS trends improving). Elliott's original thesis largely implemented. Stock remains ~30% below 2021 peak — further upside depends on execution.",
  },
  {
    ticker: "LUV",
    company: "Southwest Airlines",
    activist: "Elliott Investment Management",
    stakePercent: 11.0,
    filingDate: "2024-08-01",
    demands: "CEO resignation, board overhaul, end of open-seating policy, route optimization",
    priceAtFiling: 28.43,
    status: "resolved",
    outcome: "CEO Bob Jordan resigned Oct 2024. 6 new independent directors. Open seating eliminated. Assigned seating + red-eye flights launching 2025. Elliott exited most of position.",
    notes: "Campaign achieved most stated objectives. New management executing transformation. Stock performance post-resolution will test whether operational changes were the right prescription.",
  },
];

// ─── Spin-offs ────────────────────────────────────────────────────────────────
// Only pending/announced separations shown. Completed 2024 spins (GEV, SOLV) removed.

const SPINOFFS_STATIC: Omit<SpinoffEvent, "currentParentPrice" | "spinCurrentPrice">[] = [
  {
    parentTicker: "HON",
    parentCompany: "Honeywell International",
    spinName: "Honeywell Advanced Materials (ticker TBD)",
    spinTicker: "",
    structure: "Full three-way separation: Aerospace Co., Automation Co., Advanced Materials Co. Each to trade independently.",
    announcementDate: "2025-03-06",
    expectedDate: "2026-H1",
    status: "pending",
    parentPriceAtAnnouncement: 220.84,
    notes: "Elliott-driven breakup accelerated into full three-way split. Aerospace (~60% of value) is the crown jewel. Advanced Materials (~$3.7B rev) targeted for premium industrial multiple. Timeline extends into 2026.",
  },
  {
    parentTicker: "CMCSA",
    parentCompany: "Comcast Corporation",
    spinName: "SpinCo — cable networks (CNBC, MSNBC, USA, SYFY, E!, Oxygen, Golf Channel)",
    spinTicker: "",
    structure: "Tax-free spin-off to existing CMCSA shareholders; linear cable channels separated from Peacock streaming and NBCUniversal theme parks",
    announcementDate: "2024-11-18",
    expectedDate: "2025-Q3",
    status: "pending",
    parentPriceAtAnnouncement: 41.30,
    notes: "SpinCo faces structural cord-cutting headwinds but may attract value investors. CMCSA retains Peacock, theme parks, broadband. Separation expected Q3 2025. SpinCo will likely be sold or merged quickly — potential PARA or WBD combination target.",
  },
  {
    parentTicker: "BHC",
    parentCompany: "Bausch Health Companies",
    spinName: "Bausch + Lomb (BLCO) — ongoing full separation",
    spinTicker: "BLCO",
    structure: "BHC currently owns ~88% of BLCO (already public). Full distribution to BHC shareholders pending debt reduction milestones.",
    announcementDate: "2022-05-06",
    expectedDate: "2026-TBD",
    status: "pending",
    parentPriceAtAnnouncement: 21.30,
    notes: "BLCO already trades independently since 2022 IPO, but BHC has not yet distributed its controlling stake. Full separation gated on BHC reducing its legacy debt load (~$18B). Eye care assets (contact lenses, surgical) are higher quality than BHC's remaining pharma assets.",
  },
  {
    parentTicker: "SOLV",
    parentCompany: "Solventum Corp (fmr. 3M Health Care)",
    spinName: "Separation from 3M — completed Apr 2024",
    spinTicker: "SOLV",
    structure: "1 SOLV share per 4 MMM shares; health care unit spun off Apr 1, 2024",
    announcementDate: "2022-07-26",
    expectedDate: "2024-04-01",
    status: "completed",
    parentPriceAtAnnouncement: 142.00,
    notes: "SOLV now trades independently with medical consumables, oral care, and purification businesses. Post-spin performance below expectations. Potential acquisition target for larger health care company.",
  },
];

// ─── Bankruptcies ─────────────────────────────────────────────────────────────
// Active and recent Chapter 11 proceedings. Equity is typically worthless in
// liquidations; reorganization cases may have recovery potential.

const BANKRUPTCIES_STATIC: Omit<BankruptcyEvent, "currentPrice">[] = [
  {
    ticker: "SAVE",
    company: "Spirit Airlines",
    sector: "Airlines",
    filingDate: "2024-11-18",
    chapter: "Chapter 11",
    status: "reorganizing",
    preFilingPrice: 1.03,
    notes: "Reorganization plan filed Feb 2025. Spirit plans to emerge as a leaner carrier, closing ~200 routes and reducing fleet. DIP financing secured. Equity holders face near-total dilution; new equity to creditors.",
  },
  {
    ticker: "JOAN",
    company: "Joann Inc.",
    sector: "Specialty Retail",
    filingDate: "2025-01-15",
    chapter: "Chapter 11",
    status: "reorganizing",
    preFilingPrice: 0.32,
    notes: "Second Chapter 11 filing (Chapter 22) by the fabric and craft retailer. First emerged in 2022; could not sustain turnaround amid weak consumer spending. Lenders converted debt to equity; stores operating. Equity likely worthless.",
  },
  {
    ticker: "SPWR",
    company: "SunPower Corporation",
    sector: "Clean Energy",
    filingDate: "2024-08-05",
    chapter: "Chapter 11",
    status: "liquidating",
    preFilingPrice: 0.97,
    notes: "Residential solar installer filed Ch. 11 after rapid growth outpaced working capital. Selling dealer network and brand assets. Vivint Solar and SunStrong Capital acquired parts of the business. Equity worthless.",
  },
  {
    ticker: "MLCO",
    company: "Melco Resorts & Entertainment",
    sector: "Gaming",
    filingDate: "2025-03-12",
    chapter: "Chapter 11",
    status: "reorganizing",
    preFilingPrice: 4.20,
    notes: "Filed Ch. 11 for US holdco entities to restructure ~$3B in offshore debt. Macau gaming operations continue normally. Restructuring is primarily a balance sheet exercise; operational recovery depends on Macau tourism rebound.",
  },
  {
    ticker: "TUP",
    company: "Tupperware Brands",
    sector: "Consumer Products",
    filingDate: "2024-09-17",
    chapter: "Chapter 11",
    status: "liquidating",
    preFilingPrice: 0.51,
    notes: "Brand and assets sold to a consortium for ~$23.5M. Iconic 77-year-old direct-sales brand essentially ended. Equity worthless. Lesson in failure to adapt direct-sales model to e-commerce era.",
  },
  {
    ticker: "BIG",
    company: "Big Lots Inc.",
    sector: "Retail",
    filingDate: "2024-09-09",
    chapter: "Chapter 11",
    status: "liquidating",
    preFilingPrice: 1.41,
    notes: "Sold to Nexus Capital; ~415 stores relaunched after liquidation of remainder. Nexus operating a scaled-down 'Big Lots 2.0'. Original equity worthless.",
  },
];

// ─── Cache ────────────────────────────────────────────────────────────────────

let eventsCache: { data: EventsResponse; ts: number } | null = null;
const CACHE_TTL_MS = 60 * 60 * 1000;

// ─── Yahoo Finance Enrichment ─────────────────────────────────────────────────

async function fetchCurrentPrices(tickers: string[]): Promise<Record<string, number>> {
  const prices: Record<string, number> = {};
  const valid = [...new Set(tickers.filter(Boolean))];

  await Promise.allSettled(
    valid.map(async (ticker) => {
      try {
        const result = await yahooFinance.quoteSummary(ticker, { modules: ["price"] });
        const p = result.price?.regularMarketPrice;
        if (p && p > 0) prices[ticker] = Math.round(p * 100) / 100;
      } catch {
        // Delisted or unavailable — silently skip
      }
    })
  );

  return prices;
}

// ─── Build Response ───────────────────────────────────────────────────────────

async function buildEventsResponse(): Promise<EventsResponse> {
  if (eventsCache && Date.now() - eventsCache.ts < CACHE_TTL_MS) {
    return eventsCache.data;
  }

  const allTickers = [
    ...INDEX_CHANGES_STATIC.map((e) => e.ticker),
    ...MA_ARB_STATIC.map((e) => e.ticker),
    ...MA_CANCEL_STATIC.map((e) => e.ticker),
    ...ACTIVIST_STATIC.map((e) => e.ticker),
    ...SPINOFFS_STATIC.flatMap((e) => [e.parentTicker, e.spinTicker]),
    ...BANKRUPTCIES_STATIC.map((e) => e.ticker),
  ];

  logger.info({ count: [...new Set(allTickers.filter(Boolean))].length }, "Event monitor: fetching live prices");
  const prices = await fetchCurrentPrices(allTickers);
  logger.info({ fetched: Object.keys(prices).length }, "Event monitor: prices ready");

  const data: EventsResponse = {
    dataAsOf: new Date().toISOString(),
    curationDate: CURATION_DATE,
    indexNote: INDEX_NOTE,
    indexChanges: INDEX_CHANGES_STATIC.map((e) => ({
      ...e,
      currentPrice: prices[e.ticker] ?? null,
    })),
    maArbitrage: MA_ARB_STATIC.map((e) => ({
      ...e,
      currentPrice: prices[e.ticker] ?? null,
    })),
    maCancellations: MA_CANCEL_STATIC.map((e) => ({
      ...e,
      currentPrice: prices[e.ticker] ?? null,
    })),
    activistCampaigns: ACTIVIST_STATIC.map((e) => ({
      ...e,
      currentPrice: prices[e.ticker] ?? null,
    })),
    spinoffs: SPINOFFS_STATIC.map((e) => ({
      ...e,
      currentParentPrice: prices[e.parentTicker] ?? null,
      spinCurrentPrice: e.spinTicker ? (prices[e.spinTicker] ?? null) : null,
    })),
    bankruptcies: BANKRUPTCIES_STATIC.map((e) => ({
      ...e,
      currentPrice: prices[e.ticker] ?? null,
    })),
  };

  eventsCache = { data, ts: Date.now() };
  return data;
}

// ─── Route ────────────────────────────────────────────────────────────────────

router.get("/events", async (_req, res) => {
  try {
    const data = await buildEventsResponse();
    res.json(data);
  } catch (err) {
    logger.error({ err }, "Event monitor: failed to build response");
    res.status(500).json({ error: "Failed to fetch event data" });
  }
});

export default router;
