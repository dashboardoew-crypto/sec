export type SolarCleaningRecordItem = {
  id: string;
  date: string;
  monthKey: string;
  monthLabel: string;
  name: string;
  inTime: string;
  outTime: string;
  manPowerFormatted: string;
  manPowerMinutes: number;
  manPowerHours: number;
  yard: string;
  canopyZoneI: string;
  foundryZoneII: string;
  machineShopIII: string;
  remark: string;
};

export type MonthlySolarSummary = {
  monthKey: string;
  monthLabel: string;
  totalShifts: number;
  totalMinutes: number;
  totalManPowerFormatted: string;
  totalManPowerHours: number;
  avgMinutesPerShift: number;
  avgManPowerFormatted: string;
  workerCount: number;
  workers: string[];
  zonesSummary: {
    yard: number;
    canopyZoneI: number;
    foundryZoneII: number;
    machineShopIII: number;
  };
};

export type WorkerSolarSummary = {
  name: string;
  totalShifts: number;
  totalMinutes: number;
  totalManPowerFormatted: string;
  totalManPowerHours: number;
  avgMinutesPerShift: number;
  avgManPowerFormatted: string;
  activeMonths: string[];
  lastActiveDate: string;
};

export type SolarAnalyticsOverall = {
  totalShifts: number;
  totalMinutes: number;
  totalManPowerFormatted: string;
  totalManPowerHours: number;
  uniqueWorkers: number;
  activeMonthsCount: number;
  avgMinutesPerShift: number;
  avgManPowerFormatted: string;
};

export type SolarAnalyticsReport = {
  overall: SolarAnalyticsOverall;
  monthlySummaries: MonthlySolarSummary[];
  workerSummaries: WorkerSolarSummary[];
  records: SolarCleaningRecordItem[];
  availableMonths: Array<{ key: string; label: string }>;
  availableWorkers: string[];
};

export async function fetchSolarAnalytics(params: {
  month?: string;
  worker?: string;
  from?: string;
  to?: string;
  search?: string;
} = {}): Promise<SolarAnalyticsReport> {
  const searchParams = new URLSearchParams();
  if (params.month && params.month !== 'all') searchParams.set('month', params.month);
  if (params.worker && params.worker !== 'all') searchParams.set('worker', params.worker);
  if (params.from) searchParams.set('from', params.from);
  if (params.to) searchParams.set('to', params.to);
  if (params.search) searchParams.set('search', params.search);

  const res = await fetch(`/api/reports/solar-cleaning?${searchParams.toString()}`);
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to fetch solar cleaning analytics: ${res.statusText}`);
  }
  return res.json();
}

