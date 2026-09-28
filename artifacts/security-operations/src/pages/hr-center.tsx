import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Download,
  Edit3,
  LayoutDashboard,
  Loader2,
  Printer,
  ReceiptText,
  RefreshCw,
  Search,
  WalletCards,
} from 'lucide-react';
import { Link } from 'wouter';
import { PageIntro } from '@/components/ops-ui';
import { canEditPayments, useAuth } from '@/lib/auth';
import {
  displayDate,
  fetchBillSignatories,
  fetchDriverWages,
  fetchHrReport,
  fetchPaymentTransactions,
  formatDays,
  formatMinutes,
  savePaymentBill,
  saveDriverDayPayment,
  today,
  type HrReport,
  type BillSignatories,
  type DriverWageOption,
  type HrSummary,
  type PaymentTransaction,
} from '@/lib/hr-report';

type View = 'overview' | 'payments' | 'transactions';
type StatusFilter = 'all' | 'unpaid' | 'partial' | 'paid' | 'excluded';

const inputClass = 'w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15';
const paymentMethods = ['Cash', 'Bank transfer', 'UPI', 'Cheque', 'Other'];
const amount = (value: number) => `₹${value.toFixed(2)}`;
const roundOffToRupee = (value: number) => {
  const currencyValue = Number(value.toFixed(2));
  return currencyValue > 0 ? Number((Math.ceil(currencyValue) - currencyValue).toFixed(2)) : 0;
};
const sourceLabel = (source: string) => source === 'daily-attendance'
  ? 'Training Register'
  : source === 'driver-attendance'
    ? 'Driver Attendance'
    : source === 'chowk-labour'
      ? 'Chowk Labour'
      : 'All registers';
const transactionRegisterLabel = (transaction: PaymentTransaction) =>
  transaction.registers?.length
    ? transaction.registers.map(sourceLabel).join(', ')
    : sourceLabel(transaction.sourceScope);
const paymentAttendanceSummary = (transaction: PaymentTransaction, details: HrReport['details']) => {
  if (transaction.driverDays && transaction.wagePerDay) {
    return `${formatDays(transaction.driverDays)} days × ${amount(transaction.wagePerDay)} wage/day`;
  }
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
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
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
  const [driverWages, setDriverWages] = useState<DriverWageOption[]>([]);
  const [driverPaymentName, setDriverPaymentName] = useState('');
  const [driverPaymentDays, setDriverPaymentDays] = useState('');
  const [driverPaymentMethod, setDriverPaymentMethod] = useState('Cash');
  const [driverPaymentReference, setDriverPaymentReference] = useState('');
  const [driverPaymentNote, setDriverPaymentNote] = useState('');
  const [billTransactionId, setBillTransactionId] = useState('');
  const [billDetailsOverride, setBillDetailsOverride] = useState<HrReport['details'] | null>(null);
  const [transactionHistory, setTransactionHistory] = useState<PaymentTransaction[]>([]);
  const [transactionLoading, setTransactionLoading] = useState(false);
  const [transactionPaidOn, setTransactionPaidOn] = useState(today);
  const [transactionSource, setTransactionSource] = useState('all');
  const [transactionQuery, setTransactionQuery] = useState('');
  const [billSignatories, setBillSignatories] = useState<BillSignatories>({
    preparedBy: '',
    checkedBy: '',
    verifiedBy: '',
  });
  const transactionRequestId = useRef(0);
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
    void fetchBillSignatories().then(setBillSignatories).catch(() => undefined);
    void fetchDriverWages().then(setDriverWages).catch((reason) => {
      setError(reason instanceof Error ? reason.message : 'Driver wage records could not be loaded');
    });
  }, []);

  const refreshTransactionHistory = async (
    nextPaidOn = transactionPaidOn,
    nextSource = transactionSource,
  ) => {
    const currentRequest = ++transactionRequestId.current;
    setTransactionLoading(true);
    try {
      const nextTransactions = await fetchPaymentTransactions('', '', nextSource, '', nextPaidOn);
      if (currentRequest === transactionRequestId.current) setTransactionHistory(nextTransactions);
    } catch (reason) {
      if (currentRequest === transactionRequestId.current) {
        setError(reason instanceof Error ? reason.message : 'Payment transactions could not be loaded');
      }
    } finally {
      if (currentRequest === transactionRequestId.current) setTransactionLoading(false);
    }
  };

  useEffect(() => {
    if (view === 'transactions') void refreshTransactionHistory();
  }, [view]);

  const summaries = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (report?.summaries ?? [])
      .filter((row) => (!query || row.name.toLowerCase().includes(query)) &&
        (statusFilter === 'all' ||
          row.paymentStatus === statusFilter ||
          (statusFilter === 'excluded' && (report?.details ?? []).some((detail) => detail.name === row.name && detail.paymentStatus === 'excluded'))))
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
  const payableDetailIds = useMemo(
    () => new Set(payableDetails.map((row) => row.id)),
    [payableDetails],
  );
  const selectedEntryIdSet = useMemo(() => new Set(selectedEntryIds), [selectedEntryIds]);
  const selectedPaymentTotal = useMemo(
    () => payableDetails.reduce(
      (sum, row) => sum + (selectedEntryIdSet.has(row.id) ? row.outstandingAmount : 0),
      0,
    ),
    [payableDetails, selectedEntryIdSet],
  );
  const roundOffAmount = roundOffToRupee(selectedPaymentTotal);
  const paymentTotalWithRoundOff = Number((selectedPaymentTotal + roundOffAmount).toFixed(2));

  const visibleTransactions = useMemo(() => {
    const query = search.trim().toLowerCase();
    return transactions.filter((transaction) =>
      !query || transaction.personName.toLowerCase().includes(query));
  }, [search, transactions]);

  const selectedTransactions = useMemo(
    () => visibleTransactions.filter((transaction) =>
      !selectedPerson || transaction.personName === selectedPerson),
    [selectedPerson, visibleTransactions],
  );
  const selectedPersonBillDetails = useMemo(
    () => (report?.details ?? []).filter((row) =>
      row.name === selectedPerson &&
      row.paymentAllocations.some((allocation) => allocation.transactionId === billTransactionId)),
    [billTransactionId, report, selectedPerson],
  );
  const selectedBillTransaction = useMemo(
    () => transactionHistory.find((transaction) => transaction.id === billTransactionId)
      ?? transactions.find((transaction) => transaction.id === billTransactionId)
      ?? null,
    [billTransactionId, transactionHistory, transactions],
  );
  const billDetails = billDetailsOverride ?? selectedPersonBillDetails;
  const filteredTransactionHistory = useMemo(() => {
    const query = transactionQuery.trim().toLowerCase();
    if (!query) return transactionHistory;
    return transactionHistory.filter((transaction) => [
      transaction.personName,
      transaction.billNumber,
      transaction.paymentReference ?? '',
      transaction.paymentMethod,
      transaction.paymentNote ?? '',
      transaction.paidBy ?? '',
      transactionRegisterLabel(transaction),
      displayDate(transaction.fromDate),
      displayDate(transaction.toDate),
      displayDate(transaction.paidAt.slice(0, 10)),
    ].join(' ').toLowerCase().includes(query));
  }, [transactionHistory, transactionQuery]);

  const totals = useMemo(() => {
    const summaryTotals = { payable: 0, paid: 0, outstanding: 0, openPeople: 0, paidPeople: 0 };
    for (const row of summaries) {
      summaryTotals.payable += row.totalAmount;
      summaryTotals.paid += row.paidAmount;
      summaryTotals.outstanding += row.outstandingAmount;
      if (row.outstandingAmount > 0) summaryTotals.openPeople += 1;
      if (row.paymentStatus === 'paid') summaryTotals.paidPeople += 1;
    }
    return {
      people: summaries.length,
      ...summaryTotals,
      attendanceEntries: details.length,
    };
  }, [details, summaries]);

  useEffect(() => {
    setSelectedEntryIds([]);
    setPaymentReference('');
    setPaymentNote('');
  }, [selected?.name]);

  const recordPayment = async () => {
    if (!selected || !report) return;
    const selectedIds = selectedEntryIds.filter((id) => payableDetailIds.has(id));
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
    const requestedPaymentTotal = paymentTotalWithRoundOff;
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
        totalAmount: Number(selected.totalAmount.toFixed(2)),
        roundingAmount: roundOffAmount,
        attendanceRecordIds: selectedIds,
        status: selectedPaymentTotal >= selected.outstandingAmount - 0.005 ? 'paid' : 'partial',
        paymentMethod,
        paymentReference: reference,
        paymentNote: paymentNote.trim(),
      });
       setNotice(`${selected.name}: ${amount(requestedPaymentTotal)} recorded against ${selectedIds.length} attendance ${selectedIds.length === 1 ? 'entry' : 'entries'}.`);
      const loaded = await load();
      if (view === 'transactions') void refreshTransactionHistory();
      const selectedReferences = new Set(
        payableDetails
          .filter((row) => selectedEntryIdSet.has(row.id))
          .map((row) => row.referenceNo),
      );
      const savedTransaction = loaded?.transactions.find((transaction) =>
        transaction.personName === selected.name &&
         Math.abs(transaction.amount - requestedPaymentTotal) < 0.005 &&
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

  const recordDriverDayPayment = async () => {
    const days = Number(driverPaymentDays);
    const driver = driverWages.find((option) => option.name === driverPaymentName);
    if (!driver || !Number.isInteger(days) || days < 1 || days > 366) {
      setError('Select a driver and enter a whole number of days from 1 to 366.');
      return;
    }
    if (['Bank transfer', 'UPI', 'Cheque'].includes(driverPaymentMethod) && !driverPaymentReference.trim()) {
      setError(`${driverPaymentMethod} payments need a reference or UTR number.`);
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const savedTransaction = await saveDriverDayPayment({
        driverName: driver.name,
        days,
        paymentMethod: driverPaymentMethod,
        paymentReference: driverPaymentReference.trim(),
        paymentNote: driverPaymentNote.trim(),
      });
      await load();
      if (view === 'transactions') void refreshTransactionHistory();
      setDriverPaymentDays('');
      setDriverPaymentReference('');
      setDriverPaymentNote('');
      setNotice(`${driver.name}: ${days} day${days === 1 ? '' : 's'} paid at ${amount(driver.wagePerDay)} per day. Payment ${savedTransaction.billNumber} was added to payment history.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Driver day payment could not be saved');
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
    downloadCsv(rows, `hr-summary-${from || 'all-dates'}-to-${to || 'all-dates'}.csv`);
  };

  const exportTransactions = () => {
    const rows = [
      ['Payment date', 'Person', 'Register', 'Bill number', 'Paid period', 'Amount', 'Method', 'Reference', 'Paid by'],
      ...filteredTransactionHistory.map((transaction) => [
        displayDate(transaction.paidAt.slice(0, 10)),
        transaction.personName,
        transactionRegisterLabel(transaction),
        transaction.billNumber,
        `${displayDate(transaction.fromDate)} to ${displayDate(transaction.toDate)}`,
        transaction.amount.toFixed(2),
        transaction.paymentMethod,
        transaction.paymentReference ?? '',
        transaction.paidBy ?? '',
      ]),
    ];
    downloadCsv(rows, `payment-transactions-${transactionPaidOn || 'all-dates'}.csv`);
  };

  const openBill = async (transactionId: string) => {
    const transaction = transactionHistory.find((item) => item.id === transactionId)
      ?? transactions.find((item) => item.id === transactionId);
    if (!transaction) return;
    setError('');
    setBillDetailsOverride(null);
    try {
      const billReport = await fetchHrReport(transaction.fromDate, transaction.toDate, transaction.sourceScope);
      setBillDetailsOverride(billReport.details.filter((row) =>
        row.paymentAllocations.some((allocation) => allocation.transactionId === transaction.id),
      ));
      setBillTransactionId(transaction.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The payment bill could not be opened');
    }
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
        description="Attendance, payroll and payment history in one workspace. All HR details load by default."
        action={(
          <div className="flex flex-wrap gap-2 print:hidden">
            <button onClick={() => view === 'transactions' ? void refreshTransactionHistory() : void load()} disabled={view === 'transactions' ? transactionLoading : loading} className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-semibold hover:bg-muted disabled:opacity-50">
              <RefreshCw size={15} className={(view === 'transactions' ? transactionLoading : loading) ? 'animate-spin' : ''} /> Refresh
            </button>
            <button onClick={view === 'transactions' ? exportTransactions : exportCsv} disabled={view === 'transactions' ? transactionLoading || !filteredTransactionHistory.length : loading || !summaries.length} className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-semibold hover:bg-muted disabled:opacity-50">
              <Download size={15} /> Export {view === 'transactions' ? 'transactions' : 'summary'}
            </button>
          </div>
        )}
      />

      <section className="mb-5 rounded-xl border border-border bg-card p-5 shadow-sm print:hidden">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1.1fr_1.1fr_1fr_auto] lg:items-end">
          <label>
            <span className="mb-1.5 block text-xs font-semibold">From date</span>
            <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className={inputClass} aria-label="Filter HR report from date" />
          </label>
          <label>
            <span className="mb-1.5 block text-xs font-semibold">To date</span>
            <input type="date" value={to} onChange={(event) => setTo(event.target.value)} className={inputClass} aria-label="Filter HR report to date" />
          </label>
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
          <button onClick={() => {
            if (from && to && from > to) {
              setError('The from date must be on or before the to date.');
              return;
            }
            void load(from, to, source, search);
          }} disabled={loading} className="flex h-[42px] items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">
            {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Apply
          </button>
        </div>
        {error && <div className="mt-4 flex items-center gap-2 text-sm text-destructive"><AlertTriangle size={15} /> {error}</div>}
        {notice && <div className="mt-4 flex items-center gap-2 text-sm text-emerald-700"><CheckCircle2 size={15} /> {notice}</div>}
      </section>

      <nav className="mb-5 flex flex-wrap gap-2 border-b border-border pb-3 print:hidden" aria-label="HR sections">
        <TabButton active={view === 'overview'} icon={LayoutDashboard} onClick={() => setView('overview')}>Overview</TabButton>
        <TabButton active={view === 'payments'} icon={WalletCards} onClick={() => setView('payments')}>Payment queue <Count>{totals.openPeople}</Count></TabButton>
        <TabButton active={view === 'transactions'} icon={ReceiptText} onClick={() => setView('transactions')}>Payment transactions</TabButton>
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
          transactions={selectedTransactions}
          selected={selected}
          selectedPerson={selectedPerson}
          setSelectedPerson={setSelectedPerson}
           selectedEntryIds={selectedEntryIds}
           paymentTotal={paymentTotalWithRoundOff}
           roundOffAmount={roundOffAmount}
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
            onOpenBill={(transactionId) => void openBill(transactionId)}
            onCloseBill={() => { setBillTransactionId(''); setBillDetailsOverride(null); }}
           billTransaction={selectedBillTransaction}
           billDetails={billDetails}
            billSignatories={billSignatories}
          driverWages={driverWages}
          driverPaymentName={driverPaymentName}
          setDriverPaymentName={setDriverPaymentName}
          driverPaymentDays={driverPaymentDays}
          setDriverPaymentDays={setDriverPaymentDays}
          driverPaymentMethod={driverPaymentMethod}
          setDriverPaymentMethod={setDriverPaymentMethod}
          driverPaymentReference={driverPaymentReference}
          setDriverPaymentReference={setDriverPaymentReference}
          driverPaymentNote={driverPaymentNote}
          setDriverPaymentNote={setDriverPaymentNote}
          onRecordDriverPayment={() => void recordDriverDayPayment()}
          loading={loading}
        />
      )}
      {view === 'transactions' && (
        <PaymentTransactionsView
          transactions={filteredTransactionHistory}
          loading={transactionLoading}
          query={transactionQuery}
          onQueryChange={setTransactionQuery}
          paidOn={transactionPaidOn}
          onPaidOnChange={setTransactionPaidOn}
          source={transactionSource}
          onSourceChange={(nextSource) => { setTransactionSource(nextSource); void refreshTransactionHistory(transactionPaidOn, nextSource); }}
          onApply={() => void refreshTransactionHistory()}
          onToday={() => { const nextDate = today(); setTransactionPaidOn(nextDate); void refreshTransactionHistory(nextDate); }}
          onAllDates={() => { setTransactionPaidOn(''); void refreshTransactionHistory('', transactionSource); }}
          onOpenBill={(transactionId) => void openBill(transactionId)}
          billTransaction={selectedBillTransaction}
          billDetails={billDetails}
          billSignatories={billSignatories}
          onCloseBill={() => { setBillTransactionId(''); setBillDetailsOverride(null); }}
        />
      )}
    </div>
  );
}

function Overview({ report, summaries, totals, loading, onOpenPayments, onSelectPerson }: {
  report: HrReport | null;
  summaries: HrSummary[];
  totals: { people: number; payable: number; paid: number; outstanding: number; openPeople: number; paidPeople: number; attendanceEntries: number };
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

function PaymentsView({ report, summaries, details, transactions, selected, selectedPerson, setSelectedPerson, selectedEntryIds, paymentTotal, roundOffAmount, onTogglePaymentEntry, paymentMethod, setPaymentMethod, paymentReference, setPaymentReference, paymentNote, setPaymentNote, saving, editable, onRecordPayment, onPrint, onOpenBill, onCloseBill, billTransaction, billDetails, billSignatories, driverWages, driverPaymentName, setDriverPaymentName, driverPaymentDays, setDriverPaymentDays, driverPaymentMethod, setDriverPaymentMethod, driverPaymentReference, setDriverPaymentReference, driverPaymentNote, setDriverPaymentNote, onRecordDriverPayment, loading }: {
  report: HrReport | null;
  summaries: HrSummary[];
  details: HrReport['details'];
  transactions: PaymentTransaction[];
  selected: HrSummary | null;
  selectedPerson: string;
  setSelectedPerson: (value: string) => void;
  selectedEntryIds: string[];
  paymentTotal: number;
  roundOffAmount: number;
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
  billSignatories: BillSignatories;
  driverWages: DriverWageOption[];
  driverPaymentName: string;
  setDriverPaymentName: (value: string) => void;
  driverPaymentDays: string;
  setDriverPaymentDays: (value: string) => void;
  driverPaymentMethod: string;
  setDriverPaymentMethod: (value: string) => void;
  driverPaymentReference: string;
  setDriverPaymentReference: (value: string) => void;
  driverPaymentNote: string;
  setDriverPaymentNote: (value: string) => void;
  onRecordDriverPayment: () => void;
  loading: boolean;
}) {
  const unpaid = summaries.filter((row) => row.outstandingAmount > 0);
  const driverOnly = details.length > 0 && details.every((row) => row.source === 'driver-attendance');
  const selectedDriverWage = driverWages.find((driver) => driver.name === driverPaymentName)?.wagePerDay ?? 0;
  const selectedDriverDays = Number(driverPaymentDays);
  const selectedDriverAmount = selectedDriverWage > 0 && Number.isInteger(selectedDriverDays) && selectedDriverDays > 0
    ? selectedDriverDays * selectedDriverWage
    : 0;
  const selectedDriverRoundOff = roundOffToRupee(selectedDriverAmount);
  return (
    <>
      <div className={`mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5 ${selected ? 'print:hidden' : ''}`}>
        <Metric label="Workers" value={String(summaries.length)} />
        <Metric label="Open workers" value={String(unpaid.length)} tone={unpaid.length ? 'warning' : 'success'} />
        <Metric label="Total payable" value={amount(summaries.reduce((sum, row) => sum + row.totalAmount, 0))} />
        <Metric label="Paid" value={amount(summaries.reduce((sum, row) => sum + row.paidAmount, 0))} tone="success" />
        <Metric label="Outstanding" value={amount(unpaid.reduce((sum, row) => sum + row.outstandingAmount, 0))} tone="warning" />
      </div>
      {!selected && editable && (
        <section className="mb-6 rounded-xl border border-primary/20 bg-primary/5 p-5 shadow-sm print:hidden">
          <div className="mb-4">
            <h2 className="font-serif text-lg font-bold">Driver attendance day payment</h2>
            <p className="mt-1 text-xs text-muted-foreground">Create a new wage-only payment entry for a driver. The amount uses only the driver master wage and the number of days entered; DA, NA, overtime, and attendance rows are not included.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-[1.5fr_.75fr_1fr_1fr_1fr]">
            <label>
              <span className="mb-1.5 block text-xs font-semibold">Driver</span>
              <select value={driverPaymentName} onChange={(event) => setDriverPaymentName(event.target.value)} className={inputClass}>
                <option value="">Select driver…</option>
                {driverWages.map((driver) => <option key={driver.name} value={driver.name}>{driver.name} · {amount(driver.wagePerDay)}/day</option>)}
              </select>
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-semibold">No. of days</span>
              <input type="number" min={1} max={366} step={1} value={driverPaymentDays} onChange={(event) => setDriverPaymentDays(event.target.value)} placeholder="e.g. 5" className={inputClass} />
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-semibold">Wage amount</span>
              <input value={selectedDriverAmount ? amount(selectedDriverAmount) : 'Select driver and days'} readOnly className={`${inputClass} bg-muted/50 font-mono font-semibold`} />
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-semibold">Payment method</span>
              <select value={driverPaymentMethod} onChange={(event) => setDriverPaymentMethod(event.target.value)} className={inputClass}>{paymentMethods.map((method) => <option key={method}>{method}</option>)}</select>
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-semibold">Reference / UTR {driverPaymentMethod !== 'Cash' && driverPaymentMethod !== 'Other' ? '(required)' : '(optional)'}</span>
              <input value={driverPaymentReference} onChange={(event) => setDriverPaymentReference(event.target.value)} placeholder={driverPaymentMethod === 'Cash' || driverPaymentMethod === 'Other' ? 'Optional' : 'Enter reference'} className={inputClass} />
            </label>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-muted-foreground">
              {selectedDriverAmount
                ? `${formatDays(selectedDriverDays)} days × ${amount(selectedDriverWage)} wage/day = ${amount(selectedDriverAmount)}${selectedDriverRoundOff ? ` · +${amount(selectedDriverRoundOff)} round off` : ''}`
                : 'Choose a driver and enter the number of days.'}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <input value={driverPaymentNote} onChange={(event) => setDriverPaymentNote(event.target.value)} placeholder="Optional note" className={`${inputClass} w-48`} />
              <button onClick={onRecordDriverPayment} disabled={saving || !selectedDriverAmount} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
                {saving ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />} {saving ? 'Saving…' : 'Record driver payment'}
              </button>
            </div>
          </div>
        </section>
      )}
      {!selected && (
        <section className="mb-6 overflow-hidden rounded-xl border border-border bg-card shadow-sm print:hidden">
          <div className="border-b border-border px-5 py-4"><h2 className="font-serif text-lg font-bold">Payment queue</h2><p className="text-xs text-muted-foreground">{unpaid.length} person(s) have an amount left to pay.</p></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="border-b border-border bg-muted/45"><tr>{['Person', 'Worked days', 'Total payable', 'Paid', 'Amount left', 'Status', 'Action'].map((label) => <th key={label} className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</th>)}</tr></thead><tbody className="divide-y divide-border">{unpaid.map((row) => <tr key={row.name} className="hover:bg-muted/30"><td className="px-4 py-3 font-semibold">{row.name}</td><td className="px-4 py-3">{formatDays(row.workedDays)}</td><td className="px-4 py-3 font-mono">{amount(row.totalAmount)}</td><td className="px-4 py-3 font-mono text-emerald-700">{amount(row.paidAmount)}</td><td className="px-4 py-3 font-mono font-bold text-amber-700">{amount(row.outstandingAmount)}</td><td className="px-4 py-3"><StatusBadge status={row.paymentStatus} /></td><td className="px-4 py-3"><button onClick={() => setSelectedPerson(row.name)} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted">Open worker</button></td></tr>)}</tbody></table></div>{!loading && !unpaid.length && <EmptyTable text="No unpaid people match this period and filter." />}</section>
      )}
      {selected && report && (
        <section data-print-statement className="mb-6 rounded-xl border-2 border-foreground/15 bg-card p-6 shadow-sm md:p-8 print:mb-0 print:border-0 print:p-0 print:shadow-none">
           <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5"><div><button onClick={() => setSelectedPerson('')} className="mb-3 text-xs font-semibold text-primary hover:underline print:hidden">← Back to payment queue</button><div className="font-mono text-[10px] uppercase tracking-[.18em] text-primary">Worker payment statement</div><h2 className="mt-2 font-serif text-3xl font-bold">{selected.name}</h2><p className="mt-1 text-sm text-muted-foreground">{displayDate(report.from)} to {displayDate(report.to)} · {sourceLabel(report.sourceScope)}</p></div><div className="text-right"><StatusBadge status={selected.paymentStatus} /><div className="mt-2 text-xs text-muted-foreground">Amount left</div><div className="font-mono text-2xl font-bold text-amber-700">{amount(selected.outstandingAmount)}</div></div></div>
           <div data-print-screen className="mt-6 grid gap-3 sm:grid-cols-4"><Metric label="Worked days" value={formatDays(selected.workedDays)} /><Metric label="Total payable" value={amount(selected.totalAmount)} /><Metric label="Paid" value={amount(selected.paidAmount)} tone="success" /><Metric label="Balance left" value={amount(selected.outstandingAmount)} tone="warning" /></div>
              <div data-print-screen className="mt-6 divide-y divide-border">{driverOnly ? <BillLine label="DA / NA" detail="Driver day and night allowances" value={amount(selected.wageAmount)} /> : <><BillLine label="Base wages" detail={`${formatDays(selected.workedDays)} days × ${amount(selected.wagePerDay)}`} value={amount(selected.wageAmount)} /><BillLine label="SPL" detail={`${formatMinutes(selected.overtimeMinutes)} at ${amount(selected.overtimeRate)}/hour`} value={amount(selected.overtimeAmount)} /></>}<BillLine label="Exact total payable" detail={driverOnly ? 'Driver allowances' : 'Base wages + SPL, with no rounding adjustment'} value={amount(selected.totalAmount)} /></div>
             {editable && selected.outstandingAmount > 0 && <div data-payment-form className="mt-5 rounded-xl border border-primary/20 bg-primary/5 p-5"><div className="mb-4"><h3 className="font-serif text-lg font-bold">Record a payment</h3><p className="text-xs text-muted-foreground">Select the exact attendance reference this payment covers. The attendance amount is calculated automatically and rounded to the next whole rupee.</p></div><div className="grid gap-4 md:grid-cols-5"><label><span className="mb-1.5 block text-xs font-semibold">Payment total</span><input value={paymentTotal ? amount(paymentTotal) : 'Select a reference'} readOnly className={`${inputClass} bg-muted/50 font-mono font-semibold`} /></label><div className="flex min-h-[68px] flex-col justify-center rounded-lg border border-input bg-background px-3 py-2.5"><span className="text-xs font-semibold">Round off amount</span><span className={`font-mono text-sm font-bold ${roundOffAmount ? 'text-primary' : 'text-muted-foreground'}`}>{roundOffAmount ? `+${amount(roundOffAmount)}` : '₹0.00'}</span><span className="text-[10px] text-muted-foreground">{roundOffAmount ? 'Automatically added from paise' : 'No paise to round'}</span></div><label><span className="mb-1.5 block text-xs font-semibold">Payment method</span><select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} className={inputClass}>{paymentMethods.map((method) => <option key={method}>{method}</option>)}</select></label><label><span className="mb-1.5 block text-xs font-semibold">Reference / UTR {paymentMethod !== 'Cash' && paymentMethod !== 'Other' ? '(required)' : '(optional)'}</span><input value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} placeholder={paymentMethod === 'Cash' || paymentMethod === 'Other' ? 'Optional' : 'Enter reference'} className={inputClass} /></label><label><span className="mb-1.5 block text-xs font-semibold">Note</span><input value={paymentNote} onChange={(event) => setPaymentNote(event.target.value)} placeholder="Optional" className={inputClass} /></label></div><div className="mt-3 text-xs text-muted-foreground">{selectedEntryIds.length ? `Selected attendance reference${selectedEntryIds.length === 1 ? '' : 's'}: ${details.filter((row) => selectedEntryIds.includes(row.id)).map((row) => `${row.referenceNo} (${displayDate(row.displayDate || row.date)})`).join(', ')}` : 'No attendance reference selected. Choose the row for the exact payment date below.'}</div><div className="mt-4 flex flex-wrap items-center gap-3"><button onClick={onRecordPayment} disabled={saving || !paymentTotal} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">{saving ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />} {saving ? 'Saving…' : 'Record payment'}</button><button onClick={onPrint} className="flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-semibold hover:bg-muted disabled:opacity-50"><Printer size={15} /> Print statement</button></div></div>}
            <div data-print-screen className="mt-7 grid gap-7 lg:grid-cols-[1.35fr_.65fr]">
              <div>
                <div className="mb-3 flex items-start justify-between gap-3">
                    <div><h3 className="font-serif text-lg font-bold">Attendance for this payment</h3><p className="text-xs text-muted-foreground">Each row has one reference number. Select only the row(s) that this payment is for; rows are never selected automatically.</p></div>
                  <span className="print:hidden text-xs text-muted-foreground">{details.filter((row) => row.paymentIncluded && row.paymentStatus !== 'paid').length} open · {details.filter((row) => !row.paymentIncluded).length} excluded</span>
                </div>
                  <DetailTable details={details} selectedEntryIds={selectedEntryIds} onTogglePaymentEntry={onTogglePaymentEntry} canEditRecords={editable} />
              </div>
              <div>
                <div className="mb-3 flex items-center justify-between gap-3"><h3 className="font-serif text-lg font-bold">Payment history</h3><span className="text-[10px] uppercase tracking-wider text-muted-foreground">{transactions.length} reference{transactions.length === 1 ? '' : 's'}</span></div>
                {transactions.length ? <div className="max-h-56 space-y-2 overflow-y-auto pr-1">{transactions.map((transaction) => <div key={transaction.id} className="rounded-lg border border-border bg-muted/20 p-2.5 text-xs shadow-sm"><div className="flex items-start justify-between gap-2"><span className="font-semibold">{amount(transaction.amount)} · {transaction.paymentMethod}</span><span className="shrink-0 text-right text-[10px] leading-4 text-muted-foreground">Paid {displayDate(transaction.paidAt.slice(0, 10))}</span></div><div className="mt-1 truncate text-[11px] text-muted-foreground">{transaction.billNumber}{transaction.paymentReference ? ` · Ref ${transaction.paymentReference}` : ''}</div><div className="mt-1 truncate text-[10px] text-muted-foreground" title="Attendance date and reference">Work: {paymentAttendanceSummary(transaction, report?.details ?? [])}</div><div className="mt-2 flex items-center justify-between gap-2"><span className="truncate text-[11px] text-muted-foreground">{transaction.paymentNote || (transaction.paidBy ? `by ${transaction.paidBy}` : 'Payment recorded')}</span><button onClick={() => onOpenBill(transaction.id)} className="shrink-0 rounded-md border border-primary/30 px-2 py-1 text-[10px] font-semibold text-primary hover:bg-primary/10">Open bill</button></div></div>)}</div> : <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">No payment has been recorded for this period.</div>}
              </div>
            </div>
             <div data-print-bill className="hidden">
             <div className="border-b border-black pb-2">
               <h1 className="text-center text-xl font-bold">PAYMENT BILL</h1>
                <p className="text-center text-xs">{sourceLabel(report.sourceScope)}</p>
             </div>
              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <div><strong>Name:</strong> {selected.name}</div>
                <div><strong>Work location:</strong> {selected.workLocation || '—'}</div>
                <div><strong>Supervisor:</strong> {selected.supervisor || '—'}</div>
                <div><strong>Bill:</strong> {selected.billNumber || '—'}</div>
                <div><strong>Attendance period:</strong> {displayDate(report.from)} to {displayDate(report.to)}</div>
                <div><strong>Payment date:</strong> {selected.paidAt ? displayDate(selected.paidAt.slice(0, 10)) : '—'}</div>
             </div>
             <table className="mt-4 w-full border border-black text-xs">
               <tbody>
                 <tr><td className="border-b border-black px-2 py-1.5">Worked days</td><td className="border-b border-black px-2 py-1.5 text-right">{formatDays(selected.workedDays)}</td></tr>
                 <tr><td className="border-b border-black px-2 py-1.5">Base wages</td><td className="border-b border-black px-2 py-1.5 text-right">{amount(selected.wageAmount)}</td></tr>
                  <tr><td className="border-b border-black px-2 py-1.5">SPL amount</td><td className="border-b border-black px-2 py-1.5 text-right">{amount(selected.overtimeAmount)}</td></tr>
                 <tr><td className="border-b border-black px-2 py-1.5 font-bold">Total bill</td><td className="border-b border-black px-2 py-1.5 text-right font-bold">{amount(selected.totalAmount)}</td></tr>
                 <tr><td className="border-b border-black px-2 py-1.5">Paid</td><td className="border-b border-black px-2 py-1.5 text-right">{amount(selected.paidAmount)}</td></tr>
                 <tr><td className="px-2 py-1.5 font-bold">Balance</td><td className="px-2 py-1.5 text-right font-bold">{amount(selected.outstandingAmount)}</td></tr>
               </tbody>
             </table>
              <div className="mt-10 grid grid-cols-4 gap-3 text-center text-[10px]">
                <SignatureCell label="Prepared by" name={billSignatories.preparedBy} nameAboveLine />
                <SignatureCell label="Checked by" name={billSignatories.checkedBy} nameAboveLine />
                <SignatureCell label="Verified by" name={billSignatories.verifiedBy} nameAboveLine />
                <SignatureCell name={selected.name} />
             </div>
           </div>
             {billTransaction && <BillDialog transaction={billTransaction} details={billDetails} billSignatories={billSignatories} onClose={onCloseBill} />}
        </section>
      )}
    </>
  );
}

function PaymentTransactionsView({ transactions, loading, query, onQueryChange, paidOn, onPaidOnChange, source, onSourceChange, onApply, onToday, onAllDates, onOpenBill, billTransaction, billDetails, billSignatories, onCloseBill }: {
  transactions: PaymentTransaction[];
  loading: boolean;
  query: string;
  onQueryChange: (value: string) => void;
  paidOn: string;
  onPaidOnChange: (value: string) => void;
  source: string;
  onSourceChange: (value: string) => void;
  onApply: () => void;
  onToday: () => void;
  onAllDates: () => void;
  onOpenBill: (transactionId: string) => void;
  billTransaction: PaymentTransaction | null;
  billDetails: HrReport['details'];
  billSignatories: BillSignatories;
  onCloseBill: () => void;
}) {
  return (
    <>
      <section className="mb-5 rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><ReceiptText size={20} /></div>
            <div>
              <h2 className="font-serif text-xl font-bold">Payment transactions</h2>
              <p className="mt-1 text-xs text-muted-foreground">Search every completed payment, open its bill, or print a payment history receipt.</p>
            </div>
          </div>
          <div className="rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">{transactions.length} result{transactions.length === 1 ? '' : 's'}</div>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-[1.5fr_1fr_1fr_auto] md:items-end">
          <label>
            <span className="mb-1.5 block text-xs font-semibold">Search payments</span>
            <span className="relative block">
              <Search size={15} className="pointer-events-none absolute left-3 top-3 text-muted-foreground" />
              <input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Person, bill, UTR, method, or payer" className={`${inputClass} pl-9`} aria-label="Search payment transactions" />
            </span>
          </label>
          <label>
            <span className="mb-1.5 block text-xs font-semibold">Paid on</span>
            <input type="date" value={paidOn} onChange={(event) => onPaidOnChange(event.target.value)} className={inputClass} aria-label="Filter payments by date" />
          </label>
          <label>
            <span className="mb-1.5 block text-xs font-semibold">Register</span>
            <select value={source} onChange={(event) => onSourceChange(event.target.value)} className={inputClass}>
              <option value="all">All registers</option>
              <option value="driver-attendance">Driver Attendance</option>
              <option value="daily-attendance">Training Register</option>
              <option value="chowk-labour">Chowk Labour</option>
            </select>
          </label>
          <button onClick={onApply} disabled={loading} className="flex h-[42px] items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">
            {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Apply
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button onClick={onToday} disabled={loading} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${paidOn ? 'bg-primary text-primary-foreground' : 'border border-border hover:bg-muted'}`}>Today</button>
          <button onClick={onAllDates} disabled={loading} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${!paidOn ? 'bg-primary text-primary-foreground' : 'border border-border hover:bg-muted'}`}>All dates</button>
          <span className="text-[11px] text-muted-foreground">Search updates as you type. Date and register filters load from the payment history.</span>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="max-h-[34rem] overflow-auto">
          <table className="w-full min-w-[1180px] text-left text-sm">
            <thead className="sticky top-0 z-10 border-b border-border bg-muted/95">
              <tr>{['Paid on', 'Person', 'Bill number', 'Paid period', 'Register', 'Amount', 'Method', 'Reference / UTR', 'Paid by', 'Action'].map((label) => <th key={label} className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-border">
              {transactions.map((transaction) => (
                <tr key={transaction.id} className="hover:bg-muted/30">
                  <td className="whitespace-nowrap px-4 py-3">{displayDate(transaction.paidAt.slice(0, 10))}</td>
                  <td className="px-4 py-3 font-semibold">{transaction.personName}</td>
                  <td className="px-4 py-3 font-mono text-xs">{transaction.billNumber}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs">{displayDate(transaction.fromDate)} – {displayDate(transaction.toDate)}</td>
                  <td className="px-4 py-3">{transactionRegisterLabel(transaction)}</td>
                  <td className="px-4 py-3 font-mono font-bold text-emerald-700">{amount(transaction.amount)}</td>
                  <td className="px-4 py-3">{transaction.paymentMethod}</td>
                  <td className="px-4 py-3 text-xs">{transaction.paymentReference || '—'}</td>
                  <td className="px-4 py-3 text-xs">{transaction.paidBy || '—'}</td>
                  <td className="px-4 py-3"><button onClick={() => onOpenBill(transaction.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10"><ReceiptText size={14} /> Open bill</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && !transactions.length && <EmptyTable text={query ? 'No payment transactions match this search.' : paidOn ? 'No payments were recorded on this date.' : 'No payment transactions have been recorded yet.'} />}
        </div>
      </section>
      {billTransaction && <BillDialog transaction={billTransaction} details={billDetails} billSignatories={billSignatories} onClose={onCloseBill} />}
    </>
  );
}

function BillDialog({ transaction, details, billSignatories, onClose }: {
  transaction: PaymentTransaction;
  details: HrReport['details'];
  billSignatories: BillSignatories;
  onClose: () => void;
}) {
  const billTotal = details.reduce((sum, row) => sum + billAmounts(row, transaction.id).total, 0);
  const roundingAmount = transaction.roundingAmount ?? 0;
  const driverBill = isDriverBill(details);
  const firstDetail = details[0];
  const workLocation = firstDetail?.workLocation || '—';
  const supervisor = firstDetail?.supervisor || '—';
  return <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/35 p-2 sm:p-4" role="dialog" aria-modal="true" aria-label={`Bill ${transaction.billNumber}`}>
    <div className="max-h-[calc(100dvh-1rem)] w-full max-w-4xl overflow-y-auto rounded-xl border border-border bg-card shadow-2xl sm:max-h-[90dvh] sm:rounded-2xl">
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-4 sm:gap-4 sm:px-6 sm:py-5">
        <div className="min-w-0"><div className="font-mono text-[10px] uppercase tracking-[.16em] text-primary">Payment bill</div><h2 className="mt-1 truncate font-serif text-xl font-bold sm:text-2xl">{transaction.personName}</h2><p className="mt-1 break-words text-xs text-muted-foreground">{displayDate(transaction.fromDate)} to {displayDate(transaction.toDate)} · {transaction.billNumber}</p></div>
        <button onClick={onClose} className="rounded-md px-2 py-1 text-sm font-semibold text-muted-foreground hover:bg-muted" aria-label="Close bill">Close</button>
      </div>
      <div className="p-4 sm:p-6">
        <div className="grid gap-2 border-b border-border pb-4 text-xs sm:grid-cols-2">
          <div><strong>Name:</strong> {transaction.personName}</div>
          <div><strong>Work location:</strong> {workLocation}</div>
          <div><strong>Supervisor:</strong> {supervisor}</div>
          <div><strong>Bill:</strong> {transaction.billNumber}</div>
          <div><strong>Attendance period:</strong> {displayDate(transaction.fromDate)} to {displayDate(transaction.toDate)}</div>
          <div><strong>Payment date:</strong> {displayDate(transaction.paidAt.slice(0, 10))}</div>
        </div>
        {transaction.driverDays && transaction.wagePerDay ? <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm">
          <div className="font-semibold">Driver wage payment</div>
          <div className="mt-1 text-xs text-muted-foreground">{formatDays(transaction.driverDays)} days × {amount(transaction.wagePerDay)} wages per day. This payment is based only on the driver wage.</div>
        </div> : details.length ? <>
           <div className="hidden overflow-x-auto rounded-lg border border-border sm:block"><BillTable details={details} transactionId={transaction.id} driverBill={driverBill} /></div>
           <div className="space-y-3 sm:hidden">{details.map((row) => { const line = billAmounts(row, transaction.id); return <div key={row.id} className="rounded-lg border border-border bg-background/40 p-3"><div className="flex items-start justify-between gap-3"><div><div className="text-xs font-semibold">{displayDate(row.displayDate || row.date)}</div><div className="mt-1 text-[11px] text-muted-foreground">{sourceLabel(row.source)}</div></div><div className="font-mono text-sm font-bold">{amount(line.total)}</div></div><div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-border pt-3 text-xs"><div><span className="text-muted-foreground">Days</span><div className="mt-0.5 font-semibold">{formatDays(row.workedDays)}</div></div>{driverBill ? <><div><span className="text-muted-foreground">DA</span><div className="mt-0.5 font-mono">{row.da || '—'}</div></div><div><span className="text-muted-foreground">NA</span><div className="mt-0.5 font-mono">{row.na || '—'}</div></div><div><span className="text-muted-foreground">DA amount</span><div className="mt-0.5 font-mono">{amount(line.daAmount)}</div></div><div><span className="text-muted-foreground">NA amount</span><div className="mt-0.5 font-mono">{amount(line.naAmount)}</div></div></> : <><div><span className="text-muted-foreground">SPL</span><div className="mt-0.5 font-mono">{formatMinutes(line.overtimeMinutes)}</div></div><div><span className="text-muted-foreground">SPL amount</span><div className="mt-0.5 font-mono">{amount(line.overtime)}</div></div></>}</div></div>; })}</div>
        </> : <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No attendance rows are linked to this payment in the selected date range.</div>}
           <div className="mt-5 flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:items-end sm:justify-between"><div className="space-y-1 text-xs text-muted-foreground"><div>Bill total</div>{roundingAmount > 0 && <div>Round off <span className="font-mono text-foreground">+{amount(roundingAmount)}</span></div>}<div className="font-semibold text-foreground">Total paid</div></div><div className="shrink-0 space-y-1 sm:text-right"><div className="font-mono text-lg text-muted-foreground">{amount(Math.max(transaction.amount - roundingAmount, 0))}</div>{roundingAmount > 0 && <div className="font-mono text-sm text-primary">+ {amount(roundingAmount)}</div>}<div className="font-mono text-xl font-bold">{amount(transaction.amount)}</div>{details.length && Math.abs(billTotal + roundingAmount - transaction.amount) > 0.005 ? <div className="mt-1 text-[10px] text-amber-700">Linked attendance total: {amount(billTotal)}</div> : null}</div></div>
         <div className="mt-8 grid grid-cols-4 gap-3 text-center text-[10px]"><SignatureCell label="Prepared by" name={billSignatories.preparedBy} nameAboveLine /><SignatureCell label="Checked by" name={billSignatories.checkedBy} nameAboveLine /><SignatureCell label="Verified by" name={billSignatories.verifiedBy} nameAboveLine /><SignatureCell name={transaction.personName} /></div>
         <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end"><button onClick={() => downloadBill(transaction, details, billSignatories)} className="flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-muted"><Download size={14} /> Download bill</button><button onClick={() => printBill(transaction, details, billSignatories)} className="flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90"><Printer size={14} /> Print bill</button></div>
      </div>
    </div>
  </div>;
}

function isDriverBill(details: HrReport['details']) {
  return details.length > 0 && details.every((row) => row.source === 'driver-attendance');
}

function BillTable({ details, transactionId, driverBill }: {
  details: HrReport['details'];
  transactionId: string;
  driverBill: boolean;
}) {
  const headers = driverBill
    ? ['Date', 'Register', 'Days', 'DA', 'NA', 'DA amount', 'NA amount', 'Total amount']
    : ['Date', 'Register', 'Days', 'Wage amount', 'SPL', 'SPL amount', 'Total amount'];
  return <table className="w-full min-w-[760px] text-left text-xs"><thead className="border-b border-border bg-muted/45"><tr>{headers.map((label) => <th key={label} className="whitespace-nowrap px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</th>)}</tr></thead><tbody className="divide-y divide-border">{details.map((row) => { const line = billAmounts(row, transactionId); return <tr key={row.id}><td className="whitespace-nowrap px-3 py-2">{displayDate(row.displayDate || row.date)}</td><td className="px-3 py-2">{sourceLabel(row.source)}</td><td className="px-3 py-2">{formatDays(row.workedDays)}</td>{driverBill ? <><td className="px-3 py-2 font-mono">{row.da || '—'}</td><td className="px-3 py-2 font-mono">{row.na || '—'}</td><td className="px-3 py-2 font-mono">{amount(line.daAmount)}</td><td className="px-3 py-2 font-mono">{amount(line.naAmount)}</td></> : <><td className="px-3 py-2 font-mono">{amount(line.base)}</td><td className="px-3 py-2 font-mono">{formatMinutes(line.overtimeMinutes)}</td><td className="px-3 py-2 font-mono">{amount(line.overtime)}</td></>}<td className="px-3 py-2 font-mono font-semibold">{amount(line.total)}</td></tr>; })}</tbody></table>;
}

function billAmounts(row: HrReport['details'][number], transactionId: string) {
  const allocation = row.paymentAllocations.find((item) => item.transactionId === transactionId)?.amount ?? row.totalAmount;
  if (row.totalAmount <= 0 || allocation >= row.totalAmount - 0.005) {
    return { base: row.baseAmount, overtime: row.overtimeAmount, overtimeMinutes: row.overtimeMinutes, total: row.totalAmount, daAmount: row.daAmount, naAmount: row.naAmount };
  }
  const ratio = allocation / row.totalAmount;
  return {
    base: row.baseAmount * ratio,
    overtime: row.overtimeAmount * ratio,
    overtimeMinutes: row.overtimeMinutes * ratio,
    total: allocation,
    daAmount: row.daAmount * ratio,
    naAmount: row.naAmount * ratio,
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

function buildBillHtml(transaction: PaymentTransaction, details: HrReport['details'], billSignatories: BillSignatories) {
  const driverBill = isDriverBill(details);
  const firstDetail = details[0];
  const workLocation = firstDetail?.workLocation || '—';
  const supervisor = firstDetail?.supervisor || '—';
  const rows = details.map((row) => {
    const line = billAmounts(row, transaction.id);
    return driverBill
      ? `<tr><td>${escapeHtml(displayDate(row.displayDate || row.date))}</td><td>${escapeHtml(sourceLabel(row.source))}</td><td>${escapeHtml(formatDays(row.workedDays))}</td><td>${escapeHtml(row.da || '—')}</td><td>${escapeHtml(row.na || '—')}</td><td>${escapeHtml(amount(line.daAmount))}</td><td>${escapeHtml(amount(line.naAmount))}</td><td><strong>${escapeHtml(amount(line.total))}</strong></td></tr>`
      : `<tr><td>${escapeHtml(displayDate(row.displayDate || row.date))}</td><td>${escapeHtml(sourceLabel(row.source))}</td><td>${escapeHtml(formatDays(row.workedDays))}</td><td>${escapeHtml(amount(line.base))}</td><td>${escapeHtml(formatMinutes(line.overtimeMinutes))}</td><td>${escapeHtml(amount(line.overtime))}</td><td><strong>${escapeHtml(amount(line.total))}</strong></td></tr>`;
  }).join('');
  const headers = driverBill
    ? '<th>Date</th><th>Register</th><th>Days</th><th>DA</th><th>NA</th><th>DA amount</th><th>NA amount</th><th>Total amount</th>'
    : '<th>Date</th><th>Register</th><th>Days</th><th>Wage amount</th><th>SPL</th><th>SPL amount</th><th>Total amount</th>';
  const signatures = [
    `<div class="signature signature-name-above"><span>${escapeHtml(billSignatories.preparedBy || '')}</span><div class="signature-line"></div><strong>Prepared by</strong></div>`,
    `<div class="signature signature-name-above"><span>${escapeHtml(billSignatories.checkedBy || '')}</span><div class="signature-line"></div><strong>Checked by</strong></div>`,
    `<div class="signature signature-name-above"><span>${escapeHtml(billSignatories.verifiedBy || '')}</span><div class="signature-line"></div><strong>Verified by</strong></div>`,
    `<div class="signature"><div class="signature-line"></div><span>${escapeHtml(transaction.personName || '')}</span></div>`,
  ].join('');
  const roundingAmount = transaction.roundingAmount ?? 0;
  const billTotal = transaction.amount - roundingAmount;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(transaction.billNumber)}</title><style>body{font-family:Arial,sans-serif;color:#111;margin:32px}h1{margin:0 0 4px;font-size:22px}.meta{display:grid;grid-template-columns:1fr 1fr;gap:7px;font-size:12px;margin-top:18px}table{border-collapse:collapse;width:100%;margin-top:24px;font-size:12px}th,td{border:1px solid #bbb;padding:8px;text-align:left}th{background:#f1f1f1;text-transform:uppercase;font-size:10px}td:nth-child(n+3){text-align:right}.summary{margin-top:20px;margin-left:auto;width:260px}.summary div{display:flex;justify-content:space-between;border-bottom:1px solid #ddd;padding:7px 0;font-size:13px}.summary strong{font-size:16px}.signatures{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-top:64px;text-align:center;font-size:10px}.signature{display:flex;flex-direction:column;gap:4px;min-height:30px}.signature-name-above{justify-content:flex-end}.signature-line{border-top:1px solid #111;margin:0 0 2px}.signature-name-above span{font-size:12px;font-weight:700}.signature strong{font-weight:400}</style></head><body><h1>Payment bill</h1><div class="meta"><div><strong>Name:</strong> ${escapeHtml(transaction.personName)}</div><div><strong>Work location:</strong> ${escapeHtml(workLocation)}</div><div><strong>Supervisor:</strong> ${escapeHtml(supervisor)}</div><div><strong>Bill:</strong> ${escapeHtml(transaction.billNumber)}</div><div><strong>Attendance period:</strong> ${escapeHtml(displayDate(transaction.fromDate))} to ${escapeHtml(displayDate(transaction.toDate))}</div><div><strong>Payment date:</strong> ${escapeHtml(displayDate(transaction.paidAt.slice(0, 10)))}</div></div><table><thead><tr>${headers}</tr></thead><tbody>${rows || `<tr><td colspan="${driverBill ? 8 : 7}">No linked attendance rows.</td></tr>`}</tbody></table><div class="summary"><div><span>Bill total</span><strong>${escapeHtml(amount(billTotal))}</strong></div>${roundingAmount > 0 ? `<div><span>Round off</span><strong>+${escapeHtml(amount(roundingAmount))}</strong></div>` : ''}<div><span>Total paid</span><strong>${escapeHtml(amount(transaction.amount))}</strong></div></div><div class="signatures">${signatures}</div></body></html>`;
}

function downloadBill(transaction: PaymentTransaction, details: HrReport['details'], billSignatories: BillSignatories) {
  const url = URL.createObjectURL(new Blob([buildBillHtml(transaction, details, billSignatories)], { type: 'text/html' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `bill-${transaction.billNumber}.html`;
  link.click();
  URL.revokeObjectURL(url);
}

function printBill(transaction: PaymentTransaction, details: HrReport['details'], billSignatories: BillSignatories) {
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
   printWindow.document.write(buildBillHtml(transaction, details, billSignatories));
  printWindow.document.close();
  window.setTimeout(print, 500);
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
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${statusClass(status)}`}>{status === 'paid' ? <CheckCircle2 size={12} /> : status === 'excluded' ? <AlertTriangle size={12} /> : <Clock3 size={12} />}{statusLabel(status)}</span>;
}

function BillLine({ label, detail, value }: { label: string; detail: string; value: string }) {
  return <div className="flex items-center justify-between gap-5 py-4"><div><div className="font-semibold">{label}</div><div className="mt-1 text-xs text-muted-foreground">{detail}</div></div><div className="font-mono text-base font-semibold">{value}</div></div>;
}

function SignatureCell({ label, name, nameAboveLine = false }: { label?: string; name: string; nameAboveLine?: boolean }) {
  return nameAboveLine
    ? <div className="flex min-h-12 flex-col justify-end gap-1"><div className="text-xs font-bold">{name || ' '}</div><div className="border-t border-black pt-1 font-normal">{label}</div></div>
    : <div className="flex min-h-12 flex-col justify-end gap-1"><div className="border-t border-black pt-1 font-normal">{name || ' '}</div></div>;
}

function DetailTable({ details, selectedEntryIds, onTogglePaymentEntry, canEditRecords }: {
  details: HrReport['details'];
  selectedEntryIds: string[];
  onTogglePaymentEntry: (recordId: string, checked: boolean) => void;
  canEditRecords: boolean;
}) {
  const visibleDetails = details.filter((row) => row.paymentStatus !== 'paid');
  const hasDriverDetails = visibleDetails.some((row) => row.source === 'driver-attendance');
  const hasOvertimeDetails = visibleDetails.some((row) => row.source !== 'driver-attendance');
  const headers = [
    'Pay',
    'Attendance reference',
    'Date',
    'Register',
    'Days',
    ...(hasDriverDetails ? ['DA', 'NA', 'DA amount', 'NA amount'] : []),
    ...(hasOvertimeDetails ? ['Hours', 'SPL', 'Wage amount', 'SPL amount'] : []),
    'Total amount',
    'Status',
    ...(canEditRecords ? ['Action'] : []),
  ];
  return <>
           <div className="hidden overflow-x-auto rounded-lg border border-border sm:block"><table className="w-full min-w-[1120px] text-left text-xs"><thead className="border-b border-border"><tr>{headers.map((label) => <th key={label} className="px-2 py-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</th>)}</tr></thead><tbody className="divide-y divide-border">{visibleDetails.map((row) => { const selectable = row.paymentIncluded && row.outstandingAmount > 0; const driver = row.source === 'driver-attendance'; const editHref = `/registers/${row.source}?edit=${encodeURIComponent(row.id)}&from=${encodeURIComponent(row.date)}&to=${encodeURIComponent(row.date)}`; return <tr key={row.id} className={row.paymentIncluded ? '' : 'bg-slate-50/70'}><td className="px-2 py-2">{selectable ? <input type="checkbox" checked={selectedEntryIds.includes(row.id)} onChange={(event) => onTogglePaymentEntry(row.id, event.target.checked)} className="size-4 accent-[hsl(var(--primary))]" aria-label={`Select attendance ${row.referenceNo}`} /> : <span className="text-muted-foreground">—</span>}</td><td className="px-2 py-2 font-mono text-[10px]">{row.referenceNo}</td><td className="px-2 py-2">{displayDate(row.displayDate || row.date)}</td><td className="px-2 py-2">{sourceLabel(row.source)}</td><td className="px-2 py-2">{formatDays(row.workedDays)}</td>{hasDriverDetails && <>{driver ? <><td className="px-2 py-2 font-mono">{row.da || '—'}</td><td className="px-2 py-2 font-mono">{row.na || '—'}</td><td className="px-2 py-2 font-mono">{amount(row.daAmount)}</td><td className="px-2 py-2 font-mono">{amount(row.naAmount)}</td></> : <><td className="px-2 py-2 text-muted-foreground">—</td><td className="px-2 py-2 text-muted-foreground">—</td><td className="px-2 py-2 text-muted-foreground">—</td><td className="px-2 py-2 text-muted-foreground">—</td></>}</>}{hasOvertimeDetails && <>{driver ? <><td className="px-2 py-2 text-muted-foreground">—</td><td className="px-2 py-2 text-muted-foreground">—</td><td className="px-2 py-2 text-muted-foreground">—</td><td className="px-2 py-2 text-muted-foreground">—</td></> : <><td className="px-2 py-2 font-mono">{formatMinutes(row.minutes)}</td><td className="px-2 py-2 font-mono text-primary">{formatMinutes(row.overtimeMinutes)}</td><td className="px-2 py-2 font-mono">{amount(row.baseAmount)}</td><td className="px-2 py-2 font-mono">{amount(row.overtimeAmount)}</td></>}</>}{<td className="px-2 py-2 font-mono font-semibold">{amount(row.totalAmount)}</td>}<td className="px-2 py-2"><StatusBadge status={row.paymentStatus} /></td>{canEditRecords && <td className="px-2 py-2"><Link href={editHref} className="inline-flex items-center gap-1.5 rounded-md border border-primary/30 px-2.5 py-1.5 font-semibold text-primary hover:bg-primary/10" aria-label={`Edit attendance ${row.referenceNo}`} data-testid={`button-edit-attendance-${row.id}`}><Edit3 size={13} /> Edit</Link></td>}</tr>; })}</tbody></table></div>
              <div className="space-y-3 sm:hidden">{visibleDetails.map((row) => { const selectable = row.paymentIncluded && row.outstandingAmount > 0; const driver = row.source === 'driver-attendance'; const editHref = `/registers/${row.source}?edit=${encodeURIComponent(row.id)}&from=${encodeURIComponent(row.date)}&to=${encodeURIComponent(row.date)}`; return <div key={row.id} className={`rounded-lg border border-border p-3 ${row.paymentIncluded ? 'bg-card' : 'bg-muted/30'}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex items-center gap-2">{selectable ? <input type="checkbox" checked={selectedEntryIds.includes(row.id)} onChange={(event) => onTogglePaymentEntry(row.id, event.target.checked)} className="size-4 shrink-0 accent-[hsl(var(--primary))]" aria-label={`Select attendance ${row.referenceNo}`} /> : <span className="size-4 shrink-0 text-center text-muted-foreground">—</span>}<span className="truncate font-mono text-[10px] font-semibold">{row.referenceNo}</span></div><div className="mt-1 pl-6 text-xs text-muted-foreground">{displayDate(row.displayDate || row.date)} · {sourceLabel(row.source)}</div></div><div className="shrink-0 text-right"><div className="font-mono text-sm font-bold">{amount(row.outstandingAmount)}</div><StatusBadge status={row.paymentStatus} /></div></div><div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-border pt-3 text-xs"><div><span className="text-muted-foreground">Days</span><div className="mt-0.5">{formatDays(row.workedDays)}</div></div>{driver ? <><div><span className="text-muted-foreground">DA</span><div className="mt-0.5 font-mono">{row.da || '—'}</div></div><div><span className="text-muted-foreground">NA</span><div className="mt-0.5 font-mono">{row.na || '—'}</div></div><div><span className="text-muted-foreground">DA amount</span><div className="mt-0.5 font-mono">{amount(row.daAmount)}</div></div><div><span className="text-muted-foreground">NA amount</span><div className="mt-0.5 font-mono">{amount(row.naAmount)}</div></div></> : <><div><span className="text-muted-foreground">Hours</span><div className="mt-0.5 font-mono">{formatMinutes(row.minutes)}</div></div><div><span className="text-muted-foreground">SPL</span><div className="mt-0.5 font-mono">{formatMinutes(row.overtimeMinutes)}</div></div><div><span className="text-muted-foreground">Wage amount</span><div className="mt-0.5 font-mono">{amount(row.baseAmount)}</div></div><div><span className="text-muted-foreground">SPL amount</span><div className="mt-0.5 font-mono">{amount(row.overtimeAmount)}</div></div></>}<div><span className="text-muted-foreground">Total amount</span><div className="mt-0.5 font-mono font-semibold">{amount(row.totalAmount)}</div></div></div>{canEditRecords && <Link href={editHref} className="mt-3 flex items-center justify-center gap-1.5 border-t border-border pt-3 text-xs font-semibold text-primary hover:underline" aria-label={`Edit attendance ${row.referenceNo}`} data-testid={`button-edit-attendance-mobile-${row.id}`}><Edit3 size={13} /> Edit attendance</Link>}</div>; })}</div>
    {!visibleDetails.length && <div className="border-t border-border p-6 text-center text-sm text-muted-foreground">All attendance in this period has been paid and moved to payment history.</div>}
  </>;
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