import { useEffect, useState } from 'react';
import {
  CalendarDays,
  Clock,
  Download,
  Layers,
  RefreshCw,
  Search,
  Sun,
  User,
  Users,
  XCircle,
} from 'lucide-react';
import {
  fetchSolarAnalytics,
  type SolarAnalyticsReport,
} from '@/lib/solar-report';
import { downloadCsv } from '@/lib/date-utils';

const inputClass =
  'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15';

type SubReportTab = 'monthly' | 'workers' | 'records';

export function SolarReportModule() {
  const [data, setData] = useState<SolarAnalyticsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [selectedMonth, setSelectedMonth] = useState('all');
  const [selectedWorker, setSelectedWorker] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<SubReportTab>('monthly');

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchSolarAnalytics({
        month: selectedMonth,
        worker: selectedWorker,
        from: dateFrom || undefined,
        to: dateTo || undefined,
        search: searchQuery,
      });
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load solar analytics');
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [selectedMonth, selectedWorker, dateFrom, dateTo]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void loadData();
  };

  const handleResetFilters = () => {
    setSelectedMonth('all');
    setSelectedWorker('all');
    setDateFrom('');
    setDateTo('');
    setSearchQuery('');
  };

  // Export Monthly Summary CSV
  const exportMonthlyCsv = () => {
    if (!data?.monthlySummaries.length) return;
    const headers = [
      'Month',
      'Total Man Power (Formatted)',
      'Total Man Power (Hours)',
      'Total Cleaning Shifts',
      'Worker Count',
      'Workers',
      'Avg Man Power / Shift',
      'Yard Cleaned Count',
      'Canopy Zone I Count',
      'Foundry Zone II Count',
      'Machine Shop III Count',
    ];
    const rows = data.monthlySummaries.map((m) => [
      m.monthLabel,
      m.totalManPowerFormatted,
      m.totalManPowerHours.toString(),
      m.totalShifts.toString(),
      m.workerCount.toString(),
      m.workers.join('; '),
      m.avgManPowerFormatted,
      m.zonesSummary.yard.toString(),
      m.zonesSummary.canopyZoneI.toString(),
      m.zonesSummary.foundryZoneII.toString(),
      m.zonesSummary.machineShopIII.toString(),
    ]);
    downloadCsv(`Solar_Cleaning_Monthly_Man_Power_${new Date().toISOString().slice(0, 10)}.csv`, [headers, ...rows]);
  };

  // Export Detailed Records CSV
  const exportRecordsCsv = () => {
    if (!data?.records.length) return;
    const headers = [
      'Date',
      'Month',
      'Worker Name',
      'In-Time',
      'Out-Time',
      'Man Power (Duration)',
      'Man Power (Hours)',
      'Yard',
      'Canopy Zone I',
      'Foundry Zone II',
      'Machine Shop III',
      'Remark',
    ];
    const rows = data.records.map((r) => [
      r.date,
      r.monthLabel,
      r.name,
      r.inTime,
      r.outTime,
      r.manPowerFormatted,
      r.manPowerHours.toString(),
      r.yard,
      r.canopyZoneI,
      r.foundryZoneII,
      r.machineShopIII,
      r.remark,
    ]);
    downloadCsv(`Solar_Cleaning_Records_${new Date().toISOString().slice(0, 10)}.csv`, [headers, ...rows]);
  };

  return (
    <div className="space-y-6">
      {/* Intro Header */}
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-border bg-card p-6 shadow-sm md:flex-row md:items-center">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-0.5 font-mono text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
              <Sun size={12} className="text-amber-500" /> Module Report 3.0
            </span>
            <span className="font-mono text-xs text-muted-foreground">Solar Cleaning Intelligence</span>
          </div>
          <h2 className="font-serif text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Solar Panel Cleaning & Monthly Man Power Analytics
          </h2>
          <p className="max-w-2xl text-xs text-muted-foreground sm:text-sm">
            Automatic worker time calculation (<span className="font-mono font-semibold text-foreground">out-time − in-time</span>)
            and monthly consolidated man power reports across all solar panel cleaning zones.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => void loadData()}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border border-border bg-background px-3.5 py-2 text-xs font-semibold hover:bg-muted disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          <button
            onClick={exportMonthlyCsv}
            disabled={loading || !data?.monthlySummaries.length}
            className="flex items-center gap-2 rounded-lg border border-border bg-background px-3.5 py-2 text-xs font-semibold hover:bg-muted disabled:opacity-50"
          >
            <Download size={14} /> Export Monthly (CSV)
          </button>
          <button
            onClick={exportRecordsCsv}
            disabled={loading || !data?.records.length}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow hover:opacity-90 disabled:opacity-50"
          >
            <Download size={14} /> Export Records (CSV)
          </button>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm transition hover:border-primary/40">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="font-mono text-[10px] uppercase tracking-wider">Total Man Power</span>
            <div className="grid size-8 place-items-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Clock size={16} />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-serif text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
              {data?.overall.totalManPowerFormatted || '0m'}
            </span>
          </div>
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">
            {data?.overall.totalManPowerHours ?? 0} hrs total work duration
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-sm transition hover:border-primary/40">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="font-mono text-[10px] uppercase tracking-wider">Cleaning Shifts</span>
            <div className="grid size-8 place-items-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <CalendarDays size={16} />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-serif text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
              {data?.overall.totalShifts ?? 0}
            </span>
            <span className="text-xs text-muted-foreground">shifts</span>
          </div>
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">
            across {data?.overall.activeMonthsCount ?? 0} active months
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-sm transition hover:border-primary/40">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="font-mono text-[10px] uppercase tracking-wider">Active Workers</span>
            <div className="grid size-8 place-items-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Users size={16} />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-serif text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
              {data?.overall.uniqueWorkers ?? 0}
            </span>
            <span className="text-xs text-muted-foreground">cleaners</span>
          </div>
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">
            logged in solar register
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-sm transition hover:border-primary/40">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="font-mono text-[10px] uppercase tracking-wider">Avg Man Power / Shift</span>
            <div className="grid size-8 place-items-center rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400">
              <Sun size={16} />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-serif text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
              {data?.overall.avgManPowerFormatted || '0m'}
            </span>
          </div>
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">
            per worker session
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <form onSubmit={handleSearchSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-12">
          {/* Month Filter */}
          <div className="space-y-1 lg:col-span-3">
            <label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Month Select
            </label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className={inputClass}
            >
              <option value="all">All Months</option>
              {data?.availableMonths.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          {/* Worker Filter */}
          <div className="space-y-1 lg:col-span-3">
            <label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Worker / Cleaner
            </label>
            <select
              value={selectedWorker}
              onChange={(e) => setSelectedWorker(e.target.value)}
              className={inputClass}
            >
              <option value="all">All Workers</option>
              {data?.availableWorkers.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
          </div>

          {/* From Date */}
          <div className="space-y-1 lg:col-span-3">
            <label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              From Date
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className={inputClass}
            />
          </div>

          {/* To Date */}
          <div className="space-y-1 lg:col-span-3">
            <label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              To Date
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className={inputClass}
            />
          </div>

          {/* Search Query */}
          <div className="space-y-1 lg:col-span-10">
            <label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Search Keywords
            </label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search yard, zone, worker, remark..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`${inputClass} pl-9`}
              />
            </div>
          </div>

          {/* Reset / Actions */}
          <div className="flex items-end gap-2 lg:col-span-2">
            <button
              type="submit"
              className="flex h-9 w-full items-center justify-center rounded-lg bg-primary text-xs font-semibold text-primary-foreground hover:opacity-90"
            >
              Apply Filter
            </button>
            {(selectedMonth !== 'all' || selectedWorker !== 'all' || dateFrom || dateTo || searchQuery) && (
              <button
                type="button"
                onClick={handleResetFilters}
                title="Reset filters"
                className="grid size-9 place-items-center rounded-lg border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <XCircle size={16} />
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        <button
          onClick={() => setActiveTab('monthly')}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-bold transition sm:text-sm ${
            activeTab === 'monthly'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <CalendarDays size={16} /> Monthly Man Power Report
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
            {data?.monthlySummaries.length ?? 0}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('workers')}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-bold transition sm:text-sm ${
            activeTab === 'workers'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <User size={16} /> Worker Breakdown
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
            {data?.workerSummaries.length ?? 0}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('records')}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-bold transition sm:text-sm ${
            activeTab === 'records'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Layers size={16} /> Detailed Cleaning Records
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
            {data?.records.length ?? 0}
          </span>
        </button>
      </div>

      {/* Tab Content */}
      {loading ? (
        <div className="flex h-64 items-center justify-center rounded-2xl border border-border bg-card">
          <div className="flex flex-col items-center gap-3">
            <RefreshCw size={24} className="animate-spin text-primary" />
            <span className="font-mono text-xs text-muted-foreground">Calculating solar cleaning man power...</span>
          </div>
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-destructive/20 bg-destructive/10 p-6 text-center text-destructive">
          <p className="font-semibold">{error}</p>
          <button
            onClick={() => void loadData()}
            className="mt-3 rounded-lg bg-destructive px-4 py-1.5 text-xs font-semibold text-destructive-foreground"
          >
            Try Again
          </button>
        </div>
      ) : (
        <>
          {/* TAB 1: MONTHLY MAN POWER REPORT */}
          {activeTab === 'monthly' && (
            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
              <div className="border-b border-border bg-muted/30 px-6 py-4">
                <h3 className="font-serif text-lg font-bold text-foreground">
                  Monthly Man Power Summary
                </h3>
                <p className="text-xs text-muted-foreground">
                  Aggregated man power hours and cleaning shifts grouped by month.
                </p>
              </div>

              {!data?.monthlySummaries.length ? (
                <div className="p-12 text-center text-sm text-muted-foreground">
                  No solar cleaning records found for the selected filters.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-border bg-muted/40 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      <tr>
                        <th className="px-6 py-3.5">Month</th>
                        <th className="px-6 py-3.5">Total Man Power</th>
                        <th className="px-6 py-3.5">Cleaning Shifts</th>
                        <th className="px-6 py-3.5">Active Workers</th>
                        <th className="px-6 py-3.5">Avg Time / Shift</th>
                        <th className="px-6 py-3.5">Zones Cleaned</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {data.monthlySummaries.map((m) => (
                        <tr key={m.monthKey} className="transition-colors hover:bg-muted/30">
                          <td className="px-6 py-4">
                            <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-2.5 py-1 font-mono text-xs font-bold text-amber-700 dark:text-amber-300">
                              <CalendarDays size={12} /> {m.monthLabel}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-baseline gap-2">
                              <span className="font-mono text-base font-extrabold text-foreground">
                                {m.totalManPowerFormatted}
                              </span>
                              <span className="font-mono text-xs text-muted-foreground">
                                ({m.totalManPowerHours}h)
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 font-mono font-medium text-foreground">
                            {m.totalShifts} shifts
                          </td>
                          <td className="px-6 py-4">
                            <div className="space-y-1">
                              <div className="font-semibold text-foreground">
                                {m.workerCount} workers
                              </div>
                              <div className="max-w-xs truncate text-xs text-muted-foreground" title={m.workers.join(', ')}>
                                {m.workers.join(', ')}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 font-mono text-xs text-muted-foreground">
                            {m.avgManPowerFormatted}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-wrap gap-1.5">
                              {m.zonesSummary.yard > 0 && (
                                <span className="rounded bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                                  Yard ({m.zonesSummary.yard})
                                </span>
                              )}
                              {m.zonesSummary.canopyZoneI > 0 && (
                                <span className="rounded bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                                  Canopy ({m.zonesSummary.canopyZoneI})
                                </span>
                              )}
                              {m.zonesSummary.foundryZoneII > 0 && (
                                <span className="rounded bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                                  Foundry ({m.zonesSummary.foundryZoneII})
                                </span>
                              )}
                              {m.zonesSummary.machineShopIII > 0 && (
                                <span className="rounded bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                                  Machine Shop ({m.zonesSummary.machineShopIII})
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t-2 border-border bg-muted/30 font-semibold">
                      <tr>
                        <td className="px-6 py-3.5 font-mono text-xs uppercase text-muted-foreground">Total</td>
                        <td className="px-6 py-3.5 font-mono text-base font-extrabold text-foreground">
                          {data.overall.totalManPowerFormatted}{' '}
                          <span className="text-xs text-muted-foreground font-normal">
                            ({data.overall.totalManPowerHours}h)
                          </span>
                        </td>
                        <td className="px-6 py-3.5 font-mono text-sm text-foreground">
                          {data.overall.totalShifts} shifts
                        </td>
                        <td className="px-6 py-3.5 font-mono text-sm text-foreground">
                          {data.overall.uniqueWorkers} cleaners
                        </td>
                        <td className="px-6 py-3.5 font-mono text-xs text-muted-foreground">
                          {data.overall.avgManPowerFormatted} avg
                        </td>
                        <td className="px-6 py-3.5 text-xs text-muted-foreground">
                          {data.overall.activeMonthsCount} months total
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: WORKER-WISE MAN POWER */}
          {activeTab === 'workers' && (
            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
              <div className="border-b border-border bg-muted/30 px-6 py-4">
                <h3 className="font-serif text-lg font-bold text-foreground">
                  Worker-Wise Man Power Contribution
                </h3>
                <p className="text-xs text-muted-foreground">
                  Individual workers ranked by total cleaning time and shifts completed.
                </p>
              </div>

              {!data?.workerSummaries.length ? (
                <div className="p-12 text-center text-sm text-muted-foreground">
                  No worker records found for the selected filters.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-border bg-muted/40 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      <tr>
                        <th className="px-6 py-3.5">Cleaner / Worker</th>
                        <th className="px-6 py-3.5">Total Man Power</th>
                        <th className="px-6 py-3.5">Shifts Done</th>
                        <th className="px-6 py-3.5">Avg Duration / Shift</th>
                        <th className="px-6 py-3.5">Active Months</th>
                        <th className="px-6 py-3.5">Last Active Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {data.workerSummaries.map((w) => (
                        <tr key={w.name} className="transition-colors hover:bg-muted/30">
                          <td className="px-6 py-4 font-semibold text-foreground">
                            <div className="flex items-center gap-2">
                              <div className="grid size-7 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                                {w.name.charAt(0).toUpperCase()}
                              </div>
                              {w.name}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-baseline gap-2">
                              <span className="font-mono text-base font-extrabold text-foreground">
                                {w.totalManPowerFormatted}
                              </span>
                              <span className="font-mono text-xs text-muted-foreground">
                                ({w.totalManPowerHours}h)
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 font-mono font-medium text-foreground">
                            {w.totalShifts} shifts
                          </td>
                          <td className="px-6 py-4 font-mono text-xs text-muted-foreground">
                            {w.avgManPowerFormatted}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-wrap gap-1">
                              {w.activeMonths.map((m) => (
                                <span key={m} className="rounded bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                                  {m}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-6 py-4 font-mono text-xs text-muted-foreground">
                            {w.lastActiveDate || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: DETAILED CLEANING RECORDS */}
          {activeTab === 'records' && (
            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
              <div className="border-b border-border bg-muted/30 px-6 py-4">
                <h3 className="font-serif text-lg font-bold text-foreground">
                  Individual Solar Cleaning Records
                </h3>
                <p className="text-xs text-muted-foreground">
                  Complete record history showing in-time, out-time, calculated man power, zones, and remarks.
                </p>
              </div>

              {!data?.records.length ? (
                <div className="p-12 text-center text-sm text-muted-foreground">
                  No cleaning records found for the selected filters.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-border bg-muted/40 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3.5">Date</th>
                        <th className="px-4 py-3.5">Worker Name</th>
                        <th className="px-4 py-3.5">In-Time</th>
                        <th className="px-4 py-3.5">Out-Time</th>
                        <th className="px-4 py-3.5">Man Power (Calculated)</th>
                        <th className="px-4 py-3.5">Yard</th>
                        <th className="px-4 py-3.5">Canopy I</th>
                        <th className="px-4 py-3.5">Foundry II</th>
                        <th className="px-4 py-3.5">Machine Shop III</th>
                        <th className="px-4 py-3.5">Remark</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {data.records.map((r) => (
                        <tr key={r.id} className="transition-colors hover:bg-muted/30">
                          <td className="px-4 py-3 font-mono text-xs text-foreground whitespace-nowrap">
                            {r.date}
                          </td>
                          <td className="px-4 py-3 font-semibold text-foreground whitespace-nowrap">
                            {r.name}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                            {r.inTime || '—'}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                            {r.outTime || '—'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2.5 py-1 font-mono text-xs font-bold text-amber-700 dark:text-amber-300">
                              <Clock size={12} /> {r.manPowerFormatted}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">
                            {r.yard || '—'}
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">
                            {r.canopyZoneI || '—'}
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">
                            {r.foundryZoneII || '—'}
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">
                            {r.machineShopIII || '—'}
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground max-w-[200px] truncate" title={r.remark}>
                            {r.remark || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

