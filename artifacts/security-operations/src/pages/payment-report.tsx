import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Download, FileSpreadsheet, RefreshCw } from 'lucide-react';
import { Link } from 'wouter';
import { PageIntro } from '@/components/ops-ui';
import { displayDate, fetchHrReport, fetchPaymentTransactions, formatDays, formatMinutes, monthStart, today, type HrReport, type PaymentTransaction } from '@/lib/hr-report';

const inputClass = 'w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary';
const amount = (value: number) => `₹${value.toFixed(2)}`;
const sourceLabel = (source: string) => source === 'daily-attendance' ? 'Training Register' : source === 'chowk-labour' ? 'Chowk Labour' : source === 'driver-attendance' ? 'Driver Attendance' : 'All registers';
const statusLabel = (status: string) => status === 'paid' ? 'Paid' : status === 'partial' ? 'Partly paid' : 'Unpaid';
const shortDate = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: '2-digit' });
const paymentDateLabel = (value: string) => displayDate(value.slice(0, 10));

export default function PaymentReportPage() {
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [source, setSource] = useState('all');
  const [name, setName] = useState('');
  const [report, setReport] = useState<HrReport | null>(null);
  const [transactions, setTransactions] = useState<PaymentTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async (nextFrom = from, nextTo = to, nextSource = source, nextName = name) => {
    setLoading(true);
    setError('');
    try {
      const [nextReport, nextTransactions] = await Promise.all([
        fetchHrReport(nextFrom, nextTo, nextSource),
        fetchPaymentTransactions('', '', nextSource, nextName, today()),
      ]);
      setReport(nextReport);
      setTransactions(nextTransactions);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Payment report could not be loaded');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const peopleOptions = useMemo(() => Array.from(new Set(
    (report?.details ?? [])
      .filter((row) => source === 'all' || row.source === source)
      .map((row) => row.name)
      .filter(Boolean),
  )).sort((a, b) => a.localeCompare(b)), [report, source]);
  const details = useMemo(() => (report?.details ?? [])
    .filter((row) => row.name.toLowerCase().includes(name.trim().toLowerCase()))
    .sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name)), [name, report]);
  const summaries = useMemo(() => (report?.summaries ?? []).filter((row) => row.name.toLowerCase().includes(name.trim().toLowerCase())), [name, report]);
  const visibleTransactions = useMemo(() => transactions.filter((transaction) =>
    !name || transaction.personName.toLowerCase() === name.toLowerCase(),
  ), [name, transactions]);
  const totals = useMemo(() => ({
    people: summaries.length,
    due: details.reduce((sum, row) => sum + row.totalAmount, 0),
    paid: details.reduce((sum, row) => sum + row.paidAmount, 0),
    left: details.reduce((sum, row) => sum + row.outstandingAmount, 0),
    paidDays: details.filter((row) => row.paymentStatus === 'paid').length,
    unpaidDays: details.filter((row) => row.paymentStatus !== 'paid').length,
  }), [details, summaries.length]);

  const exportReport = () => {
    const columns = ['Attendance date', 'Person', 'Register', 'Days', 'Hours', 'Overtime', 'Amount due', 'Amount paid', 'Amount left', 'Status', 'Payment date', 'Method', 'Reference'];
    const rows = details.map((row) => [
      row.date,
      row.name,
      sourceLabel(row.source),
      formatDays(row.workedDays),
      formatMinutes(row.minutes),
      formatMinutes(row.overtimeMinutes),
      row.totalAmount.toFixed(2),
      row.paidAmount.toFixed(2),
      row.outstandingAmount.toFixed(2),
      statusLabel(row.paymentStatus),
      row.paymentDates.map(paymentDateLabel).join(' | '),
      row.paymentMethods.join(' | '),
      row.paymentReferences.join(' | '),
    ]);
    const csv = [columns, ...rows].map((row) => row.map((cell) => JSON.stringify(cell)).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `payment-detail-report-${from}-to-${to}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return <div className="ops-grid min-h-[100dvh] px-5 py-8 md:px-8 lg:px-10">
    <div className="mb-6 flex items-center justify-between print:hidden"><Link href="/" className="flex items-center gap-2 text-sm font-semibold"><ArrowLeft size={16} /> Back to modules</Link><span className="font-mono text-[10px] uppercase tracking-[.16em] text-muted-foreground">Payment reporting workspace</span></div>
    <PageIntro eyebrow="Human resources and finance" title="Daily payment ledger" description="See every person, attendance day, amount due, amount paid, amount left, and the payment event that covered it." action={<div className="flex flex-wrap gap-2"><Link href="/reports" className="rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-semibold hover:bg-muted print:hidden">Payroll summary</Link><Link href="/payments" className="rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-semibold hover:bg-muted print:hidden">Open unpaid queue</Link><button onClick={exportReport} disabled={!details.length} className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-semibold hover:bg-muted disabled:opacity-50 print:hidden"><Download size={16} /> Export detail</button></div>} />

    <section className="mb-5 rounded-xl border border-border bg-card p-5 shadow-sm print:hidden">
      <div className="grid gap-4 md:grid-cols-4">
        <label><span className="mb-1.5 block text-xs font-semibold">From date</span><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className={inputClass} /></label>
        <label><span className="mb-1.5 block text-xs font-semibold">To date</span><input type="date" value={to} onChange={(event) => setTo(event.target.value)} className={inputClass} /></label>
        <label><span className="mb-1.5 block text-xs font-semibold">Register</span><select value={source} onChange={(event) => setSource(event.target.value)} className={inputClass}><option value="all">All registers</option><option value="driver-attendance">Driver Attendance</option><option value="daily-attendance">Training Register</option><option value="chowk-labour">Chowk Labour</option></select></label>
       <label><span className="mb-1.5 block text-xs font-semibold">Search person</span><select value={name} onChange={(event) => setName(event.target.value)} className={inputClass} disabled={!peopleOptions.length}><option value="">All people</option>{peopleOptions.map((personName) => <option key={personName} value={personName}>{personName}</option>)}</select></label>
      </div>
      <div className="mt-4 flex items-center gap-3"><button onClick={() => void load(from, to, source, name)} disabled={loading || !from || !to || from > to} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> {loading ? 'Loading…' : 'Refresh report'}</button>{error && <span className="text-sm text-destructive">{error}</span>}</div>
    </section>

    <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-6 print:hidden">
      <Metric label="People" value={String(totals.people)} />
      <Metric label="Amount due" value={amount(totals.due)} />
      <Metric label="Amount paid" value={amount(totals.paid)} tone="success" />
      <Metric label="Amount left" value={amount(totals.left)} tone="warning" />
      <Metric label="Paid days" value={String(totals.paidDays)} tone="success" />
      <Metric label="Unpaid days" value={String(totals.unpaidDays)} tone="warning" />
    </div>

    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center gap-3 border-b border-border px-5 py-4"><FileSpreadsheet size={19} className="text-primary" /><div><h2 className="font-serif text-lg font-bold">Day-by-day payment ledger</h2><p className="text-xs text-muted-foreground">{report ? `${shortDate(report.from)} – ${shortDate(report.to)} · ${details.length} attendance days` : 'Choose a date range'}</p></div></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[1450px] text-left text-sm"><thead className="border-b border-border bg-muted/45"><tr>{['Attendance date', 'Person', 'Register', 'Days', 'Hours', 'Overtime', 'Amount due', 'Paid', 'Amount left', 'Status', 'Payment date', 'Method', 'Reference'].map((label) => <th key={label} className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</th>)}</tr></thead><tbody className="divide-y divide-border">{details.map((row) => <tr key={row.id} className="hover:bg-muted/30"><td className="px-4 py-3">{displayDate(row.date)}</td><td className="px-4 py-3 font-semibold">{row.name}</td><td className="px-4 py-3">{sourceLabel(row.source)}</td><td className="px-4 py-3">{formatDays(row.workedDays)}</td><td className="px-4 py-3 font-mono">{formatMinutes(row.minutes)}</td><td className="px-4 py-3 font-mono text-primary">{formatMinutes(row.overtimeMinutes)}</td><td className="px-4 py-3 font-mono font-semibold">{amount(row.totalAmount)}</td><td className="px-4 py-3 font-mono text-emerald-700">{amount(row.paidAmount)}</td><td className="px-4 py-3 font-mono font-bold text-amber-700">{amount(row.outstandingAmount)}</td><td className="px-4 py-3"><StatusBadge status={row.paymentStatus} /></td><td className="px-4 py-3 text-xs">{row.paymentDates.length ? row.paymentDates.map(paymentDateLabel).join(', ') : '—'}</td><td className="px-4 py-3 text-xs">{row.paymentMethods.join(', ') || '—'}</td><td className="px-4 py-3 text-xs">{row.paymentReferences.join(', ') || '—'}</td></tr>)}</tbody></table></div>
      {!loading && !details.length && <div className="p-10 text-center text-sm text-muted-foreground">No attendance payment rows match this period and search.</div>}
    </section>

    <section className="mt-6 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
       <div className="border-b border-border px-5 py-4"><h2 className="font-serif text-lg font-bold">Payments made today</h2><p className="text-xs text-muted-foreground">Only payments recorded today are shown, separate from the attendance rows they cover.</p></div>
       <div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-left text-sm"><thead className="border-b border-border bg-muted/45"><tr>{['Payment date', 'Person', 'Paid period', 'Register', 'Amount', 'Method', 'Reference', 'Paid by'].map((label) => <th key={label} className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</th>)}</tr></thead><tbody className="divide-y divide-border">{visibleTransactions.map((transaction) => <tr key={transaction.id}><td className="px-4 py-3">{paymentDateLabel(transaction.paidAt)}</td><td className="px-4 py-3 font-semibold">{transaction.personName}</td><td className="px-4 py-3 text-xs">{displayDate(transaction.fromDate)} – {displayDate(transaction.toDate)}</td><td className="px-4 py-3">{sourceLabel(transaction.sourceScope)}</td><td className="px-4 py-3 font-mono font-bold text-emerald-700">{amount(transaction.amount)}</td><td className="px-4 py-3">{transaction.paymentMethod}</td><td className="px-4 py-3 text-xs">{transaction.paymentReference || '—'}</td><td className="px-4 py-3 text-xs">{transaction.paidBy || '—'}</td></tr>)}</tbody></table></div>
       {!loading && !visibleTransactions.length && <div className="p-8 text-center text-sm text-muted-foreground">No payments have been recorded today for this register and person filter.</div>}
    </section>
  </div>;
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: 'success' | 'warning' }) {
  return <div className={`rounded-xl border p-4 shadow-sm ${tone === 'success' ? 'border-emerald-200 bg-emerald-50/70' : tone === 'warning' ? 'border-amber-200 bg-amber-50/70' : 'border-border bg-card'}`}><div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div><div className="mt-1 font-mono text-xl font-bold">{value}</div></div>;
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${status === 'paid' ? 'bg-emerald-100 text-emerald-800' : status === 'partial' ? 'bg-sky-100 text-sky-800' : 'bg-amber-100 text-amber-800'}`}>{statusLabel(status)}</span>;
}