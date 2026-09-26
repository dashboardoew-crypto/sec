export type HrSummary = {
  name: string;
  workLocation: string;
  supervisor: string;
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
  paymentStatus: 'paid' | 'partial' | 'unpaid' | 'excluded';
  billNumber: string | null;
  paidAt: string | null;
};

export type HrDetail = {
  id: string;
  referenceNo: string;
  date: string;
  displayDate?: string;
  name: string;
  workLocation: string;
  supervisor: string;
  source: string;
  workedDays: number;
  da: number;
  na: number;
  daAmount: number;
  naAmount: number;
  minutes: number;
  overtimeMinutes: number;
  shortfallMinutes: number;
  baseAmount: number;
  overtimeAmount: number;
  totalAmount: number;
  roundingAmount: number;
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

export type BillSignatories = {
  preparedBy: string;
  checkedBy: string;
  verifiedBy: string;
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
  roundingAmount: number;
  paymentMethod: string;
  paymentReference: string | null;
  paymentNote: string | null;
  attendanceReferences: string[];
  registers: string[];
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

export async function fetchBillSignatories(): Promise<BillSignatories> {
  const response = await fetch('/api/admin/bill-signatories', { credentials: 'include' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof payload.error === 'string' ? payload.error : 'Bill signatories could not be loaded');
  return payload as BillSignatories;
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
  roundingAmount: number;
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
export const displayDate = (value: string): string => {
  const range = value.split(' to ');
  if (range.length === 2) return `${displayDate(range[0])} to ${displayDate(range[1])}`;
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};
export const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};
export const monthStart = () => `${today().slice(0, 8)}01`;
export const sixMonthsAgo = () => {
  const date = new Date();
  date.setMonth(date.getMonth() - 6);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};