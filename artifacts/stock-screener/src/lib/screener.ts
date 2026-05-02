export interface Stock {
  ticker: string;
  company: string;
  sector: string;
  marketCap: "Mega" | "Large" | "Mid" | "Small" | "Micro";
  epsGrowth5yr: number;
  consecutiveYearsAbove16: number;
  pegRatio: number;
  forwardPE: number;
  revenueGrowth3yr: number;
  roe: number;
  netMargin: number;
  debtToEquity: number;
  yearsTo100x: number;
  hundredBaggerScore: number;
}

export function calculateMetrics(stock: Omit<Stock, "yearsTo100x" | "hundredBaggerScore">): Stock {
  const yearsTo100x = Math.log(100) / Math.log(1 + stock.epsGrowth5yr);
  
  // EPS proximity to 16% (max 40)
  let epsScore = 0;
  if (stock.epsGrowth5yr >= 0.16) epsScore = 40;
  else if (stock.epsGrowth5yr >= 0.12) epsScore = 20 + ((stock.epsGrowth5yr - 0.12) / 0.04) * 20;
  else epsScore = Math.max(0, (stock.epsGrowth5yr / 0.12) * 20);

  // PEG ratio (max 25)
  let pegScore = 0;
  if (stock.pegRatio <= 0.5) pegScore = 25;
  else if (stock.pegRatio >= 3.0) pegScore = 0;
  else pegScore = 25 - ((stock.pegRatio - 0.5) / 2.5) * 25;

  // ROE (max 20)
  let roeScore = 0;
  if (stock.roe >= 0.40) roeScore = 20;
  else if (stock.roe <= 0) roeScore = 0;
  else roeScore = (stock.roe / 0.40) * 20;

  // Consistency (max 15)
  let consistencyScore = Math.min(1.0, stock.consecutiveYearsAbove16 / 10) * 15;

  return {
    ...stock,
    yearsTo100x,
    hundredBaggerScore: Math.round(epsScore + pegScore + roeScore + consistencyScore)
  };
}

export interface FilterState {
  epsGrowth: number;
  pegMin: number;
  pegMax: number;
  fwdPeMin: number;
  fwdPeMax: number;
  revGrowth: number;
  roeMin: number;
  netMarginMin: number;
  debtEqMax: number;
  marketCaps: string[];
  sectors: string[];
}

export const defaultFilters: FilterState = {
  epsGrowth: 15,
  pegMin: 0,
  pegMax: 2.0,
  fwdPeMin: 10,
  fwdPeMax: 40,
  revGrowth: 10,
  roeMin: 15,
  netMarginMin: 8,
  debtEqMax: 1.5,
  marketCaps: ["Mega", "Large", "Mid", "Small", "Micro"],
  sectors: [] // Empty means all
};

export function filterStocks(stocks: Stock[], filters: FilterState): Stock[] {
  return stocks.filter(s => {
    if (s.epsGrowth5yr * 100 < filters.epsGrowth) return false;
    if (s.pegRatio < filters.pegMin || s.pegRatio > filters.pegMax) return false;
    if (s.forwardPE < filters.fwdPeMin || s.forwardPE > filters.fwdPeMax) return false;
    if (s.revenueGrowth3yr * 100 < filters.revGrowth) return false;
    if (s.roe * 100 < filters.roeMin) return false;
    if (s.netMargin * 100 < filters.netMarginMin) return false;
    if (s.debtToEquity > filters.debtEqMax) return false;
    if (!filters.marketCaps.includes(s.marketCap)) return false;
    if (filters.sectors.length > 0 && !filters.sectors.includes(s.sector)) return false;
    return true;
  });
}
