import { useEffect, useMemo, useState } from 'react';
import { CalendarRange, Eye, LockKeyhole, Pencil, Printer, RefreshCw, WalletCards } from 'lucide-react';
import { useListRegisterRecords } from '@workspace/api-client-react';
import type { RegisterRecord } from '@workspace/api-client-react';
import { PageIntro } from '@/components/ops-ui';
import { canEditPayments, useAuth } from '@/lib/auth';

const inputClass = 'w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary';

const timeToMinutes = (value: unknown) => {
  if (typeof value !== 'string') return undefined;
  const [hours, minutes] = value.split(':').map(Number);
  return Number.isFinite(hours) && Number.isFinite(minutes) ? hours * 60 + minutes : undefined;
};

const periodMinutes = (value: unknown, period: 'morning' | 'evening') => {
  const minutes = timeToMinutes(value);
  if (minutes === undefined) return undefined;
  return period === 'evening' && Math.floor(minutes / 60) < 12 ? minutes + 720 : minutes;
};

const trainingDurationMinutes = (data: Record<string, unknown>) => {
  const morningIn = periodMinutes(data.morning_in, 'morning');
  const morningOut = periodMinutes(data.morning_out, 'morning');
  const eveningIn = periodMinutes(data.evening_in, 'evening');
  const eveningOut = periodMinutes(data.evening_out, 'evening');
  const difference = (from: number, to: number) => (to - from + 1440) % 1440;

  if (morningIn !== undefined && morningOut !== undefined && eveningIn !== undefined && eveningOut !== undefined) {
    return difference(morningIn, morningOut) + difference(eveningIn, eveningOut);
  }
  if (morningIn !== undefined && eveningOut !== undefined && morningOut === undefined && eveningIn === undefined) {
    return Math.max(difference(morningIn, eveningOut) - 60, 0);
  }
  if (eveningIn !== undefined && morningOut !== undefined && morningIn === undefined && eveningOut === undefined) {
    return Math.max(difference(eveningIn, morningOut) - 60, 0);
  }

  const durations = [
    morningIn !== undefined && morningOut !== undefined ? difference(morningIn, morningOut) : undefined,
    eveningIn !== undefined && eveningOut !== undefined ? difference(eveningIn, eveningOut) : undefined,
  ].filter((value): value is number => value !== undefined);
  return durations.length ? durations.reduce((total, duration) => total + duration, 0) : undefined;
};

const parseStoredDuration = (value: unknown) => {
  if (typeof value !== 'string') return undefined;
  const sign = value.startsWith('-') ? -1 : 1;
  const [hours, minutes] = value.replace('-', '').split(':').map(Number);
  return Number.isFinite(hours) && Number.isFinite(minutes) ? sign * (hours * 60 + minutes) : undefined;
};

const formatSignedDuration = (minutes: number) => {
  const sign = minutes < 0 ? '-' : '';
  const absolute = Math.abs(Math.round(minutes));
  return `${sign}${String(Math.floor(absolute / 60)).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')}`;
};

const formatDays = (days: number) => Number.isInteger(days) ? String(days) : days.toFixed(2);
const dateKey = (record: RegisterRecord) => record.recordDate?.slice(0, 10) ?? String(record.data.date ?? '');
const displayDate = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => `${today().slice(0, 8)}01`;

type ReportRow = {
  record: RegisterRecord;
  date: string;
  totalMinutes: number;
  days: number;
  overtimeMinutes: number;
};

export default function PaymentsPage() {
  const { user } = useAuth();
  const editable = canEditPayments(user?.role);
  const labourQuery = useListRegisterRecords('labour-master', { limit: 500 });
  const attendanceQuery = useListRegisterRecords('daily-attendance', { limit: 500 });
  const [labourName, setLabourName] = useState('');
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [overtimeRate, setOvertimeRate] = useState('0.00');
  const [generated, setGenerated] = useState(false);

  const labourRecords = labourQuery.data?.records ?? [];
  const attendanceRecords = attendanceQuery.data?.records ?? [];
  const labourOptions = useMemo(
    () => labourRecords
      .map((record) => String(record.data.name ?? '').trim())
      .filter(Boolean)
      .filter((name, index, names) => names.indexOf(name) === index)
      .sort((a, b) => a.localeCompare(b)),
    [labourRecords],
  );
  const selectedLabour = labourRecords.find((record) => String(record.data.name ?? '').trim() === labourName);
  const dailyWage = Number(selectedLabour?.data.wages_per_day ?? 0);

  useEffect(() => {
    const nextRate = dailyWage > 0 ? dailyWage / 8 : 0;
    setOvertimeRate(nextRate.toFixed(2));
  }, [dailyWage, labourName]);

  const reportRows = useMemo<ReportRow[]>(() => {
    if (!generated || !labourName || !from || !to) return [];
    return attendanceRecords
      .filter((record) => String(record.data.labour_name ?? '').trim() === labourName)
      .map((record) => {
        const date = dateKey(record);
        const totalMinutes = trainingDurationMinutes(record.data) ?? parseStoredDuration(record.data.total_hours) ?? 0;
        return { record, date, totalMinutes, days: totalMinutes / 480, overtimeMinutes: totalMinutes - 480 };
      })
      .filter((row) => row.date >= from && row.date <= to)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [attendanceRecords, from, generated, labourName, to]);

  const totalDays = reportRows.reduce((sum, row) => sum + row.days, 0);
  const totalOvertimeMinutes = reportRows.reduce((sum, row) => sum + row.overtimeMinutes, 0);
  const overtimeHourlyRate = Number(overtimeRate) || 0;
  const wageAmount = totalDays * dailyWage;
  const overtimeAmount = (totalOvertimeMinutes / 60) * overtimeHourlyRate;
  const totalAmount = wageAmount + overtimeAmount;
  const loading = labourQuery.isLoading || attendanceQuery.isLoading;
  const error = labourQuery.isError || attendanceQuery.isError;

  return (
    <div className="ops-grid min-h-[100dvh] px-5 py-8 md:px-8 lg:px-10">
      <PageIntro
        eyebrow="HR and finance workspace"
        title="Payment report"
        description="Select one labour member and a date range to calculate payable days, signed overtime, wages, and the printable payment slip."
        action={<button onClick={() => window.print()} disabled={!generated || reportRows.length === 0} className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-semibold hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 print:hidden"><Printer size={16} /> Print slip</button>}
      />

      <section className="mb-6 rounded-xl border border-border bg-card p-5 shadow-sm print:hidden">
        <div className="mb-4 flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary"><WalletCards size={20} /></div>
          <div><h2 className="font-serif text-lg font-bold">Generate labour payment report</h2><p className="text-xs text-muted-foreground">The report uses Training Register entries and wages from Labour Master.</p></div>
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          <label><span className="mb-1.5 block text-xs font-semibold">Labour name</span><select value={labourName} onChange={(event) => { setLabourName(event.target.value); setGenerated(false); }} className={inputClass} data-testid="select-payment-labour"><option value="">Select labour…</option>{labourOptions.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
          <label><span className="mb-1.5 block text-xs font-semibold">From date</span><input type="date" value={from} onChange={(event) => { setFrom(event.target.value); setGenerated(false); }} className={inputClass} data-testid="input-payment-from" /></label>
          <label><span className="mb-1.5 block text-xs font-semibold">To date</span><input type="date" value={to} onChange={(event) => { setTo(event.target.value); setGenerated(false); }} className={inputClass} data-testid="input-payment-to" /></label>
          <label><span className="mb-1.5 block text-xs font-semibold">Overtime rate / hour</span><input type="number" min="0" step="0.01" value={overtimeRate} onChange={(event) => setOvertimeRate(event.target.value)} className={inputClass} data-testid="input-overtime-rate" /><span className="mt-1 block text-[11px] text-muted-foreground">Default: daily wage ÷ 8</span></label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button onClick={() => setGenerated(true)} disabled={!labourName || !from || !to || from > to || loading} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50" data-testid="button-generate-payment-report"><CalendarRange size={16} /> Generate report</button>
          {selectedLabour && <span className="text-xs text-muted-foreground">Daily wage: <strong className="text-foreground">{dailyWage.toFixed(2)}</strong></span>}
          {error && <span className="text-xs text-destructive">Attendance or Labour Master data could not be loaded.</span>}
          {loading && <span className="flex items-center gap-1 text-xs text-muted-foreground"><RefreshCw size={13} className="animate-spin" /> Loading records…</span>}
        </div>
      </section>

      {generated && reportRows.length === 0 ? (
        <section className="rounded-xl border border-dashed border-border bg-card/60 p-10 text-center">
          <h2 className="font-serif text-xl font-bold">No attendance records found</h2>
          <p className="mt-2 text-sm text-muted-foreground">There are no Training Register entries for {labourName} in the selected date range.</p>
        </section>
      ) : generated ? (
        <section className="rounded-xl border border-border bg-card p-6 shadow-sm md:p-8" data-testid="payment-slip">
          <div className="flex flex-col justify-between gap-4 border-b border-border pb-5 sm:flex-row sm:items-start">
            <div><div className="font-mono text-[10px] uppercase tracking-[.16em] text-primary">Generated payment slip</div><h2 className="mt-1 font-serif text-2xl font-bold">{labourName}</h2><p className="mt-1 text-sm text-muted-foreground">Days: {displayDate(from)} to {displayDate(to)}</p></div>
            <div className="text-left text-sm sm:text-right"><div>Daily wage <strong>{dailyWage.toFixed(2)}</strong></div><div>OT rate <strong>{overtimeHourlyRate.toFixed(2)} / hour</strong></div></div>
          </div>
          <div className="mt-6 overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead className="border-b border-border bg-muted/45"><tr><th className="px-3 py-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Day</th><th className="px-3 py-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Date</th><th className="px-3 py-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Total hours</th><th className="px-3 py-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Days</th><th className="px-3 py-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Overtime</th></tr></thead><tbody className="divide-y divide-border">{reportRows.map((row, index) => <tr key={row.record.id}><td className="px-3 py-3">{index + 1}</td><td className="px-3 py-3">{displayDate(row.date)}</td><td className="px-3 py-3 font-mono">{formatSignedDuration(row.totalMinutes)}</td><td className="px-3 py-3">{formatDays(row.days)}</td><td className={`px-3 py-3 font-mono font-semibold ${row.overtimeMinutes < 0 ? 'text-destructive' : 'text-primary'}`}>{formatSignedDuration(row.overtimeMinutes)}</td></tr>)}</tbody></table></div>
          <div className="mt-6 grid gap-3 border-t border-border pt-5 sm:grid-cols-4"><Summary label="Total days" value={formatDays(totalDays)} /><Summary label="Total overtime" value={formatSignedDuration(totalOvertimeMinutes)} negative={totalOvertimeMinutes < 0} /><Summary label="Wages" value={wageAmount.toFixed(2)} /><Summary label="Overtime amount" value={overtimeAmount.toFixed(2)} negative={overtimeAmount < 0} /></div>
          <div className="mt-5 flex justify-end rounded-lg bg-primary/10 p-4 text-right"><div><div className="text-xs uppercase tracking-wider text-muted-foreground">Total payable</div><div className="mt-1 font-mono text-2xl font-bold text-primary">{totalAmount.toFixed(2)}</div></div></div>
          <div className="mt-16 grid grid-cols-2 gap-16 text-sm"><div className="border-t border-foreground/40 pt-2">Sign</div><div className="border-t border-foreground/40 pt-2">Sign of HR</div></div>
        </section>
      ) : (
        <section className="rounded-xl border border-dashed border-border bg-card/60 p-10 text-center">
          <h2 className="font-serif text-xl font-bold">Choose a labour and date range</h2>
          <p className="mt-2 text-sm text-muted-foreground">Generate a report to see the day-wise payment slip.</p>
        </section>
      )}

      {!editable && <div className="mt-5 flex items-center gap-2 text-xs text-muted-foreground print:hidden"><Eye size={14} /> View-only payment access</div>}
      {editable && <div className="mt-5 flex items-center gap-2 text-xs text-muted-foreground print:hidden"><Pencil size={14} /> HR and Admin can generate and print payment slips</div>}
      <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground print:hidden"><LockKeyhole size={14} /> Payment reports are visible only to HR, Manager, and Admin.</div>
    </div>
  );
}

function Summary({ label, value, negative = false }: { label: string; value: string; negative?: boolean }) {
  return <div className="rounded-lg border border-border bg-muted/35 p-3"><div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div><div className={`mt-1 font-mono text-lg font-semibold ${negative ? 'text-destructive' : 'text-foreground'}`}>{value}</div></div>;
}