export type CarBreakdownRecordItem = {
  id: string;
  date: string;
  monthKey: string;
  monthLabel: string;
  carName: string;
  outTime: string;
  inDate: string;
  inTime: string;
  durationMinutes: number;
  durationFormatted: string;
  durationHours: number;
  status: 'completed' | 'in_service';
  remark: string;
};

export type MonthlyCarBreakdownSummary = {
  monthKey: string;
  monthLabel: string;
  totalIncidents: number;
  completedCount: number;
  inServiceCount: number;
  totalMinutes: number;
  totalDurationFormatted: string;
  totalDurationHours: number;
  avgMinutesPerIncident: number;
  avgDurationFormatted: string;
  uniqueCarsCount: number;
  cars: string[];
};

export type CarBreakdownVehicleSummary = {
  carName: string;
  totalIncidents: number;
  completedCount: number;
  inServiceCount: number;
  totalMinutes: number;
  totalDurationFormatted: string;
  totalDurationHours: number;
  avgMinutesPerIncident: number;
  avgDurationFormatted: string;
  activeMonths: string[];
  lastBreakdownDate: string;
};

export type CarBreakdownAnalyticsOverall = {
  totalIncidents: number;
  completedIncidents: number;
  currentlyInService: number;
  totalMinutes: number;
  totalDurationFormatted: string;
  totalDurationHours: number;
  avgMinutesPerIncident: number;
  avgDurationFormatted: string;
  uniqueCars: number;
  activeMonthsCount: number;
};

export type CarBreakdownReport = {
  overall: CarBreakdownAnalyticsOverall;
  monthlySummaries: MonthlyCarBreakdownSummary[];
  vehicleSummaries: CarBreakdownVehicleSummary[];
  records: CarBreakdownRecordItem[];
  availableMonths: Array<{ key: string; label: string }>;
  availableCars: string[];
};

export type CarBreakdownAnalyticsReport = CarBreakdownReport;

export async function fetchCarBreakdownAnalytics(params: {
  month?: string;
  car?: string;
  status?: string;
  from?: string;
  to?: string;
  search?: string;
}): Promise<CarBreakdownReport> {
  const query = new URLSearchParams();
  if (params.month && params.month !== 'all') query.set('month', params.month);
  if (params.car && params.car !== 'all') query.set('car', params.car);
  if (params.status && params.status !== 'all') query.set('status', params.status);
  if (params.from) query.set('from', params.from);
  if (params.to) query.set('to', params.to);
  if (params.search) query.set('search', params.search);

  const url = `/api/reports/car-breakdowns${query.toString() ? `?${query.toString()}` : ''}`;
  const res = await fetch(url);
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(errorText || `Failed to fetch car breakdown analytics (${res.status})`);
  }
  return res.json();
}
