import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, Eye, FileText, LockKeyhole, Printer, RefreshCw, WalletCards, XCircle } from 'lucide-react';
import { Link } from 'wouter';
import { PageIntro } from '@/components/ops-ui';
import { canEditPayments, useAuth } from '@/lib/auth';
import { displayDate, fetchHrReport, fetchPaymentBills, formatDays, formatMinutes, monthStart, savePaymentBill, today, type HrReport, type PaymentBill } from '@/lib/hr-report';

const inputClass = 'w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary';
const sourceLabel = (source: string) => source === 'daily-attendance' ? 'Training Register' : source === 'driver-attendance' ? 'Driver Attendance' : source === 'chowk-labour' ? 'Chowk Labour' : 'All three registers';
const amount = (value: number) => `₹${value.toFixed(2)}`;
const shortDate = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: '2-digit' });

export default function PaymentsPage() {
  const { user } = useAuth();
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [source, setSource] = useState('all');
  const [person, setPerson] = useState('');
  const [report, setReport] = useState<HrReport | null>(null);
  const [history, setHistory] = useState<PaymentBill[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const editable = canEditPayments(user?.role);

  const load = async () => {
    setLoading(true); setError(''); setNotice('');
    try {
      const [nextReport, nextHistory] = await Promise.all([fetchHrReport(from, to, source), fetchPaymentBills(from, to, source)]);
      setReport(nextReport); setHistory(nextHistory);
      if (person && !nextReport.summaries.some((row) => row.name === person)) setPerson('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Payment report could not be loaded');
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const selected = useMemo(() => report?.summaries.find((row) => row.name === person) ?? null, [person, report]);
  const people = report?.summaries ?? [];
  const selectedDetails = useMemo(() => (report?.details ?? []).filter((row) => !person || row.name === person), [person, report]);

  const changeStatus = async (status: 'paid' | 'unpaid') => {
    if (!selected || !report) return;
    setSaving(true); setError(''); setNotice('');
    try {
      await savePaymentBill({
        personName: selected.name, fromDate: report.from, toDate: report.to, sourceScope: source,
        totalDays: selected.workedDays, wagePerDay: selected.wagePerDay, wageAmount: selected.wageAmount,
        overtimeMinutes: selected.overtimeMinutes, overtimeRate: selected.overtimeRate,
        overtimeAmount: selected.overtimeAmount, roundingAmount: selected.roundingAmount,
        totalAmount: selected.totalAmount, status,
      });
      setNotice(status === 'paid' ? `${selected.name}'s bill was marked paid and stored.` : `${selected.name}'s bill was marked unpaid.`);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Payment status could not be saved');
    } finally { setSaving(false); }
  };

  return <div className="ops-grid min-h-[100dvh] px-5 py-8 md:px-8 lg:px-10">
    <div className="mb-6 flex items-center justify-between print:hidden"><Link href="/" className="flex items-center gap-2 text-sm font-semibold"><ArrowLeft size={16} /> Back to modules</Link><span className="font-mono text-[10px] uppercase tracking-[.16em] text-muted-foreground">HR + payment workspace</span></div>
    <PageIntro eyebrow="Human resources and finance" title="Payment bills" description="Generate a clear bill for every person, review the three attendance registers, and store whether each bill is paid or unpaid." action={<button onClick={() => window.print()} disabled={!selected} className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-semibold hover:bg-muted disabled:opacity-50 print:hidden"><Printer size={16} /> Print bill</button>} />
    <section className="mb-6 rounded-xl border border-border bg-card p-5 shadow-sm print:hidden">
      <div className="mb-4 flex items-center gap-3"><div className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary"><WalletCards size={20} /></div><div><h2 className="font-serif text-lg font-bold">Generate payment report</h2><p className="text-xs text-muted-foreground">Select a register and date range to see everyone, then open one person&apos;s bill.</p></div></div>
      <div className="grid gap-4 md:grid-cols-4">
        <label><span className="mb-1.5 block text-xs font-semibold">From date</span><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className={inputClass} /></label>
        <label><span className="mb-1.5 block text-xs font-semibold">To date</span><input type="date" value={to} onChange={(event) => setTo(event.target.value)} className={inputClass} /></label>
        <label><span className="mb-1.5 block text-xs font-semibold">Register</span><select value={source} onChange={(event) => { setSource(event.target.value); setPerson(''); }} className={inputClass}><option value="all">All three registers</option><option value="driver-attendance">Driver Attendance</option><option value="daily-attendance">Training Register</option><option value="chowk-labour">Chowk Labour</option></select></label>
        <label><span className="mb-1.5 block text-xs font-semibold">Person bill</span><select value={person} onChange={(event) => setPerson(event.target.value)} className={inputClass}><option value="">Everyone / select below</option>{people.map((row) => <option key={row.name} value={row.name}>{row.name}</option>)}</select></label>
      </div>
      <div className="mt-4 flex items-center gap-3"><button onClick={() => void load()} disabled={loading || !from || !to || from > to} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> {loading ? 'Loading…' : 'Generate report'}</button>{error && <span className="text-sm text-destructive">{error}</span>}{notice && <span className="text-sm text-primary">{notice}</span>}</div>
    </section>
    {report && !person && <section className="mb-6 overflow-hidden rounded-xl border border-border bg-card shadow-sm print:hidden"><div className="flex items-center gap-3 border-b border-border px-5 py-4"><FileText size={18} className="text-primary" /><div><h2 className="font-serif text-lg font-bold">Payment list</h2><p className="text-xs text-muted-foreground">{people.length} people · {sourceLabel(source)} · {shortDate(report.from)} to {shortDate(report.to)}</p></div></div><div className="overflow-x-auto"><table className="w-full min-w-[920px] text-left text-sm"><thead className="border-b border-border bg-muted/45"><tr>{['Name', 'Days', 'Wage amount', 'Overtime', 'OT amount', 'Round off', 'Total payable', 'Status', 'Bill'].map((label) => <th key={label} className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</th>)}</tr></thead><tbody className="divide-y divide-border">{people.map((row) => <tr key={row.name} className="hover:bg-muted/30"><td className="px-4 py-3 font-semibold">{row.name}</td><td className="px-4 py-3">{formatDays(row.workedDays)}</td><td className="px-4 py-3 font-mono">{amount(row.wageAmount)}</td><td className="px-4 py-3 font-mono text-primary">{formatMinutes(row.overtimeMinutes)}</td><td className="px-4 py-3 font-mono">{amount(row.overtimeAmount)}</td><td className="px-4 py-3 font-mono">{row.roundingAmount >= 0 ? '+' : ''}{amount(row.roundingAmount)}</td><td className="px-4 py-3 font-mono font-bold">{amount(row.totalAmount)}</td><td className="px-4 py-3"><StatusBadge status={row.paymentStatus} /></td><td className="px-4 py-3"><button onClick={() => setPerson(row.name)} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted">Open bill</button></td></tr>)}</tbody></table></div></section>}
    {selected && report && <BillSlip report={report} source={source} selected={selected} selectedDetails={selectedDetails} saving={saving} editable={editable} onStatus={changeStatus} />}
    {report && person && !selected && <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">Select a person from the generated report.</div>}
    <PaymentHistory history={history} />
    {!editable && <div className="mt-5 flex items-center gap-2 text-xs text-muted-foreground print:hidden"><Eye size={14} /> View-only payment access</div>}
    <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground print:hidden"><LockKeyhole size={14} /> Only HR and Admin can change paid/unpaid status.</div>
  </div>;
}

function BillSlip({ report, source, selected, selectedDetails, saving, editable, onStatus }: { report: HrReport; source: string; selected: NonNullable<HrReport['summaries'][number]>; selectedDetails: HrReport['details']; saving: boolean; editable: boolean; onStatus: (status: 'paid' | 'unpaid') => void }) {
  return <section className="mx-auto max-w-3xl rounded-xl border-2 border-foreground/15 bg-card p-6 shadow-sm md:p-9" data-testid="payment-bill-slip">
    <div className="flex items-start justify-between gap-5 border-b border-border pb-5"><div><div className="font-mono text-[10px] uppercase tracking-[.18em] text-primary">Payment bill</div><h2 className="mt-2 font-serif text-3xl font-bold">{selected.name}</h2><p className="mt-1 text-sm text-muted-foreground">Bill period {shortDate(report.from)} to {shortDate(report.to)}</p><p className="mt-1 text-xs text-muted-foreground">{sourceLabel(source)}</p></div><div className="text-right"><div className="font-mono text-[10px] uppercase tracking-[.15em] text-muted-foreground">Bill number</div><div className="mt-1 font-mono text-sm font-bold">{selected.billNumber ?? 'Not saved yet'}</div><StatusBadge status={selected.paymentStatus} /></div></div>
    <div className="mt-7 divide-y divide-border text-sm">
      <BillLine label="Total days" detail={`Wage ${amount(selected.wagePerDay)} × ${formatDays(selected.workedDays)}`} value={amount(selected.wageAmount)} />
      <BillLine label="Overtime" detail={`${formatMinutes(selected.overtimeMinutes)} · ${amount(selected.wagePerDay)} ÷ 8 × ${(selected.overtimeMinutes / 60).toFixed(2)} hours`} value={amount(selected.overtimeAmount)} />
      <BillLine label="Round off" detail="Rounded to the nearest rupee" value={`${selected.roundingAmount >= 0 ? '+' : ''}${amount(selected.roundingAmount)}`} />
      <div className="flex items-end justify-between gap-4 py-5"><div><div className="font-serif text-xl font-bold">Total amount payable</div><div className="mt-1 text-xs text-muted-foreground">Wages + overtime + round off</div></div><div className="font-mono text-2xl font-bold text-primary">{amount(selected.totalAmount)}</div></div>
    </div>
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/45 p-4"><div><div className="text-[10px] uppercase tracking-wider text-muted-foreground">Payment status</div><div className={`mt-1 flex items-center gap-2 font-semibold ${selected.paymentStatus === 'paid' ? 'text-emerald-700' : 'text-amber-700'}`}>{selected.paymentStatus === 'paid' ? <CheckCircle2 size={17} /> : <XCircle size={17} />}{selected.paymentStatus === 'paid' ? `Paid${selected.paidAt ? ` on ${displayDate(selected.paidAt.slice(0, 10))}` : ''}` : 'Unpaid'}</div></div>{editable && <button onClick={() => onStatus(selected.paymentStatus === 'paid' ? 'unpaid' : 'paid')} disabled={saving} className={`rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 ${selected.paymentStatus === 'paid' ? 'bg-amber-700' : 'bg-emerald-700'}`}>{saving ? 'Saving…' : selected.paymentStatus === 'paid' ? 'Mark unpaid' : 'Mark as paid'}</button>}</div>
    <div className="mt-7 grid grid-cols-2 gap-12 text-sm"><div className="border-t border-foreground/40 pt-2">Prepared by HR</div><div className="border-t border-foreground/40 pt-2">Sign of HR</div></div>
    <div className="mt-8 overflow-x-auto print:hidden"><table className="w-full min-w-[680px] text-left text-xs"><thead className="border-b border-border"><tr>{['Date', 'Register', 'Days', 'Hours', 'Overtime', 'Entry payable', 'Status'].map((label) => <th key={label} className="px-2 py-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</th>)}</tr></thead><tbody className="divide-y divide-border">{selectedDetails.map((row) => <tr key={row.id}><td className="px-2 py-2">{displayDate(row.date)}</td><td className="px-2 py-2">{sourceLabel(row.source)}</td><td className="px-2 py-2">{formatDays(row.workedDays)}</td><td className="px-2 py-2 font-mono">{formatMinutes(row.minutes)}</td><td className="px-2 py-2 font-mono">{formatMinutes(row.overtimeMinutes)}</td><td className="px-2 py-2 font-mono">{amount(row.totalAmount)}</td><td className="px-2 py-2">{row.paymentStatus}</td></tr>)}</tbody></table></div>
  </section>;
}

function BillLine({ label, detail, value }: { label: string; detail: string; value: string }) {
  return <div className="flex items-center justify-between gap-5 py-4"><div><div className="font-semibold">{label}</div><div className="mt-1 text-xs text-muted-foreground">{detail}</div></div><div className="font-mono text-base font-semibold">{value}</div></div>;
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${status === 'paid' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{status}</span>;
}

function PaymentHistory({ history }: { history: PaymentBill[] }) {
  return <section className="mt-6 overflow-hidden rounded-xl border border-border bg-card shadow-sm print:hidden"><div className="border-b border-border px-5 py-4"><h2 className="font-serif text-lg font-bold">Payment history</h2><p className="text-xs text-muted-foreground">Every saved bill and its current paid/unpaid state appears here.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left text-sm"><thead className="border-b border-border bg-muted/45"><tr>{['Bill', 'Name', 'Period', 'Register', 'Amount', 'Status', 'Paid by'].map((label) => <th key={label} className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</th>)}</tr></thead><tbody className="divide-y divide-border">{history.map((bill) => <tr key={bill.id}><td className="px-4 py-3 font-mono text-xs">{bill.billNumber}</td><td className="px-4 py-3 font-semibold">{bill.personName}</td><td className="px-4 py-3 text-xs">{shortDate(bill.fromDate)} – {shortDate(bill.toDate)}</td><td className="px-4 py-3">{sourceLabel(bill.sourceScope)}</td><td className="px-4 py-3 font-mono font-bold">{amount(bill.totalAmount)}</td><td className="px-4 py-3"><StatusBadge status={bill.status} /></td><td className="px-4 py-3 text-xs">{bill.paidBy ?? '—'}</td></tr>)}</tbody></table></div>{!history.length && <div className="p-8 text-center text-sm text-muted-foreground">No saved bills for this filter yet.</div>}</section>;
}