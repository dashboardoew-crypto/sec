import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, BarChart3, CalendarRange, Car, Download, FileText, RefreshCw, Search, Sun, Users, Wrench } from 'lucide-react';
import { Link } from 'wouter';
import { PageIntro } from '@/components/ops-ui';
import { VehicleReportModule } from '@/components/vehicle-report-module';
import { SolarReportModule } from '@/components/solar-report-module';
import { BreakdownReportView } from '@/components/breakdown-report-view';
import { CarBreakdownReportModule } from '@/components/car-breakdown-report-module';
import {
  displayDate,
  fetchHrReport,
  formatDays,
  formatMinutes,
  monthStart,
  today,
  type HrDetail,
  type HrReport,
  type HrSummary,
} from '@/lib/hr-report';

type ReportSource = 'driver-attendance' | 'chowk-labour' | 'daily-attendance';

const reportOptions: Array<{ source: ReportSource; label: string; description: string }> = [
  {
    source: 'driver-attendance',
    label: 'Driver report',
    description: 'Driver attendance, station days, DA, NA and allowance totals.',
  },
  {
    source: 'chowk-labour',
    label: 'Chowk labour report',
    description: 'Person-wise chowk labour days, hours, overtime and payable amounts.',
  },
  {
    source: 'daily-attendance',
    label: 'Training register report',
    description: 'Person-wise training attendance, hours, days, overtime and payable amounts.',
  },
];

const inputClass = 'w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15';
const amount = (value: number) => `₹${value.toFixed(2)}`;
const reportLabel = (source: string) => reportOptions.find((option) => option.source === source)?.label ?? source;
const downloadCsv = (filename: string, rows: string[][]) => {
  const csv = rows.map((row) => row.map((cell) => JSON.stringify(cell)).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

export default function ReportsPage() {
  const [reportVersion, setReportVersion] = useState<'v4' | 'v3' | 'v2' | 'v1' | 'breakdowns'>('v4');
  const [source, setSource] = useState<ReportSource>('driver-attendance');
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [person, setPerson] = useState('');
  const [report, setReport] = useState<HrReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async (nextSource = source, nextFrom = from, nextTo = to) => {
    setLoading(true);
    setError('');
    try {
      const nextReport = await fetchHrReport(nextFrom, nextTo, nextSource);
      setReport(nextReport);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Report could not be loaded');
      setReport(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [source]);

  const people = useMemo(() => {
    const query = person.trim().toLowerCase();
    return (report?.summaries ?? [])
      .filter((summary) => !query || summary.name.toLowerCase().includes(query))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [person, report]);

  const details = useMemo(() => {
    const query = person.trim().toLowerCase();
    return (report?.details ?? [])
      .filter((detail) => !query || detail.name.toLowerCase().includes(query))
      .sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
  }, [person, report]);

  const reportOption = reportOptions.find((option) => option.source === source)!;
  const summaryRows = useMemo(() => people.map((summary) => {
    const personDetails = details.filter((detail) => detail.name === summary.name);
    return {
      summary,
      entries: personDetails.length,
      da: personDetails.reduce((total, detail) => total + detail.da, 0),
      na: personDetails.reduce((total, detail) => total + detail.na, 0),
      daAmount: personDetails.reduce((total, detail) => total + detail.daAmount, 0),
      naAmount: personDetails.reduce((total, detail) => total + detail.naAmount, 0),
      minutes: personDetails.reduce((total, detail) => total + detail.minutes, 0),
    };
  }), [details, people]);

  const exportDetails = () => {
    const rows = source === 'driver-attendance'
      ? [
        ['Attendance reference', 'Date', 'Person', 'Register', 'Days', 'DA', 'NA', 'DA amount', 'NA amount', 'Total amount'],
        ...details.map((detail) => [
          detail.referenceNo,
          detail.date,
          detail.name,
          reportLabel(detail.source),
          formatDays(detail.workedDays),
          String(detail.da || ''),
          String(detail.na || ''),
          detail.daAmount.toFixed(2),
          detail.naAmount.toFixed(2),
          detail.totalAmount.toFixed(2),
        ]),
      ]
      : [
        ['Attendance reference', 'Date', 'Person', 'Register', 'Days', 'Hours', 'Overtime', 'Base amount', 'Overtime amount', 'Total amount'],
        ...details.map((detail) => [
          detail.referenceNo,
          detail.date,
          detail.name,
          reportLabel(detail.source),
          formatDays(detail.workedDays),
          formatMinutes(detail.minutes),
          formatMinutes(detail.overtimeMinutes),
          detail.baseAmount.toFixed(2),
          detail.overtimeAmount.toFixed(2),
          detail.totalAmount.toFixed(2),
        ]),
      ];
    downloadCsv(`${source}-all-details-${from}-to-${to}.csv`, rows);
  };

  const exportSummary = () => {
    const rows = source === 'driver-attendance'
      ? [
        ['Person', 'Days', 'DA', 'NA', 'DA amount', 'NA amount', 'Total amount', 'Entries'],
        ...summaryRows.map(({ summary, entries, da, na, daAmount, naAmount }) => [
          summary.name,
          formatDays(summary.workedDays),
          String(da || ''),
          String(na || ''),
          daAmount.toFixed(2),
          naAmount.toFixed(2),
          summary.totalAmount.toFixed(2),
          String(entries),
        ]),
      ]
      : [
        ['Person', 'Days', 'Hours', 'Overtime', 'Base amount', 'Overtime amount', 'Total amount', 'Entries'],
        ...summaryRows.map(({ summary, entries, minutes }) => [
          summary.name,
          formatDays(summary.workedDays),
          formatMinutes(minutes),
          formatMinutes(summary.overtimeMinutes),
          summary.baseAmount.toFixed(2),
          summary.overtimeAmount.toFixed(2),
          summary.totalAmount.toFixed(2),
          String(entries),
        ]),
      ];
    downloadCsv(`${source}-summary-by-person-${from}-to-${to}.csv`, rows);
  };

  return (
    <div className="ops-grid min-h-[100dvh] px-3 py-5 sm:px-5 sm:py-8 md:px-8 lg:px-10">
      <div className="mb-6 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
          <ArrowLeft size={16} /> Back to modules
        </Link>
        <span className="font-mono text-[10px] uppercase tracking-[.16em] text-muted-foreground">Reports workspace</span>
      </div>

      {/* Main Version Switcher */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-2 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setReportVersion('v4')}
            className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition sm:text-sm ${
              reportVersion === 'v4'
                ? 'bg-indigo-600 text-white shadow-md dark:bg-indigo-500'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
            data-testid="button-report-v4"
          >
            <Wrench size={16} /> Module Report 4.0 (Car Breakdown Analytics)
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${
                reportVersion === 'v4'
                  ? 'bg-white/25 text-white'
                  : 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300'
              }`}
            >
              4.0
            </span>
          </button>

          <button
            onClick={() => setReportVersion('v3')}
            className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition sm:text-sm ${
              reportVersion === 'v3'
                ? 'bg-amber-600 text-white shadow-md dark:bg-amber-500'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            <Sun size={16} /> Module Report 3.0 (Solar Cleaning Analytics)
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${
                reportVersion === 'v3'
                  ? 'bg-white/25 text-white'
                  : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
              }`}
            >
              3.0
            </span>
          </button>

          <button
            onClick={() => setReportVersion('v2')}
            className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition sm:text-sm ${
              reportVersion === 'v2'
                ? 'bg-teal-600 text-white shadow-md'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            <Car size={16} /> Module Report 2.0 (Driver & Vehicle Analytics)
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${
                reportVersion === 'v2'
                  ? 'bg-white/25 text-white'
                  : 'bg-teal-500/15 text-teal-700 dark:text-teal-300'
              }`}
            >
              2.0
            </span>
          </button>

          <button
            onClick={() => setReportVersion('v1')}
            className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition sm:text-sm ${
              reportVersion === 'v1'
                ? 'bg-primary text-primary-foreground shadow-md'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            <Users size={16} /> HR & Attendance Reports (v1.0)
          </button>

          <button
            onClick={() => setReportVersion('breakdowns')}
            className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition sm:text-sm ${
              reportVersion === 'breakdowns'
                ? 'bg-red-600 text-white shadow-md'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
            data-testid="button-report-breakdowns"
          >
            <AlertTriangle size={16} /> Tubewell Breakdown Reports
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${
                reportVersion === 'breakdowns'
                  ? 'bg-white/25 text-white'
                  : 'bg-red-500/15 text-red-700 dark:text-red-300'
              }`}
            >
              Alerts
            </span>
          </button>
        </div>

        <div className="hidden px-2 font-mono text-[11px] text-muted-foreground lg:block">
          {reportVersion === 'v4'
            ? 'Car Breakdown Service Logs, Monthly Downtime & Vehicle Reliability Analytics'
            : reportVersion === 'breakdowns'
              ? 'Tubewell 1 & 2 Breakdown Incident Reports, Live Status & Dispatches'
              : reportVersion === 'v3'
                ? 'Solar Panel Cleaning Register & Monthly Man Power Calculations'
                : reportVersion === 'v2'
                  ? 'Outgoing Vehicle Log (Local) & Out of Station KM Analytics'
                  : 'Driver Attendance, Chowk Labour & Training Reports'}
        </div>
      </div>

      {reportVersion === 'v4' ? (
        <CarBreakdownReportModule />
      ) : reportVersion === 'breakdowns' ? (
        <BreakdownReportView />
      ) : reportVersion === 'v3' ? (
        <SolarReportModule />
      ) : reportVersion === 'v2' ? (
        <VehicleReportModule />
      ) : (
        <>
          <PageIntro
            eyebrow="Main module · reports"
            title="Person-wise operational reports"
            description="Generate a complete report for every driver, Chowk labour worker, or training-register person for the selected date range."
            action={(
              <div className="flex flex-wrap gap-2">
                <button onClick={() => void load()} disabled={loading} className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-semibold hover:bg-muted disabled:opacity-50">
                  <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh
                </button>
                <button onClick={exportDetails} disabled={loading || !details.length} className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-semibold hover:bg-muted disabled:opacity-50">
                  <Download size={15} /> All report details
                </button>
                <button onClick={exportSummary} disabled={loading || !summaryRows.length} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50">
                  <Download size={15} /> Summary by person
                </button>
              </div>
            )}
          />

          <section className="mb-5 rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="grid gap-3 lg:grid-cols-[1.5fr_1fr_1fr_1.2fr_auto] lg:items-end">
              <div className="grid gap-2 sm:grid-cols-3 lg:col-span-1 lg:block">
                <span className="mb-1.5 block text-xs font-semibold">Report type</span>
                <div className="grid gap-2 sm:col-span-2">
                  <select value={source} onChange={(event) => { setSource(event.target.value as ReportSource); setPerson(''); }} className={inputClass}>
                    {reportOptions.map((option) => <option key={option.source} value={option.source}>{option.label}</option>)}
                  </select>
                </div>
              </div>
              <label>
                <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold"><CalendarRange size={13} /> From date</span>
                <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className={inputClass} />
              </label>
              <label>
                <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold"><CalendarRange size={13} /> To date</span>
                <input type="date" value={to} onChange={(event) => setTo(event.target.value)} className={inputClass} />
              </label>
              <label>
                <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold"><Search size={13} /> Person</span>
                <input value={person} onChange={(event) => setPerson(event.target.value)} placeholder="All people" className={inputClass} />
              </label>
              <button onClick={() => void load(source, from, to)} disabled={loading || !from || !to || from > to} className="flex h-[42px] items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">
                <FileText size={15} /> Generate
              </button>
            </div>
            {error && <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</div>}
          </section>

          <section className="mb-5 grid gap-3 md:grid-cols-3">
            {reportOptions.map((option) => (
              <button key={option.source} onClick={() => { setSource(option.source); setPerson(''); }} className={`rounded-xl border p-4 text-left shadow-sm transition hover:-translate-y-0.5 ${source === option.source ? 'border-primary/50 bg-primary/10' : 'border-border bg-card hover:bg-muted/40'}`}>
                <div className="flex items-start justify-between gap-3">
                  <span className={`grid size-9 place-items-center rounded-lg ${source === option.source ? 'bg-primary text-primary-foreground' : 'bg-secondary text-primary'}`}><BarChart3 size={17} /></span>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{source === option.source ? 'Selected' : 'Report'}</span>
                </div>
                <h2 className="mt-4 font-serif text-lg font-bold">{option.label}</h2>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{option.description}</p>
              </button>
            ))}
          </section>

          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[.16em] text-primary">{reportOption.label}</div>
              <h2 className="mt-1 font-serif text-2xl font-bold">Summary by person</h2>
              <p className="mt-1 text-xs text-muted-foreground">{report ? `${displayDate(report.from)} to ${displayDate(report.to)} · ${people.length} people · ${details.length} attendance entries` : 'Choose filters and generate a report.'}</p>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
              <Users size={14} /> {report?.expectedDays ?? 0} days in selected period
            </div>
          </div>

          <section className="mb-6 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="max-h-[26rem] overflow-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="sticky top-0 z-10 border-b border-border bg-muted/95">
                  <tr>{(source === 'driver-attendance'
                    ? ['Person', 'Days', 'DA', 'NA', 'DA amount', 'NA amount', 'Total amount', 'Entries']
                    : ['Person', 'Days', 'Hours', 'Overtime', 'Base amount', 'Overtime amount', 'Total amount', 'Entries']
                  ).map((label) => <th key={label} className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {summaryRows.map(({ summary, entries, da, na, daAmount, naAmount, minutes }) => {
                    return (
                      <tr key={summary.name} className="hover:bg-muted/30">
                        <td className="px-4 py-3 font-semibold">{summary.name}</td>
                        <td className="px-4 py-3">{formatDays(summary.workedDays)}</td>
                        {source === 'driver-attendance' ? <>
                          <td className="px-4 py-3 font-mono">{da || '—'}</td>
                          <td className="px-4 py-3 font-mono">{na || '—'}</td>
                          <td className="px-4 py-3 font-mono">{amount(daAmount)}</td>
                          <td className="px-4 py-3 font-mono">{amount(naAmount)}</td>
                        </> : <>
                          <td className="px-4 py-3 font-mono">{formatMinutes(minutes)}</td>
                          <td className="px-4 py-3 font-mono text-primary">{formatMinutes(summary.overtimeMinutes)}</td>
                          <td className="px-4 py-3 font-mono">{amount(summary.baseAmount)}</td>
                          <td className="px-4 py-3 font-mono">{amount(summary.overtimeAmount)}</td>
                        </>}
                        <td className="px-4 py-3 font-mono font-bold">{amount(summary.totalAmount)}</td>
                        <td className="px-4 py-3 text-muted-foreground">{entries}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!loading && !people.length && <div className="p-10 text-center text-sm text-muted-foreground">No people or records match this report.</div>}
            </div>
          </section>

          <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="border-b border-border px-5 py-4">
              <h2 className="font-serif text-lg font-bold">All report details</h2>
              <p className="mt-1 text-xs text-muted-foreground">Every attendance reference is shown as a separate row.</p>
            </div>
            <div className="max-h-[38rem] overflow-auto">
              {source === 'driver-attendance'
                ? <DriverDetails details={details} loading={loading} />
                : <AttendanceDetails details={details} loading={loading} />}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function DriverDetails({ details, loading }: { details: HrDetail[]; loading: boolean }) {
  return (
    <>
      <table className="w-full min-w-[1100px] text-left text-sm">
        <thead className="sticky top-0 z-10 border-b border-border bg-muted/95">
          <tr>{['Attendance reference', 'Date', 'Person', 'Register', 'Days', 'DA', 'NA', 'DA amount', 'NA amount', 'Total amount'].map((label) => <th key={label} className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-border">
          {details.map((detail) => <tr key={detail.id} className="hover:bg-muted/30"><td className="px-4 py-3 font-mono text-xs">{detail.referenceNo}</td><td className="px-4 py-3">{displayDate(detail.date)}</td><td className="px-4 py-3 font-semibold">{detail.name}</td><td className="px-4 py-3">Driver Attendance</td><td className="px-4 py-3">{formatDays(detail.workedDays)}</td><td className="px-4 py-3 font-mono">{detail.da || '—'}</td><td className="px-4 py-3 font-mono">{detail.na || '—'}</td><td className="px-4 py-3 font-mono">{amount(detail.daAmount)}</td><td className="px-4 py-3 font-mono">{amount(detail.naAmount)}</td><td className="px-4 py-3 font-mono font-bold">{amount(detail.totalAmount)}</td></tr>)}
        </tbody>
      </table>
      {!loading && !details.length && <div className="p-10 text-center text-sm text-muted-foreground">No driver attendance records match this report.</div>}
    </>
  );
}

function AttendanceDetails({ details, loading }: { details: HrDetail[]; loading: boolean }) {
  return (
    <>
      <table className="w-full min-w-[1100px] text-left text-sm">
        <thead className="sticky top-0 z-10 border-b border-border bg-muted/95">
          <tr>{['Attendance reference', 'Date', 'Person', 'Register', 'Days', 'Hours', 'Overtime', 'Base amount', 'Overtime amount', 'Total amount'].map((label) => <th key={label} className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-border">
          {details.map((detail) => <tr key={detail.id} className="hover:bg-muted/30"><td className="px-4 py-3 font-mono text-xs">{detail.referenceNo}</td><td className="px-4 py-3">{displayDate(detail.date)}</td><td className="px-4 py-3 font-semibold">{detail.name}</td><td className="px-4 py-3">{reportLabel(detail.source)}</td><td className="px-4 py-3">{formatDays(detail.workedDays)}</td><td className="px-4 py-3 font-mono">{formatMinutes(detail.minutes)}</td><td className="px-4 py-3 font-mono text-primary">{formatMinutes(detail.overtimeMinutes)}</td><td className="px-4 py-3 font-mono">{amount(detail.baseAmount)}</td><td className="px-4 py-3 font-mono">{amount(detail.overtimeAmount)}</td><td className="px-4 py-3 font-mono font-bold">{amount(detail.totalAmount)}</td></tr>)}
        </tbody>
      </table>
      {!loading && !details.length && <div className="p-10 text-center text-sm text-muted-foreground">No attendance records match this report.</div>}
    </>
  );
}