import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  Car,
  CheckCircle2,
  Clock,
  Compass,
  Download,
  Gauge,
  MapPin,
  Phone,
  RefreshCw,
  Search,
  User,
  Users,
  XCircle,
} from 'lucide-react';
import {
  fetchLiveDriverPresence,
  fetchVehicleAnalytics,
  type CarConsolidatedSummary,
  type CarDestinationMonthlySummary,
  type CarMonthlySummary,
  type DriverKmSummary,
  type DriverLivePresenceItem,
  type DriverLivePresenceReport,
  type DriverLocalTimeSummary,
  type DriverMonthlyHoursSummary,
  type LocationConsolidatedSummary,
  type LocationMonthlySummary,
  type StationDriverSummary,
  type TripDetail,
  type VehicleAnalyticsReport,
} from '@/lib/vehicle-report';
import { downloadCsv } from '@/lib/date-utils';

const inputClass =
  'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15';

const formatDuration = (totalMinutes: number): string => {
  if (!totalMinutes || totalMinutes <= 0) return '0m';
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h`;
  return `${mins}m`;
};

type SubReportTab =
  | 'live-drivers'
  | 'local-time'
  | 'driver-km'
  | 'trips-breakdown'
  | 'station-km'
  | 'driver-monthly-hours'
  | 'car-monthly'
  | 'location-monthly'
  | 'car-destination-monthly';

export function VehicleReportModule() {
  const [activeTab, setActiveTab] = useState<SubReportTab>('local-time');
  const [driver, setDriver] = useState('ALL');
  const [car, setCar] = useState('ALL');
  const [month, setMonth] = useState('ALL');
  const [tripType, setTripType] = useState<'all' | 'unit-2' | 'local' | 'out-station'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [report, setReport] = useState<VehicleAnalyticsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Live Driver Presence State
  const [liveDriversData, setLiveDriversData] = useState<DriverLivePresenceReport | null>(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState('');
  const [liveStatusFilter, setLiveStatusFilter] = useState<'all' | 'available' | 'on_trip' | 'punched_out' | 'not_reported'>('all');
  const [liveSearchQuery, setLiveSearchQuery] = useState('');

  const loadLiveDrivers = async () => {
    setLiveLoading(true);
    setLiveError('');
    try {
      const data = await fetchLiveDriverPresence();
      setLiveDriversData(data);
    } catch (err) {
      setLiveError(err instanceof Error ? err.message : 'Failed to load live driver presence');
    } finally {
      setLiveLoading(false);
    }
  };

  const loadData = async (
    nextDriver = driver,
    nextType = tripType,
    nextMonth = month,
    nextCar = car
  ) => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchVehicleAnalytics({
        driver: nextDriver !== 'ALL' ? nextDriver : undefined,
        type: nextType !== 'all' ? nextType : undefined,
        month: nextMonth !== 'ALL' ? nextMonth : undefined,
        car: nextCar !== 'ALL' ? nextCar : undefined,
      });
      setReport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load vehicle analytics');
      setReport(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
    void loadLiveDrivers();
  }, []);

  const query = searchQuery.trim().toLowerCase();

  const filteredLiveDrivers = useMemo(() => {
    if (!liveDriversData?.drivers) return [];
    let list = liveDriversData.drivers;
    if (liveStatusFilter !== 'all') {
      list = list.filter((d) => d.liveStatus === liveStatusFilter);
    }
    const q = liveSearchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (d) =>
          d.driverName.toLowerCase().includes(q) ||
          d.phone.includes(q) ||
          d.supervisor.toLowerCase().includes(q) ||
          d.activeTrip?.carName.toLowerCase().includes(q) ||
          d.activeTrip?.station.toLowerCase().includes(q)
      );
    }
    return list;
  }, [liveDriversData, liveStatusFilter, liveSearchQuery]);

  const exportLiveDriversCsv = () => {
    if (!liveDriversData?.drivers.length) return;
    const headers = [
      'Driver Name',
      'Mobile Phone',
      'Current Presence Status',
      'Today Punch In Time',
      'Today Punch Out Time',
      'Active Trip Vehicle',
      'Destination / Station',
      'Trip Out Time',
      'Passenger In Vehicle',
      'Trips Completed Today',
      'KM Driven Today',
      'Scheduled Duty',
      'Supervisor',
      'Working Area',
    ];
    const rows = liveDriversData.drivers.map((d) => [
      d.driverName,
      d.phone || '—',
      d.liveStatusLabel,
      d.inTime || '—',
      d.outTime || '—',
      d.activeTrip?.carName || '—',
      d.activeTrip?.station || '—',
      d.activeTrip?.outTime || '—',
      d.activeTrip?.personInCar || '—',
      d.todayTripsCount.toString(),
      d.todayKm.toString(),
      d.scheduledTrip ? `${d.scheduledTrip.scheduleTime} (${d.scheduledTrip.carName} - ${d.scheduledTrip.location})` : '—',
      d.supervisor || '—',
      d.workLocation || '—',
    ]);
    downloadCsv(`Live_Driver_Presence_${liveDriversData.targetDate}.csv`, [headers, ...rows]);
  };

  // Filtered views
  const filteredLocalTime = useMemo(() => {
    if (!report?.localTimeSummary) return [];
    return report.localTimeSummary.filter(
      (item) => !query || item.driverName.toLowerCase().includes(query)
    );
  }, [report, query]);

  const filteredDriverKm = useMemo(() => {
    if (!report?.driverKmSummary) return [];
    return report.driverKmSummary.filter(
      (item) => !query || item.driverName.toLowerCase().includes(query)
    );
  }, [report, query]);

  const filteredStationKm = useMemo(() => {
    if (!report?.stationDriverSummary) return [];
    return report.stationDriverSummary.filter((item) => {
      const matchStation = !query || item.station.toLowerCase().includes(query);
      const matchDriver = !query || item.driverName.toLowerCase().includes(query);
      return matchStation || matchDriver;
    });
  }, [report, query]);

  const filteredTrips = useMemo(() => {
    if (!report?.trips) return [];
    return report.trips.filter((item) => {
      const matchStation = !query || item.station.toLowerCase().includes(query);
      const matchDriver = !query || item.driverName.toLowerCase().includes(query);
      const matchCar = !query || item.carName.toLowerCase().includes(query);
      const matchPassenger = !query || item.personInCar.toLowerCase().includes(query);
      return matchStation || matchDriver || matchCar || matchPassenger;
    });
  }, [report, query]);

  // 1. Filtered Driver Hours (Joined by Driver Name, filtered by month)
  const filteredDriverHours = useMemo(() => {
    const map = new Map<string, {
      driverName: string;
      totalMinutes: number;
      localMinutes: number;
      outStationMinutes: number;
      totalTrips: number;
      localTrips: number;
      outStationTrips: number;
      totalKm: number;
    }>();

    for (const t of filteredTrips) {
      if (!t.driverName || t.driverName === 'UNKNOWN') continue;
      const existing = map.get(t.driverName) || {
        driverName: t.driverName,
        totalMinutes: 0,
        localMinutes: 0,
        outStationMinutes: 0,
        totalTrips: 0,
        localTrips: 0,
        outStationTrips: 0,
        totalKm: 0,
      };
      existing.totalTrips += 1;
      existing.totalKm += t.kmRun;
      existing.totalMinutes += t.durationMinutes;
      if (t.type === 'local') {
        existing.localTrips += 1;
        existing.localMinutes += t.durationMinutes;
      } else {
        existing.outStationTrips += 1;
        existing.outStationMinutes += t.durationMinutes;
      }
      map.set(t.driverName, existing);
    }

    return Array.from(map.values())
      .map((item) => {
        const avgMin = item.totalTrips > 0 ? Math.round(item.totalMinutes / item.totalTrips) : 0;
        return {
          driverName: item.driverName,
          totalMinutes: item.totalMinutes,
          totalHoursFormatted: formatDuration(item.totalMinutes),
          totalHoursDecimal: Math.round((item.totalMinutes / 60) * 10) / 10,
          localMinutes: item.localMinutes,
          localHoursFormatted: formatDuration(item.localMinutes),
          outStationMinutes: item.outStationMinutes,
          outStationHoursFormatted: formatDuration(item.outStationMinutes),
          totalTrips: item.totalTrips,
          localTrips: item.localTrips,
          outStationTrips: item.outStationTrips,
          totalKm: Math.round(item.totalKm * 10) / 10,
          avgHoursFormatted: formatDuration(avgMin),
        };
      })
      .filter((item) => !query || item.driverName.toLowerCase().includes(query))
      .sort((a, b) => b.totalMinutes - a.totalMinutes);
  }, [filteredTrips, query]);

  // 2. Filtered Car Summary (ONLY joined by Car, filtered by month)
  const filteredCarSummary = useMemo(() => {
    const map = new Map<string, {
      carName: string;
      totalKm: number;
      totalTrips: number;
      localTrips: number;
      outStationTrips: number;
      totalMinutes: number;
    }>();

    for (const t of filteredTrips) {
      if (!t.carName || t.carName === '—') continue;
      const existing = map.get(t.carName) || {
        carName: t.carName,
        totalKm: 0,
        totalTrips: 0,
        localTrips: 0,
        outStationTrips: 0,
        totalMinutes: 0,
      };
      existing.totalTrips += 1;
      existing.totalKm += t.kmRun;
      existing.totalMinutes += t.durationMinutes;
      if (t.type === 'local') {
        existing.localTrips += 1;
      } else {
        existing.outStationTrips += 1;
      }
      map.set(t.carName, existing);
    }

    return Array.from(map.values())
      .map((item) => ({
        carName: item.carName,
        totalKm: Math.round(item.totalKm * 10) / 10,
        totalTrips: item.totalTrips,
        localTrips: item.localTrips,
        outStationTrips: item.outStationTrips,
        totalMinutes: item.totalMinutes,
        totalHoursFormatted: formatDuration(item.totalMinutes),
        avgKmPerTrip: item.totalTrips > 0 ? Math.round((item.totalKm / item.totalTrips) * 10) / 10 : 0,
      }))
      .filter((item) => !query || item.carName.toLowerCase().includes(query))
      .sort((a, b) => b.totalKm - a.totalKm);
  }, [filteredTrips, query]);

  // 3. Filtered Location Summary (ONLY joined by Location, filtered by month)
  const filteredLocationSummary = useMemo(() => {
    const map = new Map<string, {
      location: string;
      totalKm: number;
      totalTrips: number;
      localTrips: number;
      outStationTrips: number;
      totalMinutes: number;
    }>();

    for (const t of filteredTrips) {
      if (!t.station || t.station === '—') continue;
      const existing = map.get(t.station) || {
        location: t.station,
        totalKm: 0,
        totalTrips: 0,
        localTrips: 0,
        outStationTrips: 0,
        totalMinutes: 0,
      };
      existing.totalTrips += 1;
      existing.totalKm += t.kmRun;
      existing.totalMinutes += t.durationMinutes;
      if (t.type === 'local') {
        existing.localTrips += 1;
      } else {
        existing.outStationTrips += 1;
      }
      map.set(t.station, existing);
    }

    return Array.from(map.values())
      .map((item) => ({
        location: item.location,
        totalKm: Math.round(item.totalKm * 10) / 10,
        totalTrips: item.totalTrips,
        localTrips: item.localTrips,
        outStationTrips: item.outStationTrips,
        totalMinutes: item.totalMinutes,
        totalHoursFormatted: formatDuration(item.totalMinutes),
        avgKmPerTrip: item.totalTrips > 0 ? Math.round((item.totalKm / item.totalTrips) * 10) / 10 : 0,
      }))
      .filter((item) => !query || item.location.toLowerCase().includes(query))
      .sort((a, b) => b.totalTrips - a.totalTrips || b.totalKm - a.totalKm);
  }, [filteredTrips, query]);

  // 4. Filtered Car Destination Summary (ONLY joined by Car + Destination, filtered by month)
  const filteredCarDestinationSummary = useMemo(() => {
    const map = new Map<string, {
      carName: string;
      destination: string;
      totalTrips: number;
      totalKm: number;
      totalMinutes: number;
    }>();

    for (const t of filteredTrips) {
      if (!t.carName || t.carName === '—' || !t.station) continue;
      const key = `${t.carName}__${t.station}`;
      const existing = map.get(key) || {
        carName: t.carName,
        destination: t.station,
        totalTrips: 0,
        totalKm: 0,
        totalMinutes: 0,
      };
      existing.totalTrips += 1;
      existing.totalKm += t.kmRun;
      existing.totalMinutes += t.durationMinutes;
      map.set(key, existing);
    }

    return Array.from(map.values())
      .map((item) => ({
        carName: item.carName,
        destination: item.destination,
        totalTrips: item.totalTrips,
        totalKm: Math.round(item.totalKm * 10) / 10,
        totalMinutes: item.totalMinutes,
        totalHoursFormatted: formatDuration(item.totalMinutes),
        avgKmPerTrip: item.totalTrips > 0 ? Math.round((item.totalKm / item.totalTrips) * 10) / 10 : 0,
      }))
      .filter((item) => {
        const matchCar = !query || item.carName.toLowerCase().includes(query);
        const matchDest = !query || item.destination.toLowerCase().includes(query);
        return matchCar || matchDest;
      })
      .sort((a, b) => a.carName.localeCompare(b.carName) || b.totalTrips - a.totalTrips);
  }, [filteredTrips, query]);

  // Export Handlers
  const exportLocalTime = () => {
    const rows = [
      ['Driver Name', 'Total Trips (Local)', 'Total Time Spent', 'Total Minutes', 'Avg Duration/Trip', 'Total KM Run (Local)', 'Last Active Date'],
      ...filteredLocalTime.map((item) => [
        item.driverName,
        String(item.tripCount),
        item.totalHoursFormatted,
        String(item.totalMinutes),
        item.avgHoursFormatted,
        String(item.totalKm),
        item.lastTripDate || '—',
      ]),
    ];
    downloadCsv(`local-driving-time-report-${month !== 'ALL' ? month : 'all'}.csv`, rows);
  };

  const exportDriverKm = () => {
    const rows = [
      ['Driver Name', 'Total KM Run', 'Local KM Run', 'Out of Station KM Run', 'Total Trips', 'Local Trips', 'Out of Station Trips', 'Avg KM/Trip', 'Total Driving Time', 'Last Trip Date'],
      ...filteredDriverKm.map((item) => [
        item.driverName,
        String(item.totalKm),
        String(item.localKm),
        String(item.outStationKm),
        String(item.totalTrips),
        String(item.localTrips),
        String(item.outStationTrips),
        String(item.avgKmPerTrip),
        item.totalHoursFormatted,
        item.lastTripDate || '—',
      ]),
    ];
    downloadCsv(`driver-km-report-${month !== 'ALL' ? month : 'all'}.csv`, rows);
  };

  const exportTripsBreakdown = () => {
    const rows = [
      ['Date', 'Trip Category', 'Register Source', 'Driver Name', 'Vehicle/Car', 'Destination / Station', 'Out Time', 'In Time', 'Duration', 'Initial Odometer', 'Final Odometer', 'KM Run', 'Passenger / In Car', 'Requested By Whom', 'Signature / Verifier'],
      ...filteredTrips.map((trip) => [
        trip.date,
        trip.typeLabel,
        trip.registerSlug,
        trip.driverName,
        trip.carName,
        trip.station,
        trip.outTime,
        trip.inTime,
        trip.durationFormatted,
        String(trip.initialReading),
        String(trip.finalReading),
        String(trip.kmRun),
        trip.personInCar,
        trip.requestedByWhom || '—',
        trip.signature,
      ]),
    ];
    downloadCsv(`trips-manifest-local-vs-outstation-${month !== 'ALL' ? month : 'all'}.csv`, rows);
  };

  const exportStationKm = () => {
    const rows = [
      ['Station / Destination', 'Driver Name', 'Route Category', 'Trip Count', 'Total KM Run', 'Avg KM/Trip', 'Total Driving Duration'],
      ...filteredStationKm.map((item) => [
        item.station,
        item.driverName,
        item.typeLabel,
        String(item.tripCount),
        String(item.totalKm),
        String(item.avgKmPerTrip),
        item.totalHoursFormatted,
      ]),
    ];
    downloadCsv(`station-wise-driver-km-report-${month !== 'ALL' ? month : 'all'}.csv`, rows);
  };

  // 1. Export Driver Hours
  const exportDriverHours = () => {
    const rows = [
      ['Driver Name', 'Total Driving Hours', 'Total Minutes', 'Total Hours (Decimal)', 'Local Hours', 'Out of Station Hours', 'Total Trips', 'Local Trips', 'Out of Station Trips', 'Total KM Run', 'Avg Time/Trip'],
      ...filteredDriverHours.map((item) => [
        item.driverName,
        item.totalHoursFormatted,
        String(item.totalMinutes),
        String(item.totalHoursDecimal),
        item.localHoursFormatted,
        item.outStationHoursFormatted,
        String(item.totalTrips),
        String(item.localTrips),
        String(item.outStationTrips),
        String(item.totalKm),
        item.avgHoursFormatted,
      ]),
    ];
    downloadCsv(`driver-hours-report-${month !== 'ALL' ? month : 'all'}.csv`, rows);
  };

  // 2. Export Car-Wise Report
  const exportCarReport = () => {
    const rows = [
      ['Car / Vehicle', 'Total KM Run', 'Total Trips', 'Local Trips', 'Out of Station Trips', 'Usage Duration', 'Avg KM/Trip'],
      ...filteredCarSummary.map((item) => [
        item.carName,
        String(item.totalKm),
        String(item.totalTrips),
        String(item.localTrips),
        String(item.outStationTrips),
        item.totalHoursFormatted,
        String(item.avgKmPerTrip),
      ]),
    ];
    downloadCsv(`car-wise-report-${month !== 'ALL' ? month : 'all'}.csv`, rows);
  };

  // 3. Export Location-Wise Report
  const exportLocationReport = () => {
    const rows = [
      ['Destination / Location', 'Total KM Run', 'Total Trips', 'Local Trips', 'Out of Station Trips', 'Travel Duration', 'Avg KM/Trip'],
      ...filteredLocationSummary.map((item) => [
        item.location,
        String(item.totalKm),
        String(item.totalTrips),
        String(item.localTrips),
        String(item.outStationTrips),
        item.totalHoursFormatted,
        String(item.avgKmPerTrip),
      ]),
    ];
    downloadCsv(`location-wise-report-${month !== 'ALL' ? month : 'all'}.csv`, rows);
  };

  // 4. Export Destinations Covered by Car
  const exportCarDestination = () => {
    const rows = [
      ['Car / Vehicle', 'Destination Covered', 'Total Trips', 'Total KM Run', 'Total Driving Duration', 'Avg KM/Trip'],
      ...filteredCarDestinationSummary.map((item) => [
        item.carName,
        item.destination,
        String(item.totalTrips),
        String(item.totalKm),
        item.totalHoursFormatted,
        String(item.avgKmPerTrip),
      ]),
    ];
    downloadCsv(`destinations-by-car-report-${month !== 'ALL' ? month : 'all'}.csv`, rows);
  };

  return (
    <div className="space-y-6">
      {/* Module 2.0 Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-teal-500/20 bg-gradient-to-r from-teal-500/10 via-emerald-500/5 to-transparent p-5 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="grid size-12 place-items-center rounded-xl bg-teal-600 text-white shadow-md">
            <Car size={26} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-teal-600/15 px-2.5 py-0.5 font-mono text-[11px] font-bold uppercase tracking-wider text-teal-700 dark:text-teal-400">
                Module Report 2.0
              </span>
              <span className="font-mono text-xs text-muted-foreground">Fleet & Driver Intelligence</span>
            </div>
            <h1 className="mt-1 font-serif text-2xl font-bold tracking-tight text-foreground">
              Driver & Vehicle Movement Analytics
            </h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Local driving duration, driver KM totals, monthly driver hours, car-wise & location-wise monthly manifests, and destination coverage.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => void loadData()}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border border-border bg-card px-3.5 py-2 text-xs font-semibold text-foreground shadow-sm hover:bg-muted disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>

          {activeTab === 'local-time' && (
            <button
              onClick={exportLocalTime}
              disabled={loading || !filteredLocalTime.length}
              className="flex items-center gap-2 rounded-lg bg-teal-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-teal-700 disabled:opacity-50"
            >
              <Download size={14} /> Export Local Time (CSV)
            </button>
          )}
          {activeTab === 'driver-km' && (
            <button
              onClick={exportDriverKm}
              disabled={loading || !filteredDriverKm.length}
              className="flex items-center gap-2 rounded-lg bg-teal-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-teal-700 disabled:opacity-50"
            >
              <Download size={14} /> Export Driver KM (CSV)
            </button>
          )}
          {activeTab === 'trips-breakdown' && (
            <button
              onClick={exportTripsBreakdown}
              disabled={loading || !filteredTrips.length}
              className="flex items-center gap-2 rounded-lg bg-teal-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-teal-700 disabled:opacity-50"
            >
              <Download size={14} /> Export Trips Manifest (CSV)
            </button>
          )}
          {activeTab === 'station-km' && (
            <button
              onClick={exportStationKm}
              disabled={loading || !filteredStationKm.length}
              className="flex items-center gap-2 rounded-lg bg-teal-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-teal-700 disabled:opacity-50"
            >
              <Download size={14} /> Export Station KM (CSV)
            </button>
          )}
          {activeTab === 'driver-monthly-hours' && (
            <button
              onClick={exportDriverHours}
              disabled={loading || !filteredDriverHours.length}
              className="flex items-center gap-2 rounded-lg bg-teal-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-teal-700 disabled:opacity-50"
            >
              <Download size={14} /> Export Driver Hours (CSV)
            </button>
          )}
          {activeTab === 'car-monthly' && (
            <button
              onClick={exportCarReport}
              disabled={loading || !filteredCarSummary.length}
              className="flex items-center gap-2 rounded-lg bg-teal-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-teal-700 disabled:opacity-50"
            >
              <Download size={14} /> Export Car-Wise Report (CSV)
            </button>
          )}
          {activeTab === 'location-monthly' && (
            <button
              onClick={exportLocationReport}
              disabled={loading || !filteredLocationSummary.length}
              className="flex items-center gap-2 rounded-lg bg-teal-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-teal-700 disabled:opacity-50"
            >
              <Download size={14} /> Export Location-Wise Report (CSV)
            </button>
          )}
          {activeTab === 'car-destination-monthly' && (
            <button
              onClick={exportCarDestination}
              disabled={loading || !filteredCarDestinationSummary.length}
              className="flex items-center gap-2 rounded-lg bg-teal-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-teal-700 disabled:opacity-50"
            >
              <Download size={14} /> Export Destinations by Car (CSV)
            </button>
          )}
        </div>
      </div>

      {/* KPI Overview Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm transition hover:border-teal-500/40">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Total Combined KM
            </span>
            <span className="grid size-8 place-items-center rounded-lg bg-emerald-500/10 text-emerald-600">
              <Gauge size={16} />
            </span>
          </div>
          <div className="mt-2 text-3xl font-extrabold text-foreground">
            {report?.totals.totalKm ?? 0} <span className="text-base font-normal text-muted-foreground">km</span>
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="font-medium text-teal-600 dark:text-teal-400">{report?.totals.localKm ?? 0} km local</span>
            <span>·</span>
            <span className="font-medium text-amber-600 dark:text-amber-400">{report?.totals.outStationKm ?? 0} km out-station</span>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-sm transition hover:border-teal-500/40">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Local Driving Time
            </span>
            <span className="grid size-8 place-items-center rounded-lg bg-teal-500/10 text-teal-600">
              <Clock size={16} />
            </span>
          </div>
          <div className="mt-2 text-3xl font-extrabold text-foreground">
            {report?.totals.localHoursFormatted || '0m'}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            Spent in <span className="font-medium text-foreground">{report?.totals.localTrips ?? 0} local trips</span> (Outgoing Vehicle Log)
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-sm transition hover:border-teal-500/40">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Trip Manifest
            </span>
            <span className="grid size-8 place-items-center rounded-lg bg-blue-500/10 text-blue-600">
              <Car size={16} />
            </span>
          </div>
          <div className="mt-2 text-3xl font-extrabold text-foreground">
            {report?.totals.totalTrips ?? 0} <span className="text-base font-normal text-muted-foreground">trips</span>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {report?.totals.localTrips ?? 0} Local · {report?.totals.outStationTrips ?? 0} Out of Station
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-sm transition hover:border-teal-500/40">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Active Network
            </span>
            <span className="grid size-8 place-items-center rounded-lg bg-purple-500/10 text-purple-600">
              <Users size={16} />
            </span>
          </div>
          <div className="mt-2 text-3xl font-extrabold text-foreground">
            {report?.availableDrivers.length ?? 0} <span className="text-base font-normal text-muted-foreground">drivers</span>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            Across {report?.availableCars.length ?? 0} cars & {report?.availableStations.length ?? 0} destinations
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-4 lg:items-end">
          <label>
            <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold">
              <CalendarDays size={13} /> Month Select
            </span>
            <select
              value={month}
              onChange={(e) => {
                setMonth(e.target.value);
                void loadData(driver, tripType, e.target.value, car);
              }}
              className={inputClass}
            >
              <option value="ALL">All Months</option>
              {(report?.availableMonths ?? []).map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label} ({m.key})
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold">
              <User size={13} /> Driver Filter
            </span>
            <select
              value={driver}
              onChange={(e) => {
                setDriver(e.target.value);
                void loadData(e.target.value, tripType, month, car);
              }}
              className={inputClass}
            >
              <option value="ALL">All Drivers</option>
              {(report?.availableDrivers ?? []).map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold">
              <Car size={13} /> Vehicle / Car
            </span>
            <select
              value={car}
              onChange={(e) => {
                setCar(e.target.value);
                void loadData(driver, tripType, month, e.target.value);
              }}
              className={inputClass}
            >
              <option value="ALL">All Cars</option>
              {(report?.availableCars ?? []).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>

          <div className="flex gap-2">
            <button
              onClick={() => void loadData(driver, tripType, month, car)}
              disabled={loading}
              className="flex h-[38px] flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground shadow hover:opacity-90 disabled:opacity-50"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Apply Filters
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}
      </div>

      {/* Sub-report Tab Selector */}
      <div className="border-b border-border">
        <nav className="flex flex-wrap gap-1 sm:gap-2">
          {/* LIVE DRIVER PRESENCE BOARD */}
          <button
            onClick={() => {
              setActiveTab('live-drivers');
              if (!liveDriversData) void loadLiveDrivers();
            }}
            className={`flex items-center gap-2 border-b-2 px-3.5 py-2.5 text-xs sm:text-sm font-bold transition ${
              activeTab === 'live-drivers'
                ? 'border-emerald-600 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400 dark:text-emerald-300'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <span className="relative flex size-2.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex size-2.5 rounded-full bg-emerald-500"></span>
            </span>
            <Users size={15} /> Live Driver Presence
            <span className="rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-emerald-800 dark:text-emerald-200">
              {liveDriversData ? `${liveDriversData.summary.totalPresentToday} Present` : 'Live'}
            </span>
          </button>

          {/* Group 1: Core Daily Registers */}
          <button
            onClick={() => setActiveTab('local-time')}
            className={`flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-xs sm:text-sm font-semibold transition ${
              activeTab === 'local-time'
                ? 'border-teal-600 text-teal-700 dark:border-teal-400 dark:text-teal-300'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Clock size={15} /> 1. Local Time
            <span className="rounded-full bg-teal-500/15 px-1.5 py-0.5 text-[11px] font-bold text-teal-700 dark:text-teal-300">
              {filteredLocalTime.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('driver-km')}
            className={`flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-xs sm:text-sm font-semibold transition ${
              activeTab === 'driver-km'
                ? 'border-teal-600 text-teal-700 dark:border-teal-400 dark:text-teal-300'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <User size={15} /> 2.a Driver KM
            <span className="rounded-full bg-teal-500/15 px-1.5 py-0.5 text-[11px] font-bold text-teal-700 dark:text-teal-300">
              {filteredDriverKm.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('trips-breakdown')}
            className={`flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-xs sm:text-sm font-semibold transition ${
              activeTab === 'trips-breakdown'
                ? 'border-teal-600 text-teal-700 dark:border-teal-400 dark:text-teal-300'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Gauge size={15} /> 2.b Local vs Out-Station
            <span className="rounded-full bg-teal-500/15 px-1.5 py-0.5 text-[11px] font-bold text-teal-700 dark:text-teal-300">
              {filteredTrips.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('station-km')}
            className={`flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-xs sm:text-sm font-semibold transition ${
              activeTab === 'station-km'
                ? 'border-teal-600 text-teal-700 dark:border-teal-400 dark:text-teal-300'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <MapPin size={15} /> 2.c Station by Driver
            <span className="rounded-full bg-teal-500/15 px-1.5 py-0.5 text-[11px] font-bold text-teal-700 dark:text-teal-300">
              {filteredStationKm.length}
            </span>
          </button>

          {/* Group 2: Monthly Analytics (User Requested) */}
          <button
            onClick={() => setActiveTab('driver-monthly-hours')}
            className={`flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-xs sm:text-sm font-bold transition ${
              activeTab === 'driver-monthly-hours'
                ? 'border-teal-600 text-teal-700 dark:border-teal-400 dark:text-teal-300 bg-teal-500/5'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Clock size={15} /> 3. Driver Hours
            <span className="rounded-full bg-teal-500/15 px-1.5 py-0.5 text-[11px] font-bold text-teal-700 dark:text-teal-300">
              {filteredDriverHours.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('car-monthly')}
            className={`flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-xs sm:text-sm font-bold transition ${
              activeTab === 'car-monthly'
                ? 'border-teal-600 text-teal-700 dark:border-teal-400 dark:text-teal-300 bg-teal-500/5'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Car size={15} /> 4. Car-Wise Report
            <span className="rounded-full bg-teal-500/15 px-1.5 py-0.5 text-[11px] font-bold text-teal-700 dark:text-teal-300">
              {filteredCarSummary.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('location-monthly')}
            className={`flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-xs sm:text-sm font-bold transition ${
              activeTab === 'location-monthly'
                ? 'border-teal-600 text-teal-700 dark:border-teal-400 dark:text-teal-300 bg-teal-500/5'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Compass size={15} /> 5. Location-Wise Report
            <span className="rounded-full bg-teal-500/15 px-1.5 py-0.5 text-[11px] font-bold text-teal-700 dark:text-teal-300">
              {filteredLocationSummary.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('car-destination-monthly')}
            className={`flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-xs sm:text-sm font-bold transition ${
              activeTab === 'car-destination-monthly'
                ? 'border-teal-600 text-teal-700 dark:border-teal-400 dark:text-teal-300 bg-teal-500/5'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <MapPin size={15} /> 6. Destinations by Car
            <span className="rounded-full bg-teal-500/15 px-1.5 py-0.5 text-[11px] font-bold text-teal-700 dark:text-teal-300">
              {filteredCarDestinationSummary.length}
            </span>
          </button>
        </nav>
      </div>

      {/* Quick Month Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 font-mono text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <CalendarDays size={14} className="text-teal-600" /> Filter by Month:
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                setMonth('ALL');
                void loadData(driver, tripType, 'ALL', car);
              }}
              className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                month === 'ALL'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'border border-border bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              All Months
            </button>
            {(report?.availableMonths ?? []).map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => {
                  setMonth(m.key);
                  void loadData(driver, tripType, m.key, car);
                }}
                className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                  month === m.key
                    ? 'bg-teal-600 text-white shadow-sm'
                    : 'border border-border bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div className="text-xs text-muted-foreground">
          Active Filter: <span className="font-bold text-teal-700 dark:text-teal-400">{month !== 'ALL' ? (report?.availableMonths.find((m) => m.key === month)?.label || month) : 'All Months (Combined)'}</span>
        </div>
      </div>

      {/* Global Quick Search Bar */}
      <div className="flex items-center justify-between gap-3">
        <div className="w-full max-w-sm">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-2.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search driver, car, or location in current view…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`${inputClass} pl-8`}
            />
          </div>
        </div>
        <div className="text-xs text-muted-foreground">
          Showing data for: <span className="font-semibold text-foreground">{month !== 'ALL' ? month : 'All Months'}</span>
          {car !== 'ALL' && <span> · Car: <span className="font-semibold text-foreground">{car}</span></span>}
          {driver !== 'ALL' && <span> · Driver: <span className="font-semibold text-foreground">{driver}</span></span>}
        </div>
      </div>

      {/* TAB 0: LIVE DRIVER PRESENCE BOARD */}
      {activeTab === 'live-drivers' && (
        <div className="space-y-5">
          {/* Section Header */}
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <div className="flex items-center gap-2">
                <span className="relative flex size-2.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex size-2.5 rounded-full bg-emerald-500"></span>
                </span>
                <span className="font-mono text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                  Real-time Duty Board · {liveDriversData?.targetDate || 'Today'}
                </span>
              </div>
              <h2 className="mt-1 font-serif text-2xl font-bold tracking-tight">
                Live Driver Presence & Vehicle Assignment Board
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Instant operational overview of which drivers are punched in, currently on premises, out on active trips, or shift ended.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => void loadLiveDrivers()}
                disabled={liveLoading}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50"
              >
                <RefreshCw size={14} className={liveLoading ? 'animate-spin' : ''} />
                Refresh Roster
              </button>
              <button
                onClick={exportLiveDriversCsv}
                disabled={liveLoading || !liveDriversData?.drivers.length}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white shadow hover:bg-emerald-700 disabled:opacity-50 dark:bg-emerald-500"
              >
                <Download size={14} />
                Export Live Roster CSV
              </button>
            </div>
          </div>

          {/* KPI Summary Cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <div className="rounded-xl border border-border bg-card p-3.5 shadow-sm">
              <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Total Drivers</div>
              <div className="mt-1 font-serif text-2xl font-bold text-foreground">
                {liveDriversData?.summary.totalRegistered ?? 0}
              </div>
              <div className="text-[10px] text-muted-foreground">registered in directory</div>
            </div>

            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3.5 shadow-sm">
              <div className="font-mono text-[10px] uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Present Today</div>
              <div className="mt-1 font-serif text-2xl font-bold text-emerald-700 dark:text-emerald-300">
                {liveDriversData?.summary.totalPresentToday ?? 0}
              </div>
              <div className="text-[10px] text-emerald-600/80">punched in on duty</div>
            </div>

            <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-3.5 shadow-sm">
              <div className="font-mono text-[10px] uppercase tracking-wider text-green-700 dark:text-green-400">Available Now</div>
              <div className="mt-1 font-serif text-2xl font-bold text-green-700 dark:text-green-300">
                {liveDriversData?.summary.availableNow ?? 0}
              </div>
              <div className="text-[10px] text-green-600/80">ready for dispatch</div>
            </div>

            <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-3.5 shadow-sm">
              <div className="font-mono text-[10px] uppercase tracking-wider text-indigo-700 dark:text-indigo-400">On Active Trip</div>
              <div className="mt-1 font-serif text-2xl font-bold text-indigo-700 dark:text-indigo-300">
                {liveDriversData?.summary.onTripNow ?? 0}
              </div>
              <div className="text-[10px] text-indigo-600/80">on road with vehicle</div>
            </div>

            <div className="rounded-xl border border-border bg-card p-3.5 shadow-sm">
              <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Shift Ended</div>
              <div className="mt-1 font-serif text-2xl font-bold text-foreground">
                {liveDriversData?.summary.punchedOutToday ?? 0}
              </div>
              <div className="text-[10px] text-muted-foreground">punched out today</div>
            </div>

            <div className="rounded-xl border border-border bg-card p-3.5 shadow-sm">
              <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Not Reported</div>
              <div className="mt-1 font-serif text-2xl font-bold text-muted-foreground">
                {liveDriversData?.summary.notReportedToday ?? 0}
              </div>
              <div className="text-[10px] text-muted-foreground">no entry logged today</div>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 shadow-sm">
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  ['all', `All Drivers (${liveDriversData?.drivers.length ?? 0})`],
                  ['available', `Available Now (${liveDriversData?.summary.availableNow ?? 0})`],
                  ['on_trip', `On Trip (${liveDriversData?.summary.onTripNow ?? 0})`],
                  ['punched_out', `Shift Ended (${liveDriversData?.summary.punchedOutToday ?? 0})`],
                  ['not_reported', `Not Logged (${liveDriversData?.summary.notReportedToday ?? 0})`],
                ] as const
              ).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setLiveStatusFilter(val)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    liveStatusFilter === val
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="relative min-w-[240px] flex-1 sm:max-w-xs">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search driver name, phone, car..."
                value={liveSearchQuery}
                onChange={(e) => setLiveSearchQuery(e.target.value)}
                className={`${inputClass} pl-8 py-1.5 text-xs`}
              />
            </div>
          </div>

          {/* Drivers List */}
          {liveLoading ? (
            <div className="space-y-3 p-8">
              <div className="h-8 w-1/3 animate-pulse rounded bg-muted" />
              <div className="h-64 animate-pulse rounded-xl bg-muted" />
            </div>
          ) : liveError ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center">
              <AlertTriangle className="mx-auto size-8 text-destructive" />
              <p className="mt-2 text-sm font-semibold text-destructive">{liveError}</p>
              <button
                onClick={() => void loadLiveDrivers()}
                className="mt-3 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
              >
                Retry
              </button>
            </div>
          ) : !filteredLiveDrivers.length ? (
            <div className="rounded-xl border border-border bg-card p-12 text-center text-muted-foreground">
              <Users className="mx-auto size-10 opacity-30" />
              <p className="mt-3 text-base font-semibold">No drivers matching this filter</p>
              <p className="mt-1 text-xs">Try switching status filters or clearing the search box.</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-border bg-muted/40 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3">Driver Name & Contact</th>
                      <th className="px-4 py-3">Live Presence Status</th>
                      <th className="px-4 py-3">Attendance In / Out</th>
                      <th className="px-4 py-3">Current Active Vehicle Trip</th>
                      <th className="px-4 py-3 text-center">Trips Completed Today</th>
                      <th className="px-4 py-3 text-center">KM Driven Today</th>
                      <th className="px-4 py-3">Assigned Schedule</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredLiveDrivers.map((d) => (
                      <tr key={d.driverName} className="transition hover:bg-muted/30">
                        {/* Driver & Contact */}
                        <td className="px-4 py-3.5">
                          <div className="font-bold text-foreground">{d.driverName}</div>
                          <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                            {d.phone ? (
                              <a
                                href={`tel:${d.phone}`}
                                className="inline-flex items-center gap-1 font-mono text-primary hover:underline"
                                title="Click to call driver"
                              >
                                <Phone size={11} /> {d.phone}
                              </a>
                            ) : (
                              <span>No phone</span>
                            )}
                            {d.supervisor && <span>· Sup: {d.supervisor}</span>}
                          </div>
                        </td>

                        {/* Live Status Badge */}
                        <td className="px-4 py-3.5">
                          {d.liveStatus === 'available' ? (
                            <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                              <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                              Available on Premises
                            </div>
                          ) : d.liveStatus === 'on_trip' ? (
                            <div className="inline-flex items-center gap-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-1 text-xs font-bold text-indigo-700 dark:text-indigo-300">
                              <Car size={13} />
                              On Trip
                            </div>
                          ) : d.liveStatus === 'on_station' ? (
                            <div className="inline-flex items-center gap-1.5 rounded-full border border-purple-500/30 bg-purple-500/10 px-2.5 py-1 text-xs font-bold text-purple-700 dark:text-purple-300">
                              <MapPin size={13} />
                              On Out-Station
                            </div>
                          ) : d.liveStatus === 'punched_out' ? (
                            <div className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/60 px-2.5 py-1 text-xs font-medium text-muted-foreground">
                              Shift Ended
                            </div>
                          ) : (
                            <div className="inline-flex items-center gap-1.5 rounded-full border border-destructive/20 bg-destructive/5 px-2.5 py-1 text-xs font-medium text-destructive/80">
                              Not Logged Today
                            </div>
                          )}
                        </td>

                        {/* Attendance */}
                        <td className="px-4 py-3.5 text-xs font-mono">
                          {d.inTime ? (
                            <div>
                              <span className="font-semibold text-emerald-700 dark:text-emerald-400">In: {d.inTime}</span>
                              {d.outTime && <span className="ml-2 text-muted-foreground">Out: {d.outTime}</span>}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>

                        {/* Active Trip */}
                        <td className="max-w-xs px-4 py-3.5 text-xs">
                          {d.activeTrip ? (
                            <div className="space-y-0.5 rounded-lg border border-indigo-500/20 bg-indigo-500/5 p-2 text-indigo-950 dark:text-indigo-200">
                              <div className="flex items-center gap-1 font-bold">
                                <Car size={13} className="text-indigo-600 dark:text-indigo-400" />
                                <span>{d.activeTrip.carName}</span>
                                <span>→</span>
                                <span>{d.activeTrip.station}</span>
                              </div>
                              <div className="text-[11px] text-muted-foreground">
                                Out: <span className="font-mono font-semibold">{d.activeTrip.outTime}</span>
                                {d.activeTrip.personInCar !== '—' && <span> · Passenger: {d.activeTrip.personInCar}</span>}
                              </div>
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </td>

                        {/* Trips Completed */}
                        <td className="px-4 py-3.5 text-center font-bold">
                          {d.todayTripsCount > 0 ? (
                            <span className="rounded bg-teal-500/10 px-2 py-0.5 text-xs text-teal-700 dark:text-teal-300">
                              {d.todayTripsCount} trips
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">0</span>
                          )}
                        </td>

                        {/* KM Driven */}
                        <td className="px-4 py-3.5 text-center font-mono text-xs font-semibold">
                          {d.todayKm > 0 ? `${d.todayKm} km` : '—'}
                        </td>

                        {/* Scheduled Trip */}
                        <td className="max-w-xs px-4 py-3.5 text-xs">
                          {d.scheduledTrip ? (
                            <div className="rounded border border-border bg-background/50 px-2 py-1">
                              <span className="font-mono font-bold text-amber-700 dark:text-amber-400">
                                {d.scheduledTrip.scheduleTime}
                              </span>
                              <span className="ml-1 text-muted-foreground">
                                ({d.scheduledTrip.carName} · {d.scheduledTrip.location})
                              </span>
                            </div>
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
          )}
        </div>
      )}

      {/* TAB 1: 1. Time spent by driver in local */}
      {activeTab === 'local-time' && (
        <div className="space-y-4">
          <div>
            <span className="font-mono text-xs font-bold uppercase tracking-wider text-teal-600">
              Register: Outgoing Vehicle Log(local )
            </span>
            <h2 className="font-serif text-xl font-bold">1. Time Spent by Driver in Local</h2>
            <p className="text-xs text-muted-foreground">
              Total hours and minutes spent by each driver on local trips, computed from out-time to in-time.
            </p>
          </div>

          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="max-h-[32rem] overflow-auto">
              <table className="w-full min-w-[750px] text-left text-sm">
                <thead className="sticky top-0 z-10 border-b border-border bg-muted/95">
                  <tr>
                    {['Driver Name', 'Total Time Spent', 'Total Trips (Local)', 'Avg Duration / Trip', 'Total KM (Local)', 'Last Trip Date'].map((label) => (
                      <th key={label} className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredLocalTime.map((item) => (
                    <tr key={item.driverName} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-semibold text-foreground">
                        <div className="flex items-center gap-2">
                          <span className="grid size-7 place-items-center rounded-full bg-teal-500/10 font-mono text-xs font-bold text-teal-700 dark:text-teal-300">
                            {item.driverName.slice(0, 2)}
                          </span>
                          <span>{item.driverName}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono font-bold text-teal-700 dark:text-teal-400">
                        {item.totalHoursFormatted}
                        <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                          ({item.totalMinutes}m)
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-foreground">{item.tripCount}</td>
                      <td className="px-4 py-3 font-mono text-muted-foreground">
                        {item.avgHoursFormatted}
                      </td>
                      <td className="px-4 py-3 font-mono font-medium text-foreground">
                        {item.totalKm} km
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {item.lastTripDate || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!loading && !filteredLocalTime.length && (
                <div className="p-12 text-center text-sm text-muted-foreground">
                  No local driving records found matching the current filters.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: 2.a Total KM per Driver */}
      {activeTab === 'driver-km' && (
        <div className="space-y-4">
          <div>
            <span className="font-mono text-xs font-bold uppercase tracking-wider text-teal-600">
              Combined Fleet Analysis
            </span>
            <h2 className="font-serif text-xl font-bold">2.a Report Total KM per Driver</h2>
            <p className="text-xs text-muted-foreground">
              Total kilometers traveled by each driver across both Local and Out-of-Station registers.
            </p>
          </div>

          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="max-h-[32rem] overflow-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="sticky top-0 z-10 border-b border-border bg-muted/95">
                  <tr>
                    {['Driver Name', 'Total KM Run', 'Local KM', 'Out-Station KM', 'Total Trips', 'Avg KM / Trip', 'Total Driving Duration', 'Last Trip Date'].map((label) => (
                      <th key={label} className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredDriverKm.map((item) => (
                    <tr key={item.driverName} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-semibold text-foreground">
                        <div className="flex items-center gap-2">
                          <span className="grid size-7 place-items-center rounded-full bg-primary/10 font-mono text-xs font-bold text-primary">
                            {item.driverName.slice(0, 2)}
                          </span>
                          <span>{item.driverName}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-base font-extrabold text-foreground">
                        {item.totalKm} <span className="text-xs font-normal text-muted-foreground">km</span>
                      </td>
                      <td className="px-4 py-3 font-mono font-medium text-teal-600 dark:text-teal-400">
                        {item.localKm} km
                        <span className="ml-1 text-[10px] text-muted-foreground">({item.localTrips}t)</span>
                      </td>
                      <td className="px-4 py-3 font-mono font-medium text-amber-600 dark:text-amber-400">
                        {item.outStationKm} km
                        <span className="ml-1 text-[10px] text-muted-foreground">({item.outStationTrips}t)</span>
                      </td>
                      <td className="px-4 py-3 font-mono text-foreground font-semibold">
                        {item.totalTrips}
                      </td>
                      <td className="px-4 py-3 font-mono text-muted-foreground">
                        {item.avgKmPerTrip} km
                      </td>
                      <td className="px-4 py-3 font-mono font-medium text-foreground">
                        {item.totalHoursFormatted}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {item.lastTripDate || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!loading && !filteredDriverKm.length && (
                <div className="p-12 text-center text-sm text-muted-foreground">
                  No driver KM records found matching the current filters.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: 2.b Local vs Out Stations Trips */}
      {activeTab === 'trips-breakdown' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="font-mono text-xs font-bold uppercase tracking-wider text-teal-600">
                Segmented Trip Manifest
              </span>
              <h2 className="font-serif text-xl font-bold">2.b Report Total KM Trips by Local or Out Stations</h2>
              <p className="text-xs text-muted-foreground">
                Full comparative manifest of trips segmented by Local log vs Out of Station register.
              </p>
            </div>

            <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
              <button
                type="button"
                onClick={() => {
                  setTripType('all');
                  void loadData(driver, 'all', month, car);
                }}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                  tripType === 'all' ? 'bg-primary text-primary-foreground font-semibold' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                All Trips ({report?.totals.totalTrips ?? 0})
              </button>
              <button
                type="button"
                onClick={() => {
                  setTripType('unit-2');
                  void loadData(driver, 'unit-2', month, car);
                }}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                  tripType === 'unit-2' ? 'bg-indigo-600 text-white font-semibold' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Unit 2 ({report?.totals.unit2Trips ?? 0})
              </button>
              <button
                type="button"
                onClick={() => {
                  setTripType('local');
                  void loadData(driver, 'local', month, car);
                }}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                  tripType === 'local' ? 'bg-teal-600 text-white font-semibold' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Local ({report?.totals.localTrips ?? 0})
              </button>
              <button
                type="button"
                onClick={() => {
                  setTripType('out-station');
                  void loadData(driver, 'out-station', month, car);
                }}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                  tripType === 'out-station' ? 'bg-amber-600 text-white font-semibold' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Out-Station ({report?.totals.outStationTrips ?? 0})
              </button>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="max-h-[34rem] overflow-auto">
              <table className="w-full min-w-[1100px] text-left text-sm">
                <thead className="sticky top-0 z-10 border-b border-border bg-muted/95">
                  <tr>
                    {[
                      'Date',
                      'Category',
                      'Driver Name',
                      'Car / Vehicle',
                      'Destination',
                      'Out Time',
                      'In Time',
                      'Duration',
                      'Odometer (Start → End)',
                      'KM Car Run',
                      'Person in Car',
                      'Requested By',
                      'Sign',
                    ].map((label) => (
                      <th key={label} className="px-3.5 py-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredTrips.map((trip) => {
                    const isIncompleteTrip =
                      !trip.inTime ||
                      trip.inTime === '—' ||
                      trip.finalReading <= 0 ||
                      !trip.signature ||
                      trip.signature === '—';
                    return (
                      <tr
                        key={trip.id}
                        className={`transition-colors ${
                          isIncompleteTrip
                            ? 'bg-red-500/[0.04] text-red-800 hover:bg-red-500/10 dark:bg-red-950/20 dark:text-red-400'
                            : 'hover:bg-muted/30 text-foreground'
                        }`}
                        title={isIncompleteTrip ? 'Incomplete vehicle entry: trip is not closed or missing data' : undefined}
                      >
                        <td className={`px-3.5 py-3 font-mono text-xs ${isIncompleteTrip ? 'font-medium text-red-800 dark:text-red-400' : ''}`}>{trip.date || '—'}</td>
                        <td className="px-3.5 py-3">
                          {trip.type === 'unit-2' ? (
                            <span className="rounded bg-indigo-500/15 px-2 py-0.5 font-mono text-[11px] font-bold text-indigo-700 dark:text-indigo-300">
                              Unit 2
                            </span>
                          ) : trip.type === 'local' ? (
                            <span className="rounded bg-teal-500/15 px-2 py-0.5 font-mono text-[11px] font-bold text-teal-700 dark:text-teal-300">
                              Local
                            </span>
                          ) : (
                            <span className="rounded bg-amber-500/15 px-2 py-0.5 font-mono text-[11px] font-bold text-amber-700 dark:text-amber-300">
                              Out of Station
                            </span>
                          )}
                        </td>
                        <td className={`px-3.5 py-3 font-semibold ${isIncompleteTrip ? 'text-red-800 dark:text-red-400' : 'text-foreground'}`}>{trip.driverName}</td>
                        <td className={`px-3.5 py-3 font-medium ${isIncompleteTrip ? 'text-red-800 dark:text-red-400' : 'text-foreground'}`}>{trip.carName}</td>
                        <td className="px-3.5 py-3">
                          <span className={`flex items-center gap-1 ${isIncompleteTrip ? 'text-red-800 dark:text-red-400 font-medium' : 'text-foreground'}`}>
                            <MapPin size={12} className={isIncompleteTrip ? 'text-red-800/70 dark:text-red-400/70' : 'text-muted-foreground'} />
                            {trip.station}
                          </span>
                        </td>
                        <td className={`px-3.5 py-3 font-mono text-xs ${isIncompleteTrip ? 'font-medium text-red-800 dark:text-red-400' : 'text-muted-foreground'}`}>{trip.outTime || '—'}</td>
                        <td className={`px-3.5 py-3 font-mono text-xs ${isIncompleteTrip ? 'font-bold text-red-800 dark:text-red-400' : 'text-muted-foreground'}`}>{trip.inTime || '—'}</td>
                        <td className={`px-3.5 py-3 font-mono font-medium ${isIncompleteTrip ? 'text-red-800 dark:text-red-400' : 'text-teal-600 dark:text-teal-400'}`}>
                          {trip.durationFormatted}
                        </td>
                        <td className={`px-3.5 py-3 font-mono text-xs ${isIncompleteTrip ? 'font-medium text-red-800 dark:text-red-400' : 'text-muted-foreground'}`}>
                          {trip.initialReading} → {trip.finalReading}
                        </td>
                        <td className={`px-3.5 py-3 font-mono text-sm font-extrabold ${isIncompleteTrip ? 'text-red-800 dark:text-red-400' : 'text-foreground'}`}>
                          {trip.kmRun} km
                        </td>
                        <td className={`px-3.5 py-3 text-xs ${isIncompleteTrip ? 'font-medium text-red-800 dark:text-red-400' : 'text-muted-foreground'}`}>{trip.personInCar}</td>
                        <td className={`px-3.5 py-3 text-xs font-medium ${isIncompleteTrip ? 'text-red-800 dark:text-red-400' : 'text-foreground'}`}>{trip.requestedByWhom || '—'}</td>
                        <td className={`px-3.5 py-3 text-xs ${isIncompleteTrip ? 'font-medium text-red-800 dark:text-red-400' : 'text-muted-foreground'}`}>{trip.signature || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!loading && !filteredTrips.length && (
                <div className="p-12 text-center text-sm text-muted-foreground">
                  No vehicle trip entries match the chosen filters.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: 2.c Station-wise by driver */}
      {activeTab === 'station-km' && (
        <div className="space-y-4">
          <div>
            <span className="font-mono text-xs font-bold uppercase tracking-wider text-teal-600">
              Route & Destination Analysis
            </span>
            <h2 className="font-serif text-xl font-bold">2.c Report Total KM Station-Wise by Driver</h2>
            <p className="text-xs text-muted-foreground">
              Distribution of trips, driver coverage, and total kilometers run per destination station.
            </p>
          </div>

          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="max-h-[32rem] overflow-auto">
              <table className="w-full min-w-[850px] text-left text-sm">
                <thead className="sticky top-0 z-10 border-b border-border bg-muted/95">
                  <tr>
                    {['Destination / Station', 'Driver Name', 'Trip Category', 'Trip Count', 'Total KM Run', 'Avg KM / Trip', 'Total Driving Duration'].map((label) => (
                      <th key={label} className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredStationKm.map((item, idx) => (
                    <tr key={`${item.station}-${item.driverName}-${item.type}-${idx}`} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-semibold text-foreground">
                        <div className="flex items-center gap-1.5">
                          <MapPin size={14} className="text-primary" />
                          <span>{item.station}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-medium text-foreground">
                        {item.driverName}
                      </td>
                      <td className="px-4 py-3">
                        {item.type === 'local' ? (
                          <span className="rounded bg-teal-500/15 px-2 py-0.5 font-mono text-[10px] font-bold text-teal-700 dark:text-teal-300">
                            Local
                          </span>
                        ) : (
                          <span className="rounded bg-amber-500/15 px-2 py-0.5 font-mono text-[10px] font-bold text-amber-700 dark:text-amber-300">
                            Out of Station
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono font-medium text-foreground">{item.tripCount}</td>
                      <td className="px-4 py-3 font-mono text-base font-extrabold text-foreground">
                        {item.totalKm} <span className="text-xs font-normal text-muted-foreground">km</span>
                      </td>
                      <td className="px-4 py-3 font-mono text-muted-foreground">
                        {item.avgKmPerTrip} km
                      </td>
                      <td className="px-4 py-3 font-mono font-medium text-teal-600 dark:text-teal-400">
                        {item.totalHoursFormatted}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!loading && !filteredStationKm.length && (
                <div className="p-12 text-center text-sm text-muted-foreground">
                  No station records match the chosen search.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: 3. Driver Hours Report */}
      {activeTab === 'driver-monthly-hours' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="font-mono text-xs font-bold uppercase tracking-wider text-teal-600">
                Driver Utilization Analytics
              </span>
              <h2 className="font-serif text-xl font-bold">3. Driver Hours Report</h2>
              <p className="text-xs text-muted-foreground">
                Total driving duration, local vs out-of-station time, trip count, and total kilometers logged per driver.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground shadow-sm">
              Filtered Period: <span className="font-bold text-teal-700 dark:text-teal-400">{month !== 'ALL' ? (report?.availableMonths.find((m) => m.key === month)?.label || month) : 'All Months'}</span>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="max-h-[32rem] overflow-auto">
              <table className="w-full min-w-[850px] text-left text-sm">
                <thead className="sticky top-0 z-10 border-b border-border bg-muted/95">
                  <tr>
                    {['Driver Name', 'Total Driving Hours', 'Local Hours', 'Out-Station Hours', 'Total Trips', 'Total KM', 'Avg Time / Trip'].map((label) => (
                      <th key={label} className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredDriverHours.map((item) => (
                    <tr key={item.driverName} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-semibold text-foreground">
                        <div className="flex items-center gap-2">
                          <span className="grid size-7 place-items-center rounded-full bg-teal-500/10 font-mono text-xs font-bold text-teal-700 dark:text-teal-300">
                            {item.driverName.slice(0, 2)}
                          </span>
                          <span>{item.driverName}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-base font-extrabold text-teal-700 dark:text-teal-400">
                        {item.totalHoursFormatted}
                        <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                          ({item.totalHoursDecimal}h)
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-teal-600 dark:text-teal-400">
                        {item.localHoursFormatted}
                        <span className="ml-1 text-[10px] text-muted-foreground">({item.localTrips}t)</span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-amber-600 dark:text-amber-400">
                        {item.outStationHoursFormatted}
                        <span className="ml-1 text-[10px] text-muted-foreground">({item.outStationTrips}t)</span>
                      </td>
                      <td className="px-4 py-3 font-mono font-medium text-foreground">
                        {item.totalTrips} trips
                      </td>
                      <td className="px-4 py-3 font-mono font-bold text-foreground">
                        {item.totalKm} km
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {item.avgHoursFormatted}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!loading && !filteredDriverHours.length && (
                <div className="p-12 text-center text-sm text-muted-foreground">
                  No driver hour records found for this period.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 6: 4. Car-Wise Report */}
      {activeTab === 'car-monthly' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="font-mono text-xs font-bold uppercase tracking-wider text-teal-600">
                Vehicle Deployment Analytics
              </span>
              <h2 className="font-serif text-xl font-bold">4. Car-Wise Report</h2>
              <p className="text-xs text-muted-foreground">
                Total kilometers run, trips logged, active usage duration, and average mileage per vehicle.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground shadow-sm">
              Filtered Period: <span className="font-bold text-teal-700 dark:text-teal-400">{month !== 'ALL' ? (report?.availableMonths.find((m) => m.key === month)?.label || month) : 'All Months'}</span>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="max-h-[32rem] overflow-auto">
              <table className="w-full min-w-[750px] text-left text-sm">
                <thead className="sticky top-0 z-10 border-b border-border bg-muted/95">
                  <tr>
                    {['Vehicle / Car', 'Total KM Run', 'Total Trips', 'Usage Duration', 'Avg KM / Trip'].map((label) => (
                      <th key={label} className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredCarSummary.map((item) => (
                    <tr key={item.carName} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-semibold text-foreground">
                        <div className="flex items-center gap-2.5">
                          <span className="grid size-8 place-items-center rounded-lg bg-teal-500/10 text-teal-700 dark:text-teal-400">
                            <Car size={16} />
                          </span>
                          <span className="font-bold text-base">{item.carName}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-base font-extrabold text-foreground">
                        {item.totalKm} <span className="text-xs font-normal text-muted-foreground">km</span>
                      </td>
                      <td className="px-4 py-3 font-mono text-foreground font-medium">
                        {item.totalTrips}
                        <span className="ml-1 text-[11px] text-muted-foreground">
                          ({item.localTrips} local · {item.outStationTrips} out)
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono font-medium text-teal-600 dark:text-teal-400">
                        {item.totalHoursFormatted}
                      </td>
                      <td className="px-4 py-3 font-mono text-muted-foreground">
                        {item.avgKmPerTrip} km
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!loading && !filteredCarSummary.length && (
                <div className="p-12 text-center text-sm text-muted-foreground">
                  No vehicle deployment records found for this period.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 7: 5. Location-Wise Report */}
      {activeTab === 'location-monthly' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="font-mono text-xs font-bold uppercase tracking-wider text-teal-600">
                Route Demand Analytics
              </span>
              <h2 className="font-serif text-xl font-bold">5. Location-Wise Report</h2>
              <p className="text-xs text-muted-foreground">
                Total kilometers traveled, trips dispatched, travel duration, and average mileage per destination station.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground shadow-sm">
              Filtered Period: <span className="font-bold text-teal-700 dark:text-teal-400">{month !== 'ALL' ? (report?.availableMonths.find((m) => m.key === month)?.label || month) : 'All Months'}</span>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="max-h-[32rem] overflow-auto">
              <table className="w-full min-w-[750px] text-left text-sm">
                <thead className="sticky top-0 z-10 border-b border-border bg-muted/95">
                  <tr>
                    {['Destination / Location', 'Total KM Run', 'Total Trips', 'Travel Duration', 'Avg KM / Trip'].map((label) => (
                      <th key={label} className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredLocationSummary.map((item) => (
                    <tr key={item.location} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-semibold text-foreground">
                        <div className="flex items-center gap-2">
                          <span className="grid size-8 place-items-center rounded-lg bg-teal-500/10 text-teal-700 dark:text-teal-400">
                            <MapPin size={15} />
                          </span>
                          <span className="font-bold text-base">{item.location}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-base font-extrabold text-foreground">
                        {item.totalKm} <span className="text-xs font-normal text-muted-foreground">km</span>
                      </td>
                      <td className="px-4 py-3 font-mono text-foreground font-medium">
                        {item.totalTrips} trips
                        <span className="ml-1 text-[11px] text-muted-foreground">
                          ({item.localTrips} local · {item.outStationTrips} out)
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono font-medium text-teal-600 dark:text-teal-400">
                        {item.totalHoursFormatted}
                      </td>
                      <td className="px-4 py-3 font-mono text-muted-foreground">
                        {item.avgKmPerTrip} km
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!loading && !filteredLocationSummary.length && (
                <div className="p-12 text-center text-sm text-muted-foreground">
                  No location records found for this period.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 8: 6. Destinations Covered by Car */}
      {activeTab === 'car-destination-monthly' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="font-mono text-xs font-bold uppercase tracking-wider text-teal-600">
                Car Route Manifest
              </span>
              <h2 className="font-serif text-xl font-bold">6. Destinations Covered by Car</h2>
              <p className="text-xs text-muted-foreground">
                Specific routes and destinations covered by each car, with trips count, total kilometers run, and duration.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground shadow-sm">
              Filtered Period: <span className="font-bold text-teal-700 dark:text-teal-400">{month !== 'ALL' ? (report?.availableMonths.find((m) => m.key === month)?.label || month) : 'All Months'}</span>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="max-h-[32rem] overflow-auto">
              <table className="w-full min-w-[750px] text-left text-sm">
                <thead className="sticky top-0 z-10 border-b border-border bg-muted/95">
                  <tr>
                    {['Vehicle / Car', 'Destination Covered', 'Trips Count', 'Total KM Run', 'Driving Duration', 'Avg KM / Trip'].map((label) => (
                      <th key={label} className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredCarDestinationSummary.map((item, idx) => (
                    <tr key={`${item.carName}-${item.destination}-${idx}`} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-semibold text-foreground">
                        <div className="flex items-center gap-1.5">
                          <Car size={15} className="text-teal-600" />
                          <span className="font-bold">{item.carName}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-medium text-foreground">
                        <div className="flex items-center gap-1.5">
                          <MapPin size={13} className="text-muted-foreground" />
                          <span>{item.destination}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono font-medium text-foreground">
                        {item.totalTrips} trips
                      </td>
                      <td className="px-4 py-3 font-mono text-base font-extrabold text-foreground">
                        {item.totalKm} <span className="text-xs font-normal text-muted-foreground">km</span>
                      </td>
                      <td className="px-4 py-3 font-mono font-medium text-teal-600 dark:text-teal-400">
                        {item.totalHoursFormatted}
                      </td>
                      <td className="px-4 py-3 font-mono text-muted-foreground">
                        {item.avgKmPerTrip} km
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!loading && !filteredCarDestinationSummary.length && (
                <div className="p-12 text-center text-sm text-muted-foreground">
                  No car-destination records found for this period.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
