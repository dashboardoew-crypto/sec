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
  totalAmount: number;
  sources: Record<string, { days: number; overtimeMinutes: number; amount: number }>;
  paidAmount: number;
  outstandingAmount: number;
  paymentStatus: 'paid' | 'partial' | 'unpaid';
  billNumber: string | null;
  paidAt: string | null;
};

export type HrDetail = {
  id: string;
  referenceNo: string;
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
  paidAmount: number;
  outstandingAmount: number;
  paymentDates: string[];
  paymentMethods: string[];
  paymentReferences: string[];
  paymentAllocations: Array<{ transactionId: string; amount: number }>;
  paymentStatus: 'paid' | 'partial' | 'unpaid' | 'excluded';
  paymentIncluded: boolean;
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
  totalAmount: number;
  paidAmount: number;
  status: 'paid' | 'partial' | 'unpaid';
  paymentMethod: string | null;
  paymentReference: string | null;
  paymentNote: string | null;
  paidAt: string | null;
  paidBy: string | null;
};

export type PaymentTransaction = {
  id: string;
  billKey: string;
  billNumber: string;
  personName: string;
  fromDate: string;
  toDate: string;
  sourceScope: string;
  amount: number;
  paymentMethod: string;
  paymentReference: string | null;
  paymentNote: string | null;
  attendanceReferences: string[];
  paidAt: string;
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

export async function fetchPaymentTransactions(from = '', to = '', source = 'all', name = '', paidOn = ''): Promise<PaymentTransaction[]> {
  const query = new URLSearchParams({ from, to, source, name, paidOn });
  const response = await fetch(`/api/payments/transactions?${query.toString()}`, { credentials: 'include' });
  const payload = await response.json().catch(() => []);
  if (!response.ok) throw new Error(typeof payload.error === 'string' ? payload.error : 'Payment transaction history could not be loaded');
  return payload as PaymentTransaction[];
}

export async function updateAttendanceInclusion(input: {
  recordId: string;
  fromDate: string;
  toDate: string;
  sourceScope: string;
  included: boolean;
}): Promise<{ included: boolean }> {
  const response = await fetch('/api/hr/attendance-inclusion', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(input),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof payload.error === 'string' ? payload.error : 'Attendance inclusion could not be updated');
  return payload as { included: boolean };
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
  totalAmount: number;
  attendanceRecordIds: string[];
  status: 'paid' | 'partial' | 'unpaid';
  paymentMethod?: string;
  paymentReference?: string;
  paymentNote?: string;
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
export const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};
export const monthStart = () => `${today().slice(0, 8)}01`;