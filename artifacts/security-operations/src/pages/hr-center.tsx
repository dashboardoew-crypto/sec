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
type StatusFilter = 'all' | 'unpaid' | 'partial' | 'paid' | 'excluded';

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
const paymentAttendanceSummary = (transaction: PaymentTransaction, details: HrReport['details']) => {
  const references = new Set(transaction.attendanceReferences);
  const linkedRows = details.filter((row) => references.has(row.referenceNo));
  const dates = Array.from(new Set(linkedRows.map((row) => row.date))).sort();
  const linkedReferences = linkedRows.map((row) => row.referenceNo);
  const shownReferences = linkedReferences.length ? linkedReferences : transaction.attendanceReferences;
  const dateLabel = dates.length ? dates.map(displayDate).join(', ') : 'date unavailable';
  const referenceLabel = shownReferences.length ? shownReferences.join(', ') : 'reference unavailable';
  return `${dateLabel} · ${referenceLabel}`;
};
const statusLabel = (status: string) => status === 'paid'
  ? 'Paid'
  : status === 'partial'
    ? 'Partly paid'
    : status === 'excluded'
      ? 'Excluded'
      : 'Unpaid';
const statusClass = (status: string) => status === 'paid'
  ? 'bg-emerald-100 text-emerald-800'
  : status === 'partial'
    ? 'bg-sky-100 text-sky-800'
    : status === 'excluded'
      ? 'bg-slate-100 text-slate-700'
    : 'bg-amber-100 text-amber-800';

export default function HrCenterPage() {
  const { user } = useAuth();
  const [view, setView] = useState<View>('overview');
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [source, setSource] = useState('all');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [report, setReport] = useState<HrReport | null>(null);
  const [transactions, setTransactions] = useState<PaymentTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selectedPerson, setSelectedPerson] = useState('');
  const [selectedEntryIds, setSelectedEntryIds] = useState<string[]>([]);
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentNote, setPaymentNote] = useState('');
  const [billTransactionId, setBillTransactionId] = useState('');
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
      return { report: nextReport, transactions: nextTransactions };
    } catch (reason) {
      if (currentRequest === requestId.current) {
        setError(reason instanceof Error ? reason.message : 'HR data could not be loaded');
      }
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
    return undefined;
  };

  useEffect(() => {
    void load();
  }, []);

  const summaries = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (report?.summaries ?? [])
      .filter((row) => (!query || row.name.toLowerCase().includes(query)) &&
        (statusFilter === 'all' || row.paymentStatus === statusFilter))
      .sort((a, b) => b.outstandingAmount - a.outstandingAmount || a.name.localeCompare(b.name));
  }, [report, search, statusFilter]);

  const details = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (report?.details ?? [])
      .filter((row) => (!query || row.name.toLowerCase().includes(query)) &&
        (statusFilter === 'all' || row.paymentStatus === statusFilter))
      .sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
  }, [report, search, statusFilter]);

  const selected = useMemo(
    () => summaries.find((row) => row.name === selectedPerson) ?? null,
    [selectedPerson, summaries],
  );

  const selectedDetails = useMemo(
    () => details.filter((row) => row.name === selectedPerson),
    [details, selectedPerson],
  );
  const payableDetails = useMemo(
    () => selectedDetails.filter((row) => row.paymentIncluded && row.outstandingAmount > 0),
    [selectedDetails],
  );
  const selectedPaymentTotal = useMemo(
    () => payableDetails
      .filter((row) => selectedEntryIds.includes(row.id))
      .reduce((sum, row) => sum + row.outstandingAmount, 0),
    [payableDetails, selectedEntryIds],
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
    setSelectedEntryIds([]);
    setPaymentReference('');
    setPaymentNote('');
  }, [selected?.name]);

  const recordPayment = async () => {
    if (!selected || !report) return;
    const selectedIds = selectedEntryIds.filter((id) => payableDetails.some((row) => row.id === id));
    if (!selectedIds.length || selectedPaymentTotal <= 0) {
      setError('Select at least one unpaid attendance entry before recording payment.');
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
      const savedBill = await savePaymentBill({
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
        totalAmount: selected.totalAmount,
        attendanceRecordIds: selectedIds,
        status: selectedPaymentTotal >= selected.outstandingAmount - 0.005 ? 'paid' : 'partial',
        paymentMethod,
        paymentReference: reference,
        paymentNote: paymentNote.trim(),
      });
      setNotice(`${selected.name}: ${amount(selectedPaymentTotal)} recorded against ${selectedIds.length} attendance ${selectedIds.length === 1 ? 'entry' : 'entries'}.`);
      const loaded = await load();
      const selectedReferences = new Set(
        payableDetails
          .filter((row) => selectedIds.includes(row.id))
          .map((row) => row.referenceNo),
      );
      const savedTransaction = loaded?.transactions.find((transaction) =>
        transaction.personName === selected.name &&
        Math.abs(transaction.amount - selectedPaymentTotal) < 0.005 &&
        transaction.paidAt === savedBill.paidAt &&
        transaction.attendanceReferences.some((reference) => selectedReferences.has(reference)),
      );
      if (savedTransaction) setBillTransactionId(savedTransaction.id);
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
    <div className={`ops-grid min-h-[100dvh] px-3 py-5 sm:px-5 sm:py-8 md:px-8 lg:px-10 ${selected ? 'print-statement' : ''}`}>
      <div className="mb-6 flex items-center justify-between print:hidden">
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
          <div className="flex flex-wrap gap-2 print:hidden">
            <button onClick={() => void load()} disabled={loading} className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-semibold hover:bg-muted disabled:opacity-50">
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh
            </button>
            <button onClick={view === 'ledger' ? exportLedger : exportCsv} disabled={loading || (view === 'ledger' ? !details.length : !summaries.length)} className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-semibold hover:bg-muted disabled:opacity-50">
              <Download size={15} /> Export {view === 'ledger' ? 'ledger' : 'summary'}
            </button>
          </div>
        )}
      />

      <section className="mb-5 rounded-xl border border-border bg-card p-5 shadow-sm print:hidden">
        <div className="grid gap-4 md:grid-cols-[1fr_1fr_1.1fr_1.1fr_1fr_auto] md:items-end">
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
          <label>
            <span className="mb-1.5 block text-xs font-semibold">Payment status</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)} className={inputClass}>
              <option value="all">All statuses</option>
              <option value="unpaid">Unpaid</option>
              <option value="partial">Partly paid</option>
              <option value="paid">Paid</option>
              <option value="excluded">Excluded attendance</option>
            </select>
          </label>
          <button onClick={() => void load(from, to, source, search)} disabled={loading || !from || !to || from > to} className="flex h-[42px] items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">
            {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Apply
          </button>
        </div>
        {error && <div className="mt-4 flex items-center gap-2 text-sm text-destructive"><AlertTriangle size={15} /> {error}</div>}
        {notice && <div className="mt-4 flex items-center gap-2 text-sm text-emerald-700"><CheckCircle2 size={15} /> {notice}</div>}
      </section>

      <nav className="mb-5 flex flex-wrap gap-2 border-b border-border pb-3 print:hidden" aria-label="HR sections">
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
           selectedEntryIds={selectedEntryIds}
           paymentTotal={selectedPaymentTotal}
           onTogglePaymentEntry={(recordId, checked) => setSelectedEntryIds((current) => checked ? Array.from(new Set([...current, recordId])) : current.filter((id) => id !== recordId))}
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
           onOpenBill={setBillTransactionId}
           onCloseBill={() => setBillTransactionId('')}
           billTransaction={transactions.find((transaction) => transaction.id === billTransactionId) ?? null}
           billDetails={(report?.details ?? []).filter((row) =>
             row.name === selectedPerson &&
             row.paymentAllocations.some((allocation) => allocation.transactionId === billTransactionId))}
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

function PaymentsView({ report, summaries, details, transactions, selected, selectedPerson, setSelectedPerson, selectedEntryIds, paymentTotal, onTogglePaymentEntry, paymentMethod, setPaymentMethod, paymentReference, setPaymentReference, paymentNote, setPaymentNote, saving, editable, onRecordPayment, onPrint, onOpenBill, onCloseBill, billTransaction, billDetails, loading }: {
  report: HrReport | null;
  summaries: HrSummary[];
  details: HrReport['details'];
  transactions: PaymentTransaction[];
  selected: HrSummary | null;
  selectedPerson: string;
  setSelectedPerson: (value: string) => void;
  selectedEntryIds: string[];
  paymentTotal: number;
  onTogglePaymentEntry: (recordId: string, checked: boolean) => void;
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
  onOpenBill: (transactionId: string) => void;
  onCloseBill: () => void;
  billTransaction: PaymentTransaction | null;
  billDetails: HrReport['details'];
  loading: boolean;
}) {
  const unpaid = summaries.filter((row) => row.outstandingAmount > 0);
  return (
    <>
      <div className={`mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5 ${selected ? 'print:hidden' : ''}`}>
        <Metric label="Workers" value={String(summaries.length)} />
        <Metric label="Open workers" value={String(unpaid.length)} tone={unpaid.length ? 'warning' : 'success'} />
        <Metric label="Total payable" value={amount(summaries.reduce((sum, row) => sum + row.totalAmount, 0))} />
        <Metric label="Paid" value={amount(summaries.reduce((sum, row) => sum + row.paidAmount, 0))} tone="success" />
        <Metric label="Outstanding" value={amount(unpaid.reduce((sum, row) => sum + row.outstandingAmount, 0))} tone="warning" />
      </div>
      {!selected && (
        <section className="mb-6 overflow-hidden rounded-xl border border-border bg-card shadow-sm print:hidden">
          <div className="border-b border-border px-5 py-4"><h2 className="font-serif text-lg font-bold">Payment queue</h2><p className="text-xs text-muted-foreground">{unpaid.length} person(s) have an amount left to pay.</p></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="border-b border-border bg-muted/45"><tr>{['Person', 'Worked days', 'Total payable', 'Paid', 'Amount left', 'Status', 'Action'].map((label) => <th key={label} className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</th>)}</tr></thead><tbody className="divide-y divide-border">{unpaid.map((row) => <tr key={row.name} className="hover:bg-muted/30"><td className="px-4 py-3 font-semibold">{row.name}</td><td className="px-4 py-3">{formatDays(row.workedDays)}</td><td className="px-4 py-3 font-mono">{amount(row.totalAmount)}</td><td className="px-4 py-3 font-mono text-emerald-700">{amount(row.paidAmount)}</td><td className="px-4 py-3 font-mono font-bold text-amber-700">{amount(row.outstandingAmount)}</td><td className="px-4 py-3"><StatusBadge status={row.paymentStatus} /></td><td className="px-4 py-3"><button onClick={() => setSelectedPerson(row.name)} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted">Open worker</button></td></tr>)}</tbody></table></div>{!loading && !unpaid.length && <EmptyTable text="No unpaid people match this period and filter." />}</section>
      )}
      {selected && report && (
        <section data-print-statement className="mb-6 rounded-xl border-2 border-foreground/15 bg-card p-6 shadow-sm md:p-8 print:mb-0 print:border-0 print:p-0 print:shadow-none">
           <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5"><div><button onClick={() => setSelectedPerson('')} className="mb-3 text-xs font-semibold text-primary hover:underline print:hidden">← Back to payment queue</button><div className="font-mono text-[10px] uppercase tracking-[.18em] text-primary">Worker payment statement</div><h2 className="mt-2 font-serif text-3xl font-bold">{selected.name}</h2><p className="mt-1 text-sm text-muted-foreground">{displayDate(report.from)} to {displayDate(report.to)} · {sourceLabel(report.sourceScope)}</p></div><div className="text-right"><StatusBadge status={selected.paymentStatus} /><div className="mt-2 text-xs text-muted-foreground">Amount left</div><div className="font-mono text-2xl font-bold text-amber-700">{amount(selected.outstandingAmount)}</div></div></div>
           <div data-print-screen className="mt-6 grid gap-3 sm:grid-cols-4"><Metric label="Worked days" value={formatDays(selected.workedDays)} /><Metric label="Total payable" value={amount(selected.totalAmount)} /><Metric label="Paid" value={amount(selected.paidAmount)} tone="success" /><Metric label="Balance left" value={amount(selected.outstandingAmount)} tone="warning" /></div>
           <div data-print-screen className="mt-6 divide-y divide-border"><BillLine label="Base wages" detail={`${formatDays(selected.workedDays)} days × ${amount(selected.wagePerDay)}`} value={amount(selected.wageAmount)} /><BillLine label="Overtime" detail={`${formatMinutes(selected.overtimeMinutes)} at ${amount(selected.overtimeRate)}/hour`} value={amount(selected.overtimeAmount)} /><BillLine label="Exact total payable" detail="Base wages + overtime, with no rounding adjustment" value={amount(selected.totalAmount)} /></div>
            {editable && selected.outstandingAmount > 0 && <div data-payment-form className="mt-5 rounded-xl border border-primary/20 bg-primary/5 p-5"><div className="mb-4"><h3 className="font-serif text-lg font-bold">Record a payment</h3><p className="text-xs text-muted-foreground">Select the exact attendance reference this payment covers. The payable total is calculated automatically; no payment amount is entered manually.</p></div><div className="grid gap-4 md:grid-cols-4"><label><span className="mb-1.5 block text-xs font-semibold">Payment total</span><input value={paymentTotal ? amount(paymentTotal) : 'Select a reference'} readOnly className={`${inputClass} bg-muted/50 font-mono font-semibold`} /></label><label><span className="mb-1.5 block text-xs font-semibold">Payment method</span><select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} className={inputClass}>{paymentMethods.map((method) => <option key={method}>{method}</option>)}</select></label><label><span className="mb-1.5 block text-xs font-semibold">Reference / UTR {paymentMethod !== 'Cash' && paymentMethod !== 'Other' ? '(required)' : '(optional)'}</span><input value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} placeholder={paymentMethod === 'Cash' || paymentMethod === 'Other' ? 'Optional' : 'Enter reference'} className={inputClass} /></label><label><span className="mb-1.5 block text-xs font-semibold">Note</span><input value={paymentNote} onChange={(event) => setPaymentNote(event.target.value)} placeholder="Optional" className={inputClass} /></label></div><div className="mt-3 text-xs text-muted-foreground">{selectedEntryIds.length ? `Selected attendance reference${selectedEntryIds.length === 1 ? '' : 's'}: ${details.filter((row) => selectedEntryIds.includes(row.id)).map((row) => `${row.referenceNo} (${displayDate(row.date)})`).join(', ')}` : 'No attendance reference selected. Choose the row for the exact payment date below.'}</div><div className="mt-4 flex flex-wrap items-center gap-3"><button onClick={onRecordPayment} disabled={saving || !paymentTotal} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">{saving ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />} {saving ? 'Saving…' : 'Record payment'}</button><button onClick={onPrint} className="flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-semibold hover:bg-muted"><Printer size={15} /> Print statement</button></div></div>}
            <div data-print-screen className="mt-7 grid gap-7 lg:grid-cols-[1.35fr_.65fr]">
              <div>
                <div className="mb-3 flex items-start justify-between gap-3">
                    <div><h3 className="font-serif text-lg font-bold">Attendance for this payment</h3><p className="text-xs text-muted-foreground">Each row has one reference number. Select only the row(s) that this payment is for; rows are never selected automatically.</p></div>
                  <span className="print:hidden text-xs text-muted-foreground">{details.filter((row) => row.paymentIncluded && row.paymentStatus !== 'paid').length} open · {details.filter((row) => !row.paymentIncluded).length} excluded</span>
                </div>
                  <DetailTable details={details} selectedEntryIds={selectedEntryIds} onTogglePaymentEntry={onTogglePaymentEntry} />
              </div>
              <div>
                <div className="mb-3 flex items-center justify-between gap-3"><h3 className="font-serif text-lg font-bold">Payment history</h3><span className="text-[10px] uppercase tracking-wider text-muted-foreground">{transactions.length} reference{transactions.length === 1 ? '' : 's'}</span></div>
                {transactions.length ? <div className="max-h-56 space-y-2 overflow-y-auto pr-1">{transactions.map((transaction) => <div key={transaction.id} className="rounded-lg border border-border bg-muted/20 p-2.5 text-xs shadow-sm"><div className="flex items-start justify-between gap-2"><span className="font-semibold">{amount(transaction.amount)} · {transaction.paymentMethod}</span><span className="shrink-0 text-right text-[10px] leading-4 text-muted-foreground">Paid {displayDate(transaction.paidAt.slice(0, 10))}</span></div><div className="mt-1 truncate text-[11px] text-muted-foreground">{transaction.billNumber}{transaction.paymentReference ? ` · Ref ${transaction.paymentReference}` : ''}</div><div className="mt-1 truncate text-[10px] text-muted-foreground" title="Attendance date and reference">Work: {paymentAttendanceSummary(transaction, report?.details ?? [])}</div><div className="mt-2 flex items-center justify-between gap-2"><span className="truncate text-[11px] text-muted-foreground">{transaction.paymentNote || (transaction.paidBy ? `by ${transaction.paidBy}` : 'Payment recorded')}</span><button onClick={() => onOpenBill(transaction.id)} className="shrink-0 rounded-md border border-primary/30 px-2 py-1 text-[10px] font-semibold text-primary hover:bg-primary/10">Open bill</button></div></div>)}</div> : <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">No payment has been recorded for this period.</div>}
              </div>
            </div>
           <div data-print-bill className="hidden">
             <div className="border-b border-black pb-2">
               <h1 className="text-center text-xl font-bold">PAYMENT BILL</h1>
               <p className="text-center text-xs">Attendance payment statement</p>
             </div>
             <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
               <div><strong>Name:</strong> {selected.name}</div>
               <div><strong>Status:</strong> {statusLabel(selected.paymentStatus)}</div>
               <div><strong>Period:</strong> {displayDate(report.from)} to {displayDate(report.to)}</div>
               <div><strong>Register:</strong> {sourceLabel(report.sourceScope)}</div>
             </div>
             <table className="mt-4 w-full border border-black text-xs">
               <tbody>
                 <tr><td className="border-b border-black px-2 py-1.5">Worked days</td><td className="border-b border-black px-2 py-1.5 text-right">{formatDays(selected.workedDays)}</td></tr>
                 <tr><td className="border-b border-black px-2 py-1.5">Base wages</td><td className="border-b border-black px-2 py-1.5 text-right">{amount(selected.wageAmount)}</td></tr>
                 <tr><td className="border-b border-black px-2 py-1.5">Overtime</td><td className="border-b border-black px-2 py-1.5 text-right">{amount(selected.overtimeAmount)}</td></tr>
                 <tr><td className="border-b border-black px-2 py-1.5 font-bold">Total bill</td><td className="border-b border-black px-2 py-1.5 text-right font-bold">{amount(selected.totalAmount)}</td></tr>
                 <tr><td className="border-b border-black px-2 py-1.5">Paid</td><td className="border-b border-black px-2 py-1.5 text-right">{amount(selected.paidAmount)}</td></tr>
                 <tr><td className="px-2 py-1.5 font-bold">Balance</td><td className="px-2 py-1.5 text-right font-bold">{amount(selected.outstandingAmount)}</td></tr>
               </tbody>
             </table>
             <p className="mt-4 text-xs"><strong>Condition:</strong> This bill includes only attendance selected for this payment period. Any excluded attendance will be considered in a later payment.</p>
             <div className="mt-8 grid grid-cols-2 gap-10 text-xs">
               <div className="border-t border-black pt-1">Prepared by</div>
               <div className="border-t border-black pt-1">Worker signature</div>
             </div>
           </div>
            {billTransaction && <BillDialog transaction={billTransaction} details={billDetails} onClose={onCloseBill} />}
        </section>
      )}
    </>
  );
}

function LedgerView({ details, transactions, loading }: { details: HrReport['details']; transactions: PaymentTransaction[]; loading: boolean }) {
  const [attendanceQuery, setAttendanceQuery] = useState('');
  const [attendanceSearch, setAttendanceSearch] = useState('');
  const [transactionQuery, setTransactionQuery] = useState('');
  const [transactionSearch, setTransactionSearch] = useState('');
  const normalizedAttendanceSearch = attendanceSearch.trim().toLowerCase();
  const normalizedTransactionSearch = transactionSearch.trim().toLowerCase();
  const filteredDetails = details.filter((row) => {
    if (!normalizedAttendanceSearch) return true;
    return [
      row.date,
      displayDate(row.date),
      row.name,
      sourceLabel(row.source),
      row.paymentStatus,
      amount(row.totalAmount),
    ].join(' ').toLowerCase().includes(normalizedAttendanceSearch);
  });
  const filteredTransactions = transactions.filter((transaction) => {
    if (!normalizedTransactionSearch) return true;
    return [
      transaction.paidAt,
      displayDate(transaction.paidAt.slice(0, 10)),
      transaction.personName,
      displayDate(transaction.fromDate),
      displayDate(transaction.toDate),
      sourceLabel(transaction.sourceScope),
      transaction.paymentMethod,
      transaction.paymentReference ?? '',
      transaction.billNumber,
    ].join(' ').toLowerCase().includes(normalizedTransactionSearch);
  });
  return (
    <>
      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div className="flex items-center gap-3"><ListChecks size={19} className="text-primary" /><div><h2 className="font-serif text-lg font-bold">Attendance payment ledger</h2><p className="text-xs text-muted-foreground">Every attendance entry with its due, paid and remaining amount.</p></div></div>
          <form className="flex w-full gap-2 sm:w-auto" onSubmit={(event) => { event.preventDefault(); setAttendanceSearch(attendanceQuery); }}>
            <div className="relative min-w-0 flex-1 sm:w-64"><Search size={14} className="pointer-events-none absolute left-3 top-3 text-muted-foreground" /><input value={attendanceQuery} onChange={(event) => setAttendanceQuery(event.target.value)} placeholder="Search attendance" className={`${inputClass} pl-8`} aria-label="Search attendance payment ledger" /></div>
            <button type="submit" className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2.5 text-xs font-semibold text-primary-foreground"><Search size={14} /> Search</button>
          </form>
        </div>
        <div className="max-h-[32rem] overflow-auto">
           <table className="w-full min-w-[1400px] text-left text-sm"><thead className="sticky top-0 z-10 border-b border-border bg-muted/95"><tr>{['Reference no.', 'Date', 'Person', 'Register', 'Days', 'Hours', 'Overtime', 'Amount due', 'Paid', 'Amount left', 'Status'].map((label) => <th key={label} className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</th>)}</tr></thead><tbody className="divide-y divide-border">{filteredDetails.map((row) => <tr key={row.id} className="hover:bg-muted/30"><td className="px-4 py-3 font-mono text-xs">{row.referenceNo}</td><td className="px-4 py-3">{displayDate(row.date)}</td><td className="px-4 py-3 font-semibold">{row.name}</td><td className="px-4 py-3">{sourceLabel(row.source)}</td><td className="px-4 py-3">{formatDays(row.workedDays)}</td><td className="px-4 py-3 font-mono">{formatMinutes(row.minutes)}</td><td className="px-4 py-3 font-mono text-primary">{formatMinutes(row.overtimeMinutes)}</td><td className="px-4 py-3 font-mono font-semibold">{amount(row.totalAmount)}</td><td className="px-4 py-3 font-mono text-emerald-700">{amount(row.paidAmount)}</td><td className="px-4 py-3 font-mono font-bold text-amber-700">{amount(row.outstandingAmount)}</td><td className="px-4 py-3"><StatusBadge status={row.paymentStatus} /></td></tr>)}</tbody></table>
          {!loading && !filteredDetails.length && <EmptyTable text={attendanceSearch ? 'No attendance rows match this search.' : 'No attendance rows match this period and filter.'} />}
        </div>
      </section>
      <section className="mt-6 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div><h2 className="font-serif text-lg font-bold">Payment transactions</h2><p className="text-xs text-muted-foreground">Payments recorded inside the selected period.</p></div>
          <form className="flex w-full gap-2 sm:w-auto" onSubmit={(event) => { event.preventDefault(); setTransactionSearch(transactionQuery); }}>
            <div className="relative min-w-0 flex-1 sm:w-64"><Search size={14} className="pointer-events-none absolute left-3 top-3 text-muted-foreground" /><input value={transactionQuery} onChange={(event) => setTransactionQuery(event.target.value)} placeholder="Search transactions" className={`${inputClass} pl-8`} aria-label="Search payment transactions" /></div>
            <button type="submit" className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2.5 text-xs font-semibold text-primary-foreground"><Search size={14} /> Search</button>
          </form>
        </div>
        <div className="max-h-[28rem] overflow-auto">
          <table className="w-full min-w-[1000px] text-left text-sm"><thead className="sticky top-0 z-10 border-b border-border bg-muted/95"><tr>{['Paid on', 'Person', 'Paid period', 'Register', 'Amount', 'Method', 'Reference', 'Paid by'].map((label) => <th key={label} className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</th>)}</tr></thead><tbody className="divide-y divide-border">{filteredTransactions.map((transaction) => <tr key={transaction.id} className="hover:bg-muted/30"><td className="px-4 py-3">{displayDate(transaction.paidAt.slice(0, 10))}</td><td className="px-4 py-3 font-semibold">{transaction.personName}</td><td className="px-4 py-3 text-xs">{displayDate(transaction.fromDate)} – {displayDate(transaction.toDate)}</td><td className="px-4 py-3">{sourceLabel(transaction.sourceScope)}</td><td className="px-4 py-3 font-mono font-bold text-emerald-700">{amount(transaction.amount)}</td><td className="px-4 py-3">{transaction.paymentMethod}</td><td className="px-4 py-3 text-xs">{transaction.paymentReference || '—'}</td><td className="px-4 py-3 text-xs">{transaction.paidBy || '—'}</td></tr>)}</tbody></table>
          {!loading && !filteredTransactions.length && <EmptyTable text={transactionSearch ? 'No payment transactions match this search.' : 'No payment transactions match this period and filter.'} />}
        </div>
      </section>
    </>
  );
}

function BillDialog({ transaction, details, onClose }: {
  transaction: PaymentTransaction;
  details: HrReport['details'];
  onClose: () => void;
}) {
  const billTotal = details.reduce((sum, row) => sum + billAmounts(row, transaction.id).total, 0);
  return <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/35 p-2 sm:p-4" role="dialog" aria-modal="true" aria-label={`Bill ${transaction.billNumber}`}>
    <div className="max-h-[calc(100dvh-1rem)] w-full max-w-4xl overflow-y-auto rounded-xl border border-border bg-card shadow-2xl sm:max-h-[90dvh] sm:rounded-2xl">
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-4 sm:gap-4 sm:px-6 sm:py-5">
        <div className="min-w-0"><div className="font-mono text-[10px] uppercase tracking-[.16em] text-primary">Payment bill</div><h2 className="mt-1 truncate font-serif text-xl font-bold sm:text-2xl">{transaction.personName}</h2><p className="mt-1 break-words text-xs text-muted-foreground">{displayDate(transaction.fromDate)} to {displayDate(transaction.toDate)} · {transaction.billNumber}</p></div>
        <button onClick={onClose} className="rounded-md px-2 py-1 text-sm font-semibold text-muted-foreground hover:bg-muted" aria-label="Close bill">Close</button>
      </div>
      <div className="p-4 sm:p-6">
        {details.length ? <>
          <div className="hidden overflow-x-auto rounded-lg border border-border sm:block"><table className="w-full min-w-[860px] text-left text-xs"><thead className="border-b border-border bg-muted/45"><tr>{['Date', 'Register', 'Days', 'Overtime', 'Per day amount', 'Overtime amount', 'Total amount'].map((label) => <th key={label} className="whitespace-nowrap px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</th>)}</tr></thead><tbody className="divide-y divide-border">{details.map((row) => { const line = billAmounts(row, transaction.id); return <tr key={row.id}><td className="whitespace-nowrap px-3 py-2">{displayDate(row.date)}</td><td className="px-3 py-2">{sourceLabel(row.source)}</td><td className="px-3 py-2">{formatDays(row.workedDays)}</td><td className="px-3 py-2 font-mono text-primary">{formatMinutes(row.overtimeMinutes)}</td><td className="px-3 py-2 font-mono">{amount(line.base)}</td><td className="px-3 py-2 font-mono text-primary">{amount(line.overtime)}</td><td className="px-3 py-2 font-mono font-semibold">{amount(line.total)}</td></tr>; })}</tbody></table></div>
          <div className="space-y-3 sm:hidden">{details.map((row) => { const line = billAmounts(row, transaction.id); return <div key={row.id} className="rounded-lg border border-border bg-background/40 p-3"><div className="flex items-start justify-between gap-3"><div><div className="text-xs font-semibold">{displayDate(row.date)}</div><div className="mt-1 text-[11px] text-muted-foreground">{sourceLabel(row.source)}</div></div><div className="font-mono text-sm font-bold">{amount(line.total)}</div></div><div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-border pt-3 text-xs"><div><span className="text-muted-foreground">Days</span><div className="mt-0.5 font-semibold">{formatDays(row.workedDays)}</div></div><div><span className="text-muted-foreground">Overtime</span><div className="mt-0.5 font-mono text-primary">{formatMinutes(row.overtimeMinutes)}</div></div><div><span className="text-muted-foreground">Per day amount</span><div className="mt-0.5 font-mono">{amount(line.base)}</div></div><div><span className="text-muted-foreground">Overtime amount</span><div className="mt-0.5 font-mono text-primary">{amount(line.overtime)}</div></div></div></div>; })}</div>
        </> : <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No attendance rows are linked to this payment in the selected date range.</div>}
          <div className="mt-5 flex flex-col gap-4 border-t border-border pt-4 sm:flex-row sm:items-end sm:justify-between"><div className="min-w-0 text-xs text-muted-foreground"><div>Payment date: {displayDate(transaction.paidAt.slice(0, 10))}</div><div className="mt-1 break-words">Payment reference: {transaction.paymentReference || 'No reference'}</div><div className="mt-1 break-words">Attendance references: {transaction.attendanceReferences.length ? transaction.attendanceReferences.join(', ') : 'No attendance reference stored'}</div></div><div className="shrink-0 sm:text-right"><div className="text-xs text-muted-foreground">Exact payment total</div><div className="font-mono text-xl font-bold">{amount(transaction.amount)}</div>{details.length && Math.abs(billTotal - transaction.amount) > 0.005 ? <div className="mt-1 text-[10px] text-amber-700">Linked attendance total: {amount(billTotal)}</div> : null}</div></div>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end"><button onClick={() => downloadBill(transaction, details)} className="flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-muted"><Download size={14} /> Download bill</button><button onClick={() => printBill(transaction, details)} className="flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90"><Printer size={14} /> Print bill</button></div>
      </div>
    </div>
  </div>;
}

function billAmounts(row: HrReport['details'][number], transactionId: string) {
  const allocation = row.paymentAllocations.find((item) => item.transactionId === transactionId)?.amount ?? row.totalAmount;
  if (row.totalAmount <= 0 || allocation >= row.totalAmount - 0.005) {
    return { base: row.baseAmount, overtime: row.overtimeAmount, total: row.totalAmount };
  }
  const ratio = allocation / row.totalAmount;
  return {
    base: row.baseAmount * ratio,
    overtime: row.overtimeAmount * ratio,
    total: allocation,
  };
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function buildBillHtml(transaction: PaymentTransaction, details: HrReport['details']) {
  const rows = details.map((row) => {
    const line = billAmounts(row, transaction.id);
    return `<tr><td>${escapeHtml(row.referenceNo)}</td><td>${escapeHtml(displayDate(row.date))}</td><td>${escapeHtml(sourceLabel(row.source))}</td><td>${escapeHtml(formatDays(row.workedDays))}</td><td>${escapeHtml(formatMinutes(row.overtimeMinutes))}</td><td>${escapeHtml(amount(line.base))}</td><td>${escapeHtml(amount(line.overtime))}</td><td><strong>${escapeHtml(amount(line.total))}</strong></td></tr>`;
  }).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(transaction.billNumber)}</title><style>body{font-family:Arial,sans-serif;color:#111;margin:32px}h1{margin:0 0 4px;font-size:22px}p{color:#555;font-size:12px}table{border-collapse:collapse;width:100%;margin-top:24px;font-size:12px}th,td{border:1px solid #bbb;padding:8px;text-align:left}th{background:#f1f1f1;text-transform:uppercase;font-size:10px}td:nth-child(n+4){text-align:right}.summary{margin-top:20px;margin-left:auto;width:260px}.summary div{display:flex;justify-content:space-between;border-bottom:1px solid #ddd;padding:7px 0;font-size:13px}.summary strong{font-size:16px}</style></head><body><h1>Payment bill</h1><p><strong>Person:</strong> ${escapeHtml(transaction.personName)}<br><strong>Bill:</strong> ${escapeHtml(transaction.billNumber)}<br><strong>Attendance period:</strong> ${escapeHtml(displayDate(transaction.fromDate))} to ${escapeHtml(displayDate(transaction.toDate))}<br><strong>Payment date:</strong> ${escapeHtml(displayDate(transaction.paidAt.slice(0, 10)))}<br><strong>Payment reference:</strong> ${escapeHtml(transaction.paymentReference || 'No reference')}<br><strong>Attendance references:</strong> ${escapeHtml(transaction.attendanceReferences.join(', ') || 'No attendance reference stored')}</p><table><thead><tr><th>Attendance reference</th><th>Date</th><th>Register</th><th>Days</th><th>Overtime</th><th>Per day amount</th><th>Overtime amount</th><th>Total amount</th></tr></thead><tbody>${rows || '<tr><td colspan="8">No linked attendance rows.</td></tr>'}</tbody></table><div class="summary"><div><span>Exact payment total</span><strong>${escapeHtml(amount(transaction.amount))}</strong></div></div></body></html>`;
}

function downloadBill(transaction: PaymentTransaction, details: HrReport['details']) {
  const url = URL.createObjectURL(new Blob([buildBillHtml(transaction, details)], { type: 'text/html' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `bill-${transaction.billNumber}.html`;
  link.click();
  URL.revokeObjectURL(url);
}

function printBill(transaction: PaymentTransaction, details: HrReport['details']) {
  const printWindow = window.open('', '_blank', 'width=900,height=700');
  if (!printWindow) return;
  let printed = false;
  const print = () => {
    if (printed) return;
    printed = true;
    printWindow.print();
    window.setTimeout(() => printWindow.close(), 250);
  };
  printWindow.onload = print;
  printWindow.document.open();
  printWindow.document.write(buildBillHtml(transaction, details));
  printWindow.document.close();
  window.setTimeout(print, 500);
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

function DetailTable({ details, selectedEntryIds, onTogglePaymentEntry }: {
  details: HrReport['details'];
  selectedEntryIds: string[];
  onTogglePaymentEntry: (recordId: string, checked: boolean) => void;
}) {
  const visibleDetails = details.filter((row) => row.paymentStatus !== 'paid');
  return <div className="overflow-x-auto"><table className="w-full min-w-[1120px] text-left text-xs"><thead className="border-b border-border"><tr>{['Pay', 'Reference no.', 'Date', 'Register', 'Days', 'Hours', 'Overtime', 'Per day amount', 'Overtime amount', 'Total amount', 'Status'].map((label) => <th key={label} className="px-2 py-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</th>)}</tr></thead><tbody className="divide-y divide-border">{visibleDetails.map((row) => { const selectable = row.paymentIncluded && row.outstandingAmount > 0; return <tr key={row.id} className={row.paymentIncluded ? '' : 'bg-slate-50/70'}><td className="px-2 py-2">{selectable ? <input type="checkbox" checked={selectedEntryIds.includes(row.id)} onChange={(event) => onTogglePaymentEntry(row.id, event.target.checked)} className="size-4 accent-[hsl(var(--primary))]" aria-label={`Select attendance ${row.referenceNo}`} /> : <span className="text-muted-foreground">—</span>}</td><td className="px-2 py-2 font-mono text-[10px]">{row.referenceNo}</td><td className="px-2 py-2">{displayDate(row.date)}</td><td className="px-2 py-2">{sourceLabel(row.source)}</td><td className="px-2 py-2">{formatDays(row.workedDays)}</td><td className="px-2 py-2 font-mono">{formatMinutes(row.minutes)}</td><td className="px-2 py-2 font-mono">{formatMinutes(row.overtimeMinutes)}</td><td className="px-2 py-2 font-mono">{amount(row.baseAmount)}</td><td className="px-2 py-2 font-mono text-primary">{amount(row.overtimeAmount)}</td><td className="px-2 py-2 font-mono font-semibold">{amount(row.outstandingAmount)}</td><td className="px-2 py-2"><StatusBadge status={row.paymentStatus} /></td></tr>; })}</tbody></table>{!visibleDetails.length && <div className="border-t border-border p-6 text-center text-sm text-muted-foreground">All attendance in this period has been paid and moved to payment history.</div>}</div>;
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