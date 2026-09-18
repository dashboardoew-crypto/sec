import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Download,
  FileSpreadsheet,
  LayoutDashboard,
  ListChecks,
  Loader2,
  Printer,
  RefreshCw,
  Search,
  WalletCards,
} from 'lucide-react';
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
  type HrSummary,
  type PaymentTransaction,
} from '@/lib/hr-report';

type View = 'overview' | 'payments' | 'ledger';

const inputClass = 'w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15';
const paymentMethods = ['Cash', 'Bank transfer', 'UPI', 'Cheque', 'Other'];
const amount = (value: number) => `₹${value.toFixed(2)}`;
const sourceLabel = (source: string) => source === 'daily-attendance'
  ? 'Training Register'
  : source === 'driver-attendance'
    ? 'Driver Attendance'
    : source === 'chowk-labour'
      ? 'Chowk Labour'
      : 'All registers';
const statusLabel = (status: string) => status === 'paid' ? 'Paid' : status === 'partial' ? 'Partly paid' : 'Unpaid';
const statusClass = (status: string) => status === 'paid'
  ? 'bg-emerald-100 text-emerald-800'
  : status === 'partial'
    ? 'bg-sky-100 text-sky-800'
    : 'bg-amber-100 text-amber-800';

export default function HrCenterPage() {
  const { user } = useAuth();
  const [view, setView] = useState<View>('overview');
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [source, setSource] = useState('all');
  const [search, setSearch] = useState('');
  const [report, setReport] = useState<HrReport | null>(null);
  const [transactions, setTransactions] = useState<PaymentTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selectedPerson, setSelectedPerson] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentNote, setPaymentNote] = useState('');
  const requestId = useRef(0);
  const editable = canEditPayments(user?.role);

  const load = async (
    nextFrom = from,
    nextTo = to,
    nextSource = source,
    nextSearch = search,
  ) => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError('');
    setNotice('');
    try {
      const [nextReport, nextTransactions] = await Promise.all([
        fetchHrReport(nextFrom, nextTo, nextSource),
        fetchPaymentTransactions(nextFrom, nextTo, nextSource, nextSearch),
      ]);
      if (currentRequest !== requestId.current) return;
      setReport(nextReport);
      setTransactions(nextTransactions);
      setSelectedPerson((current) =>
        current && nextReport.summaries.some((row) => row.name === current) ? current : '');
    } catch (reason) {
      if (currentRequest === requestId.current) {
        setError(reason instanceof Error ? reason.message : 'HR data could not be loaded');
      }
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const summaries = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (report?.summaries ?? [])
      .filter((row) => !query || row.name.toLowerCase().includes(query))
      .sort((a, b) => b.outstandingAmount - a.outstandingAmount || a.name.localeCompare(b.name));
  }, [report, search]);

  const details = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (report?.details ?? [])
      .filter((row) => !query || row.name.toLowerCase().includes(query))
      .sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
  }, [report, search]);

  const selected = useMemo(
    () => summaries.find((row) => row.name === selectedPerson) ?? null,
    [selectedPerson, summaries],
  );

  const selectedDetails = useMemo(
    () => details.filter((row) => row.name === selectedPerson),
    [details, selectedPerson],
  );

  const visibleTransactions = useMemo(() => {
    const query = search.trim().toLowerCase();
    return transactions.filter((transaction) =>
      !query || transaction.personName.toLowerCase().includes(query));
  }, [search, transactions]);

  const totals = useMemo(() => ({
    people: summaries.length,
    payable: summaries.reduce((sum, row) => sum + row.totalAmount, 0),
    paid: summaries.reduce((sum, row) => sum + row.paidAmount, 0),
    outstanding: summaries.reduce((sum, row) => sum + row.outstandingAmount, 0),
    openPeople: summaries.filter((row) => row.outstandingAmount > 0).length,
    paidPeople: summaries.filter((row) => row.paymentStatus === 'paid').length,
    attendanceEntries: details.length,
    shortfallMinutes: details.reduce((sum, row) => sum + row.shortfallMinutes, 0),
  }), [details, summaries]);

  useEffect(() => {
    setPaymentAmount(selected?.outstandingAmount ? selected.outstandingAmount.toFixed(2) : '');
    setPaymentReference('');
    setPaymentNote('');
  }, [selected?.name, selected?.outstandingAmount]);

  const recordPayment = async () => {
    if (!selected || !report) return;
    const entered = Number(paymentAmount);
    if (!Number.isFinite(entered) || entered <= 0 || entered > selected.outstandingAmount + 0.005) {
      setError(`Enter an amount between ₹0.01 and ${amount(selected.outstandingAmount)}.`);
      return;
    }
    const reference = paymentReference.trim();
    if (['Bank transfer', 'UPI', 'Cheque'].includes(paymentMethod) && !reference) {
      setError(`${paymentMethod} payments need a reference or UTR number.`);
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    try {
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
        status: entered >= selected.outstandingAmount - 0.005 ? 'paid' : 'partial',
        paymentMethod,
        paymentReference: reference,
        paymentNote: paymentNote.trim(),
      });
      setNotice(`${selected.name}: ${amount(entered)} recorded successfully.`);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Payment could not be saved');
    } finally {
      setSaving(false);
    }
  };

  const exportCsv = () => {
    const rows = [
      ['Name', 'Worked days', 'Overtime', 'Total payable', 'Paid', 'Outstanding', 'Status'],
      ...summaries.map((row) => [
        row.name,
        formatDays(row.workedDays),
        formatMinutes(row.overtimeMinutes),
        row.totalAmount.toFixed(2),
        row.paidAmount.toFixed(2),
        row.outstandingAmount.toFixed(2),
        statusLabel(row.paymentStatus),
      ]),
    ];
    downloadCsv(rows, `hr-summary-${from}-to-${to}.csv`);
  };

  const exportLedger = () => {
    const rows = [
      ['Date', 'Person', 'Register', 'Days', 'Hours', 'Overtime', 'Amount due', 'Amount paid', 'Amount left', 'Status'],
      ...details.map((row) => [
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
      ]),
    ];
    downloadCsv(rows, `hr-ledger-${from}-to-${to}.csv`);
  };

  return (
    <div className="ops-grid min-h-[100dvh] px-5 py-8 md:px-8 lg:px-10">
      <div className="mb-6 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
          <ArrowLeft size={16} /> Back to modules
        </Link>
        <span className="font-mono text-[10px] uppercase tracking-[.16em] text-muted-foreground">HR workspace</span>
      </div>

      <PageIntro
        eyebrow="Human resources"
        title="People, payroll and payments"
        description="One workspace for attendance-based payroll, payment recording and the complete payment ledger."
        action={(
          <div className="flex flex-wrap gap-2">
            <button onClick={() => void load()} disabled={loading} className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-semibold hover:bg-muted disabled:opacity-50">
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh
            </button>
            <button onClick={view === 'ledger' ? exportLedger : exportCsv} disabled={loading || (view === 'ledger' ? !details.length : !summaries.length)} className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-semibold hover:bg-muted disabled:opacity-50">
              <Download size={15} /> Export {view === 'ledger' ? 'ledger' : 'summary'}
            </button>
          </div>
        )}
      />

      <section className="mb-5 rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-[1fr_1fr_1.2fr_1.2fr_auto] md:items-end">
          <DateField label="From date" value={from} onChange={setFrom} />
          <DateField label="To date" value={to} onChange={setTo} />
          <label>
            <span className="mb-1.5 block text-xs font-semibold">Register</span>
            <select value={source} onChange={(event) => { setSource(event.target.value); setSelectedPerson(''); }} className={inputClass}>
              <option value="all">All registers</option>
              <option value="driver-attendance">Driver Attendance</option>
              <option value="daily-attendance">Training Register</option>
              <option value="chowk-labour">Chowk Labour</option>
            </select>
          </label>
          <label>
            <span className="mb-1.5 block text-xs font-semibold">Search person</span>
            <span className="relative block">
              <Search size={15} className="pointer-events-none absolute left-3 top-3 text-muted-foreground" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="All people" className={`${inputClass} pl-9`} />
            </span>
          </label>
          <button onClick={() => void load(from, to, source, search)} disabled={loading || !from || !to || from > to} className="flex h-[42px] items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">
            {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Apply
          </button>
        </div>
        {error && <div className="mt-4 flex items-center gap-2 text-sm text-destructive"><AlertTriangle size={15} /> {error}</div>}
        {notice && <div className="mt-4 flex items-center gap-2 text-sm text-emerald-700"><CheckCircle2 size={15} /> {notice}</div>}
      </section>

      <nav className="mb-5 flex flex-wrap gap-2 border-b border-border pb-3" aria-label="HR sections">
        <TabButton active={view === 'overview'} icon={LayoutDashboard} onClick={() => setView('overview')}>Overview</TabButton>
        <TabButton active={view === 'payments'} icon={WalletCards} onClick={() => setView('payments')}>Payment queue <Count>{totals.openPeople}</Count></TabButton>
        <TabButton active={view === 'ledger'} icon={ListChecks} onClick={() => setView('ledger')}>Daily ledger</TabButton>
      </nav>

      {view === 'overview' && (
        <Overview
          report={report}
          summaries={summaries}
          totals={totals}
          loading={loading}
          onOpenPayments={() => setView('payments')}
          onSelectPerson={(name) => { setSelectedPerson(name); setView('payments'); }}
        />
      )}
      {view === 'payments' && (
        <PaymentsView
          report={report}
          summaries={summaries}
          details={selectedDetails}
          transactions={visibleTransactions.filter((transaction) => !selectedPerson || transaction.personName === selectedPerson)}
          selected={selected}
          selectedPerson={selectedPerson}
          setSelectedPerson={setSelectedPerson}
          paymentAmount={paymentAmount}
          setPaymentAmount={setPaymentAmount}
          paymentMethod={paymentMethod}
          setPaymentMethod={setPaymentMethod}
          paymentReference={paymentReference}
          setPaymentReference={setPaymentReference}
          paymentNote={paymentNote}
          setPaymentNote={setPaymentNote}
          saving={saving}
          editable={editable}
          onRecordPayment={() => void recordPayment()}
          onPrint={() => window.print()}
          loading={loading}
        />
      )}
      {view === 'ledger' && <LedgerView details={details} transactions={visibleTransactions} loading={loading} />}
    </div>
  );
}

function Overview({ report, summaries, totals, loading, onOpenPayments, onSelectPerson }: {
  report: HrReport | null;
  summaries: HrSummary[];
  totals: { people: number; payable: number; paid: number; outstanding: number; openPeople: number; paidPeople: number; attendanceEntries: number; shortfallMinutes: number };
  loading: boolean;
  onOpenPayments: () => void;
  onSelectPerson: (name: string) => void;
}) {
  return (
    <>
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <Metric label="People" value={String(totals.people)} detail={`${totals.paidPeople} fully paid`} />
        <Metric label="Total payable" value={amount(totals.payable)} />
        <Metric label="Paid" value={amount(totals.paid)} tone="success" />
        <Metric label="Outstanding" value={amount(totals.outstanding)} tone={totals.outstanding ? 'warning' : 'success'} />
        <Metric label="Open people" value={String(totals.openPeople)} tone={totals.openPeople ? 'warning' : 'success'} />
        <Metric label="Attendance entries" value={String(totals.attendanceEntries)} detail={report ? `${displayDate(report.from)} – ${displayDate(report.to)}` : 'Loading period'} />
      </div>
      <section className="mb-5 grid gap-5 lg:grid-cols-[1.1fr_.9fr]">
        <div className="rounded-xl border border-border bg-card shadow-sm">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div><h2 className="font-serif text-lg font-bold">Payroll controls</h2><p className="mt-0.5 text-xs text-muted-foreground">Checks that keep the selected period reliable.</p></div>
            <FileSpreadsheet size={19} className="text-primary" />
          </div>
          <div className="divide-y divide-border">
            <Control label="Attendance coverage" detail={totals.attendanceEntries ? `${totals.attendanceEntries} entries included in this period.` : 'No attendance entries found for this period.'} good={Boolean(totals.attendanceEntries)} />
            <Control label="Payment balance" detail={totals.outstanding ? `${amount(totals.outstanding)} remains open across ${totals.openPeople} person(s).` : 'All included people are fully paid.'} good={!totals.outstanding} />
            <Control label="Time exceptions" detail={totals.shortfallMinutes ? `${formatMinutes(totals.shortfallMinutes)} of shortfall time needs review.` : 'No shortfall time is present in the report.'} good={!totals.shortfallMinutes} />
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-4"><h2 className="font-serif text-lg font-bold">How to use HR</h2><p className="mt-0.5 text-xs text-muted-foreground">The workflow stays in this page.</p></div>
          <div className="space-y-4">
            <WorkflowStep number="01" title="Set the period" text="Choose dates and register scope, then apply the filters." />
            <WorkflowStep number="02" title="Review balances" text="Use the overview to find people with an amount still open." />
            <WorkflowStep number="03" title="Record payment" text="Open a person in the payment queue and enter the exact amount paid." />
            <WorkflowStep number="04" title="Export evidence" text="Export the summary or day-by-day ledger when reconciliation is complete." />
          </div>
        </div>
      </section>
      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div><h2 className="font-serif text-lg font-bold">People at a glance</h2><p className="mt-0.5 text-xs text-muted-foreground">Sorted by the amount still open.</p></div>
          <button onClick={onOpenPayments} className="rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-muted">Open payment queue</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-border bg-muted/45"><tr>{['Person', 'Worked days', 'Overtime', 'Total payable', 'Paid', 'Outstanding', 'Status', 'Action'].map((label) => <th key={label} className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</th>)}</tr></thead>
            <tbody className="divide-y divide-border">
              {summaries.map((row) => <tr key={row.name} className="hover:bg-muted/30"><td className="px-4 py-3 font-semibold">{row.name}</td><td className="px-4 py-3">{formatDays(row.workedDays)}</td><td className="px-4 py-3 font-mono text-primary">{formatMinutes(row.overtimeMinutes)}</td><td className="px-4 py-3 font-mono font-semibold">{amount(row.totalAmount)}</td><td className="px-4 py-3 font-mono text-emerald-700">{amount(row.paidAmount)}</td><td className="px-4 py-3 font-mono font-bold text-amber-700">{amount(row.outstandingAmount)}</td><td className="px-4 py-3"><StatusBadge status={row.paymentStatus} /></td><td className="px-4 py-3"><button onClick={() => onSelectPerson(row.name)} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted">Open</button></td></tr>)}
            </tbody>
          </table>
        </div>
        {!loading && !summaries.length && <EmptyTable text="No people match this period and filter." />}
      </section>
    </>
  );
}

function PaymentsView({ report, summaries, details, transactions, selected, selectedPerson, setSelectedPerson, paymentAmount, setPaymentAmount, paymentMethod, setPaymentMethod, paymentReference, setPaymentReference, paymentNote, setPaymentNote, saving, editable, onRecordPayment, onPrint, loading }: {
  report: HrReport | null;
  summaries: HrSummary[];
  details: HrReport['details'];
  transactions: PaymentTransaction[];
  selected: HrSummary | null;
  selectedPerson: string;
  setSelectedPerson: (value: string) => void;
  paymentAmount: string;
  setPaymentAmount: (value: string) => void;
  paymentMethod: string;
  setPaymentMethod: (value: string) => void;
  paymentReference: string;
  setPaymentReference: (value: string) => void;
  paymentNote: string;
  setPaymentNote: (value: string) => void;
  saving: boolean;
  editable: boolean;
  onRecordPayment: () => void;
  onPrint: () => void;
  loading: boolean;
}) {
  const unpaid = summaries.filter((row) => row.outstandingAmount > 0);
  return (
    <>
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Metric label="Workers" value={String(summaries.length)} />
        <Metric label="Open workers" value={String(unpaid.length)} tone={unpaid.length ? 'warning' : 'success'} />
        <Metric label="Total payable" value={amount(summaries.reduce((sum, row) => sum + row.totalAmount, 0))} />
        <Metric label="Paid" value={amount(summaries.reduce((sum, row) => sum + row.paidAmount, 0))} tone="success" />
        <Metric label="Outstanding" value={amount(unpaid.reduce((sum, row) => sum + row.outstandingAmount, 0))} tone="warning" />
      </div>
      {!selected && (
        <section className="mb-6 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="border-b border-border px-5 py-4"><h2 className="font-serif text-lg font-bold">Payment queue</h2><p className="text-xs text-muted-foreground">{unpaid.length} person(s) have an amount left to pay.</p></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="border-b border-border bg-muted/45"><tr>{['Person', 'Worked days', 'Total payable', 'Paid', 'Amount left', 'Status', 'Action'].map((label) => <th key={label} className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</th>)}</tr></thead><tbody className="divide-y divide-border">{unpaid.map((row) => <tr key={row.name} className="hover:bg-muted/30"><td className="px-4 py-3 font-semibold">{row.name}</td><td className="px-4 py-3">{formatDays(row.workedDays)}</td><td className="px-4 py-3 font-mono">{amount(row.totalAmount)}</td><td className="px-4 py-3 font-mono text-emerald-700">{amount(row.paidAmount)}</td><td className="px-4 py-3 font-mono font-bold text-amber-700">{amount(row.outstandingAmount)}</td><td className="px-4 py-3"><StatusBadge status={row.paymentStatus} /></td><td className="px-4 py-3"><button onClick={() => setSelectedPerson(row.name)} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted">Open worker</button></td></tr>)}</tbody></table></div>{!loading && !unpaid.length && <EmptyTable text="No unpaid people match this period and filter." />}</section>
      )}
      {selected && report && (
        <section className="mb-6 rounded-xl border-2 border-foreground/15 bg-card p-6 shadow-sm md:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5"><div><button onClick={() => setSelectedPerson('')} className="mb-3 text-xs font-semibold text-primary hover:underline">← Back to payment queue</button><div className="font-mono text-[10px] uppercase tracking-[.18em] text-primary">Worker payment statement</div><h2 className="mt-2 font-serif text-3xl font-bold">{selected.name}</h2><p className="mt-1 text-sm text-muted-foreground">{displayDate(report.from)} to {displayDate(report.to)} · {sourceLabel(report.sourceScope)}</p></div><div className="text-right"><StatusBadge status={selected.paymentStatus} /><div className="mt-2 text-xs text-muted-foreground">Amount left</div><div className="font-mono text-2xl font-bold text-amber-700">{amount(selected.outstandingAmount)}</div></div></div>
          <div className="mt-6 grid gap-3 sm:grid-cols-4"><Metric label="Worked days" value={formatDays(selected.workedDays)} /><Metric label="Total payable" value={amount(selected.totalAmount)} /><Metric label="Paid" value={amount(selected.paidAmount)} tone="success" /><Metric label="Balance left" value={amount(selected.outstandingAmount)} tone="warning" /></div>
          <div className="mt-6 divide-y divide-border"><BillLine label="Base wages" detail={`${formatDays(selected.workedDays)} days × ${amount(selected.wagePerDay)}`} value={amount(selected.wageAmount)} /><BillLine label="Overtime" detail={`${formatMinutes(selected.overtimeMinutes)} at ${amount(selected.overtimeRate)}/hour`} value={amount(selected.overtimeAmount)} /><BillLine label="Round off" detail="Nearest rupee adjustment" value={`${selected.roundingAmount >= 0 ? '+' : ''}${amount(selected.roundingAmount)}`} /></div>
          {editable && selected.outstandingAmount > 0 && <div className="mt-5 rounded-xl border border-primary/20 bg-primary/5 p-5"><div className="mb-4"><h3 className="font-serif text-lg font-bold">Record a payment</h3><p className="text-xs text-muted-foreground">Enter the amount actually paid. Non-cash methods require a reference.</p></div><div className="grid gap-4 md:grid-cols-4"><label><span className="mb-1.5 block text-xs font-semibold">Amount paid</span><input type="number" min="0.01" max={selected.outstandingAmount} step="0.01" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} className={inputClass} /></label><label><span className="mb-1.5 block text-xs font-semibold">Payment method</span><select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} className={inputClass}>{paymentMethods.map((method) => <option key={method}>{method}</option>)}</select></label><label><span className="mb-1.5 block text-xs font-semibold">Reference / UTR {paymentMethod !== 'Cash' && paymentMethod !== 'Other' ? '(required)' : '(optional)'}</span><input value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} placeholder={paymentMethod === 'Cash' || paymentMethod === 'Other' ? 'Optional' : 'Enter reference'} className={inputClass} /></label><label><span className="mb-1.5 block text-xs font-semibold">Note</span><input value={paymentNote} onChange={(event) => setPaymentNote(event.target.value)} placeholder="Optional" className={inputClass} /></label></div><div className="mt-4 flex flex-wrap items-center gap-3"><button onClick={onRecordPayment} disabled={saving} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">{saving ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />} {saving ? 'Saving…' : 'Record payment'}</button><button onClick={onPrint} className="flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-semibold hover:bg-muted"><Printer size={15} /> Print statement</button></div></div>}
          <div className="mt-7 grid gap-7 lg:grid-cols-2"><div><h3 className="mb-3 font-serif text-lg font-bold">Attendance included</h3><DetailTable details={details} /></div><div><h3 className="mb-3 font-serif text-lg font-bold">Payment history</h3>{transactions.length ? <div className="space-y-2">{transactions.map((transaction) => <div key={transaction.id} className="rounded-lg border border-border bg-muted/20 p-3 text-sm"><div className="flex justify-between gap-3"><span className="font-semibold">{amount(transaction.amount)} · {transaction.paymentMethod}</span><span className="text-xs text-muted-foreground">{displayDate(transaction.paidAt.slice(0, 10))}</span></div><div className="mt-1 text-xs text-muted-foreground">{transaction.paymentReference || 'No reference'}{transaction.paidBy ? ` · by ${transaction.paidBy}` : ''}</div>{transaction.paymentNote && <div className="mt-1 text-xs">{transaction.paymentNote}</div>}</div>)}</div> : <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">No payment has been recorded for this period.</div>}</div></div>
        </section>
      )}
    </>
  );
}

function LedgerView({ details, transactions, loading }: { details: HrReport['details']; transactions: PaymentTransaction[]; loading: boolean }) {
  return (
    <>
      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="flex items-center gap-3 border-b border-border px-5 py-4"><ListChecks size={19} className="text-primary" /><div><h2 className="font-serif text-lg font-bold">Attendance payment ledger</h2><p className="text-xs text-muted-foreground">Every attendance entry with its due, paid and remaining amount.</p></div></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[1250px] text-left text-sm"><thead className="border-b border-border bg-muted/45"><tr>{['Date', 'Person', 'Register', 'Days', 'Hours', 'Overtime', 'Amount due', 'Paid', 'Amount left', 'Status'].map((label) => <th key={label} className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</th>)}</tr></thead><tbody className="divide-y divide-border">{details.map((row) => <tr key={row.id} className="hover:bg-muted/30"><td className="px-4 py-3">{displayDate(row.date)}</td><td className="px-4 py-3 font-semibold">{row.name}</td><td className="px-4 py-3">{sourceLabel(row.source)}</td><td className="px-4 py-3">{formatDays(row.workedDays)}</td><td className="px-4 py-3 font-mono">{formatMinutes(row.minutes)}</td><td className="px-4 py-3 font-mono text-primary">{formatMinutes(row.overtimeMinutes)}</td><td className="px-4 py-3 font-mono font-semibold">{amount(row.totalAmount)}</td><td className="px-4 py-3 font-mono text-emerald-700">{amount(row.paidAmount)}</td><td className="px-4 py-3 font-mono font-bold text-amber-700">{amount(row.outstandingAmount)}</td><td className="px-4 py-3"><StatusBadge status={row.paymentStatus} /></td></tr>)}</tbody></table></div>
        {!loading && !details.length && <EmptyTable text="No attendance rows match this period and filter." />}
      </section>
      <section className="mt-6 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="border-b border-border px-5 py-4"><h2 className="font-serif text-lg font-bold">Payment transactions</h2><p className="text-xs text-muted-foreground">Payments recorded inside the selected period.</p></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[1000px] text-left text-sm"><thead className="border-b border-border bg-muted/45"><tr>{['Paid on', 'Person', 'Paid period', 'Register', 'Amount', 'Method', 'Reference', 'Paid by'].map((label) => <th key={label} className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</th>)}</tr></thead><tbody className="divide-y divide-border">{transactions.map((transaction) => <tr key={transaction.id} className="hover:bg-muted/30"><td className="px-4 py-3">{displayDate(transaction.paidAt.slice(0, 10))}</td><td className="px-4 py-3 font-semibold">{transaction.personName}</td><td className="px-4 py-3 text-xs">{displayDate(transaction.fromDate)} – {displayDate(transaction.toDate)}</td><td className="px-4 py-3">{sourceLabel(transaction.sourceScope)}</td><td className="px-4 py-3 font-mono font-bold text-emerald-700">{amount(transaction.amount)}</td><td className="px-4 py-3">{transaction.paymentMethod}</td><td className="px-4 py-3 text-xs">{transaction.paymentReference || '—'}</td><td className="px-4 py-3 text-xs">{transaction.paidBy || '—'}</td></tr>)}</tbody></table></div>
        {!loading && !transactions.length && <EmptyTable text="No payment transactions match this period and filter." />}
      </section>
    </>
  );
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label><span className="mb-1.5 block text-xs font-semibold">{label}</span><input type="date" value={value} onChange={(event) => onChange(event.target.value)} className={inputClass} /></label>;
}

function TabButton({ active, icon: Icon, onClick, children }: { active: boolean; icon: typeof LayoutDashboard; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${active ? 'bg-primary text-primary-foreground' : 'border border-border bg-card hover:bg-muted'}`}><Icon size={15} />{children}</button>;
}

function Count({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[10px]">{children}</span>;
}

function Metric({ label, value, detail, tone }: { label: string; value: string; detail?: string; tone?: 'success' | 'warning' }) {
  return <div className={`rounded-xl border p-4 shadow-sm ${tone === 'success' ? 'border-emerald-200 bg-emerald-50/70' : tone === 'warning' ? 'border-amber-200 bg-amber-50/70' : 'border-border bg-card'}`}><div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div><div className="mt-1 font-mono text-xl font-bold">{value}</div>{detail && <div className="mt-1 truncate text-[11px] text-muted-foreground">{detail}</div>}</div>;
}

function Control({ label, detail, good }: { label: string; detail: string; good: boolean }) {
  return <div className="flex gap-3 px-5 py-4"><div className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-full ${good ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{good ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}</div><div><div className="text-sm font-semibold">{label}</div><div className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</div></div></div>;
}

function WorkflowStep({ number, title, text }: { number: string; title: string; text: string }) {
  return <div className="flex gap-3"><span className="font-mono text-[10px] font-bold tracking-wider text-primary">{number}</span><div><div className="text-sm font-semibold">{title}</div><div className="mt-1 text-xs leading-5 text-muted-foreground">{text}</div></div></div>;
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${statusClass(status)}`}>{status === 'paid' ? <CheckCircle2 size={12} /> : <Clock3 size={12} />}{statusLabel(status)}</span>;
}

function BillLine({ label, detail, value }: { label: string; detail: string; value: string }) {
  return <div className="flex items-center justify-between gap-5 py-4"><div><div className="font-semibold">{label}</div><div className="mt-1 text-xs text-muted-foreground">{detail}</div></div><div className="font-mono text-base font-semibold">{value}</div></div>;
}

function DetailTable({ details }: { details: HrReport['details'] }) {
  return <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-xs"><thead className="border-b border-border"><tr>{['Date', 'Register', 'Days', 'Hours', 'Overtime', 'Amount'].map((label) => <th key={label} className="px-2 py-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</th>)}</tr></thead><tbody className="divide-y divide-border">{details.map((row) => <tr key={row.id}><td className="px-2 py-2">{displayDate(row.date)}</td><td className="px-2 py-2">{sourceLabel(row.source)}</td><td className="px-2 py-2">{formatDays(row.workedDays)}</td><td className="px-2 py-2 font-mono">{formatMinutes(row.minutes)}</td><td className="px-2 py-2 font-mono">{formatMinutes(row.overtimeMinutes)}</td><td className="px-2 py-2 font-mono">{amount(row.totalAmount)}</td></tr>)}</tbody></table></div>;
}

function EmptyTable({ text }: { text: string }) {
  return <div className="p-10 text-center text-sm text-muted-foreground">{text}</div>;
}

function downloadCsv(rows: string[][], filename: string) {
  const csv = rows.map((row) => row.map((cell) => JSON.stringify(cell)).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}