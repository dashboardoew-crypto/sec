export type HrSummary = {
  name: string;
  workedDays: number;
  leftDays: number;
  overtimeMinutes: number;
  shortfallMinutes: number;
  wagePerDay: number;
  wageAmount: number;
  baseAmount: number;
  overtimeAmount: number;
  overtimeRate: number;
  roundingAmount: number;
  totalAmount: number;
  sources: Record<string, { days: number; overtimeMinutes: number; amount: number }>;
  paymentStatus: 'paid' | 'unpaid';
  billNumber: string | null;
  paidAt: string | null;
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
  sourceScope: string;
};

export type PaymentBill = {
  id: string;
  billNumber: string;
  billKey: string;
  personName: string;
  fromDate: string;
  toDate: string;
  sourceScope: string;
  totalDays: number;
  wagePerDay: number;
  wageAmount: number;
  overtimeMinutes: number;
  overtimeRate: number;
  overtimeAmount: number;
  roundingAmount: number;
  totalAmount: number;
  status: 'paid' | 'unpaid';
  paidAt: string | null;
  paidBy: string | null;
};

export async function fetchHrReport(from: string, to: string, source = 'all'): Promise<HrReport> {
  const response = await fetch(`/api/hr/report?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&source=${encodeURIComponent(source)}`, { credentials: 'include' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof payload.error === 'string' ? payload.error : 'The HR report could not be loaded');
  return payload as HrReport;
}

export async function fetchPaymentBills(from = '', to = '', source = 'all', name = ''): Promise<PaymentBill[]> {
  const query = new URLSearchParams({ from, to, source, name });
  const response = await fetch(`/api/payments/bills?${query.toString()}`, { credentials: 'include' });
  const payload = await response.json().catch(() => []);
  if (!response.ok) throw new Error(typeof payload.error === 'string' ? payload.error : 'Payment history could not be loaded');
  return payload as PaymentBill[];
}

export async function savePaymentBill(input: {
  personName: string;
  fromDate: string;
  toDate: string;
  sourceScope: string;
  totalDays: number;
  wagePerDay: number;
  wageAmount: number;
  overtimeMinutes: number;
  overtimeRate: number;
  overtimeAmount: number;
  roundingAmount: number;
  totalAmount: number;
  status: 'paid' | 'unpaid';
}): Promise<PaymentBill> {
  const response = await fetch('/api/payments/bills', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(input),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof payload.error === 'string' ? payload.error : 'Payment status could not be saved');
  return payload as PaymentBill;
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