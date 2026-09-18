import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Download, FileBarChart2, RefreshCw } from 'lucide-react';
import { Link } from 'wouter';
import { PageIntro } from '@/components/ops-ui';
import { displayDate, fetchHrReport, fetchPaymentTransactions, formatDays, formatMinutes, monthStart, today, type HrReport, type PaymentTransaction } from '@/lib/hr-report';

const inputClass = 'w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary';

export default function ReportsPage() {
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [name, setName] = useState('');
  const [source, setSource] = useState('all');
  const [report, setReport] = useState<HrReport | null>(null);
  const [transactions, setTransactions] = useState<PaymentTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    setError('');
    Promise.all([fetchHrReport(from, to, source), fetchPaymentTransactions(from, to, source, name)])
      .then(([nextReport, nextTransactions]) => { setReport(nextReport); setTransactions(nextTransactions); })
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Report could not be loaded'))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const summaries = useMemo(() => (report?.summaries ?? []).filter((row) => row.name.toLowerCase().includes(name.toLowerCase().trim())), [name, report]);
  const details = useMemo(() => (report?.details ?? []).filter((row) => (source === 'all' || row.source === source) && row.name.toLowerCase().includes(name.toLowerCase().trim())), [name, report, source]);
  const paymentRows = useMemo(() => transactions.filter((transaction) => transaction.personName.toLowerCase().includes(name.toLowerCase().trim())), [name, transactions]);
  const download = () => {
    const columns = ['Name', 'Worked days', 'Left days', 'Overtime', 'Shortfall', 'Base amount', 'Overtime amount', 'Total payable', 'Paid', 'Outstanding', 'Status'];
    const csv = [columns, ...summaries.map((row) => [row.name, formatDays(row.workedDays), formatDays(row.leftDays), formatMinutes(row.overtimeMinutes), formatMinutes(row.shortfallMinutes), row.baseAmount.toFixed(2), row.overtimeAmount.toFixed(2), row.totalAmount.toFixed(2), row.paidAmount.toFixed(2), row.outstandingAmount.toFixed(2), row.paymentStatus])]
      .map((row) => row.map((cell) => JSON.stringify(cell)).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const link = document.createElement('a'); link.href = url; link.download = `hr-report-${from}-to-${to}.csv`; link.click(); URL.revokeObjectURL(url);
  };
  const downloadPayments = () => {
    const columns = ['Payment date', 'Person', 'Period from', 'Period to', 'Register', 'Amount', 'Method', 'Reference', 'Paid by'];
    const rows = paymentRows.map((transaction) => [transaction.paidAt, transaction.personName, transaction.fromDate, transaction.toDate, transaction.sourceScope, transaction.amount.toFixed(2), transaction.paymentMethod, transaction.paymentReference ?? '', transaction.paidBy ?? '']);
    const csv = [columns, ...rows].map((row) => row.map((cell) => JSON.stringify(cell)).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const link = document.createElement('a'); link.href = url; link.download = `payment-history-${from}-to-${to}.csv`; link.click(); URL.revokeObjectURL(url);
  };

  return <div className="ops-grid min-h-[100dvh] px-5 py-8 md:px-8 lg:px-10">
    <div className="mb-6 flex items-center justify-between print:hidden"><Link href="/" className="flex items-center gap-2 text-sm font-semibold"><ArrowLeft size={16} /> Back to modules</Link><span className="font-mono text-[10px] uppercase tracking-[.16em] text-muted-foreground">HR workspace</span></div>
    <PageIntro eyebrow="Human resources" title="Payroll summary" description="Review worked days, overtime, payable amounts, amount paid, and the balance still left for every person." action={<div className="flex flex-wrap gap-2"><Link href="/payments" className="rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-semibold hover:bg-muted print:hidden">Open unpaid queue</Link><Link href="/payment-report" className="rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-semibold hover:bg-muted print:hidden">Daily ledger</Link><button onClick={download} disabled={!summaries.length} className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-semibold hover:bg-muted disabled:opacity-50 print:hidden"><Download size={16} /> Export payroll</button><button onClick={downloadPayments} disabled={!paymentRows.length} className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-semibold hover:bg-muted disabled:opacity-50 print:hidden"><Download size={16} /> Export payments</button></div>} />
    <section className="mb-6 rounded-xl border border-border bg-card p-5 shadow-sm print:hidden">
      <div className="grid gap-4 md:grid-cols-4">
        <label><span className="mb-1.5 block text-xs font-semibold">From date</span><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className={inputClass} /></label>
        <label><span className="mb-1.5 block text-xs font-semibold">To date</span><input type="date" value={to} onChange={(event) => setTo(event.target.value)} className={inputClass} /></label>
        <label><span className="mb-1.5 block text-xs font-semibold">Search person</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="All names" className={inputClass} /></label>
        <label><span className="mb-1.5 block text-xs font-semibold">Register detail filter</span><select value={source} onChange={(event) => setSource(event.target.value)} className={inputClass}><option value="all">All registers</option><option value="driver-attendance">Driver Attendance</option><option value="daily-attendance">Training Register</option><option value="chowk-labour">Chowk Labour</option></select></label>
      </div>
      <div className="mt-4 flex items-center gap-3"><button onClick={load} disabled={loading || !from || !to || from > to} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> {loading ? 'Loading…' : 'Refresh report'}</button>{error && <span className="text-sm text-destructive">{error}</span>}</div>
    </section>
    {report && <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-6"><Metric label="People" value={String(summaries.length)} /><Metric label="Expected days" value={String(report.expectedDays)} /><Metric label="Visible entries" value={String(details.length)} /><Metric label="Total payable" value={amount(summaries.reduce((sum, row) => sum + row.totalAmount, 0))} /><Metric label="Paid" value={amount(summaries.reduce((sum, row) => sum + row.paidAmount, 0))} /><Metric label="Outstanding" value={amount(summaries.reduce((sum, row) => sum + row.outstandingAmount, 0))} /></div>}
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center gap-3 border-b border-border px-5 py-4"><FileBarChart2 size={19} className="text-primary" /><div><h2 className="font-serif text-lg font-bold">Person summary</h2><p className="text-xs text-muted-foreground">{report ? `${displayDate(report.from)} – ${displayDate(report.to)}` : 'Choose a date range'}</p></div></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[1200px] text-left text-sm"><thead className="border-b border-border bg-muted/45"><tr>{['Name', 'Worked days', 'Left days', 'Overtime', 'Shortfall', 'Base amount', 'OT amount', 'Total payable', 'Paid', 'Outstanding', 'Status'].map((label) => <th key={label} className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</th>)}</tr></thead><tbody className="divide-y divide-border">{summaries.map((row) => <tr key={row.name} className="hover:bg-muted/30"><td className="px-4 py-3 font-semibold">{row.name}</td><td className="px-4 py-3">{formatDays(row.workedDays)}</td><td className="px-4 py-3">{formatDays(row.leftDays)}</td><td className="px-4 py-3 font-mono text-primary">{formatMinutes(row.overtimeMinutes)}</td><td className="px-4 py-3 font-mono text-muted-foreground">{formatMinutes(row.shortfallMinutes)}</td><td className="px-4 py-3 font-mono">{amount(row.baseAmount)}</td><td className="px-4 py-3 font-mono">{amount(row.overtimeAmount)}</td><td className="px-4 py-3 font-mono font-bold text-primary">{amount(row.totalAmount)}</td><td className="px-4 py-3 font-mono text-emerald-700">{amount(row.paidAmount)}</td><td className="px-4 py-3 font-mono font-bold text-amber-700">{amount(row.outstandingAmount)}</td><td className="px-4 py-3"><StatusBadge status={row.paymentStatus} /></td></tr>)}</tbody></table></div>
      {!loading && !summaries.length && <div className="p-10 text-center text-sm text-muted-foreground">No people match this period and search.</div>}
    </section>
    <section className="mt-6 overflow-hidden rounded-xl border border-border bg-card shadow-sm print:hidden"><div className="border-b border-border px-5 py-4"><h2 className="font-serif text-lg font-bold">Entry detail</h2><p className="text-xs text-muted-foreground">Use the register filter to inspect the rows included in the summary.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="border-b border-border bg-muted/45"><tr>{['Date', 'Person', 'Register', 'Days', 'Hours', 'Overtime', 'Amount', 'Status'].map((label) => <th key={label} className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</th>)}</tr></thead><tbody className="divide-y divide-border">{details.map((row) => <tr key={row.id}><td className="px-4 py-3">{displayDate(row.date)}</td><td className="px-4 py-3 font-semibold">{row.name}</td><td className="px-4 py-3">{row.source === 'daily-attendance' ? 'Training Register' : row.source === 'driver-attendance' ? 'Driver Attendance' : 'Chowk Labour'}</td><td className="px-4 py-3">{formatDays(row.workedDays)}</td><td className="px-4 py-3 font-mono">{formatMinutes(row.minutes)}</td><td className="px-4 py-3 font-mono">{formatMinutes(row.overtimeMinutes)}</td><td className="px-4 py-3 font-mono">{row.totalAmount.toFixed(2)}</td><td className="px-4 py-3 text-xs">{row.paymentStatus}</td></tr>)}</tbody></table></div></section>
    <section className="mt-6 overflow-hidden rounded-xl border border-border bg-card shadow-sm print:hidden"><div className="border-b border-border px-5 py-4"><h2 className="font-serif text-lg font-bold">All-person payment report</h2><p className="text-xs text-muted-foreground">Payments recorded inside the selected period, including overtime and partial payments.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[1000px] text-left text-sm"><thead className="border-b border-border bg-muted/45"><tr>{['Payment date', 'Person', 'Paid period', 'Register', 'Amount', 'Method', 'Reference', 'Paid by'].map((label) => <th key={label} className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</th>)}</tr></thead><tbody className="divide-y divide-border">{paymentRows.map((transaction) => <tr key={transaction.id}><td className="px-4 py-3">{displayDate(transaction.paidAt.slice(0, 10))}</td><td className="px-4 py-3 font-semibold">{transaction.personName}</td><td className="px-4 py-3 text-xs">{displayDate(transaction.fromDate)} – {displayDate(transaction.toDate)}</td><td className="px-4 py-3">{transaction.sourceScope === 'daily-attendance' ? 'Training Register' : transaction.sourceScope === 'chowk-labour' ? 'Chowk Labour' : transaction.sourceScope === 'driver-attendance' ? 'Driver Attendance' : 'All registers'}</td><td className="px-4 py-3 font-mono font-bold text-emerald-700">{amount(transaction.amount)}</td><td className="px-4 py-3">{transaction.paymentMethod}</td><td className="px-4 py-3 text-xs">{transaction.paymentReference || '—'}</td><td className="px-4 py-3 text-xs">{transaction.paidBy || '—'}</td></tr>)}</tbody></table></div>{!loading && !paymentRows.length && <div className="p-8 text-center text-sm text-muted-foreground">No payments recorded in this period.</div>}</section>
  </div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-border bg-card p-4 shadow-sm"><div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div><div className="mt-1 font-mono text-2xl font-bold">{value}</div></div>;
}

const amount = (value: number) => `₹${value.toFixed(2)}`;

function StatusBadge({ status }: { status: string }) {
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${status === 'paid' ? 'bg-emerald-100 text-emerald-800' : status === 'partial' ? 'bg-sky-100 text-sky-800' : 'bg-amber-100 text-amber-800'}`}>{status === 'paid' ? 'Paid' : status === 'partial' ? 'Partly paid' : 'Unpaid'}</span>;
}