import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Calendar,
  CalendarDays,
  Car,
  CheckCircle2,
  Clock,
  Download,
  Filter,
  Gauge,
  MapPin,
  Phone,
  RefreshCw,
  Search,
  Sparkles,
  User,
  Users,
  X,
  XCircle,
} from "lucide-react";
import {
  fetchDriverComprehensiveReport,
  type DriverComprehensiveReport,
  type DriverConsolidatedSummary,
} from "@/lib/vehicle-report";
import { downloadCsv, indiaDateKey } from "@/lib/date-utils";

const inputClass =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15";

export function DriverComprehensiveReportView() {
  const todayStr = indiaDateKey(new Date());
  const monthStartStr = `${todayStr.slice(0, 7)}-01`;

  const [from, setFrom] = useState(monthStartStr);
  const [to, setTo] = useState(todayStr);
  const [selectedDriver, setSelectedDriver] = useState("ALL");
  const [activityFilter, setActivityFilter] = useState<
    "all" | "with_trips" | "zero_trips" | "multi_trips"
  >("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"summary" | "daily">("summary");
  const [detailModalDriver, setDetailModalDriver] =
    useState<DriverConsolidatedSummary | null>(null);

  const [report, setReport] = useState<DriverComprehensiveReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadData = async (
    nextFrom = from,
    nextTo = to,
    nextDriver = selectedDriver,
  ) => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchDriverComprehensiveReport({
        from: nextFrom,
        to: nextTo,
        driver: nextDriver !== "ALL" ? nextDriver : undefined,
      });
      setReport(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load driver report",
      );
      setReport(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  // Quick Date Range Helpers
  const setQuickRange = (
    type: "today" | "yesterday" | "last7" | "thisMonth" | "lastMonth",
  ) => {
    const now = new Date();
    const today = indiaDateKey(now);
    let nextFrom = today;
    let nextTo = today;

    if (type === "today") {
      nextFrom = today;
      nextTo = today;
    } else if (type === "yesterday") {
      const y = new Date(now.getTime() - 86400000);
      nextFrom = indiaDateKey(y);
      nextTo = nextFrom;
    } else if (type === "last7") {
      const past = new Date(now.getTime() - 6 * 86400000);
      nextFrom = indiaDateKey(past);
      nextTo = today;
    } else if (type === "thisMonth") {
      nextFrom = `${today.slice(0, 7)}-01`;
      nextTo = today;
    } else if (type === "lastMonth") {
      const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDayOfPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0);
      nextFrom = indiaDateKey(prevMonthDate);
      nextTo = indiaDateKey(lastDayOfPrevMonth);
    }

    setFrom(nextFrom);
    setTo(nextTo);
    void loadData(nextFrom, nextTo, selectedDriver);
  };

  const query = searchQuery.trim().toLowerCase();

  // Filtered Driver Summaries
  const filteredDriverSummaries = useMemo(() => {
    if (!report?.driverSummaries) return [];
    return report.driverSummaries.filter((d) => {
      // Activity filter
      if (activityFilter === "with_trips" && d.totalTrips === 0) return false;
      if (activityFilter === "zero_trips" && d.daysIdleNoTrips === 0)
        return false;
      if (
        activityFilter === "multi_trips" &&
        d.days2Trips + d.days3PlusTrips === 0
      )
        return false;

      // Search query
      if (query) {
        const matchName = d.driverName.toLowerCase().includes(query);
        const matchPhone = d.phone.includes(query);
        const matchLoc = d.workLocation.toLowerCase().includes(query);
        const matchSuper = d.supervisor.toLowerCase().includes(query);
        if (!matchName && !matchPhone && !matchLoc && !matchSuper) return false;
      }
      return true;
    });
  }, [report?.driverSummaries, activityFilter, query]);

  // Filtered Daily Records
  const filteredDailyRecords = useMemo(() => {
    if (!report?.allDailyRecords) return [];
    return report.allDailyRecords.filter((rec) => {
      // Driver filter
      if (
        selectedDriver !== "ALL" &&
        rec.driverName.toLowerCase() !== selectedDriver.toLowerCase()
      ) {
        return false;
      }

      // Activity filter
      if (activityFilter === "with_trips" && rec.tripCount === 0) return false;
      if (
        activityFilter === "zero_trips" &&
        (!rec.isPresent || rec.tripCount > 0)
      )
        return false;
      if (activityFilter === "multi_trips" && rec.tripCount < 2) return false;

      // Search query
      if (query) {
        const matchName = rec.driverName.toLowerCase().includes(query);
        const matchDate =
          rec.dateFormatted.includes(query) || rec.date.includes(query);
        const matchTrips = rec.trips.some(
          (t) =>
            t.carName.toLowerCase().includes(query) ||
            t.station.toLowerCase().includes(query) ||
            t.stationName.toLowerCase().includes(query) ||
            t.personInCar.toLowerCase().includes(query),
        );
        if (!matchName && !matchDate && !matchTrips) return false;
      }
      return true;
    });
  }, [report?.allDailyRecords, selectedDriver, activityFilter, query]);

  // CSV Export: Driver Summaries
  const exportDriverSummaryCsv = () => {
    if (!filteredDriverSummaries.length) return;
    const headers = [
      "Driver Name",
      "Phone",
      "Supervisor",
      "Days Present in Company",
      "Duty Days with Trips",
      "Days Present with 0 Trips (Idle)",
      "Days with 1 Trip",
      "Days with 2 Trips",
      "Days with 3+ Trips",
      "Total Trips Completed",
      "Total KM Run",
      "Local KM",
      "Out Station KM",
      "Unit 2 KM",
      "Company Presence Hours",
      "Vehicle Driving Hours",
      "Trip Utilization %",
      "Avg KM / Trip",
    ];
    const rows = filteredDriverSummaries.map((d) => [
      d.driverName,
      d.phone || "—",
      d.supervisor || "—",
      d.daysPresent.toString(),
      d.daysWithTrips.toString(),
      d.daysIdleNoTrips.toString(),
      d.days1Trip.toString(),
      d.days2Trips.toString(),
      d.days3PlusTrips.toString(),
      d.totalTrips.toString(),
      d.totalKm.toString(),
      d.localKm.toString(),
      d.outStationKm.toString(),
      d.unit2Km.toString(),
      d.totalPresenceFormatted,
      d.totalDrivingFormatted,
      `${d.utilizationRate}%`,
      d.avgKmPerTrip.toString(),
    ]);
    downloadCsv(`Driver_Summary_Report_${from}_to_${to}.csv`, [
      headers,
      ...rows,
    ]);
  };

  // CSV Export: Daily Breakdown
  const exportDailyManifestCsv = () => {
    if (!filteredDailyRecords.length) return;
    const headers = [
      "Date",
      "Driver Name",
      "Phone",
      "Present in Company",
      "Punch In Time",
      "Date of In Time",
      "Punch Out Time",
      "Date of Out Time",
      "Shift Duration in Office",
      "Daily Trip Count",
      "Trip Activity Status",
      "Total KM Today",
      "Driving Time Today",
      "Trip Details (Vehicles / Destinations / Timings / KM / Passengers)",
    ];
    const rows = filteredDailyRecords.map((r) => {
      const tripSummary = r.trips
        .map(
          (t, idx) =>
            `Trip ${idx + 1}: ${t.carName} to ${t.station} (${t.stationName}) | Out: ${t.outTime || "—"}, In: ${t.inTime || "—"} | KM: ${t.kmRun} | Passenger: ${t.personInCar}`,
        )
        .join("; ");

      return [
        r.dateFormatted,
        r.driverName,
        r.phone || "—",
        r.isPresent ? "YES" : "NO",
        r.inTime || "—",
        r.dateOfInTime || "—",
        r.outTime || "—",
        r.dateOfOutTime || "—",
        r.presenceFormatted,
        r.tripCount.toString(),
        r.statusLabel,
        r.totalKm.toString(),
        r.drivingFormatted,
        tripSummary ||
          (r.isPresent ? "Present in Company (0 Trips Assigned)" : "No Trips"),
      ];
    });
    downloadCsv(`Driver_Daily_Trip_Manifest_${from}_to_${to}.csv`, [
      headers,
      ...rows,
    ]);
  };

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="rounded-2xl border border-teal-500/25 bg-gradient-to-r from-teal-500/10 via-emerald-500/5 to-transparent p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-teal-600 text-white shadow-md dark:bg-teal-500">
              <Users size={24} />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] font-extrabold uppercase tracking-widest text-teal-700 dark:text-teal-300">
                  Comprehensive Driver 360° Audit
                </span>
                <span className="rounded-full bg-teal-500/15 px-2 py-0.5 text-[10px] font-bold text-teal-800 dark:text-teal-200">
                  Presence & Trips
                </span>
              </div>
              <h2 className="mt-0.5 text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                Driver Activity, Attendance & Trip Report
              </h2>
              <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
                Complete overview for every driver: attendance in company, duty
                hours, and trips assigned (1 trip, 2 trips, multi-trips, or 0
                trips while present).
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => void loadData()}
              disabled={loading}
              className="flex items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2 text-xs font-semibold hover:bg-muted disabled:opacity-50"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />{" "}
              Refresh
            </button>
            <button
              onClick={exportDriverSummaryCsv}
              disabled={loading || !filteredDriverSummaries.length}
              className="flex items-center gap-2 rounded-xl bg-teal-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-teal-700 disabled:opacity-50"
            >
              <Download size={14} /> Export Driver Summary
            </button>
            <button
              onClick={exportDailyManifestCsv}
              disabled={loading || !filteredDailyRecords.length}
              className="flex items-center gap-2 rounded-xl border border-teal-600/30 bg-teal-500/10 px-3.5 py-2 text-xs font-semibold text-teal-800 hover:bg-teal-500/20 dark:text-teal-200 disabled:opacity-50"
            >
              <Download size={14} /> Export Daily Manifest
            </button>
          </div>
        </div>
      </div>

      {/* KPI Overview Cards */}
      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[11px] font-semibold uppercase tracking-wider">
              Duty Days Present
            </span>
            <span className="grid size-7 place-items-center rounded-lg bg-emerald-500/10 text-emerald-600">
              <CheckCircle2 size={15} />
            </span>
          </div>
          <div className="mt-2 text-2xl font-black text-foreground">
            {report?.summary.totalDutyDays ?? 0}
            <span className="ml-1 text-xs font-normal text-muted-foreground">
              days
            </span>
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            Across {report?.summary.totalActiveDriversInRange ?? 0} active
            drivers
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[11px] font-semibold uppercase tracking-wider">
              Trips Dispatched
            </span>
            <span className="grid size-7 place-items-center rounded-lg bg-teal-500/10 text-teal-600">
              <Car size={15} />
            </span>
          </div>
          <div className="mt-2 text-2xl font-black text-foreground">
            {report?.summary.totalTripsDone ?? 0}
            <span className="ml-1 text-xs font-normal text-muted-foreground">
              trips
            </span>
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            Unit 2, Local & Out of Station
          </div>
        </div>

        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 shadow-sm">
          <div className="flex items-center justify-between text-amber-700 dark:text-amber-400">
            <span className="text-[11px] font-semibold uppercase tracking-wider">
              Present With 0 Trips
            </span>
            <span className="grid size-7 place-items-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400">
              <AlertTriangle size={15} />
            </span>
          </div>
          <div className="mt-2 text-2xl font-black text-amber-800 dark:text-amber-300">
            {report?.summary.totalIdleDays ?? 0}
            <span className="ml-1 text-xs font-normal text-muted-foreground">
              days
            </span>
          </div>
          <div className="mt-1 text-[11px] font-medium text-amber-700 dark:text-amber-400">
            Present in office, no trip given
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[11px] font-semibold uppercase tracking-wider">
              Total Fleet Distance
            </span>
            <span className="grid size-7 place-items-center rounded-lg bg-blue-500/10 text-blue-600">
              <Gauge size={15} />
            </span>
          </div>
          <div className="mt-2 text-2xl font-black text-foreground">
            {report?.summary.totalCombinedKm ?? 0}
            <span className="ml-1 text-xs font-normal text-muted-foreground">
              km
            </span>
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            Total odometer distance run
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[11px] font-semibold uppercase tracking-wider">
              Avg Trips / Day
            </span>
            <span className="grid size-7 place-items-center rounded-lg bg-purple-500/10 text-purple-600">
              <Sparkles size={15} />
            </span>
          </div>
          <div className="mt-2 text-2xl font-black text-foreground">
            {report?.summary.totalDutyDays
              ? (
                  Math.round(
                    (report.summary.totalTripsDone /
                      report.summary.totalDutyDays) *
                      10,
                  ) / 10
                ).toFixed(1)
              : "0.0"}
            <span className="ml-1 text-xs font-normal text-muted-foreground">
              trips/day
            </span>
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            Per driver attendance day
          </div>
        </div>
      </div>

      {/* Filter and Control Toolbar */}
      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-3.5">
        {/* Quick Date Presets */}
        <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
          <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
            <Calendar size={13} /> Quick Range:
          </span>
          <button
            type="button"
            onClick={() => setQuickRange("today")}
            className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
              from === todayStr && to === todayStr
                ? "bg-teal-600 text-white font-bold"
                : "bg-muted hover:bg-muted/80 text-foreground"
            }`}
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => setQuickRange("yesterday")}
            className="rounded-lg bg-muted px-2.5 py-1 text-xs font-medium hover:bg-muted/80 text-foreground"
          >
            Yesterday
          </button>
          <button
            type="button"
            onClick={() => setQuickRange("last7")}
            className="rounded-lg bg-muted px-2.5 py-1 text-xs font-medium hover:bg-muted/80 text-foreground"
          >
            Last 7 Days
          </button>
          <button
            type="button"
            onClick={() => setQuickRange("thisMonth")}
            className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
              from === monthStartStr && to === todayStr
                ? "bg-teal-600 text-white font-bold"
                : "bg-muted hover:bg-muted/80 text-foreground"
            }`}
          >
            This Month
          </button>
          <button
            type="button"
            onClick={() => setQuickRange("lastMonth")}
            className="rounded-lg bg-muted px-2.5 py-1 text-xs font-medium hover:bg-muted/80 text-foreground"
          >
            Last Month
          </button>
        </div>

        {/* Inputs Grid */}
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4 lg:items-end">
          <label>
            <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold">
              <CalendarDays size={13} /> From Date
            </span>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className={inputClass}
            />
          </label>

          <label>
            <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold">
              <CalendarDays size={13} /> To Date
            </span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className={inputClass}
            />
          </label>

          <label>
            <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold">
              <User size={13} /> Driver Filter
            </span>
            <select
              value={selectedDriver}
              onChange={(e) => {
                setSelectedDriver(e.target.value);
                void loadData(from, to, e.target.value);
              }}
              className={inputClass}
            >
              <option value="ALL">
                All Drivers ({report?.availableDrivers.length ?? 0})
              </option>
              {(report?.availableDrivers ?? []).map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>

          <div className="flex gap-2">
            <button
              onClick={() => void loadData(from, to, selectedDriver)}
              disabled={loading}
              className="flex h-[38px] flex-1 items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 text-xs font-bold text-white shadow hover:bg-teal-700 disabled:opacity-50"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />{" "}
              Run Report
            </button>
          </div>
        </div>

        {/* Secondary Filter & Search Bar */}
        <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between">
          {/* Trip Activity Filter Tabs */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1 mr-1">
              <Filter size={12} /> Show:
            </span>
            <button
              type="button"
              onClick={() => setActivityFilter("all")}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                activityFilter === "all"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              All Activity
            </button>
            <button
              type="button"
              onClick={() => setActivityFilter("with_trips")}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                activityFilter === "with_trips"
                  ? "bg-teal-600 text-white"
                  : "bg-teal-500/10 text-teal-800 hover:bg-teal-500/20 dark:text-teal-200"
              }`}
            >
              🚗 With Trips (≥1)
            </button>
            <button
              type="button"
              onClick={() => setActivityFilter("zero_trips")}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                activityFilter === "zero_trips"
                  ? "bg-amber-600 text-white"
                  : "bg-amber-500/15 text-amber-800 hover:bg-amber-500/25 dark:text-amber-200 font-bold"
              }`}
            >
              🟡 Present With 0 Trips (Idle in Office)
            </button>
            <button
              type="button"
              onClick={() => setActivityFilter("multi_trips")}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                activityFilter === "multi_trips"
                  ? "bg-purple-600 text-white"
                  : "bg-purple-500/10 text-purple-800 hover:bg-purple-500/20 dark:text-purple-200"
              }`}
            >
              🚀 Multi-Trip Days (≥2)
            </button>
          </div>

          {/* Search box & View Switcher */}
          <div className="flex items-center gap-2">
            <div className="relative min-w-[200px]">
              <Search
                size={14}
                className="absolute left-2.5 top-2.5 text-muted-foreground"
              />
              <input
                type="text"
                placeholder="Search driver, car, place..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-input bg-background pl-8 pr-3 py-1.5 text-xs outline-none focus:border-primary"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            {/* View Mode Toggle */}
            <div className="flex items-center rounded-xl border border-border p-1 bg-muted/40">
              <button
                type="button"
                onClick={() => setViewMode("summary")}
                className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                  viewMode === "summary"
                    ? "bg-teal-600 text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Driver Summary ({filteredDriverSummaries.length})
              </button>
              <button
                type="button"
                onClick={() => setViewMode("daily")}
                className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                  viewMode === "daily"
                    ? "bg-teal-600 text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Daily Manifest ({filteredDailyRecords.length})
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive font-medium flex items-center gap-2">
            <AlertCircle size={15} /> {error}
          </div>
        )}
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="rounded-2xl border border-border bg-card p-12 text-center text-sm text-muted-foreground shadow-sm">
          <RefreshCw
            size={24}
            className="animate-spin mx-auto text-teal-600 mb-2"
          />
          Loading driver presence and vehicle trip records...
        </div>
      ) : viewMode === "summary" ? (
        /* ======================== TAB 1: DRIVER SUMMARY ======================== */
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-serif text-lg font-bold">
                Consolidated Driver Summary
              </h3>
              <p className="text-xs text-muted-foreground">
                Showing total attendance presence, trips distribution, and idle
                office days between {from} and {to}.
              </p>
            </div>
            <span className="text-xs font-semibold text-muted-foreground">
              {filteredDriverSummaries.length} driver(s) listed
            </span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border bg-muted/50 font-mono text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3.5 py-3">Driver Name</th>
                  <th className="px-3 py-3 text-center">Duty Days (Present)</th>
                  <th className="px-3 py-3 text-center">Days With Trips</th>
                  <th className="px-3 py-3 text-center bg-amber-500/10 text-amber-900 dark:text-amber-200">
                    Present With 0 Trips (Idle)
                  </th>
                  <th className="px-3 py-3 text-center">1-Trip Days</th>
                  <th className="px-3 py-3 text-center">2-Trip Days</th>
                  <th className="px-3 py-3 text-center">3+ Trip Days</th>
                  <th className="px-3 py-3 text-center font-black">
                    Total Trips
                  </th>
                  <th className="px-3 py-3 text-right">Total KM</th>
                  <th className="px-3 py-3 text-center">Office Presence</th>
                  <th className="px-3 py-3 text-center">Driving Hours</th>
                  <th className="px-3 py-3 text-center">Utilization</th>
                  <th className="px-3.5 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredDriverSummaries.length === 0 ? (
                  <tr>
                    <td
                      colSpan={13}
                      className="py-8 text-center text-muted-foreground text-sm"
                    >
                      No drivers match the selected filters or date range.
                    </td>
                  </tr>
                ) : (
                  filteredDriverSummaries.map((d) => (
                    <tr
                      key={d.driverName}
                      className="hover:bg-muted/40 transition-colors"
                    >
                      <td className="px-3.5 py-3 font-semibold text-foreground">
                        <div className="flex items-center gap-2">
                          <span className="grid size-7 place-items-center rounded-lg bg-teal-500/15 text-teal-700 dark:text-teal-300 font-bold text-xs">
                            {d.driverName.charAt(0).toUpperCase()}
                          </span>
                          <div>
                            <div className="font-bold">{d.driverName}</div>
                            {d.phone && (
                              <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                                <Phone size={10} /> {d.phone}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="px-3 py-3 text-center font-semibold">
                        {d.daysPresent > 0 ? (
                          <span className="inline-flex items-center justify-center rounded-md bg-emerald-500/15 px-2 py-0.5 text-xs font-bold text-emerald-800 dark:text-emerald-300">
                            {d.daysPresent} days
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>

                      <td className="px-3 py-3 text-center font-semibold">
                        {d.daysWithTrips > 0 ? (
                          <span className="inline-flex items-center justify-center rounded-md bg-teal-500/15 px-2 py-0.5 text-xs font-bold text-teal-800 dark:text-teal-200">
                            {d.daysWithTrips} days
                          </span>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </td>

                      {/* DAYS PRESENT WITH 0 TRIPS (IDLE IN OFFICE) */}
                      <td className="px-3 py-3 text-center bg-amber-500/5">
                        {d.daysIdleNoTrips > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/20 px-2 py-0.5 text-xs font-black text-amber-900 dark:text-amber-200">
                            <AlertTriangle size={11} className="shrink-0" />
                            {d.daysIdleNoTrips} days idle
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-[11px]">
                            0 days
                          </span>
                        )}
                      </td>

                      <td className="px-3 py-3 text-center font-medium text-foreground">
                        {d.days1Trip > 0 ? (
                          <span className="rounded bg-muted px-1.5 py-0.5">
                            {d.days1Trip}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>

                      <td className="px-3 py-3 text-center font-medium text-foreground">
                        {d.days2Trips > 0 ? (
                          <span className="rounded bg-muted px-1.5 py-0.5">
                            {d.days2Trips}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>

                      <td className="px-3 py-3 text-center font-medium text-foreground">
                        {d.days3PlusTrips > 0 ? (
                          <span className="rounded bg-purple-500/15 text-purple-700 dark:text-purple-300 px-1.5 py-0.5 font-bold">
                            {d.days3PlusTrips}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>

                      <td className="px-3 py-3 text-center font-black text-foreground">
                        {d.totalTrips > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-lg bg-teal-600 px-2.5 py-1 text-xs font-extrabold text-white shadow-sm">
                            <Car size={11} /> {d.totalTrips}
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-md bg-slate-500/10 px-2 py-0.5 text-xs text-muted-foreground">
                            0 trips
                          </span>
                        )}
                      </td>

                      <td className="px-3 py-3 text-right font-mono font-bold text-foreground">
                        {d.totalKm > 0 ? `${d.totalKm} km` : "—"}
                      </td>

                      <td className="px-3 py-3 text-center text-muted-foreground font-mono">
                        {d.totalPresenceFormatted || "—"}
                      </td>

                      <td className="px-3 py-3 text-center text-muted-foreground font-mono">
                        {d.totalDrivingFormatted || "—"}
                      </td>

                      <td className="px-3 py-3 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-[11px] font-bold text-foreground">
                            {d.utilizationRate}%
                          </span>
                          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                            <div
                              className={`h-full ${
                                d.utilizationRate >= 75
                                  ? "bg-emerald-500"
                                  : d.utilizationRate >= 40
                                    ? "bg-teal-500"
                                    : "bg-amber-500"
                              }`}
                              style={{
                                width: `${Math.min(100, d.utilizationRate)}%`,
                              }}
                            />
                          </div>
                        </div>
                      </td>

                      <td className="px-3.5 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setDetailModalDriver(d)}
                          className="inline-flex items-center gap-1 rounded-lg bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary hover:bg-primary/20"
                        >
                          Details <ArrowRight size={12} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* ======================== TAB 2: DAILY MANIFEST ======================== */
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-serif text-lg font-bold">
                Daily Activity & Trip Timeline
              </h3>
              <p className="text-xs text-muted-foreground">
                Chronological day-by-day logs showing office attendance punch
                alongside each assigned trip.
              </p>
            </div>
            <span className="text-xs font-semibold text-muted-foreground">
              {filteredDailyRecords.length} day record(s)
            </span>
          </div>

          <div className="grid gap-3">
            {filteredDailyRecords.length === 0 ? (
              <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
                No activity logs found for the selected filters.
              </div>
            ) : (
              filteredDailyRecords.map((r) => {
                const isZeroTrips = r.isPresent && r.tripCount === 0;

                return (
                  <div
                    key={`${r.date}-${r.driverName}`}
                    className={`rounded-2xl border p-4 shadow-sm transition ${
                      isZeroTrips
                        ? "border-amber-500/40 bg-amber-500/5 hover:border-amber-500/60"
                        : r.tripCount > 0
                          ? "border-border bg-card hover:border-teal-500/40"
                          : "border-border bg-card/60 opacity-80"
                    }`}
                  >
                    {/* Daily Header Bar */}
                    <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between border-b border-border/70 pb-3">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span className="font-mono text-xs font-black tracking-wide text-foreground rounded-lg bg-muted px-2.5 py-1">
                          📅 {r.dateFormatted}
                        </span>
                        <span className="font-serif text-base font-bold text-foreground">
                          {r.driverName}
                        </span>
                        {r.phone && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Phone size={11} /> {r.phone}
                          </span>
                        )}
                      </div>

                      {/* Status Badges */}
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Attendance Punch status */}
                        {r.isPresent ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-bold text-emerald-800 dark:text-emerald-300">
                            <CheckCircle2 size={12} />
                            In: {r.inTime || "—"}{" "}
                            {r.outTime ? `| Out: ${r.outTime}` : "| On Duty"} (
                            {r.presenceFormatted})
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-500/15 px-2.5 py-0.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                            <XCircle size={12} /> No Attendance Punch
                          </span>
                        )}

                        {/* Trip Activity Badge */}
                        {isZeroTrips ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/20 px-3 py-1 text-xs font-black text-amber-900 dark:text-amber-200">
                            <AlertTriangle size={13} className="shrink-0" />
                            Present in Company (0 Trips Assigned)
                          </span>
                        ) : r.tripCount === 1 ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-600 px-3 py-1 text-xs font-bold text-white shadow-sm">
                            <Car size={13} />1 Trip Done ({r.totalKm} km)
                          </span>
                        ) : r.tripCount === 2 ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-600 px-3 py-1 text-xs font-bold text-white shadow-sm">
                            <Car size={13} />2 Trips Done ({r.totalKm} km)
                          </span>
                        ) : r.tripCount > 2 ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-600 px-3 py-1 text-xs font-bold text-white shadow-sm">
                            <Car size={13} />
                            {r.tripCount} Trips Done ({r.totalKm} km)
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            0 Trips
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Trip Details or Idle Explanation */}
                    <div className="pt-3">
                      {isZeroTrips ? (
                        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
                          <div className="flex items-center gap-1.5 font-bold">
                            <AlertTriangle
                              size={14}
                              className="shrink-0 text-amber-600 dark:text-amber-400"
                            />
                            <span>Idle in Company / Standby Mode</span>
                          </div>
                          <p className="mt-1 leading-relaxed">
                            Driver was present in the company on{" "}
                            <strong>{r.dateFormatted}</strong> from{" "}
                            <strong>{r.inTime || "—"}</strong> to{" "}
                            <strong>{r.outTime || "—"}</strong> (
                            {r.presenceFormatted} shift duty), but no outgoing
                            vehicle trip was dispatched.
                          </p>
                        </div>
                      ) : r.trips.length > 0 ? (
                        <div className="space-y-2">
                          <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                            <span>Manifest Trips ({r.trips.length})</span>
                            <span>Total Day Distance: {r.totalKm} km</span>
                          </div>

                          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                            {r.trips.map((t, idx) => (
                              <div
                                key={t.recordId || idx}
                                className="rounded-xl border border-border bg-background/80 p-3 text-xs shadow-sm"
                              >
                                <div className="flex items-center justify-between border-b border-border/50 pb-1.5">
                                  <span className="inline-flex items-center gap-1 rounded bg-teal-500/15 px-2 py-0.5 text-[10px] font-black text-teal-800 dark:text-teal-200">
                                    Trip #{idx + 1}
                                  </span>
                                  <span className="font-bold text-foreground flex items-center gap-1">
                                    <Car size={12} className="text-teal-600" />{" "}
                                    {t.carName}
                                  </span>
                                </div>

                                <div className="mt-2 space-y-1">
                                  <div className="flex items-center justify-between">
                                    <span className="text-muted-foreground flex items-center gap-1">
                                      <MapPin size={11} /> Destination:
                                    </span>
                                    <span className="font-semibold text-foreground">
                                      {t.station}{" "}
                                      {t.stationName
                                        ? `(${t.stationName})`
                                        : ""}
                                    </span>
                                  </div>

                                  <div className="flex items-center justify-between">
                                    <span className="text-muted-foreground flex items-center gap-1">
                                      <Clock size={11} /> Timing:
                                    </span>
                                    <span className="font-mono text-foreground">
                                      Out {t.outTime || "—"} → In{" "}
                                      {t.inTime || "—"}
                                      {t.durationFormatted &&
                                        ` (${t.durationFormatted})`}
                                    </span>
                                  </div>

                                  <div className="flex items-center justify-between">
                                    <span className="text-muted-foreground flex items-center gap-1">
                                      <Gauge size={11} /> Distance:
                                    </span>
                                    <span className="font-mono font-bold text-teal-700 dark:text-teal-300">
                                      {t.kmRun} km ({t.initialReading || "0"} →{" "}
                                      {t.finalReading || "0"})
                                    </span>
                                  </div>

                                  {t.personInCar && t.personInCar !== "—" && (
                                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                                      <span>Passenger:</span>
                                      <span className="font-medium text-foreground">
                                        {t.personInCar}
                                      </span>
                                    </div>
                                  )}

                                  {t.requestedBy && t.requestedBy !== "—" && (
                                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                                      <span>Requested By:</span>
                                      <span className="font-medium text-foreground">
                                        {t.requestedBy}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs text-muted-foreground italic">
                          No attendance and no vehicle records recorded on this
                          date.
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Driver Drilldown Modal */}
      {detailModalDriver && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="max-h-[90dvh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-5">
            <div className="flex items-start justify-between border-b border-border pb-4">
              <div>
                <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-teal-600">
                  Driver Profile & Activity Audit
                </span>
                <h3 className="font-serif text-2xl font-bold text-foreground">
                  {detailModalDriver.driverName}
                </h3>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  {detailModalDriver.phone && (
                    <span className="flex items-center gap-1">
                      <Phone size={12} /> {detailModalDriver.phone}
                    </span>
                  )}
                  {detailModalDriver.supervisor && (
                    <span>Supervisor: {detailModalDriver.supervisor}</span>
                  )}
                  {detailModalDriver.workLocation && (
                    <span>Location: {detailModalDriver.workLocation}</span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDetailModalDriver(null)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X size={18} />
              </button>
            </div>

            {/* Quick Driver Stats */}
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-border bg-muted/40 p-3">
                <span className="text-[11px] font-semibold text-muted-foreground">
                  Days in Company
                </span>
                <div className="text-xl font-black text-foreground">
                  {detailModalDriver.daysPresent} days
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {detailModalDriver.totalPresenceFormatted} total shift
                </div>
              </div>
              <div className="rounded-xl border border-border bg-muted/40 p-3">
                <span className="text-[11px] font-semibold text-muted-foreground">
                  Days with Trips
                </span>
                <div className="text-xl font-black text-teal-700 dark:text-teal-300">
                  {detailModalDriver.daysWithTrips} days
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {detailModalDriver.totalTrips} total trips
                </div>
              </div>
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
                <span className="text-[11px] font-bold text-amber-900 dark:text-amber-200">
                  Days Idle (0 Trips)
                </span>
                <div className="text-xl font-black text-amber-800 dark:text-amber-300">
                  {detailModalDriver.daysIdleNoTrips} days
                </div>
                <div className="text-[10px] text-amber-700 dark:text-amber-400">
                  Present with no trip
                </div>
              </div>
              <div className="rounded-xl border border-border bg-muted/40 p-3">
                <span className="text-[11px] font-semibold text-muted-foreground">
                  Total Distance
                </span>
                <div className="text-xl font-black text-foreground">
                  {detailModalDriver.totalKm} km
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {detailModalDriver.avgKmPerTrip} km / trip avg
                </div>
              </div>
            </div>

            {/* Daily History Table */}
            <div>
              <h4 className="font-bold text-sm mb-2">
                Daily History & Trip Breakdown
              </h4>
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/60 font-mono text-[10px] uppercase text-muted-foreground">
                    <tr>
                      <th className="p-2.5">Date</th>
                      <th className="p-2.5">Office Attendance</th>
                      <th className="p-2.5 text-center">Trips Assigned</th>
                      <th className="p-2.5 text-right">Distance</th>
                      <th className="p-2.5">Assigned Trips & Destinations</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {detailModalDriver.days.map((day) => (
                      <tr key={day.date} className="hover:bg-muted/30">
                        <td className="p-2.5 font-mono font-bold whitespace-nowrap">
                          {day.dateFormatted}
                        </td>
                        <td className="p-2.5">
                          {day.isPresent ? (
                            <div>
                              <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                                In: {day.inTime || "—"}{" "}
                                {day.outTime
                                  ? `| Out: ${day.outTime}`
                                  : "| On Duty"}
                              </span>
                              <div className="text-[10px] text-muted-foreground">
                                {day.presenceFormatted} in company
                              </div>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">
                              Absent
                            </span>
                          )}
                        </td>
                        <td className="p-2.5 text-center">
                          {day.tripCount === 0 ? (
                            <span className="rounded bg-amber-500/20 px-2 py-0.5 font-bold text-amber-900 dark:text-amber-200">
                              0 trips (Idle)
                            </span>
                          ) : (
                            <span className="rounded bg-teal-600 px-2 py-0.5 font-bold text-white">
                              {day.tripCount} trip(s)
                            </span>
                          )}
                        </td>
                        <td className="p-2.5 text-right font-mono font-bold">
                          {day.totalKm} km
                        </td>
                        <td className="p-2.5 text-xs">
                          {day.trips.length > 0 ? (
                            <div className="space-y-1">
                              {day.trips.map((t, idx) => (
                                <div
                                  key={idx}
                                  className="flex flex-wrap items-center gap-1.5 text-[11px]"
                                >
                                  <span className="font-bold text-teal-700 dark:text-teal-300">
                                    #{idx + 1} {t.carName}
                                  </span>
                                  <span>
                                    → {t.station} ({t.stationName})
                                  </span>
                                  <span className="font-mono text-muted-foreground">
                                    [{t.outTime || "—"} - {t.inTime || "—"}]
                                  </span>
                                  <span className="font-mono font-bold">
                                    ({t.kmRun} km)
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : day.isPresent ? (
                            <span className="text-amber-800 dark:text-amber-300 font-medium italic">
                              Driver was present in office, no trip was
                              assigned.
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setDetailModalDriver(null)}
                className="rounded-lg bg-muted px-4 py-2 text-xs font-semibold hover:bg-muted/80"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
