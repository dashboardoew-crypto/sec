import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, Clock3, Download, Eye, FileText, LockKeyhole, Printer, RefreshCw, WalletCards } from 'lucide-react';
import { Link } from 'wouter';
import { PageIntro } from '@/components/ops-ui';
import { canEditPayments, useAuth } from '@/lib/auth';
import {
  displayDate,
  fetchHrReport,
  fetchPaymentTransactions,
  formatDays,
  formatMinutes,
  monthStart,
  savePaymentBill,
  today,
  type HrReport,
  type PaymentTransaction,
} from '@/lib/hr-report';

const inputClass = 'w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary';
const sourceLabel = (source: string) => source === 'daily-attendance' ? 'Training Register' : source === 'driver-attendance' ? 'Driver Attendance' : source === 'chowk-labour' ? 'Chowk Labour' : 'All three registers';
const amount = (value: number) => `₹${value.toFixed(2)}`;
const shortDate = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: '2-digit' });
const statusLabel = (status: string) => status === 'paid' ? 'Paid' : status === 'partial' ? 'Partly paid' : 'Unpaid';
const paymentMethods = ['Cash', 'Bank transfer', 'UPI', 'Cheque', 'Other'];

type StatusFilter = 'all' | 'paid' | 'partial' | 'unpaid';

export default function PaymentsPage() {
  const { user } = useAuth();
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [source, setSource] = useState('all');
  const [name, setName] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [person, setPerson] = useState('');
  const [report, setReport] = useState<HrReport | null>(null);
  const [transactions, setTransactions] = useState<PaymentTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentNote, setPaymentNote] = useState('');
  const editable = canEditPayments(user?.role);

  const load = async (nextFrom = from, nextTo = to, nextSource = source) => {
    setLoading(true);
    setError('');
    try {
      const [nextReport, nextTransactions] = await Promise.all([
        fetchHrReport(nextFrom, nextTo, nextSource),
        fetchPaymentTransactions(nextFrom, nextTo, nextSource, name),
      ]);
      setReport(nextReport);
      setTransactions(nextTransactions);
      if (person && !nextReport.summaries.some((row) => row.name === person)) setPerson('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Payment report could not be loaded');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const people = useMemo(() => (report?.summaries ?? []).filter((row) => {
    const matchesName = row.name.toLowerCase().includes(name.trim().toLowerCase());
    const matchesStatus = statusFilter === 'all' || row.paymentStatus === statusFilter;
    return matchesName && matchesStatus;
  }), [name, report, statusFilter]);
  const selected = useMemo(() => report?.summaries.find((row) => row.name === person) ?? null, [person, report]);
  const selectedDetails = useMemo(() => (report?.details ?? []).filter((row) => !person || row.name === person), [person, report]);
  const totals = useMemo(() => {
    const rows = report?.summaries ?? [];
    return {
      workers: rows.length,
      payable: rows.reduce((sum, row) => sum + row.totalAmount, 0),
      paid: rows.reduce((sum, row) => sum + row.paidAmount, 0),
      outstanding: rows.reduce((sum, row) => sum + row.outstandingAmount, 0),
      paidWorkers: rows.filter((row) => row.paymentStatus === 'paid').length,
      pendingWorkers: rows.filter((row) => row.paymentStatus !== 'paid').length,
    };
  }, [report]);

  useEffect(() => {
    if (!selected) {
      setPaymentAmount('');
      return;
    }
    setPaymentAmount(selected.outstandingAmount > 0 ? selected.outstandingAmount.toFixed(2) : '');
  }, [selected?.name, selected?.outstandingAmount]);

  const recordPayment = async () => {
    if (!selected || !report) return;
    const entered = Number(paymentAmount);
    if (!Number.isFinite(entered) || entered <= 0 || entered > selected.outstandingAmount + 0.005) {
      setError(`Enter an amount between ₹0.01 and ${amount(selected.outstandingAmount)}.`);
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const nextStatus = entered >= selected.outstandingAmount - 0.005 ? 'paid' : 'partial';
      await savePaymentBill({
        personName: selected.name,
        fromDate: report.from,
        toDate: report.to,
        sourceScope: source,
        totalDays: selected.workedDays,
        wagePerDay: selected.wagePerDay,
        wageAmount: selected.wageAmount,
        overtimeMinutes: selected.overtimeMinutes,
        overtimeRate: selected.overtimeRate,
        overtimeAmount: selected.overtimeAmount,
        roundingAmount: selected.roundingAmount,
        totalAmount: selected.totalAmount,
        paymentAmount: entered,
        status: nextStatus,
        paymentMethod,
        paymentReference,
        paymentNote,
      });
      setNotice(`${selected.name}: ${amount(entered)} recorded as ${statusLabel(nextStatus).toLowerCase()}.`);
      setPaymentReference('');
      setPaymentNote('');
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Payment could not be saved');
    } finally {
      setSaving(false);
    }
  };

  const exportCsv = () => {
    const columns = ['Name', 'Days', 'Wage amount', 'Overtime', 'OT amount', 'Total payable', 'Paid', 'Outstanding', 'Status'];
    const rows = people.map((row) => [row.name, formatDays(row.workedDays), row.wageAmount.toFixed(2), formatMinutes(row.overtimeMinutes), row.overtimeAmount.toFixed(2), row.totalAmount.toFixed(2), row.paidAmount.toFixed(2), row.outstandingAmount.toFixed(2), statusLabel(row.paymentStatus)]);
    const csv = [columns, ...rows].map((row) => row.map((cell) => JSON.stringify(cell)).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `payments-${from}-to-${to}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return <div className="ops-grid min-h-[100dvh] px-5 py-8 md:px-8 lg:px-10">
    <div className="mb-6 flex items-center justify-between print:hidden"><Link href="/" className="flex items-center gap-2 text-sm font-semibold"><ArrowLeft size={16} /> Back to modules</Link><span className="font-mono text-[10px] uppercase tracking-[.16em] text-muted-foreground">HR + payment workspace</span></div>
    <PageIntro eyebrow="Human resources and finance" title="Payroll control centre" description="Review attendance-based earnings, see who is paid or outstanding, and record each worker payment with a clear audit trail." action={<div className="flex gap-2 print:hidden"><button onClick={exportCsv} disabled={!people.length} className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-semibold hover:bg-muted disabled:opacity-50"><Download size={16} /> Export</button><button onClick={() => window.print()} disabled={!selected} className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-semibold hover:bg-muted disabled:opacity-50"><Printer size={16} /> Print bill</button></div>} />

    <section className="mb-5 rounded-xl border border-border bg-card p-5 shadow-sm print:hidden">
      <div className="mb-4 flex items-center gap-3"><div className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary"><WalletCards size={20} /></div><div><h2 className="font-serif text-lg font-bold">Payroll period</h2><p className="text-xs text-muted-foreground">Generate the worker balances for a date range and register scope.</p></div></div>
      <div className="grid gap-4 md:grid-cols-5">
        <label><span className="mb-1.5 block text-xs font-semibold">From date</span><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className={inputClass} /></label>
        <label><span className="mb-1.5 block text-xs font-semibold">To date</span><input type="date" value={to} onChange={(event) => setTo(event.target.value)} className={inputClass} /></label>
        <label><span className="mb-1.5 block text-xs font-semibold">Register</span><select value={source} onChange={(event) => setSource(event.target.value)} className={inputClass}><option value="all">All three registers</option><option value="driver-attendance">Driver Attendance</option><option value="daily-attendance">Training Register</option><option value="chowk-labour">Chowk Labour</option></select></label>
        <label><span className="mb-1.5 block text-xs font-semibold">Search worker</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="All names" className={inputClass} /></label>
        <label><span className="mb-1.5 block text-xs font-semibold">Payment status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)} className={inputClass}><option value="all">All statuses</option><option value="unpaid">Unpaid</option><option value="partial">Partly paid</option><option value="paid">Paid</option></select></label>
      </div>
      <div className="mt-4 flex items-center gap-3"><button onClick={() => { setPerson(''); void load(); }} disabled={loading || !from || !to || from > to} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> {loading ? 'Loading…' : 'Generate payroll'}</button>{error && <span className="text-sm text-destructive">{error}</span>}{notice && <span className="text-sm text-primary">{notice}</span>}</div>
    </section>

    <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-6 print:hidden">
      <Metric label="Workers" value={String(totals.workers)} detail={`${totals.paidWorkers} paid · ${totals.pendingWorkers} pending`} />
      <Metric label="Total payable" value={amount(totals.payable)} />
      <Metric label="Paid" value={amount(totals.paid)} tone="success" />
      <Metric label="Outstanding" value={amount(totals.outstanding)} tone="warning" />
      <Metric label="Paid workers" value={String(totals.paidWorkers)} tone="success" />
      <Metric label="Pending workers" value={String(totals.pendingWorkers)} tone="warning" />
    </div>

    {report && !person && <section className="mb-6 overflow-hidden rounded-xl border border-border bg-card shadow-sm print:hidden"><div className="flex items-center gap-3 border-b border-border px-5 py-4"><FileText size={18} className="text-primary" /><div><h2 className="font-serif text-lg font-bold">Worker payment queue</h2><p className="text-xs text-muted-foreground">{people.length} workers · {sourceLabel(source)} · {shortDate(report.from)} to {shortDate(report.to)}</p></div></div><div className="overflow-x-auto"><table className="w-full min-w-[1100px] text-left text-sm"><thead className="border-b border-border bg-muted/45"><tr>{['Worker', 'Days', 'Wage amount', 'Overtime', 'Total payable', 'Paid', 'Outstanding', 'Status', 'Action'].map((label) => <th key={label} className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</th>)}</tr></thead><tbody className="divide-y divide-border">{people.map((row) => <tr key={row.name} className="hover:bg-muted/30"><td className="px-4 py-3 font-semibold">{row.name}</td><td className="px-4 py-3">{formatDays(row.workedDays)}</td><td className="px-4 py-3 font-mono">{amount(row.wageAmount)}</td><td className="px-4 py-3 font-mono text-primary">{formatMinutes(row.overtimeMinutes)}</td><td className="px-4 py-3 font-mono font-bold">{amount(row.totalAmount)}</td><td className="px-4 py-3 font-mono text-emerald-700">{amount(row.paidAmount)}</td><td className="px-4 py-3 font-mono font-bold text-amber-700">{amount(row.outstandingAmount)}</td><td className="px-4 py-3"><StatusBadge status={row.paymentStatus} /></td><td className="px-4 py-3"><button onClick={() => setPerson(row.name)} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted">Open worker</button></td></tr>)}</tbody></table></div>{!people.length && <div className="p-10 text-center text-sm text-muted-foreground">No workers match these filters.</div>}</section>}

    {selected && report && <PaymentWorkerCard report={report} source={source} selected={selected} selectedDetails={selectedDetails} transactions={transactions.filter((transaction) => transaction.personName === selected.name)} paymentAmount={paymentAmount} paymentMethod={paymentMethod} paymentReference={paymentReference} paymentNote={paymentNote} saving={saving} editable={editable} onPaymentAmountChange={setPaymentAmount} onPaymentMethodChange={setPaymentMethod} onPaymentReferenceChange={setPaymentReference} onPaymentNoteChange={setPaymentNote} onRecordPayment={recordPayment} onBack={() => setPerson('')} />}
    {report && person && !selected && <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">Select a worker from the generated payroll.</div>}
    <PaymentHistory transactions={transactions} />
    {!editable && <div className="mt-5 flex items-center gap-2 text-xs text-muted-foreground print:hidden"><Eye size={14} /> View-only payment access</div>}
    <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground print:hidden"><LockKeyhole size={14} /> Only HR and Admin can record payments.</div>
  </div>;
}

function PaymentWorkerCard({ report, source, selected, selectedDetails, transactions, paymentAmount, paymentMethod, paymentReference, paymentNote, saving, editable, onPaymentAmountChange, onPaymentMethodChange, onPaymentReferenceChange, onPaymentNoteChange, onRecordPayment, onBack }: {
  report: HrReport;
  source: string;
  selected: NonNullable<HrReport['summaries'][number]>;
  selectedDetails: HrReport['details'];
  transactions: PaymentTransaction[];
  paymentAmount: string;
  paymentMethod: string;
  paymentReference: string;
  paymentNote: string;
  saving: boolean;
  editable: boolean;
  onPaymentAmountChange: (value: string) => void;
  onPaymentMethodChange: (value: string) => void;
  onPaymentReferenceChange: (value: string) => void;
  onPaymentNoteChange: (value: string) => void;
  onRecordPayment: () => void;
  onBack: () => void;
}) {
  return <section className="mx-auto max-w-5xl rounded-xl border-2 border-foreground/15 bg-card p-6 shadow-sm md:p-9" data-testid="payment-worker-card">
    <div className="flex flex-wrap items-start justify-between gap-5 border-b border-border pb-5"><div><button onClick={onBack} className="mb-3 text-xs font-semibold text-primary hover:underline print:hidden">← Back to worker list</button><div className="font-mono text-[10px] uppercase tracking-[.18em] text-primary">Worker payment statement</div><h2 className="mt-2 font-serif text-3xl font-bold">{selected.name}</h2><p className="mt-1 text-sm text-muted-foreground">{shortDate(report.from)} to {shortDate(report.to)} · {sourceLabel(source)}</p></div><div className="text-right"><StatusBadge status={selected.paymentStatus} /><div className="mt-2 text-xs text-muted-foreground">Outstanding</div><div className="font-mono text-2xl font-bold text-amber-700">{amount(selected.outstandingAmount)}</div></div></div>
    <div className="mt-6 grid gap-3 sm:grid-cols-4"><Metric label="Worked days" value={formatDays(selected.workedDays)} /><Metric label="Total payable" value={amount(selected.totalAmount)} /><Metric label="Paid" value={amount(selected.paidAmount)} tone="success" /><Metric label="Balance left" value={amount(selected.outstandingAmount)} tone="warning" /></div>
    <div className="mt-7 divide-y divide-border text-sm"><BillLine label="Base wages" detail={`${formatDays(selected.workedDays)} days × ${amount(selected.wagePerDay)}`} value={amount(selected.wageAmount)} /><BillLine label="Overtime" detail={`${formatMinutes(selected.overtimeMinutes)} at ${amount(selected.overtimeRate)}/hour`} value={amount(selected.overtimeAmount)} /><BillLine label="Round off" detail="Nearest rupee adjustment" value={`${selected.roundingAmount >= 0 ? '+' : ''}${amount(selected.roundingAmount)}`} /><div className="flex items-end justify-between gap-4 py-5"><div><div className="font-serif text-xl font-bold">Total amount payable</div><div className="mt-1 text-xs text-muted-foreground">Base wages + overtime + round off</div></div><div className="font-mono text-2xl font-bold text-primary">{amount(selected.totalAmount)}</div></div></div>
    {editable && selected.outstandingAmount > 0 && <div className="mt-5 rounded-xl border border-primary/20 bg-primary/5 p-5 print:hidden"><div className="mb-4"><h3 className="font-serif text-lg font-bold">Record a payment</h3><p className="text-xs text-muted-foreground">Enter the amount actually paid. The remaining balance will stay open for the next payment.</p></div><div className="grid gap-4 md:grid-cols-4"><label><span className="mb-1.5 block text-xs font-semibold">Amount paid</span><input type="number" min="0.01" max={selected.outstandingAmount} step="0.01" value={paymentAmount} onChange={(event) => onPaymentAmountChange(event.target.value)} className={inputClass} /></label><label><span className="mb-1.5 block text-xs font-semibold">Payment method</span><select value={paymentMethod} onChange={(event) => onPaymentMethodChange(event.target.value)} className={inputClass}>{paymentMethods.map((method) => <option key={method}>{method}</option>)}</select></label><label><span className="mb-1.5 block text-xs font-semibold">Reference / UTR</span><input value={paymentReference} onChange={(event) => onPaymentReferenceChange(event.target.value)} placeholder="Optional" className={inputClass} /></label><label><span className="mb-1.5 block text-xs font-semibold">Note</span><input value={paymentNote} onChange={(event) => onPaymentNoteChange(event.target.value)} placeholder="Optional" className={inputClass} /></label></div><button onClick={onRecordPayment} disabled={saving} className="mt-4 flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">{saving ? 'Saving…' : 'Record payment'}</button></div>}
    {selected.outstandingAmount === 0 && <div className="mt-5 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800"><CheckCircle2 size={17} /> This worker is fully paid for this period.</div>}
    <div className="mt-7 grid gap-7 lg:grid-cols-2"><div><h3 className="mb-3 font-serif text-lg font-bold">Attendance included</h3><div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-xs"><thead className="border-b border-border"><tr>{['Date', 'Register', 'Days', 'Hours', 'Overtime', 'Amount'].map((label) => <th key={label} className="px-2 py-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</th>)}</tr></thead><tbody className="divide-y divide-border">{selectedDetails.map((row) => <tr key={row.id}><td className="px-2 py-2">{displayDate(row.date)}</td><td className="px-2 py-2">{sourceLabel(row.source)}</td><td className="px-2 py-2">{formatDays(row.workedDays)}</td><td className="px-2 py-2 font-mono">{formatMinutes(row.minutes)}</td><td className="px-2 py-2 font-mono">{formatMinutes(row.overtimeMinutes)}</td><td className="px-2 py-2 font-mono">{amount(row.totalAmount)}</td></tr>)}</tbody></table></div></div><div><h3 className="mb-3 font-serif text-lg font-bold">Payment history for worker</h3>{transactions.length ? <div className="space-y-2">{transactions.map((transaction) => <div key={transaction.id} className="rounded-lg border border-border bg-muted/20 p-3 text-sm"><div className="flex justify-between gap-3"><span className="font-semibold">{amount(transaction.amount)} · {transaction.paymentMethod}</span><span className="text-xs text-muted-foreground">{displayDate(transaction.paidAt.slice(0, 10))}</span></div><div className="mt-1 text-xs text-muted-foreground">{transaction.paymentReference || 'No reference'}{transaction.paidBy ? ` · by ${transaction.paidBy}` : ''}</div>{transaction.paymentNote && <div className="mt-1 text-xs">{transaction.paymentNote}</div>}</div>)}</div> : <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">No payment has been recorded for this period.</div>}</div></div>
  </section>;
}

function BillLine({ label, detail, value }: { label: string; detail: string; value: string }) {
  return <div className="flex items-center justify-between gap-5 py-4"><div><div className="font-semibold">{label}</div><div className="mt-1 text-xs text-muted-foreground">{detail}</div></div><div className="font-mono text-base font-semibold">{value}</div></div>;
}

function Metric({ label, value, detail, tone }: { label: string; value: string; detail?: string; tone?: 'success' | 'warning' }) {
  return <div className={`rounded-xl border p-4 shadow-sm ${tone === 'success' ? 'border-emerald-200 bg-emerald-50/70' : tone === 'warning' ? 'border-amber-200 bg-amber-50/70' : 'border-border bg-card'}`}><div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div><div className="mt-1 font-mono text-xl font-bold">{value}</div>{detail && <div className="mt-1 text-[11px] text-muted-foreground">{detail}</div>}</div>;
}

function StatusBadge({ status }: { status: string }) {
  const Icon = status === 'paid' ? CheckCircle2 : status === 'partial' ? Clock3 : Clock3;
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${status === 'paid' ? 'bg-emerald-100 text-emerald-800' : status === 'partial' ? 'bg-sky-100 text-sky-800' : 'bg-amber-100 text-amber-800'}`}><Icon size={12} />{statusLabel(status)}</span>;
}

function PaymentHistory({ transactions }: { transactions: PaymentTransaction[] }) {
  return <section className="mt-6 overflow-hidden rounded-xl border border-border bg-card shadow-sm print:hidden"><div className="border-b border-border px-5 py-4"><h2 className="font-serif text-lg font-bold">Payment transaction history</h2><p className="text-xs text-muted-foreground">Each payment remains visible, including partial payments and their references.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[920px] text-left text-sm"><thead className="border-b border-border bg-muted/45"><tr>{['Date', 'Worker', 'Period', 'Register', 'Amount', 'Method', 'Reference', 'Paid by'].map((label) => <th key={label} className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</th>)}</tr></thead><tbody className="divide-y divide-border">{transactions.map((transaction) => <tr key={transaction.id}><td className="px-4 py-3">{displayDate(transaction.paidAt.slice(0, 10))}</td><td className="px-4 py-3 font-semibold">{transaction.personName}</td><td className="px-4 py-3 text-xs">{shortDate(transaction.fromDate)} – {shortDate(transaction.toDate)}</td><td className="px-4 py-3">{sourceLabel(transaction.sourceScope)}</td><td className="px-4 py-3 font-mono font-bold text-emerald-700">{amount(transaction.amount)}</td><td className="px-4 py-3">{transaction.paymentMethod}</td><td className="px-4 py-3 text-xs">{transaction.paymentReference || '—'}</td><td className="px-4 py-3 text-xs">{transaction.paidBy || '—'}</td></tr>)}</tbody></table></div>{!transactions.length && <div className="p-8 text-center text-sm text-muted-foreground">No payment transactions for this period yet.</div>}</section>;
}