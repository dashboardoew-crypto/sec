export type KothiAttendanceRecordItem = {
  id: string;
  date: string;
  monthKey: string;
  monthLabel: string;
  name: string;
  morningInTime: string;
  morningOutTime: string;
  morningMinutes: number;
  morningDurationFormatted: string;
  eveningInTime: string;
  eveningOutTime: string;
  eveningMinutes: number;
  eveningDurationFormatted: string;
  totalMinutes: number;
  totalHoursFormatted: string;
  totalHours: number;
  shiftStatus: 'Both Shifts (Full Day)' | 'Morning Only' | 'Evening Only' | 'Morning Incomplete' | 'Evening Incomplete' | 'Incomplete' | 'Present';
  signOfSecurity: string;
  hasMorning: boolean;
  hasEvening: boolean;
  createdAt: string;
};

export type KothiPersonSummary = {
  name: string;
  totalDays: number; // Day count of distinct dates attended
  totalEntries: number;
  morningShifts: number;
  eveningShifts: number;
  bothShifts: number;
  singleShiftDays: number;
  totalMinutes: number;
  totalHoursFormatted: string;
  totalHours: number;
  avgMinutesPerDay: number;
  avgHoursPerDayFormatted: string;
  avgHoursPerDay: number;
  firstDate: string;
  lastDate: string;
  activeMonths: string[];
};

export type KothiMonthlySummary = {
  monthKey: string;
  monthLabel: string;
  totalRecords: number;
  totalPersonDays: number;
  uniquePersons: number;
  morningShiftsCount: number;
  eveningShiftsCount: number;
  totalMinutes: number;
  totalHoursFormatted: string;
  totalHours: number;
  avgHoursPerPerson: number;
};

export type KothiOverallMetrics = {
  totalRecords: number;
  uniquePersons: number;
  totalPersonDays: number;
  totalMorningShifts: number;
  totalEveningShifts: number;
  totalBothShiftsDays: number;
  totalMinutes: number;
  totalHoursFormatted: string;
  totalHours: number;
  avgHoursPerDay: number;
  avgHoursPerDayFormatted: string;
};

export type KothiAttendanceReportResponse = {
  overall: KothiOverallMetrics;
  personSummaries: KothiPersonSummary[];
  monthlySummaries: KothiMonthlySummary[];
  records: KothiAttendanceRecordItem[];
  availableMonths: Array<{ key: string; label: string }>;
  availablePersons: string[];
};

export async function fetchKothiAttendanceReport(params: {
  month?: string;
  person?: string;
  from?: string;
  to?: string;
  search?: string;
} = {}): Promise<KothiAttendanceReportResponse> {
  const searchParams = new URLSearchParams();
  if (params.month && params.month !== 'all') searchParams.set('month', params.month);
  if (params.person && params.person !== 'all') searchParams.set('person', params.person);
  if (params.from) searchParams.set('from', params.from);
  if (params.to) searchParams.set('to', params.to);
  if (params.search) searchParams.set('search', params.search);

  const res = await fetch(`/api/reports/kothi-attendance?${searchParams.toString()}`);
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to fetch Kothi attendance report: ${res.statusText}`);
  }
  return res.json();
}
