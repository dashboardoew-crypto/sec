import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Eye, LockKeyhole, Printer, RefreshCw, WalletCards } from 'lucide-react';
import { Link } from 'wouter';
import { PageIntro } from '@/components/ops-ui';
import { canEditPayments, useAuth } from '@/lib/auth';
import { displayDate, fetchHrReport, formatDays, formatMinutes, monthStart, today, type HrDetail, type HrReport } from '@/lib/hr-report';

const inputClass = 'w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary';
const sourceLabel = (source: string) => source === 'daily-attendance' ? 'Training Register' : source === 'driver-attendance' ? 'Driver Attendance' : 'Chowk Labour';

export default function PaymentsPage() {
  const { user } = useAuth();
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [source, setSource] = useState('all');
  const [person, setPerson] = useState('');
  const [report, setReport] = useState<HrReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const editable = canEditPayments(user?.role);
  const load = () => { setLoading(true); setError(''); fetchHrReport(from, to).then(setReport).catch((reason) => setError(reason instanceof Error ? reason.message : 'Payment report could not be loaded')).finally(() => setLoading(false)); };
  useEffect(load, []);
  const details = useMemo(() => (report?.details ?? []).filter((row) => (source === 'all' || row.source === source) && (!person || row.name === person)), [person, report, source]);
  const people = useMemo(() => Array.from(new Set((report?.details ?? []).filter((row) => source === 'all' || row.source === source).map((row) => row.name))).sort(), [report, source]);
  const selectedSummary = useMemo(() => report?.summaries.find((row) => row.name === person), [person, report]);
  const totals = details.reduce((total, row) => ({ days: total.days + row.workedDays, overtime: total.overtime + row.overtimeMinutes, amount: total.amount + row.totalAmount }), { days: 0, overtime: 0, amount: 0 });

  return <div className="ops-grid min-h-[100dvh] px-5 py-8 md:px-8 lg:px-10">
    <div className="mb-6 flex items-center justify-between print:hidden"><Link href="/" className="flex items-center gap-2 text-sm font-semibold"><ArrowLeft size={16} /> Back to modules</Link><span className="font-mono text-[10px] uppercase tracking-[.16em] text-muted-foreground">Payment workspace</span></div>
    <PageIntro eyebrow="HR and finance workspace" title="Payment reports" description="Calculate payable amounts from Driver Attendance, Training Register, and Chowk Labour. Labour wages come from Labour Master; driver allowances come from the attendance register." action={<button onClick={() => window.print()} disabled={!details.length} className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-semibold hover:bg-muted disabled:opacity-50 print:hidden"><Printer size={16} /> Print report</button>} />
    <section className="mb-6 rounded-xl border border-border bg-card p-5 shadow-sm print:hidden"><div className="mb-4 flex items-center gap-3"><div className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary"><WalletCards size={20} /></div><div><h2 className="font-serif text-lg font-bold">Payroll review</h2><p className="text-xs text-muted-foreground">One report across all three payable registers.</p></div></div><div className="grid gap-4 md:grid-cols-4"><label><span className="mb-1.5 block text-xs font-semibold">From date</span><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className={inputClass} /></label><label><span className="mb-1.5 block text-xs font-semibold">To date</span><input type="date" value={to} onChange={(event) => setTo(event.target.value)} className={inputClass} /></label><label><span className="mb-1.5 block text-xs font-semibold">Register</span><select value={source} onChange={(event) => { setSource(event.target.value); setPerson(''); }} className={inputClass}><option value="all">All payable registers</option><option value="driver-attendance">Driver Attendance</option><option value="daily-attendance">Training Register</option><option value="chowk-labour">Chowk Labour</option></select></label><label><span className="mb-1.5 block text-xs font-semibold">Person</span><select value={person} onChange={(event) => setPerson(event.target.value)} className={inputClass}><option value="">All people</option>{people.map((name) => <option key={name} value={name}>{name}</option>)}</select></label></div><div className="mt-4 flex items-center gap-3"><button onClick={load} disabled={loading || from > to} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh payments</button>{error && <span className="text-sm text-destructive">{error}</span>}</div></section>
    <section className="rounded-xl border border-border bg-card p-6 shadow-sm md:p-8" data-testid="payment-report"><div className="flex flex-col justify-between gap-4 border-b border-border pb-5 sm:flex-row sm:items-start"><div><div className="font-mono text-[10px] uppercase tracking-[.16em] text-primary">Payroll calculation</div><h2 className="mt-1 font-serif text-2xl font-bold">{person || 'All people'}</h2><p className="mt-1 text-sm text-muted-foreground">{report ? `${displayDate(report.from)} to ${displayDate(report.to)}` : 'Loading report…'}</p></div><div className="text-left text-sm sm:text-right"><div>Register <strong>{source === 'all' ? 'All three' : sourceLabel(source)}</strong></div>{selectedSummary && <div>Base amount <strong>{selectedSummary.baseAmount.toFixed(2)}</strong></div>}</div></div><div className="mt-6 overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="border-b border-border bg-muted/45"><tr>{['Date', 'Person', 'Register', 'Days', 'Hours', 'Overtime', 'Payable', 'Status'].map((label) => <th key={label} className="px-3 py-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</th>)}</tr></thead><tbody className="divide-y divide-border">{details.map((row) => <PaymentRow key={row.id} row={row} />)}</tbody></table></div><div className="mt-6 grid gap-3 border-t border-border pt-5 sm:grid-cols-3"><Summary label="Payable days" value={formatDays(totals.days)} /><Summary label="Overtime" value={formatMinutes(totals.overtime)} /><Summary label="Total payable" value={totals.amount.toFixed(2)} /></div></section>
    {!editable && <div className="mt-5 flex items-center gap-2 text-xs text-muted-foreground print:hidden"><Eye size={14} /> View-only payment access</div>}
    {editable && <div className="mt-5 flex items-center gap-2 text-xs text-muted-foreground print:hidden"><WalletCards size={14} /> HR and Admin can review and print payroll reports</div>}
    <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground print:hidden"><LockKeyhole size={14} /> Payment reports are visible only to HR, Manager, and Admin.</div>
  </div>;
}

function PaymentRow({ row }: { row: HrDetail }) {
  return <tr><td className="px-3 py-3">{displayDate(row.date)}</td><td className="px-3 py-3 font-semibold">{row.name}</td><td className="px-3 py-3">{sourceLabel(row.source)}</td><td className="px-3 py-3">{formatDays(row.workedDays)}</td><td className="px-3 py-3 font-mono">{formatMinutes(row.minutes)}</td><td className="px-3 py-3 font-mono text-primary">{formatMinutes(row.overtimeMinutes)}</td><td className="px-3 py-3 font-mono font-bold">{row.totalAmount.toFixed(2)}</td><td className="px-3 py-3 text-xs">{row.paymentStatus}</td></tr>;
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-border bg-muted/35 p-3"><div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div><div className="mt-1 font-mono text-lg font-semibold">{value}</div></div>;
}