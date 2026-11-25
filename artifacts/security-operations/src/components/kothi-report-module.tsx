import { useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  CalendarDays,
  Clock,
  Download,
  Filter,
  Home,
  Moon,
  RefreshCw,
  Search,
  Sun,
  User,
  Users,
  XCircle,
  CheckCircle2,
  AlertCircle,
  Briefcase,
} from 'lucide-react';
import {
  fetchKothiAttendanceReport,
  type KothiAttendanceReportResponse,
  type KothiPersonSummary,
  type KothiAttendanceRecordItem,
} from '@/lib/kothi-report';
import { downloadCsv } from '@/lib/date-utils';

const inputClass =
  'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15';

type SubReportTab = 'summary' | 'records' | 'monthly';

export function KothiReportModule() {
  const [data, setData] = useState<KothiAttendanceReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [selectedMonth, setSelectedMonth] = useState('all');
  const [selectedPerson, setSelectedPerson] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<SubReportTab>('summary');

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchKothiAttendanceReport({
        month: selectedMonth,
        person: selectedPerson,
        from: dateFrom || undefined,
        to: dateTo || undefined,
        search: searchQuery,
      });
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Kothi attendance report');
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [selectedMonth, selectedPerson, dateFrom, dateTo]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void loadData();
  };

  const handleResetFilters = () => {
    setSelectedMonth('all');
    setSelectedPerson('all');
    setDateFrom('');
    setDateTo('');
    setSearchQuery('');
  };

  const handleFilterSpecificPerson = (personName: string) => {
    setSelectedPerson(personName);
    setActiveTab('records');
  };

  // Export Person Day Counts Summary CSV
  const exportPersonSummaryCsv = () => {
    if (!data?.personSummaries.length) return;
    const headers = [
      'Person Name',
      'Total Days Worked (Day Count)',
      'Total Entries',
      'Morning Shifts',
      'Evening Shifts',
      'Both Shifts (Full Days)',
      'Single Shift Days',
      'Total Working Duration',
      'Total Working Hours',
      'Avg Hours / Day',
      'First Date',
      'Last Date',
      'Active Months',
    ];
    const rows = data.personSummaries.map((p) => [
      p.name,
      p.totalDays.toString(),
      p.totalEntries.toString(),
      p.morningShifts.toString(),
      p.eveningShifts.toString(),
      p.bothShifts.toString(),
      p.singleShiftDays.toString(),
      p.totalHoursFormatted,
      p.totalHours.toString(),
      p.avgHoursPerDayFormatted,
      p.firstDate,
      p.lastDate,
      p.activeMonths.join('; '),
    ]);
    downloadCsv(`Kothi_Attendance_Person_Day_Counts_${new Date().toISOString().slice(0, 10)}.csv`, [
      headers,
      ...rows,
    ]);
  };

  // Export Detailed Records CSV
  const exportRecordsCsv = () => {
    if (!data?.records.length) return;
    const headers = [
      'Date',
      'Month',
      'Person Name',
      'Morning In-Time',
      'Morning Out-Time',
      'Morning Duration',
      'Evening In-Time',
      'Evening Out-Time',
      'Evening Duration',
      'Total Day Duration',
      'Total Day Hours',
      'Shift Status',
      'Security Sign',
    ];
    const rows = data.records.map((r) => [
      r.date,
      r.monthLabel,
      r.name,
      r.morningInTime,
      r.morningOutTime,
      r.morningDurationFormatted,
      r.eveningInTime,
      r.eveningOutTime,
      r.eveningDurationFormatted,
      r.totalHoursFormatted,
      r.totalHours.toString(),
      r.shiftStatus,
      r.signOfSecurity,
    ]);
    downloadCsv(`Kothi_Attendance_Detailed_Log_${new Date().toISOString().slice(0, 10)}.csv`, [
      headers,
      ...rows,
    ]);
  };

  const getShiftBadge = (status: KothiAttendanceRecordItem['shiftStatus']) => {
    switch (status) {
      case 'Both Shifts (Full Day)':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 size={12} /> Full Day (Both Shifts)
          </span>
        );
      case 'Morning Only':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/15 px-2.5 py-0.5 text-xs font-semibold text-blue-700 dark:text-blue-300">
            <Sun size={12} /> Morning Only
          </span>
        );
      case 'Evening Only':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/15 px-2.5 py-0.5 text-xs font-semibold text-purple-700 dark:text-purple-300">
            <Moon size={12} /> Evening Only
          </span>
        );
      case 'Morning Incomplete':
      case 'Evening Incomplete':
      case 'Incomplete':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
            <AlertCircle size={12} /> {status}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-500/15 px-2.5 py-0.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6" data-testid="kothi-attendance-report-module">
      {/* Intro Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary">
            <Home size={15} /> Kothi Household Operations
          </div>
          <h2 className="text-xl font-black tracking-tight text-foreground sm:text-2xl">
            Kothi Attendance & Day Count Report
          </h2>
          <p className="text-sm text-muted-foreground">
            Complete details of Kothi attendance, distinct day count of every household staff member, shift timings, and total hours worked.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={exportPersonSummaryCsv}
            disabled={!data?.personSummaries?.length}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-bold text-foreground shadow-sm hover:bg-muted disabled:opacity-50 transition"
            title="Export person day count summary as CSV"
            data-testid="export-person-summary-csv"
          >
            <Download size={14} /> Export Day Counts (CSV)
          </button>
          <button
            onClick={exportRecordsCsv}
            disabled={!data?.records?.length}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-bold text-foreground shadow-sm hover:bg-muted disabled:opacity-50 transition"
            title="Export full attendance records as CSV"
            data-testid="export-records-csv"
          >
            <Download size={14} /> Export All Logs (CSV)
          </button>
          <button
            onClick={() => void loadData()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground shadow-sm hover:bg-primary/90 transition"
            title="Refresh data"
            data-testid="refresh-kothi-report"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* Filter Controls */}
      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <Filter size={13} /> Filters & Search
          </div>
          {(selectedMonth !== 'all' || selectedPerson !== 'all' || dateFrom || dateTo || searchQuery) && (
            <button
              onClick={handleResetFilters}
              className="flex items-center gap-1 text-xs font-semibold text-rose-500 hover:text-rose-600 transition"
            >
              <XCircle size={14} /> Clear filters
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
          {/* Month selector */}
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">Month</label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className={inputClass}
              data-testid="kothi-filter-month"
            >
              <option value="all">All Months</option>
              {data?.availableMonths.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          {/* Person selector */}
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">Person</label>
            <select
              value={selectedPerson}
              onChange={(e) => setSelectedPerson(e.target.value)}
              className={inputClass}
              data-testid="kothi-filter-person"
            >
              <option value="all">All Staff Members</option>
              {data?.availablePersons.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          {/* Date from */}
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">From Date</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className={inputClass}
              data-testid="kothi-filter-from"
            />
          </div>

          {/* Date to */}
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">To Date</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className={inputClass}
              data-testid="kothi-filter-to"
            />
          </div>

          {/* Search box */}
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">Search</label>
            <form onSubmit={handleSearchSubmit} className="relative">
              <input
                type="text"
                placeholder="Name, date, status..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`${inputClass} pr-8`}
                data-testid="kothi-filter-search"
              />
              <button
                type="submit"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <Search size={14} />
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      {data && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm" data-testid="kpi-total-person-days">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Total Day Count
              </span>
              <div className="flex size-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <CalendarDays size={16} />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-foreground">{data.overall.totalPersonDays}</span>
              <span className="text-xs font-semibold text-muted-foreground">Person-Days</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Distinct attended days across all {data.overall.uniquePersons} staff members
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm" data-testid="kpi-unique-persons">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Staff Members
              </span>
              <div className="flex size-8 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <Users size={16} />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-foreground">{data.overall.uniquePersons}</span>
              <span className="text-xs font-semibold text-muted-foreground">Staff recorded</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Avg {data.overall.avgHoursPerDayFormatted} worked per attended day
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm" data-testid="kpi-total-hours">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Total Hours Worked
              </span>
              <div className="flex size-8 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                <Clock size={16} />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-foreground">{data.overall.totalHoursFormatted}</span>
              <span className="text-xs font-semibold text-muted-foreground">({data.overall.totalHours} hrs)</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Combined morning and evening shift hours
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm" data-testid="kpi-shifts-breakdown">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Shifts Completed
              </span>
              <div className="flex size-8 items-center justify-center rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
                <Briefcase size={16} />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-foreground">{data.overall.totalRecords}</span>
              <span className="text-xs font-semibold text-muted-foreground">Entries</span>
            </div>
            <div className="mt-1 flex items-center gap-2 text-[11px] font-semibold text-muted-foreground">
              <span className="text-blue-600 dark:text-blue-400">☀️ {data.overall.totalMorningShifts} Morn</span>
              <span>•</span>
              <span className="text-purple-600 dark:text-purple-400">🌙 {data.overall.totalEveningShifts} Eve</span>
              <span>•</span>
              <span className="text-emerald-600 dark:text-emerald-400">🌟 {data.overall.totalBothShiftsDays} Full</span>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-border pb-2">
        <button
          onClick={() => setActiveTab('summary')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition sm:text-sm ${
            activeTab === 'summary'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
          data-testid="tab-kothi-person-summary"
        >
          <Users size={15} /> Person Summary & Day Counts ({data?.personSummaries?.length ?? 0})
        </button>

        <button
          onClick={() => setActiveTab('records')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition sm:text-sm ${
            activeTab === 'records'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
          data-testid="tab-kothi-detailed-records"
        >
          <Calendar size={15} /> Detailed Attendance Logs ({data?.records?.length ?? 0})
        </button>

        <button
          onClick={() => setActiveTab('monthly')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition sm:text-sm ${
            activeTab === 'monthly'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
          data-testid="tab-kothi-monthly-summary"
        >
          <CalendarDays size={15} /> Monthly Analytics ({data?.monthlySummaries?.length ?? 0})
        </button>
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm font-semibold text-destructive">
          {error}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center p-12 text-sm text-muted-foreground">
          <RefreshCw size={18} className="mr-2 animate-spin text-primary" /> Loading Kothi attendance report...
        </div>
      )}

      {/* Tab 1: Person Summary & Day Counts */}
      {!loading && activeTab === 'summary' && (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="border-b border-border bg-muted/40 px-5 py-3.5">
            <h3 className="text-sm font-bold text-foreground">
              Household Staff Day Count & Working Hours Summary
            </h3>
            <p className="text-xs text-muted-foreground">
              Total distinct days present, shift counts (morning & evening), total hours, and average daily hours per staff member.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs" data-testid="table-kothi-person-summary">
              <thead>
                <tr className="border-b border-border bg-muted/20 text-muted-foreground">
                  <th className="px-4 py-3 font-bold">Staff Member</th>
                  <th className="px-4 py-3 font-bold text-center">Day Count (Days Present)</th>
                  <th className="px-4 py-3 font-bold text-center">Morning Shifts</th>
                  <th className="px-4 py-3 font-bold text-center">Evening Shifts</th>
                  <th className="px-4 py-3 font-bold text-center">Full Days (Both Shifts)</th>
                  <th className="px-4 py-3 font-bold text-right">Total Duration</th>
                  <th className="px-4 py-3 font-bold text-right">Avg Hours / Day</th>
                  <th className="px-4 py-3 font-bold">Period Active</th>
                  <th className="px-4 py-3 font-bold text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(!data?.personSummaries || data.personSummaries.length === 0) ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                      No Kothi attendance records found matching current filters.
                    </td>
                  </tr>
                ) : (
                  data.personSummaries.map((person) => (
                    <tr
                      key={person.name}
                      className="hover:bg-muted/40 transition group"
                      data-testid={`row-person-${person.name}`}
                    >
                      <td className="px-4 py-3 font-bold text-foreground">
                        <div className="flex items-center gap-2">
                          <div className="flex size-7 items-center justify-center rounded-full bg-primary/10 text-primary font-black text-xs">
                            {person.name.slice(0, 1).toUpperCase()}
                          </div>
                          <span>{person.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-3 py-1 font-extrabold text-emerald-700 dark:text-emerald-300">
                          <CheckCircle2 size={12} /> {person.totalDays} Days
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center font-semibold text-blue-600 dark:text-blue-400">
                        {person.morningShifts}
                      </td>
                      <td className="px-4 py-3 text-center font-semibold text-purple-600 dark:text-purple-400">
                        {person.eveningShifts}
                      </td>
                      <td className="px-4 py-3 text-center font-semibold text-emerald-600 dark:text-emerald-400">
                        {person.bothShifts}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-foreground">
                        <div>{person.totalHoursFormatted}</div>
                        <div className="text-[10px] font-normal text-muted-foreground">({person.totalHours} hrs)</div>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-muted-foreground">
                        {person.avgHoursPerDayFormatted}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        <div className="font-mono text-[11px]">{person.firstDate} to {person.lastDate}</div>
                        <div className="text-[10px]">{person.activeMonths.join(', ')}</div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => handleFilterSpecificPerson(person.name)}
                          className="rounded-lg border border-border bg-background px-2.5 py-1 text-[11px] font-bold text-foreground hover:bg-muted hover:text-primary transition"
                          title={`View all logs for ${person.name}`}
                        >
                          View Logs ↗
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Detailed Attendance Logs */}
      {!loading && activeTab === 'records' && (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="border-b border-border bg-muted/40 px-5 py-3.5 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-foreground">
                Detailed Kothi Attendance Register Logs
              </h3>
              <p className="text-xs text-muted-foreground">
                Individual attendance punches with morning and evening shift in/out times and calculated daily durations.
              </p>
            </div>
            {selectedPerson !== 'all' && (
              <button
                onClick={() => setSelectedPerson('all')}
                className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"
              >
                Showing logs for: <span className="underline">{selectedPerson}</span> (Clear)
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs" data-testid="table-kothi-detailed-records">
              <thead>
                <tr className="border-b border-border bg-muted/20 text-muted-foreground">
                  <th className="px-4 py-3 font-bold">Date</th>
                  <th className="px-4 py-3 font-bold">Staff Member</th>
                  <th className="px-4 py-3 font-bold">Morning Shift</th>
                  <th className="px-4 py-3 font-bold">Evening Shift</th>
                  <th className="px-4 py-3 font-bold text-right">Total Duration</th>
                  <th className="px-4 py-3 font-bold text-center">Status</th>
                  <th className="px-4 py-3 font-bold">Security Sign</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(!data?.records || data.records.length === 0) ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                      No attendance records found matching current filters.
                    </td>
                  </tr>
                ) : (
                  data.records.map((rec) => (
                    <tr key={rec.id} className="hover:bg-muted/40 transition">
                      <td className="px-4 py-3 font-mono font-bold text-foreground">
                        {rec.date}
                      </td>
                      <td className="px-4 py-3 font-semibold text-foreground">
                        {rec.name}
                      </td>
                      <td className="px-4 py-3">
                        {rec.morningInTime || rec.morningOutTime ? (
                          <div>
                            <span className="font-mono text-muted-foreground">
                              {rec.morningInTime || '--'} - {rec.morningOutTime || '--'}
                            </span>
                            {rec.morningMinutes > 0 && (
                              <span className="ml-2 font-bold text-blue-600 dark:text-blue-400">
                                ({rec.morningDurationFormatted})
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground/60">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {rec.eveningInTime || rec.eveningOutTime ? (
                          <div>
                            <span className="font-mono text-muted-foreground">
                              {rec.eveningInTime || '--'} - {rec.eveningOutTime || '--'}
                            </span>
                            {rec.eveningMinutes > 0 && (
                              <span className="ml-2 font-bold text-purple-600 dark:text-purple-400">
                                ({rec.eveningDurationFormatted})
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground/60">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-foreground">
                        <div>{rec.totalHoursFormatted}</div>
                        <div className="text-[10px] font-normal text-muted-foreground">({rec.totalHours} hrs)</div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {getShiftBadge(rec.shiftStatus)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {rec.signOfSecurity || '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Monthly Analytics */}
      {!loading && activeTab === 'monthly' && (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="border-b border-border bg-muted/40 px-5 py-3.5">
            <h3 className="text-sm font-bold text-foreground">
              Monthly Attendance & Manpower Analytics
            </h3>
            <p className="text-xs text-muted-foreground">
              Month-over-month person-day totals, staff counts, morning vs evening shifts, and total hours logged.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs" data-testid="table-kothi-monthly-summary">
              <thead>
                <tr className="border-b border-border bg-muted/20 text-muted-foreground">
                  <th className="px-4 py-3 font-bold">Month</th>
                  <th className="px-4 py-3 font-bold text-center">Person-Days Worked</th>
                  <th className="px-4 py-3 font-bold text-center">Unique Staff Members</th>
                  <th className="px-4 py-3 font-bold text-center">Morning Shifts</th>
                  <th className="px-4 py-3 font-bold text-center">Evening Shifts</th>
                  <th className="px-4 py-3 font-bold text-right">Total Hours</th>
                  <th className="px-4 py-3 font-bold text-right">Avg Hours / Staff</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(!data?.monthlySummaries || data.monthlySummaries.length === 0) ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                      No monthly summary available.
                    </td>
                  </tr>
                ) : (
                  data.monthlySummaries.map((m) => (
                    <tr key={m.monthKey} className="hover:bg-muted/40 transition">
                      <td className="px-4 py-3 font-bold text-foreground">
                        {m.monthLabel}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 font-bold text-emerald-700 dark:text-emerald-300">
                          {m.totalPersonDays} Person-Days
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center font-bold text-foreground">
                        {m.uniquePersons}
                      </td>
                      <td className="px-4 py-3 text-center font-semibold text-blue-600 dark:text-blue-400">
                        {m.morningShiftsCount}
                      </td>
                      <td className="px-4 py-3 text-center font-semibold text-purple-600 dark:text-purple-400">
                        {m.eveningShiftsCount}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-foreground">
                        <div>{m.totalHoursFormatted}</div>
                        <div className="text-[10px] font-normal text-muted-foreground">({m.totalHours} hrs)</div>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-muted-foreground">
                        {m.avgHoursPerPerson} hrs
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
