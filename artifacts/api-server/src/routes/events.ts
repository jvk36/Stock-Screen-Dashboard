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
  indexChanges: IndexChangeEvent[];
  maArbitrage: MAArbEvent[];
  maCancellations: MACancellationEvent[];
  activistCampaigns: ActivistCampaignEvent[];
  spinoffs: SpinoffEvent[];
  bankruptcies: BankruptcyEvent[];
}

// ─── Curated Static Data ──────────────────────────────────────────────────────
// priceAtAnnouncement / preDealPrice / priceAtFiling values are historical
// closing prices sourced from public financial records.
// Current prices are always fetched live from Yahoo Finance.

const INDEX_CHANGES_STATIC: Omit<IndexChangeEvent, "currentPrice">[] = [
  {
    ticker: "PLTR", company: "Palantir Technologies", index: "S&P 500",
    action: "addition", announcementDate: "2024-09-06", effectiveDate: "2024-09-23",
    priceAtAnnouncement: 26.43,
    notes: "Added to S&P 500; index inclusion created substantial forced-buying from passive funds.",
  },
  {
    ticker: "DELL", company: "Dell Technologies", index: "S&P 500",
    action: "addition", announcementDate: "2024-09-06", effectiveDate: "2024-09-23",
    priceAtAnnouncement: 109.94,
    notes: "Re-added to S&P 500 after going private in 2013. Returned via 2018 re-listing.",
  },
  {
    ticker: "GDDY", company: "GoDaddy Inc.", index: "S&P 500",
    action: "addition", announcementDate: "2024-09-06", effectiveDate: "2024-09-23",
    priceAtAnnouncement: 155.80,
    notes: "First-time S&P 500 inclusion for the domain registrar and web hosting company.",
  },
  {
    ticker: "KKR", company: "KKR & Co. Inc.", index: "S&P 500",
    action: "addition", announcementDate: "2024-09-20", effectiveDate: "2024-10-01",
    priceAtAnnouncement: 122.47,
    notes: "Alternative asset manager replaces Walgreens; reflects rise of private-market mega-caps in index.",
  },
  {
    ticker: "CBOE", company: "Cboe Global Markets", index: "S&P 500",
    action: "addition", announcementDate: "2024-09-20", effectiveDate: "2024-10-01",
    priceAtAnnouncement: 196.09,
    notes: "Options/futures exchange operator replaces Advance Auto Parts (AAP) effective Oct 1.",
  },
  {
    ticker: "ETSY", company: "Etsy Inc.", index: "S&P 500",
    action: "exit", announcementDate: "2024-09-06", effectiveDate: "2024-09-23",
    priceAtAnnouncement: 56.10,
    notes: "Removed after steep market-cap decline from 2021 pandemic-era peak of ~$300/share.",
  },
  {
    ticker: "WBA", company: "Walgreens Boots Alliance", index: "S&P 500",
    action: "exit", announcementDate: "2024-09-20", effectiveDate: "2024-10-01",
    priceAtAnnouncement: 11.00,
    notes: "Removed following multi-year deterioration; subsequently received $10/share go-private bid from Sycamore Partners.",
  },
];

const MA_ARB_STATIC: Omit<MAArbEvent, "currentPrice">[] = [
  {
    ticker: "DFS", company: "Discover Financial Services",
    acquirer: "Capital One Financial (COF)",
    dealValue: 140.00, dealType: "all-stock",
    cashPerShare: 0, stockTerms: "1.0192 COF shares per DFS",
    announcementDate: "2024-02-19", expectedCloseDate: "2025-Q2",
    status: "regulatory-review",
    notes: "~$35.3B deal. Pending DOJ and Federal Reserve approval. Deal value fluctuates with COF stock price.",
  },
  {
    ticker: "ANSS", company: "Ansys Inc.",
    acquirer: "Synopsys (SNPS)",
    dealValue: 390.00, dealType: "cash + stock",
    cashPerShare: 197.00, stockTerms: "0.3450 SNPS shares per ANSS",
    announcementDate: "2024-01-16", expectedCloseDate: "2025-H1",
    status: "regulatory-review",
    notes: "~$35B EDA software deal. EU raised competition concerns; DOJ also reviewing. Cash component $197 + variable SNPS stock.",
  },
  {
    ticker: "FYBR", company: "Frontier Communications",
    acquirer: "Verizon Communications (VZ)",
    dealValue: 20.00, dealType: "all-cash",
    cashPerShare: 20.00, stockTerms: "",
    announcementDate: "2024-09-05", expectedCloseDate: "2025-Q1",
    status: "regulatory-review",
    notes: "~$9.6B deal plus ~$11B net debt. FCC and DOJ review pending. Verizon acquires fiber network to compete with cable.",
  },
  {
    ticker: "K", company: "Kellanova",
    acquirer: "Mars Inc. (private)",
    dealValue: 83.50, dealType: "all-cash",
    cashPerShare: 83.50, stockTerms: "",
    announcementDate: "2024-08-14", expectedCloseDate: "2025-H1",
    status: "regulatory-review",
    notes: "~$36B deal. Mars adds Pringles, Cheez-It, Pop-Tarts, Eggo to its portfolio. Pending global antitrust reviews.",
  },
  {
    ticker: "JNPR", company: "Juniper Networks",
    acquirer: "Hewlett Packard Enterprise (HPE)",
    dealValue: 40.00, dealType: "all-cash",
    cashPerShare: 40.00, stockTerms: "",
    announcementDate: "2024-01-09", expectedCloseDate: "2025-H1",
    status: "regulatory-review",
    notes: "~$14B AI networking deal. DOJ filed suit to block in Jan 2025, citing harm to AI data center networking competition.",
  },
];

const MA_CANCEL_STATIC: Omit<MACancellationEvent, "currentPrice">[] = [
  {
    ticker: "CPRI", company: "Capri Holdings",
    acquirer: "Tapestry (TPR)",
    dealPrice: 57.00, dealType: "All-cash",
    announcementDate: "2023-08-10", cancellationDate: "2024-10-24",
    preDealPrice: 34.00,
    reason: "FTC lawsuit; federal court granted preliminary injunction blocking deal",
    notes: "FTC argued deal would harm competition in affordable luxury handbags (Coach + Kate Spade + Versace/Michael Kors). Capri shares fell ~50% on cancellation day.",
  },
  {
    ticker: "X", company: "United States Steel Corp.",
    acquirer: "Nippon Steel (Japan)",
    dealPrice: 55.00, dealType: "All-cash",
    announcementDate: "2023-12-18", cancellationDate: "2025-01-03",
    preDealPrice: 27.50,
    reason: "President Biden blocked on national security grounds via CFIUS review",
    notes: "Biden cited risks of foreign ownership of domestic steel capacity. US Steel filed lawsuit vs. Biden administration. Trump administration reviewed; status evolving.",
  },
];

const ACTIVIST_STATIC: Omit<ActivistCampaignEvent, "currentPrice">[] = [
  {
    ticker: "LUV", company: "Southwest Airlines",
    activist: "Elliott Investment Management",
    stakePercent: 11.0, filingDate: "2024-08-01",
    demands: "CEO resignation, board overhaul, strategic review, end of open-seating policy, red-eye flights",
    priceAtFiling: 28.43,
    status: "resolved",
    outcome: "CEO Bob Jordan resigned Oct 2024; new independent board members added; open-seating policy ended; operational restructuring underway.",
    notes: "Elliott's largest airline campaign. Won significant concessions. New management implementing customer-experience changes.",
  },
  {
    ticker: "SBUX", company: "Starbucks Corporation",
    activist: "Elliott Investment Management",
    stakePercent: 1.9, filingDate: "2024-06-18",
    demands: "Strategic review, improved execution, board refreshment",
    priceAtFiling: 77.23,
    status: "partial",
    outcome: "Brian Niccol (Chipotle CEO) appointed CEO Aug 2024; turnaround plan announced. Shares recovered on news.",
    notes: "Elliott's engagement contributed to leadership change. Niccol's Chipotle playbook being applied to SBUX; early results mixed.",
  },
  {
    ticker: "PFE", company: "Pfizer Inc.",
    activist: "Starboard Value",
    stakePercent: 0.5, filingDate: "2024-09-27",
    demands: "Cost cuts, portfolio rationalization, improving post-COVID commercial revenue trajectory",
    priceAtFiling: 29.10,
    status: "active",
    outcome: "Pfizer announced ~$4B cost reduction program; ongoing strategic review of commercial pipeline.",
    notes: "Starboard holds ~$1B stake. Former Pfizer executives reportedly advising Starboard. Focus on declining COVID-era revenue and pipeline execution.",
  },
  {
    ticker: "HON", company: "Honeywell International",
    activist: "Elliott Investment Management",
    stakePercent: 2.5, filingDate: "2024-11-11",
    demands: "Break up conglomerate; separate Aerospace and Industrial Automation segments",
    priceAtFiling: 224.61,
    status: "partial",
    outcome: "Honeywell announced spin-off of Advanced Materials division (Nov 2024); strategic review of broader portfolio ongoing.",
    notes: "Elliott argues Honeywell trades at a conglomerate discount. Aerospace (jet engines, avionics) seen as crown jewel.",
  },
  {
    ticker: "PSX", company: "Phillips 66",
    activist: "Elliott Investment Management",
    stakePercent: 2.5, filingDate: "2024-11-08",
    demands: "Operational improvements, cost reduction, portfolio rationalization, board refreshment",
    priceAtFiling: 139.46,
    status: "active",
    outcome: "PSX announced accelerated strategic review; management engagement with Elliott ongoing.",
    notes: "Elliott holds ~$2.5B+ stake. Argues refining margins and midstream assets are undervalued under current management.",
  },
];

const SPINOFFS_STATIC: Omit<SpinoffEvent, "currentParentPrice" | "spinCurrentPrice">[] = [
  {
    parentTicker: "HON", parentCompany: "Honeywell International",
    spinName: "Honeywell Advanced Materials (ticker TBD)",
    spinTicker: "",
    structure: "Full separation; shareholders receive pro-rata shares in new public entity",
    announcementDate: "2024-11-15", expectedDate: "2025-H2",
    status: "announced",
    parentPriceAtAnnouncement: 221.72,
    notes: "Elliott-driven breakup. Advanced Materials revenues ~$3.7B/yr. HON to retain Aerospace and Automation segments.",
  },
  {
    parentTicker: "CMCSA", parentCompany: "Comcast Corporation",
    spinName: "SpinCo — cable networks (CNBC, MSNBC, USA, SYFY, E!, Oxygen, Golf Channel)",
    spinTicker: "",
    structure: "Tax-free spin-off; linear cable channels separated from streaming (Peacock) and theme parks",
    announcementDate: "2024-11-18", expectedDate: "2025-H1",
    status: "announced",
    parentPriceAtAnnouncement: 41.30,
    notes: "Comcast separates declining linear TV from high-growth Peacock and NBCUniversal Entertainment. SpinCo faces cord-cutting headwinds.",
  },
  {
    parentTicker: "GE", parentCompany: "GE Aerospace (fmr. General Electric)",
    spinName: "GE Vernova (energy segment)",
    spinTicker: "GEV",
    structure: "1 GEV share per 4 GE shares distributed; tax-free spin",
    announcementDate: "2023-11-09", expectedDate: "2024-04-02",
    status: "completed",
    parentPriceAtAnnouncement: 110.00,
    notes: "GE Vernova began trading Apr 2, 2024 covering GE's wind, gas, and grid businesses. GE renamed GE Aerospace post-spin.",
  },
  {
    parentTicker: "MMM", parentCompany: "3M Company",
    spinName: "Solventum Corp (health care segment)",
    spinTicker: "SOLV",
    structure: "1 SOLV share per 4 MMM shares distributed; tax-free spin",
    announcementDate: "2022-07-26", expectedDate: "2024-04-01",
    status: "completed",
    parentPriceAtAnnouncement: 142.00,
    notes: "Solventum began trading Apr 1, 2024 with medical consumables, oral care, and purification businesses.",
  },
];

const BANKRUPTCIES_STATIC: Omit<BankruptcyEvent, "currentPrice">[] = [
  {
    ticker: "SAVE", company: "Spirit Airlines", sector: "Airlines",
    filingDate: "2024-11-18", chapter: "Chapter 11", status: "reorganizing",
    preFilingPrice: 1.03,
    notes: "Filed Ch. 11 after failed Frontier merger (2023) and blocked JetBlue acquisition. ~$1.1B debt. Evaluating restructuring paths.",
  },
  {
    ticker: "BIG", company: "Big Lots Inc.", sector: "Retail",
    filingDate: "2024-09-09", chapter: "Chapter 11", status: "liquidating",
    preFilingPrice: 1.41,
    notes: "Sold business to Nexus Capital Management; ~800 stores began closing. Equity likely worthless.",
  },
  {
    ticker: "FSR", company: "Fisker Inc.", sector: "Electric Vehicles",
    filingDate: "2024-06-17", chapter: "Chapter 11", status: "liquidating",
    preFilingPrice: 0.09,
    notes: "EV startup exhausted capital after failing to secure a strategic partner (talks with Nissan broke down). Vehicles liquidated.",
  },
  {
    ticker: "EXPR", company: "Express Inc.", sector: "Retail",
    filingDate: "2024-04-22", chapter: "Chapter 11", status: "plan-confirmed",
    preFilingPrice: 0.22,
    notes: "Brands sold to WHP Global / Simon Property Group. Express operates as going concern under new ownership; equity likely worthless.",
  },
  {
    ticker: "TUP", company: "Tupperware Brands", sector: "Consumer Products",
    filingDate: "2024-09-17", chapter: "Chapter 11", status: "liquidating",
    preFilingPrice: 0.51,
    notes: "Iconic direct-sales brand filed Ch. 11 after years of revenue decline and failed debt refinancing. Brand/assets being sold.",
  },
  {
    ticker: "CONN", company: "Conn's Inc.", sector: "Retail",
    filingDate: "2024-07-23", chapter: "Chapter 11", status: "liquidating",
    preFilingPrice: 0.95,
    notes: "Furniture/appliance retailer (~170 stores) filed Ch. 11 and began full liquidation. No going-concern buyer emerged.",
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
        const result = await yahooFinance.quoteSummary(ticker, {
          modules: ["price"],
        });
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
