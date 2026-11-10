import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  Car,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  LogIn,
  MapPin,
  Maximize,
  Minimize,
  PhoneCall,
  Printer,
  Radio,
  RefreshCw,
  Search,
  UserCheck,
  UserX,
  Users,
  Wrench,
} from 'lucide-react';
import { Link } from 'wouter';
import {
  fetchLiveDriverPresence,
  type DriverLivePresenceItem,
  type DriverLivePresenceReport,
} from '@/lib/vehicle-report';
import { useAuth } from '@/lib/auth';

const statusConfig: Record<
  DriverLivePresenceItem['liveStatus'],
  { label: string; bg: string; text: string; border: string; dotBg: string }
> = {
  available: {
    label: 'Available on Premises',
    bg: 'bg-emerald-500/10 dark:bg-emerald-950/40',
    text: 'text-emerald-700 dark:text-emerald-300 font-semibold',
    border: 'border-emerald-500/30',
    dotBg: 'bg-emerald-500',
  },
  on_trip: {
    label: 'On Trip (En Route)',
    bg: 'bg-blue-500/10 dark:bg-blue-950/40',
    text: 'text-blue-700 dark:text-blue-300 font-semibold',
    border: 'border-blue-500/30',
    dotBg: 'bg-blue-500',
  },
  on_station: {
    label: 'On Station Duty',
    bg: 'bg-amber-500/10 dark:bg-amber-950/40',
    text: 'text-amber-700 dark:text-amber-300 font-semibold',
    border: 'border-amber-500/30',
    dotBg: 'bg-amber-500',
  },
  punched_out: {
    label: 'Shift Ended',
    bg: 'bg-slate-500/10 dark:bg-slate-800/40',
    text: 'text-slate-700 dark:text-slate-300',
    border: 'border-slate-500/20',
    dotBg: 'bg-slate-400',
  },
  not_reported: {
    label: 'Off Duty / Absent',
    bg: 'bg-red-500/10 dark:bg-red-950/40',
    text: 'text-red-700 dark:text-red-300',
    border: 'border-red-500/20',
    dotBg: 'bg-red-400',
  },
};

export default function DriverBoardPage() {
  const { user } = useAuth();
  const [data, setData] = useState<DriverLivePresenceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [currentTime, setCurrentTime] = useState<string>('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [activeTab, setActiveTab] = useState<'roster' | 'fleet' | 'service' | 'schedule'>('roster');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'available' | 'on_trip' | 'on_station' | 'punched_out' | 'not_reported'>('all');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copied, setCopied] = useState(false);

  // Fullscreen event listener
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // Ignore fullscreen denial
    }
  };

  const copyShareLink = async () => {
    try {
      const shareUrl = window.location.origin + '/driver-board';
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // Fallback
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    }
  };

  // Clock in IST
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        new Intl.DateTimeFormat('en-IN', {
          timeZone: 'Asia/Kolkata',
          weekday: 'short',
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        }).format(now)
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const loadData = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const res = await fetchLiveDriverPresence();
      setData(res);
      setError(null);
      setLastUpdated(new Date());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to fetch live presence data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  // 30s auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      void loadData();
    }, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  const drivers = data?.drivers ?? [];
  const activeVehicles = data?.activeVehicles ?? [];
  const serviceVehicles = data?.serviceVehicles ?? [];
  const summary = data?.summary;

  const filteredDrivers = useMemo(() => {
    return drivers.filter((d) => {
      if (statusFilter !== 'all' && d.liveStatus !== statusFilter) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        d.driverName.toLowerCase().includes(q) ||
        d.phone.toLowerCase().includes(q) ||
        d.workLocation.toLowerCase().includes(q) ||
        (d.activeTrip?.carName && d.activeTrip.carName.toLowerCase().includes(q)) ||
        (d.activeTrip?.station && d.activeTrip.station.toLowerCase().includes(q)) ||
        (d.scheduledTrip?.carName && d.scheduledTrip.carName.toLowerCase().includes(q))
      );
    });
  }, [drivers, search, statusFilter]);

  const scheduledDrivers = useMemo(() => {
    return drivers.filter((d) => Boolean(d.scheduledTrip));
  }, [drivers]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-emerald-500/30">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:border-slate-700 hover:bg-slate-800 hover:text-white transition"
              data-testid="link-back-modules"
            >
              <ArrowLeft size={14} />
              <span>{user ? 'Modules' : 'ERP Home'}</span>
            </Link>
            <div className="h-4 w-px bg-slate-800" />
            <div className="flex items-center gap-2">
              <span className="grid size-8 place-items-center rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                <Car size={18} />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-base font-bold text-white tracking-tight sm:text-lg">
                    Live Driver & Fleet Board
                  </h1>
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                    <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    LIVE OPS
                  </span>
                  {!user && (
                    <span className="hidden sm:inline-flex rounded-full border border-slate-700 bg-slate-800/80 px-2 py-0.5 text-[10px] text-slate-300">
                      Public View
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 hidden sm:block">
                  Real-time Duty Presence, Vehicle Dispatches & Maintenance Tracking · Open to All
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Live Clock */}
            <div className="hidden lg:flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900/90 px-3 py-1.5 text-xs text-slate-300 font-mono">
              <Clock size={13} className="text-emerald-400" />
              <span>{currentTime || 'Loading clock…'}</span>
            </div>

            {/* Auto refresh pill */}
            <button
              type="button"
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`hidden sm:inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
                autoRefresh
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                  : 'border-slate-800 bg-slate-900 text-slate-400 hover:bg-slate-800'
              }`}
              title="Click to toggle 30s auto-refresh"
            >
              <Radio size={12} className={autoRefresh ? 'animate-pulse text-emerald-400' : 'text-slate-500'} />
              <span>{autoRefresh ? '30s Sync On' : 'Sync Paused'}</span>
            </button>

            {/* Manual refresh button */}
            <button
              type="button"
              onClick={() => void loadData(true)}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-slate-700 hover:bg-slate-800 transition disabled:opacity-50"
              data-testid="button-refresh-board"
            >
              <RefreshCw size={13} className={refreshing ? 'animate-spin text-emerald-400' : ''} />
              <span className="hidden sm:inline">Refresh</span>
            </button>

            {/* Copy / Share Link */}
            <button
              type="button"
              onClick={() => void copyShareLink()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:border-slate-700 hover:bg-slate-800 transition"
              title="Copy link to share this board"
              data-testid="button-share-board"
            >
              {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
              <span className="hidden md:inline">{copied ? 'Copied!' : 'Share'}</span>
            </button>

            {/* Fullscreen TV / Monitor Mode */}
            <button
              type="button"
              onClick={() => void toggleFullscreen()}
              className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:border-slate-700 hover:bg-slate-800 transition"
              title={isFullscreen ? 'Exit Fullscreen' : 'Full Screen Display for Gate TV / Monitor'}
              data-testid="button-fullscreen-board"
            >
              {isFullscreen ? <Minimize size={13} /> : <Maximize size={13} />}
              <span className="hidden md:inline">{isFullscreen ? 'Exit Full' : 'Fullscreen'}</span>
            </button>

            {/* Print Board */}
            <button
              type="button"
              onClick={() => window.print()}
              className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:border-slate-700 hover:bg-slate-800 transition"
              title="Print Gate Handover Sheet"
            >
              <Printer size={13} />
              <span className="hidden md:inline">Print</span>
            </button>

            {/* Sign in / User status */}
            {!user ? (
              <Link
                href="/"
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/50 bg-emerald-500/20 px-3 py-1.5 text-xs font-bold text-emerald-200 hover:bg-emerald-500/30 transition shadow-sm"
                data-testid="link-board-signin"
              >
                <LogIn size={13} />
                <span>Sign In</span>
              </Link>
            ) : (
              <span className="hidden xl:inline-flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1 text-xs text-slate-400">
                <span className="size-1.5 rounded-full bg-emerald-400" />
                <span className="font-medium text-slate-200">{user.displayName}</span>
                <span className="text-[10px] uppercase text-slate-500 font-mono">({user.role})</span>
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 space-y-6">
        {/* Quick Dispatch Shortcuts Bar */}
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-3.5 backdrop-blur-sm">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className="font-semibold text-slate-200 uppercase tracking-wider text-[11px]">Gate Quick Actions:</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/registers/outgoing-vehicles"
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-500 transition"
            >
              <Car size={13} /> Log Outgoing Vehicle
            </Link>
            <Link
              href="/registers/driver-attendance"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 transition"
            >
              <Clock size={13} /> Mark Attendance
            </Link>
            <Link
              href="/registers/car-breakdowns"
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-500/20 transition"
            >
              <Wrench size={13} /> Car Breakdowns
            </Link>
            <Link
              href="/registers/driver-master"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition"
            >
              <Users size={13} /> Driver Master
            </Link>
          </div>
        </section>

        {/* Hero KPI Stats Grid */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4 sm:gap-4">
          {/* Card 1: Present On Duty */}
          <div className="rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-950 p-4 shadow-sm relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-slate-400">Punched In Today</span>
              <span className="grid size-9 place-items-center rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <UserCheck size={18} />
              </span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-bold tracking-tight text-white font-mono">
                {summary?.totalPresentToday ?? 0}
              </span>
              <span className="text-xs text-slate-400">
                / {summary?.totalRegistered ?? 0} registered
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-400">Drivers actively on duty today</p>
          </div>

          {/* Card 2: Available at Gate */}
          <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-950/20 to-slate-950 p-4 shadow-sm relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-emerald-400">Available at Gate</span>
              <span className="grid size-9 place-items-center rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                <CheckCircle2 size={18} />
              </span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-bold tracking-tight text-emerald-300 font-mono">
                {summary?.availableNow ?? 0}
              </span>
              <span className="text-xs text-emerald-400/80">Ready for trips</span>
            </div>
            <p className="mt-1 text-xs text-slate-400">Punched in & awaiting vehicle dispatch</p>
          </div>

          {/* Card 3: Active Trips En-Route */}
          <div className="rounded-2xl border border-blue-500/30 bg-gradient-to-br from-blue-950/20 to-slate-950 p-4 shadow-sm relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-blue-400">Vehicles on Road</span>
              <span className="grid size-9 place-items-center rounded-xl bg-blue-500/20 text-blue-300 border border-blue-500/40">
                <Car size={18} />
              </span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-bold tracking-tight text-blue-300 font-mono">
                {summary?.vehiclesOnRoad ?? summary?.onTripNow ?? 0}
              </span>
              <span className="text-xs text-blue-400/80">Outside gate</span>
            </div>
            <p className="mt-1 text-xs text-slate-400">Currently out on local or station trip</p>
          </div>

          {/* Card 4: Fleet Breakdowns */}
          <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-950/20 to-slate-950 p-4 shadow-sm relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-amber-400">In Service / Breakdown</span>
              <span className="grid size-9 place-items-center rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/40">
                <Wrench size={18} />
              </span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-bold tracking-tight text-amber-300 font-mono">
                {summary?.vehiclesInService ?? 0}
              </span>
              <span className="text-xs text-amber-400/80">Under repair</span>
            </div>
            <p className="mt-1 text-xs text-slate-400">Cars currently out for maintenance</p>
          </div>
        </section>

        {/* View Mode Tabs */}
        <section className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-800 pb-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('roster')}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition ${
                activeTab === 'roster'
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                  : 'bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-800'
              }`}
            >
              <Users size={16} />
              <span>Driver Duty Roster</span>
              <span className={`ml-1 rounded-full px-2 py-0.5 text-xs font-mono ${
                activeTab === 'roster' ? 'bg-slate-950 text-emerald-300' : 'bg-slate-800 text-slate-400'
              }`}>
                {drivers.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('fleet')}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition ${
                activeTab === 'fleet'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                  : 'bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-800'
              }`}
            >
              <Car size={16} />
              <span>Active Fleet on Road</span>
              <span className={`ml-1 rounded-full px-2 py-0.5 text-xs font-mono ${
                activeTab === 'fleet' ? 'bg-blue-950 text-blue-300' : 'bg-slate-800 text-slate-400'
              }`}>
                {activeVehicles.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('service')}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition ${
                activeTab === 'service'
                  ? 'bg-amber-600 text-white shadow-md shadow-amber-500/20'
                  : 'bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-800'
              }`}
            >
              <Wrench size={16} />
              <span>Car Breakdowns & Service</span>
              <span className={`ml-1 rounded-full px-2 py-0.5 text-xs font-mono ${
                activeTab === 'service' ? 'bg-amber-950 text-amber-300' : 'bg-slate-800 text-slate-400'
              }`}>
                {serviceVehicles.filter(s => !s.isCompleted).length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('schedule')}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition ${
                activeTab === 'schedule'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20'
                  : 'bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-800'
              }`}
            >
              <Calendar size={16} />
              <span>Today's Schedule</span>
              <span className={`ml-1 rounded-full px-2 py-0.5 text-xs font-mono ${
                activeTab === 'schedule' ? 'bg-indigo-950 text-indigo-300' : 'bg-slate-800 text-slate-400'
              }`}>
                {scheduledDrivers.length}
              </span>
            </button>
          </div>

          <div className="text-xs text-slate-400 flex items-center gap-2">
            <span>Last synced:</span>
            <span className="font-mono text-slate-300">
              {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </div>
        </section>

        {/* Search & Filter Bar */}
        <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-md">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search driver by name, phone, car or destination..."
              className="w-full rounded-xl border border-slate-800 bg-slate-900/90 pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-white"
              >
                Clear
              </button>
            )}
          </div>

          {activeTab === 'roster' && (
            <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto pb-1">
              {[
                { key: 'all', label: 'All Drivers', count: drivers.length },
                { key: 'available', label: 'Available', count: summary?.availableNow ?? 0 },
                { key: 'on_trip', label: 'On Trip', count: summary?.onTripNow ?? 0 },
                { key: 'on_station', label: 'Station', count: summary?.onStationNow ?? 0 },
                { key: 'punched_out', label: 'Punched Out', count: summary?.punchedOutToday ?? 0 },
                { key: 'not_reported', label: 'Not Logged', count: summary?.notReportedToday ?? 0 },
              ].map(({ key, label, count }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setStatusFilter(key as typeof statusFilter)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                    statusFilter === key
                      ? 'bg-slate-200 text-slate-950 font-bold'
                      : 'border border-slate-800 bg-slate-900/80 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                  }`}
                >
                  {label} ({count})
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Error Notification */}
        {error && (
          <div className="flex items-center gap-3 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
            <AlertTriangle size={18} className="text-red-400 shrink-0" />
            <div className="flex-1">
              <p className="font-semibold">Unable to fetch real-time driver data</p>
              <p className="text-xs text-red-300/80">{error}</p>
            </div>
            <button
              type="button"
              onClick={() => void loadData(true)}
              className="rounded-lg bg-red-500/20 px-3 py-1.5 text-xs font-semibold text-red-200 hover:bg-red-500/30"
            >
              Retry
            </button>
          </div>
        )}

        {/* TAB 1: DRIVER DUTY ROSTER */}
        {activeTab === 'roster' && (
          <section className="space-y-4">
            {loading && !data ? (
              <div className="grid place-items-center rounded-2xl border border-slate-800 bg-slate-900/50 py-20 text-slate-400">
                <RefreshCw size={28} className="animate-spin text-emerald-400" />
                <span className="mt-3 text-sm">Loading live driver presence board…</span>
              </div>
            ) : filteredDrivers.length === 0 ? (
              <div className="grid place-items-center rounded-2xl border border-slate-800 bg-slate-900/50 py-16 text-center text-slate-400">
                <UserX size={36} className="text-slate-600 mb-2" />
                <p className="text-base font-semibold text-slate-300">No drivers match this filter</p>
                <p className="text-xs text-slate-500 mt-1">Try clearing your search or switching status tabs above.</p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filteredDrivers.map((driver) => {
                  const cfg = statusConfig[driver.liveStatus];
                  const initials = driver.driverName
                    .split(' ')
                    .map((w) => w[0])
                    .filter(Boolean)
                    .slice(0, 2)
                    .join('')
                    .toUpperCase() || 'DR';

                  return (
                    <div
                      key={driver.driverName}
                      className="group relative flex flex-col justify-between rounded-2xl border border-slate-800/90 bg-gradient-to-b from-slate-900/90 to-slate-950 p-5 shadow-sm transition hover:border-slate-700 hover:shadow-md"
                    >
                      {/* Driver Card Header */}
                      <div>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="relative">
                              <span className="grid size-11 place-items-center rounded-xl bg-slate-800 text-sm font-bold text-slate-200 border border-slate-700">
                                {initials}
                              </span>
                              <span
                                className={`absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full border-2 border-slate-950 ${cfg.dotBg}`}
                              />
                            </div>
                            <div>
                              <h3 className="font-bold text-base text-white group-hover:text-emerald-400 transition">
                                {driver.driverName}
                              </h3>
                              <p className="text-xs text-slate-400">
                                {driver.workLocation || 'Fleet Operations'}
                                {driver.supervisor ? ` • Sup: ${driver.supervisor}` : ''}
                              </p>
                            </div>
                          </div>

                          {/* Quick Call */}
                          {driver.phone && (
                            <a
                              href={`tel:${driver.phone}`}
                              className="grid size-9 place-items-center rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:border-emerald-500/50 hover:bg-emerald-500/20 hover:text-emerald-300 transition"
                              title={`Call ${driver.driverName} (${driver.phone})`}
                            >
                              <PhoneCall size={14} />
                            </a>
                          )}
                        </div>

                        {/* Status Badge */}
                        <div className="mt-3.5">
                          <div
                            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${cfg.border} ${cfg.bg} ${cfg.text}`}
                          >
                            <span className={`size-1.5 rounded-full ${cfg.dotBg} ${driver.liveStatus === 'on_trip' || driver.liveStatus === 'available' ? 'animate-pulse' : ''}`} />
                            <span>{driver.liveStatusLabel}</span>
                          </div>
                        </div>

                        {/* Active Trip Banner */}
                        {driver.activeTrip && (
                          <div className="mt-3 rounded-xl border border-blue-500/30 bg-blue-500/10 p-3 text-xs text-blue-200">
                            <div className="flex items-center justify-between font-bold text-blue-300">
                              <span className="flex items-center gap-1">
                                <Car size={13} /> {driver.activeTrip.carName}
                              </span>
                              <span className="font-mono text-[11px] uppercase bg-blue-500/20 px-1.5 py-0.5 rounded">
                                {driver.activeTrip.tripType}
                              </span>
                            </div>
                            <div className="mt-1.5 space-y-1 text-[11px] text-blue-300/90">
                              <p className="flex items-center gap-1">
                                <MapPin size={11} className="text-blue-400 shrink-0" />
                                <span className="font-medium text-white">{driver.activeTrip.station}</span>
                              </p>
                              <p className="text-blue-400/80">
                                Departed at: <span className="font-mono text-white">{driver.activeTrip.outTime}</span>
                                {driver.activeTrip.personInCar && driver.activeTrip.personInCar !== '—' ? ` • With: ${driver.activeTrip.personInCar}` : ''}
                              </p>
                            </div>
                          </div>
                        )}

                        {/* Scheduled Assignment */}
                        {driver.scheduledTrip && !driver.activeTrip && (
                          <div className="mt-3 rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-2.5 text-xs text-indigo-200">
                            <span className="font-semibold text-indigo-300 flex items-center gap-1 text-[11px] uppercase">
                              <Calendar size={11} /> Today's Scheduled Assignment
                            </span>
                            <p className="mt-1 text-[11px] text-white">
                              {driver.scheduledTrip.carName} → {driver.scheduledTrip.location}
                              {driver.scheduledTrip.scheduleTime ? ` @ ${driver.scheduledTrip.scheduleTime}` : ''}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Driver Card Footer Stats */}
                      <div className="mt-4 border-t border-slate-800/80 pt-3">
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <span className="text-[10px] uppercase text-slate-500">In / Out Time</span>
                            <p className="font-mono font-medium text-slate-300">
                              {driver.inTime ? driver.inTime : 'Not In'}
                              {driver.outTime ? ` - ${driver.outTime}` : ''}
                            </p>
                          </div>
                          <div>
                            <span className="text-[10px] uppercase text-slate-500">Today's Runs</span>
                            <p className="font-mono font-medium text-slate-300">
                              {driver.todayTripsCount} trips ({driver.todayKm} km)
                            </p>
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="mt-3 flex items-center justify-between pt-1">
                          {driver.phone ? (
                            <span className="font-mono text-[11px] text-slate-400">{driver.phone}</span>
                          ) : (
                            <span className="text-[11px] text-slate-500">No phone in master</span>
                          )}

                          {driver.liveStatus === 'available' ? (
                            <Link
                              href="/registers/outgoing-vehicles"
                              className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition"
                            >
                              Dispatch Car <ExternalLink size={11} />
                            </Link>
                          ) : driver.liveStatus === 'on_trip' ? (
                            <Link
                              href="/registers/outgoing-vehicles"
                              className="inline-flex items-center gap-1 text-xs font-semibold text-blue-400 hover:text-blue-300 transition"
                            >
                              Trip Log <ExternalLink size={11} />
                            </Link>
                          ) : (
                            <Link
                              href="/registers/driver-attendance"
                              className="inline-flex items-center gap-1 text-xs font-semibold text-slate-400 hover:text-slate-300 transition"
                            >
                              Attendance <ExternalLink size={11} />
                            </Link>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* TAB 2: ACTIVE FLEET ON ROAD */}
        {activeTab === 'fleet' && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Car size={20} className="text-blue-400" />
                  Vehicles Currently Outside the Gate ({activeVehicles.length})
                </h2>
                <p className="text-xs text-slate-400">
                  Every vehicle dispatched with an Out-Time that has not returned or logged In-Time yet.
                </p>
              </div>
              <Link
                href="/registers/outgoing-vehicles"
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 transition"
              >
                <Car size={13} /> Outgoing Vehicle Register
              </Link>
            </div>

            {activeVehicles.length === 0 ? (
              <div className="grid place-items-center rounded-2xl border border-slate-800 bg-slate-900/40 py-16 text-center text-slate-400">
                <CheckCircle2 size={40} className="text-emerald-500 mb-2" />
                <p className="text-base font-semibold text-slate-200">All fleet vehicles are on premises</p>
                <p className="text-xs text-slate-500 mt-1">There are no outgoing vehicle trips currently on the road.</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/60 shadow-sm">
                <table className="w-full text-left text-sm text-slate-300">
                  <thead className="border-b border-slate-800 bg-slate-900/90 text-[11px] uppercase tracking-wider text-slate-400 font-mono">
                    <tr>
                      <th className="px-4 py-3">Vehicle Name</th>
                      <th className="px-4 py-3">Driver</th>
                      <th className="px-4 py-3">Destination / Route</th>
                      <th className="px-4 py-3">Passenger / Purpose</th>
                      <th className="px-4 py-3">Out Time</th>
                      <th className="px-4 py-3">Trip Type</th>
                      <th className="px-4 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {activeVehicles.map((trip) => (
                      <tr key={trip.recordId} className="hover:bg-slate-800/40 transition">
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2">
                            <span className="grid size-7 place-items-center rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
                              <Car size={14} />
                            </span>
                            <span className="font-bold text-white">{trip.carName}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 font-medium text-slate-200">
                          {trip.driverName}
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-1 text-slate-300 font-medium">
                            <MapPin size={13} className="text-blue-400 shrink-0" />
                            <span>{trip.station}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-xs text-slate-400">
                          {trip.personInCar}
                        </td>
                        <td className="px-4 py-3.5 font-mono text-emerald-400 font-bold">
                          {trip.outTime}
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                            trip.tripType === 'unit-2'
                              ? 'bg-indigo-500/20 text-indigo-300'
                              : trip.tripType === 'local'
                                ? 'bg-blue-500/20 text-blue-300'
                                : 'bg-amber-500/20 text-amber-300'
                          }`}>
                            {trip.tripType === 'unit-2' ? 'Unit 2' : trip.tripType === 'local' ? 'Local' : 'Out Station'}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <Link
                            href={`/registers/${trip.registerSlug}`}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs font-semibold text-slate-200 hover:bg-slate-700 transition"
                          >
                            Mark In Time <ExternalLink size={11} />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* TAB 3: CAR BREAKDOWNS & SERVICE */}
        {activeTab === 'service' && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Wrench size={20} className="text-amber-400" />
                  Fleet Maintenance & Breakdown Status ({serviceVehicles.length})
                </h2>
                <p className="text-xs text-slate-400">
                  Track cars sent out for mechanical service, repairs, and total workshop downtime.
                </p>
              </div>
              <Link
                href="/registers/car-breakdowns"
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-500 transition"
              >
                <Wrench size={13} /> Car Breakdown Register
              </Link>
            </div>

            {serviceVehicles.length === 0 ? (
              <div className="grid place-items-center rounded-2xl border border-slate-800 bg-slate-900/40 py-16 text-center text-slate-400">
                <CheckCircle2 size={40} className="text-emerald-500 mb-2" />
                <p className="text-base font-semibold text-slate-200">All fleet vehicles in service</p>
                <p className="text-xs text-slate-500 mt-1">No recorded car breakdowns or pending workshop repairs.</p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {serviceVehicles.map((serv) => (
                  <div
                    key={serv.recordId}
                    className={`rounded-2xl border p-4 shadow-sm transition ${
                      serv.isCompleted
                        ? 'border-slate-800 bg-slate-900/60'
                        : 'border-red-500/40 bg-gradient-to-b from-red-950/20 to-slate-950'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className={`grid size-9 place-items-center rounded-xl border ${
                          serv.isCompleted
                            ? 'bg-slate-800 text-slate-300 border-slate-700'
                            : 'bg-red-500/20 text-red-300 border-red-500/30'
                        }`}>
                          <Wrench size={16} />
                        </span>
                        <div>
                          <h4 className="font-bold text-white">{serv.carName}</h4>
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            serv.isCompleted ? 'bg-slate-800 text-slate-400' : 'bg-red-500/20 text-red-300'
                          }`}>
                            {serv.isCompleted ? 'Service Completed' : 'Under Service / Breakdown'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 space-y-1.5 border-t border-slate-800/80 pt-3 text-xs text-slate-300">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Out for Service:</span>
                        <span className="font-mono text-white">{serv.outDate} {serv.outTime}</span>
                      </div>
                      {serv.inDate && (
                        <div className="flex justify-between">
                          <span className="text-slate-500">In after Service:</span>
                          <span className="font-mono text-emerald-400">{serv.inDate} {serv.inTime}</span>
                        </div>
                      )}
                      <div className="flex justify-between font-semibold">
                        <span className="text-slate-500">Total Downtime:</span>
                        <span className="font-mono text-amber-300">
                          {serv.totalTimeConsumed || (serv.isCompleted ? '—' : 'Ongoing in workshop')}
                        </span>
                      </div>
                    </div>

                    <div className="mt-4 pt-2 border-t border-slate-800/60 flex justify-end">
                      <Link
                        href="/registers/car-breakdowns"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-red-400 hover:text-red-300 transition"
                      >
                        Open Breakdown Record <ExternalLink size={11} />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* TAB 4: TODAY'S SCHEDULE */}
        {activeTab === 'schedule' && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Calendar size={20} className="text-indigo-400" />
                  Today's Planned Driver Schedules ({scheduledDrivers.length})
                </h2>
                <p className="text-xs text-slate-400">
                  Planned car allocations and scheduled destinations from Driver Schedule.
                </p>
              </div>
              <Link
                href="/registers/driver-schedule"
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 transition"
              >
                <Calendar size={13} /> Driver Schedule Register
              </Link>
            </div>

            {scheduledDrivers.length === 0 ? (
              <div className="grid place-items-center rounded-2xl border border-slate-800 bg-slate-900/40 py-16 text-center text-slate-400">
                <Calendar size={40} className="text-indigo-500 mb-2" />
                <p className="text-base font-semibold text-slate-200">No schedules set for today</p>
                <p className="text-xs text-slate-500 mt-1">Open Driver Schedule register to plan driver and car assignments.</p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {scheduledDrivers.map((driver) => (
                  <div
                    key={driver.driverName}
                    className="rounded-2xl border border-indigo-500/30 bg-gradient-to-b from-indigo-950/20 to-slate-950 p-4 shadow-sm"
                  >
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-white">{driver.driverName}</h4>
                      {driver.phone && (
                        <a
                          href={`tel:${driver.phone}`}
                          className="grid size-8 place-items-center rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:text-white"
                        >
                          <PhoneCall size={13} />
                        </a>
                      )}
                    </div>

                    <div className="mt-3 space-y-1.5 rounded-xl bg-indigo-950/40 border border-indigo-500/20 p-3 text-xs text-indigo-200">
                      <p className="flex items-center justify-between">
                        <span className="text-indigo-400">Car:</span>
                        <span className="font-bold text-white">{driver.scheduledTrip?.carName}</span>
                      </p>
                      <p className="flex items-center justify-between">
                        <span className="text-indigo-400">Route / Location:</span>
                        <span className="font-bold text-white">{driver.scheduledTrip?.location}</span>
                      </p>
                      {driver.scheduledTrip?.scheduleTime && (
                        <p className="flex items-center justify-between">
                          <span className="text-indigo-400">Scheduled Time:</span>
                          <span className="font-mono text-emerald-400">{driver.scheduledTrip.scheduleTime}</span>
                        </p>
                      )}
                    </div>

                    <div className="mt-3 flex items-center justify-between text-xs pt-1">
                      <span className="text-slate-400">Status: {driver.liveStatusLabel}</span>
                      <Link
                        href="/registers/driver-schedule"
                        className="inline-flex items-center gap-1 font-semibold text-indigo-400 hover:text-indigo-300"
                      >
                        Edit <ExternalLink size={11} />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

