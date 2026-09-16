export type HrSummary = {
  name: string;
  workedDays: number;
  leftDays: number;
  overtimeMinutes: number;
  shortfallMinutes: number;
  baseAmount: number;
  overtimeAmount: number;
  totalAmount: number;
  sources: Record<string, { days: number; overtimeMinutes: number; amount: number }>;
};

export type HrDetail = {
  id: string;
  date: string;
  name: string;
  source: string;
  workedDays: number;
  minutes: number;
  overtimeMinutes: number;
  shortfallMinutes: number;
  baseAmount: number;
  overtimeAmount: number;
  totalAmount: number;
  paymentStatus: string;
};

export type HrReport = {
  from: string;
  to: string;
  expectedDays: number;
  summaries: HrSummary[];
  details: HrDetail[];
};

export async function fetchHrReport(from: string, to: string): Promise<HrReport> {
  const response = await fetch(`/api/hr/report?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, { credentials: 'include' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof payload.error === 'string' ? payload.error : 'The HR report could not be loaded');
  return payload as HrReport;
}

export const formatMinutes = (minutes: number) => {
  const sign = minutes < 0 ? '-' : '';
  const absolute = Math.abs(Math.round(minutes));
  return `${sign}${String(Math.floor(absolute / 60)).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')}`;
};

export const formatDays = (days: number) => Number.isInteger(days) ? String(days) : days.toFixed(2);
export const displayDate = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
export const today = () => new Date().toISOString().slice(0, 10);
export const monthStart = () => `${today().slice(0, 8)}01`;