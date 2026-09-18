import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  ClipboardCheck,
  FileBarChart2,
  FileSpreadsheet,
  RefreshCw,
  UsersRound,
  WalletCards,
} from 'lucide-react';
import { Link } from 'wouter';
import { PageIntro } from '@/components/ops-ui';
import {
  displayDate,
  fetchHrReport,
  fetchPaymentTransactions,
  formatDays,
  formatMinutes,
  monthStart,
  today,
  type HrReport,
  type PaymentTransaction,
} from '@/lib/hr-report';

const inputClass = 'w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary';
const amount = (value: number) => `₹${value.toFixed(2)}`;
const sourceLabel = (source: string) => source === 'daily-attendance'
  ? 'Training Register'
  : source === 'chowk-labour'
    ? 'Chowk Labour'
    : source === 'driver-attendance'
      ? 'Driver Attendance'
      : 'All registers';

export default function HrCenterPage() {
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [source, setSource] = useState('all');
  const [report, setReport] = useState<HrReport | null>(null);
  const [transactions, setTransactions] = useState<PaymentTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async (nextFrom = from, nextTo = to, nextSource = source) => {
    setLoading(true);
    setError('');
    try {
      const [nextReport, nextTransactions] = await Promise.all([
        fetchHrReport(nextFrom, nextTo, nextSource),
        fetchPaymentTransactions(nextFrom, nextTo, nextSource),
      ]);
      setReport(nextReport);
      setTransactions(nextTransactions);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'People and pay data could not be loaded');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const summaries = useMemo(() => [...(report?.summaries ?? [])].sort((a, b) =>
    b.outstandingAmount - a.outstandingAmount || a.name.localeCompare(b.name)), [report]);

  const totals = useMemo(() => ({
    people: summaries.length,
    payable: summaries.reduce((sum, row) => sum + row.totalAmount, 0),
    paid: summaries.reduce((sum, row) => sum + row.paidAmount, 0),
    outstanding: summaries.reduce((sum, row) => sum + row.outstandingAmount, 0),
    openPeople: summaries.filter((row) => row.outstandingAmount > 0).length,
    paidPeople: summaries.filter((row) => row.paymentStatus === 'paid').length,
    shortfallMinutes: summaries.reduce((sum, row) => sum + row.shortfallMinutes, 0),
  }), [summaries]);

  const checks = useMemo(() => {
    const missingReferences = transactions.filter((transaction) =>
      transaction.paymentMethod !== 'Cash' && transaction.paymentMethod !== 'Other' && !transaction.paymentReference,
    ).length;
    return [
      {
        label: 'Attendance coverage',
        detail: report?.details.length ? `${report.details.length} attendance entries included in the period.` : 'No attendance entries were found for this period.',
        tone: report?.details.length ? 'ready' : 'watch',
      },
      {
        label: 'Payment audit trail',
        detail: missingReferences ? `${missingReferences} non-cash payment(s) need a reference.` : `${transactions.length} payment event(s) have an audit trail.`,
        tone: missingReferences ? 'watch' : 'ready',
      },
      {
        label: 'Outstanding balance',
        detail: totals.outstanding ? `${amount(totals.outstanding)} remains open across ${totals.openPeople} person(s).` : 'All included people are fully paid.',
        tone: totals.outstanding ? 'watch' : 'ready',
      },
      {
        label: 'Time exceptions',
        detail: totals.shortfallMinutes ? `${formatMinutes(totals.shortfallMinutes)} of shortfall time needs review.` : 'No shortfall time is present in the report.',
        tone: totals.shortfallMinutes ? 'watch' : 'ready',
      },
    ] as const;
  }, [report, transactions, totals]);

  return (
    <div className="ops-grid min-h-[100dvh] px-5 py-8 md:px-8 lg:px-10">
      <div className="mb-6 flex items-center justify-between print:hidden">
        <Link href="/" className="flex items-center gap-2 text-sm font-semibold"><ArrowLeft size={16} /> Back to modules</Link>
        <span className="font-mono text-[10px] uppercase tracking-[.16em] text-muted-foreground">People &amp; pay control room</span>
      </div>

      <PageIntro
        eyebrow="Human resources and finance"
        title="People & pay command center"
        description="Understand who worked, what is payable, what has already been paid, and which items need a human check before the next payroll run."
        action={(
          <div className="flex flex-wrap gap-2 print:hidden">
            <Link href="/reports" className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-semibold hover:bg-muted"><FileBarChart2 size={16} /> Payroll summary</Link>
            <Link href="/payments" className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"><WalletCards size={16} /> Open payment queue</Link>
          </div>
        )}
      />

      <section className="mb-5 rounded-xl border border-border bg-card p-5 shadow-sm print:hidden">
        <div className="mb-4 flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary"><CalendarClock size={20} /></div>
          <div><h2 className="font-serif text-lg font-bold">Control period</h2><p className="text-xs text-muted-foreground">Every number below comes from the selected attendance period and register scope.</p></div>
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          <label><span className="mb-1.5 block text-xs font-semibold">From date</span><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className={inputClass} /></label>
          <label><span className="mb-1.5 block text-xs font-semibold">To date</span><input type="date" value={to} onChange={(event) => setTo(event.target.value)} className={inputClass} /></label>
          <label><span className="mb-1.5 block text-xs font-semibold">Register scope</span><select value={source} onChange={(event) => setSource(event.target.value)} className={inputClass}><option value="all">All registers</option><option value="driver-attendance">Driver Attendance</option><option value="daily-attendance">Training Register</option><option value="chowk-labour">Chowk Labour</option></select></label>
          <div className="flex items-end"><button onClick={() => void load(from, to, source)} disabled={loading || !from || !to || from > to} className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> {loading ? 'Refreshing…' : 'Refresh control room'}</button></div>
        </div>
        {error && <div className="mt-4 flex items-center gap-2 text-sm text-destructive"><AlertTriangle size={15} /> {error}</div>}
      </section>

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <Metric icon={UsersRound} label="People" value={String(totals.people)} detail={`${totals.paidPeople} fully paid`} />
        <Metric icon={CircleDollarSign} label="Total payable" value={amount(totals.payable)} />
        <Metric icon={CheckCircle2} label="Paid" value={amount(totals.paid)} tone="success" />
        <Metric icon={WalletCards} label="Outstanding" value={amount(totals.outstanding)} tone={totals.outstanding ? 'warning' : 'success'} />
        <Metric icon={AlertTriangle} label="Open people" value={String(totals.openPeople)} tone={totals.openPeople ? 'warning' : 'success'} />
        <Metric icon={ClipboardCheck} label="Attendance entries" value={String(report?.details.length ?? 0)} detail={report ? `${displayDate(report.from)} – ${displayDate(report.to)}` : 'Loading period'} />
      </div>

      <section className="mb-5 grid gap-5 lg:grid-cols-[1.1fr_.9fr]">
        <div className="rounded-xl border border-border bg-card shadow-sm">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div><h2 className="font-serif text-lg font-bold">Payroll controls</h2><p className="mt-0.5 text-xs text-muted-foreground">Checks designed to prevent avoidable payment mistakes.</p></div>
            <FileSpreadsheet size={19} className="text-primary" />
          </div>
          <div className="divide-y divide-border">
            {checks.map((check) => <div key={check.label} className="flex gap-3 px-5 py-4"><div className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-full ${check.tone === 'ready' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{check.tone === 'ready' ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}</div><div><div className="text-sm font-semibold">{check.label}</div><div className="mt-1 text-xs leading-5 text-muted-foreground">{check.detail}</div></div></div>)}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-4"><h2 className="font-serif text-lg font-bold">Recommended workflow</h2><p className="mt-0.5 text-xs text-muted-foreground">A repeatable payroll cycle for the operations team.</p></div>
          <div className="space-y-4">
            <WorkflowStep number="01" title="Lock the period" text="Choose dates and register scope before reviewing any amount." />
            <WorkflowStep number="02" title="Resolve exceptions" text="Open attendance records for shortfall, missing time, or duplicate-looking entries." />
            <WorkflowStep number="03" title="Approve and pay" text="Use the payment queue, record the exact amount, and keep a reference for non-cash methods." />
            <WorkflowStep number="04" title="Export the evidence" text="Use the summary and daily ledger for reconciliation and management review." />
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div><h2 className="font-serif text-lg font-bold">People at a glance</h2><p className="mt-0.5 text-xs text-muted-foreground">Sorted by the amount still open so the next action is obvious.</p></div>
          <Link href="/payment-report" className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline">Open daily ledger <ArrowUpRight size={14} /></Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-border bg-muted/45"><tr>{['Person', 'Worked days', 'Overtime', 'Total payable', 'Paid', 'Outstanding', 'Status', 'Action'].map((label) => <th key={label} className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</th>)}</tr></thead>
            <tbody className="divide-y divide-border">
              {summaries.map((row) => <tr key={row.name} className="hover:bg-muted/30"><td className="px-4 py-3 font-semibold">{row.name}</td><td className="px-4 py-3">{formatDays(row.workedDays)}</td><td className="px-4 py-3 font-mono text-primary">{formatMinutes(row.overtimeMinutes)}</td><td className="px-4 py-3 font-mono font-semibold">{amount(row.totalAmount)}</td><td className="px-4 py-3 font-mono text-emerald-700">{amount(row.paidAmount)}</td><td className="px-4 py-3 font-mono font-bold text-amber-700">{amount(row.outstandingAmount)}</td><td className="px-4 py-3"><StatusBadge status={row.paymentStatus} /></td><td className="px-4 py-3"><Link href="/payments" className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted">Open queue <ArrowUpRight size={13} /></Link></td></tr>)}
            </tbody>
          </table>
        </div>
        {!loading && !summaries.length && <div className="p-10 text-center text-sm text-muted-foreground">No people match this period and register scope.</div>}
      </section>
    </div>
  );
}

function Metric({ icon: Icon, label, value, detail, tone }: { icon: typeof UsersRound; label: string; value: string; detail?: string; tone?: 'success' | 'warning' }) {
  return <div className={`rounded-xl border p-4 shadow-sm ${tone === 'success' ? 'border-emerald-200 bg-emerald-50/70' : tone === 'warning' ? 'border-amber-200 bg-amber-50/70' : 'border-border bg-card'}`}><div className="mb-4 flex items-center justify-between"><span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span><Icon size={16} className={tone === 'success' ? 'text-emerald-700' : tone === 'warning' ? 'text-amber-700' : 'text-primary'} /></div><div className="font-mono text-xl font-bold">{value}</div>{detail && <div className="mt-1 truncate text-[11px] text-muted-foreground">{detail}</div>}</div>;
}

function WorkflowStep({ number, title, text }: { number: string; title: string; text: string }) {
  return <div className="flex gap-3"><span className="font-mono text-[10px] font-bold tracking-wider text-primary">{number}</span><div><div className="text-sm font-semibold">{title}</div><div className="mt-1 text-xs leading-5 text-muted-foreground">{text}</div></div></div>;
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${status === 'paid' ? 'bg-emerald-100 text-emerald-800' : status === 'partial' ? 'bg-sky-100 text-sky-800' : 'bg-amber-100 text-amber-800'}`}>{status === 'paid' ? 'Paid' : status === 'partial' ? 'Partly paid' : 'Unpaid'}</span>;
}