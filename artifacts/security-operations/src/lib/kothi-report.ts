export const formatDays = (days: number): string => {
  if (Number.isInteger(days)) {
    return `${days} Days`;
  }
  return `${days.toFixed(1)} Days`;
};

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
  dayValue: number; // 1.0 (both shifts), 0.5 (single shift), 0.0 (incomplete)
  dayLabel: string; // "1.0 Day" | "0.5 Day" | "0 Days"
  attendanceType: 'Full Day (1.0)' | 'Half Day (0.5)' | 'Incomplete';
  signOfSecurity: string;
  hasMorning: boolean;
  hasEvening: boolean;
  createdAt: string;
};

export type KothiPersonSummary = {
  name: string;
  totalDays: number; // Sum of 1.0 days + 0.5 days (e.g. 14.5)
  totalDaysFormatted: string; // e.g. "14.5 Days"
  fullDays: number; // Count of 1.0 days (morning + evening)
  halfDays: number; // Count of 0.5 days (single shift)
  totalEntries: number;
  totalMinutes: number;
  totalHoursFormatted: string;
  totalHours: number;
  firstDate: string;
  lastDate: string;
  activeMonths: string[];
};

export type KothiMonthlySummary = {
  monthKey: string;
  monthLabel: string;
  totalRecords: number;
  totalDays: number;
  totalDaysFormatted: string;
  uniquePersons: number;
  fullDaysCount: number;
  halfDaysCount: number;
  totalMinutes: number;
  totalHoursFormatted: string;
  totalHours: number;
};

export type KothiOverallMetrics = {
  totalRecords: number;
  uniquePersons: number;
  totalDays: number;
  totalDaysFormatted: string;
  totalFullDays: number;
  totalHalfDays: number;
  totalMinutes: number;
  totalHoursFormatted: string;
  totalHours: number;
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
