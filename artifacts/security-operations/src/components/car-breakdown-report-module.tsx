import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  Car,
  CheckCircle2,
  Clock,
  Download,
  Layers,
  RefreshCw,
  Search,
  Wrench,
  XCircle,
} from 'lucide-react';
import {
  fetchCarBreakdownAnalytics,
  type CarBreakdownAnalyticsReport,
} from '@/lib/car-breakdown-report';
import { downloadCsv } from '@/lib/date-utils';

const inputClass =
  'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15';

type SubReportTab = 'monthly' | 'vehicles' | 'records';

export function CarBreakdownReportModule() {
  const [data, setData] = useState<CarBreakdownAnalyticsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [selectedMonth, setSelectedMonth] = useState('all');
  const [selectedCar, setSelectedCar] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<SubReportTab>('monthly');

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchCarBreakdownAnalytics({
        month: selectedMonth,
        car: selectedCar,
        status: selectedStatus,
        from: dateFrom || undefined,
        to: dateTo || undefined,
        search: searchQuery,
      });
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load car breakdown analytics');
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [selectedMonth, selectedCar, selectedStatus, dateFrom, dateTo]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void loadData();
  };

  const handleResetFilters = () => {
    setSelectedMonth('all');
    setSelectedCar('all');
    setSelectedStatus('all');
    setDateFrom('');
    setDateTo('');
    setSearchQuery('');
  };

  // Export Monthly Summary CSV
  const exportMonthlyCsv = () => {
    if (!data?.monthlySummaries.length) return;
    const headers = [
      'Month',
      'Total Incidents',
      'Total Service Downtime (Formatted)',
      'Total Downtime (Hours)',
      'Avg Downtime / Service',
      'Completed Services',
      'Currently In Service',
      'Unique Vehicles Serviced',
      'Vehicles List',
    ];
    const rows = data.monthlySummaries.map((m) => [
      m.monthLabel,
      m.totalIncidents.toString(),
      m.totalDurationFormatted,
      m.totalDurationHours.toString(),
      m.avgDurationFormatted,
      m.completedCount.toString(),
      m.inServiceCount.toString(),
      m.uniqueCarsCount.toString(),
      m.cars.join('; '),
    ]);
    downloadCsv(`Monthly_Car_Breakdowns_Report_${new Date().toISOString().slice(0, 10)}.csv`, [
      headers,
      ...rows,
    ]);
  };

  // Export Vehicle Summary CSV
  const exportVehicleSummaryCsv = () => {
    if (!data?.vehicleSummaries.length) return;
    const headers = [
      'Vehicle Name',
      'Total Incidents',
      'Total Service Downtime (Formatted)',
      'Total Downtime (Hours)',
      'Avg Downtime / Service',
      'Completed Services',
      'Currently In Service',
      'Last Breakdown Date',
      'Active Months',
    ];
    const rows = data.vehicleSummaries.map((v) => [
      v.carName,
      v.totalIncidents.toString(),
      v.totalDurationFormatted,
      v.totalDurationHours.toString(),
      v.avgDurationFormatted,
      v.completedCount.toString(),
      v.inServiceCount.toString(),
      v.lastBreakdownDate,
      v.activeMonths.join('; '),
    ]);
    downloadCsv(`Vehicle_Breakdown_Reliability_Summary_${new Date().toISOString().slice(0, 10)}.csv`, [
      headers,
      ...rows,
    ]);
  };

  // Export Detailed Records CSV
  const exportRecordsCsv = () => {
    if (!data?.records.length) return;
    const headers = [
      'Date',
      'Vehicle Name',
      'Out Time For Service',
      'Return Date',
      'Return Time After Service',
      'Total Time Consumed In Service',
      'Downtime (Hours)',
      'Status',
      'Remark',
    ];
    const rows = data.records.map((r) => [
      r.date,
      r.carName,
      r.outTime || '—',
      r.inDate || '—',
      r.inTime || '—',
      r.durationFormatted,
      r.durationHours.toString(),
      r.status === 'completed' ? 'Completed' : 'Currently In Service',
      r.remark || '',
    ]);
    downloadCsv(`Car_Breakdown_Detailed_Logs_${new Date().toISOString().slice(0, 10)}.csv`, [
      headers,
      ...rows,
    ]);
  };

  return (
    <div className="space-y-6">
      {/* Intro Header */}
      <div className="flex flex-col justify-between gap-4 border-b border-border pb-5 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-indigo-500/15 px-2.5 py-0.5 font-mono text-[10px] font-extrabold uppercase tracking-widest text-indigo-700 dark:text-indigo-400">
              Report 4.0
            </span>
            <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              Vehicle Maintenance & Monthly Breakdown Analytics
            </span>
          </div>
          <h2 className="mt-1 font-serif text-2xl font-bold tracking-tight sm:text-3xl">
            Car Breakdown Monthly Report
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Comprehensive monthly service downtime, workshop repair duration, vehicle reliability, and breakdown incident logs.
          </p>
        </div>

        {/* Global Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => void loadData()}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border border-border bg-card px-3.5 py-2 text-xs font-semibold text-foreground shadow-sm transition hover:bg-muted disabled:opacity-50 sm:text-sm"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>

          <button
            onClick={exportMonthlyCsv}
            disabled={loading || !data?.monthlySummaries.length}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-600 sm:text-sm"
          >
            <Download size={14} />
            Export Monthly Summary
          </button>

          <button
            onClick={exportRecordsCsv}
            disabled={loading || !data?.records.length}
            className="flex items-center gap-2 rounded-lg border border-border bg-card px-3.5 py-2 text-xs font-semibold text-foreground shadow-sm transition hover:bg-muted disabled:opacity-50 sm:text-sm"
          >
            <Download size={14} />
            Export Incident Logs
          </button>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Incidents */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm transition hover:border-primary/40">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="font-mono text-[10px] uppercase tracking-wider">Breakdown Incidents</span>
            <div className="grid size-8 place-items-center rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
              <Wrench size={16} />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-serif text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
              {data?.overall.totalIncidents ?? 0}
            </span>
            <span className="text-xs text-muted-foreground">services</span>
          </div>
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">
            across {data?.overall.activeMonthsCount ?? 0} active monthly periods
          </p>
        </div>

        {/* Total Service Downtime */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm transition hover:border-primary/40">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="font-mono text-[10px] uppercase tracking-wider">Total Service Downtime</span>
            <div className="grid size-8 place-items-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Clock size={16} />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-serif text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
              {data?.overall.totalDurationFormatted || '0m'}
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              ({data?.overall.totalDurationHours ?? 0} hrs)
            </span>
          </div>
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">
            cumulative repair time consumed
          </p>
        </div>

        {/* In Service / Pending */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm transition hover:border-primary/40">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="font-mono text-[10px] uppercase tracking-wider">Currently In Service</span>
            <div className="grid size-8 place-items-center rounded-lg bg-orange-500/10 text-orange-600 dark:text-orange-400">
              <AlertTriangle size={16} />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-serif text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
              {data?.overall.currentlyInService ?? 0}
            </span>
            <span className="text-xs text-muted-foreground">ongoing</span>
          </div>
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">
            vehicles currently at garage / pending return
          </p>
        </div>

        {/* Unique Vehicles */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm transition hover:border-primary/40">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="font-mono text-[10px] uppercase tracking-wider">Vehicles Serviced</span>
            <div className="grid size-8 place-items-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Car size={16} />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-serif text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
              {data?.overall.uniqueCars ?? 0}
            </span>
            <span className="text-xs text-muted-foreground">unique cars</span>
          </div>
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">
            avg downtime: {data?.overall.avgDurationFormatted || '0m'} / service
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <form onSubmit={handleSearchSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-12">
          {/* Month Filter */}
          <div className="space-y-1 lg:col-span-3">
            <label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Month Selection
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

          {/* Vehicle Filter */}
          <div className="space-y-1 lg:col-span-3">
            <label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Vehicle / Car Name
            </label>
            <select
              value={selectedCar}
              onChange={(e) => setSelectedCar(e.target.value)}
              className={inputClass}
            >
              <option value="all">All Vehicles</option>
              {data?.availableCars.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div className="space-y-1 lg:col-span-2">
            <label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Repair Status
            </label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className={inputClass}
            >
              <option value="all">All Statuses</option>
              <option value="completed">Completed</option>
              <option value="in_service">In Service (Pending)</option>
            </select>
          </div>

          {/* Date From */}
          <div className="space-y-1 lg:col-span-2">
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

          {/* Date To */}
          <div className="space-y-1 lg:col-span-2">
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
              <Search size={14} className="absolute left-3 top-3 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search vehicle name, repair description, or remarks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`${inputClass} pl-8`}
              />
            </div>
          </div>

          {/* Filter Actions */}
          <div className="flex items-end gap-2 lg:col-span-2">
            <button
              type="submit"
              className="flex w-full items-center justify-center rounded-lg bg-primary py-2 text-xs font-semibold text-primary-foreground shadow-sm hover:opacity-90"
            >
              Apply Filter
            </button>
            {(selectedMonth !== 'all' || selectedCar !== 'all' || selectedStatus !== 'all' || dateFrom || dateTo || searchQuery) && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="flex items-center justify-center rounded-lg border border-border bg-card p-2 text-muted-foreground hover:bg-muted"
                title="Reset filters"
              >
                <XCircle size={15} />
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('monthly')}
            className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition sm:text-sm ${
              activeTab === 'monthly'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            <CalendarDays size={15} />
            Monthly Breakdown Report
            <span className="rounded-full bg-primary/20 px-1.5 py-0.2 text-[10px]">
              {data?.monthlySummaries.length ?? 0}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('vehicles')}
            className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition sm:text-sm ${
              activeTab === 'vehicles'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            <Car size={15} />
            Vehicle Downtime Summary
            <span className="rounded-full bg-primary/20 px-1.5 py-0.2 text-[10px]">
              {data?.vehicleSummaries.length ?? 0}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('records')}
            className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition sm:text-sm ${
              activeTab === 'records'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            <Layers size={15} />
            Detailed Breakdown Logs
            <span className="rounded-full bg-primary/20 px-1.5 py-0.2 text-[10px]">
              {data?.records.length ?? 0}
            </span>
          </button>
        </div>

        {activeTab === 'vehicles' && (
          <button
            onClick={exportVehicleSummaryCsv}
            disabled={loading || !data?.vehicleSummaries.length}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Download size={13} />
            Export Vehicle CSV
          </button>
        )}
      </div>

      {/* Main Tab Content */}
      {loading ? (
        <div className="space-y-3 p-8">
          <div className="h-8 w-1/3 animate-pulse rounded bg-muted" />
          <div className="h-64 animate-pulse rounded-xl bg-muted" />
        </div>
      ) : error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center">
          <AlertTriangle className="mx-auto size-8 text-destructive" />
          <p className="mt-2 text-sm font-semibold text-destructive">{error}</p>
          <button
            onClick={() => void loadData()}
            className="mt-3 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
          >
            Try Again
          </button>
        </div>
      ) : (
        <>
          {/* TAB 1: MONTHLY BREAKDOWN SUMMARY */}
          {activeTab === 'monthly' && (
            <div className="space-y-4">
              {!data?.monthlySummaries.length ? (
                <div className="rounded-xl border border-border bg-card p-12 text-center text-muted-foreground">
                  <CalendarDays className="mx-auto size-10 opacity-30" />
                  <p className="mt-3 text-base font-semibold">No Breakdown Records Found For This Period</p>
                  <p className="mt-1 text-xs">
                    Car breakdown entries logged in the Security module will automatically be aggregated here month-by-month.
                  </p>
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="border-b border-border bg-muted/40 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                        <tr>
                          <th className="px-4 py-3">Month</th>
                          <th className="px-4 py-3 text-center">Total Incidents</th>
                          <th className="px-4 py-3">Total Service Downtime</th>
                          <th className="px-4 py-3">Avg Downtime / Service</th>
                          <th className="px-4 py-3 text-center">Completed</th>
                          <th className="px-4 py-3 text-center">In Service</th>
                          <th className="px-4 py-3 text-center">Cars Affected</th>
                          <th className="px-4 py-3">Vehicles Involved</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {data.monthlySummaries.map((m) => (
                          <tr key={m.monthKey} className="transition hover:bg-muted/30">
                            <td className="px-4 py-3.5 font-semibold text-foreground">
                              {m.monthLabel}
                            </td>
                            <td className="px-4 py-3.5 text-center font-bold">
                              <span className="rounded-md bg-indigo-500/10 px-2 py-0.5 text-xs font-bold text-indigo-700 dark:text-indigo-300">
                                {m.totalIncidents}
                              </span>
                            </td>
                            <td className="px-4 py-3.5">
                              <div className="flex items-center gap-1.5 font-bold text-amber-700 dark:text-amber-400">
                                <Clock size={14} />
                                <span>{m.totalDurationFormatted}</span>
                              </div>
                              <span className="font-mono text-[10px] text-muted-foreground">
                                {m.totalDurationHours} total hours
                              </span>
                            </td>
                            <td className="px-4 py-3.5 font-mono text-xs">
                              {m.avgDurationFormatted}
                            </td>
                            <td className="px-4 py-3.5 text-center">
                              <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                                {m.completedCount}
                              </span>
                            </td>
                            <td className="px-4 py-3.5 text-center">
                              {m.inServiceCount > 0 ? (
                                <span className="rounded bg-orange-500/15 px-2 py-0.5 text-xs font-bold text-orange-700 dark:text-orange-400">
                                  {m.inServiceCount} active
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3.5 text-center font-semibold text-muted-foreground">
                              {m.uniqueCarsCount}
                            </td>
                            <td className="max-w-xs px-4 py-3.5 text-xs text-muted-foreground">
                              <div className="flex flex-wrap gap-1">
                                {m.cars.map((car) => (
                                  <span
                                    key={car}
                                    className="rounded border border-border bg-background px-1.5 py-0.5 text-[11px] text-foreground"
                                  >
                                    {car}
                                  </span>
                                ))}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: VEHICLE DOWNTIME SUMMARY */}
          {activeTab === 'vehicles' && (
            <div className="space-y-4">
              {!data?.vehicleSummaries.length ? (
                <div className="rounded-xl border border-border bg-card p-12 text-center text-muted-foreground">
                  <Car className="mx-auto size-10 opacity-30" />
                  <p className="mt-3 text-base font-semibold">No Vehicle Breakdown Records</p>
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="border-b border-border bg-muted/40 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                        <tr>
                          <th className="px-4 py-3">Vehicle Name</th>
                          <th className="px-4 py-3 text-center">Total Incidents</th>
                          <th className="px-4 py-3">Total Service Downtime</th>
                          <th className="px-4 py-3">Avg Downtime / Repair</th>
                          <th className="px-4 py-3 text-center">Completed</th>
                          <th className="px-4 py-3 text-center">Current Status</th>
                          <th className="px-4 py-3">Last Breakdown Date</th>
                          <th className="px-4 py-3">Active Months</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {data.vehicleSummaries.map((v) => (
                          <tr key={v.carName} className="transition hover:bg-muted/30">
                            <td className="px-4 py-3.5 font-bold text-foreground">
                              <div className="flex items-center gap-2">
                                <Car size={15} className="text-muted-foreground" />
                                <span>{v.carName}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3.5 text-center font-bold">
                              <span className="rounded-md bg-indigo-500/10 px-2 py-0.5 text-xs font-bold text-indigo-700 dark:text-indigo-300">
                                {v.totalIncidents}
                              </span>
                            </td>
                            <td className="px-4 py-3.5">
                              <div className="flex items-center gap-1.5 font-bold text-amber-700 dark:text-amber-400">
                                <Clock size={14} />
                                <span>{v.totalDurationFormatted}</span>
                              </div>
                              <span className="font-mono text-[10px] text-muted-foreground">
                                {v.totalDurationHours} total hrs
                              </span>
                            </td>
                            <td className="px-4 py-3.5 font-mono text-xs">
                              {v.avgDurationFormatted}
                            </td>
                            <td className="px-4 py-3.5 text-center font-semibold text-emerald-600 dark:text-emerald-400">
                              {v.completedCount}
                            </td>
                            <td className="px-4 py-3.5 text-center">
                              {v.inServiceCount > 0 ? (
                                <span className="inline-flex items-center gap-1 rounded bg-orange-500/15 px-2 py-0.5 text-xs font-bold text-orange-700 dark:text-orange-400">
                                  <AlertTriangle size={12} /> In Workshop
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                                  <CheckCircle2 size={12} /> Available
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3.5 font-mono text-xs text-muted-foreground">
                              {v.lastBreakdownDate}
                            </td>
                            <td className="max-w-xs px-4 py-3.5 text-xs text-muted-foreground">
                              {v.activeMonths.join(', ') || '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: DETAILED BREAKDOWN INCIDENT LOGS */}
          {activeTab === 'records' && (
            <div className="space-y-4">
              {!data?.records.length ? (
                <div className="rounded-xl border border-border bg-card p-12 text-center text-muted-foreground">
                  <Layers className="mx-auto size-10 opacity-30" />
                  <p className="mt-3 text-base font-semibold">No Breakdown Incidents Found</p>
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="border-b border-border bg-muted/40 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                        <tr>
                          <th className="px-4 py-3">Date</th>
                          <th className="px-4 py-3">Vehicle Name</th>
                          <th className="px-4 py-3">Out Time</th>
                          <th className="px-4 py-3">Return Date</th>
                          <th className="px-4 py-3">Return Time</th>
                          <th className="px-4 py-3">Total Time Consumed</th>
                          <th className="px-4 py-3 text-center">Status</th>
                          <th className="px-4 py-3">Remarks / Garage Notes</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {data.records.map((r) => (
                          <tr key={r.id} className="transition hover:bg-muted/30">
                            <td className="px-4 py-3 font-mono text-xs font-semibold text-foreground">
                              {r.date}
                            </td>
                            <td className="px-4 py-3 font-semibold text-foreground">
                              {r.carName}
                            </td>
                            <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                              {r.outTime || '—'}
                            </td>
                            <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                              {r.inDate || (r.inTime ? r.date : '—')}
                            </td>
                            <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                              {r.inTime || '—'}
                            </td>
                            <td className="px-4 py-3">
                              {r.status === 'completed' ? (
                                <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-2 py-0.5 font-bold text-amber-700 dark:text-amber-400">
                                  <Clock size={12} />
                                  {r.durationFormatted}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded bg-orange-500/15 px-2 py-0.5 text-xs font-semibold text-orange-700 dark:text-orange-400">
                                  <AlertTriangle size={12} />
                                  In Service
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {r.status === 'completed' ? (
                                <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                                  <CheckCircle2 size={12} /> Completed
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded bg-orange-500/15 px-2 py-0.5 text-xs font-bold text-orange-700 dark:text-orange-400">
                                  <AlertTriangle size={12} /> Ongoing
                                </span>
                              )}
                            </td>
                            <td className="max-w-xs px-4 py-3 text-xs text-muted-foreground">
                              {r.remark || '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

