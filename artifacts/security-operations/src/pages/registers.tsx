import { type ChangeEvent, type FormEvent, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, CalendarDays, Car, Check, CheckCircle2, ChevronDown, Clock, Download, Edit3, ExternalLink, FilePlus2, LockKeyhole, LogOut, RefreshCw, Search, Send, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { Link, useLocation, useParams } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { getListRegisterRecordsQueryKey, getListRegistersQueryKey, useCreateRegisterRecord, useDeleteRegisterRecord, useListRegisterRecords, useListRegisters, useUpdateRegisterRecord } from '@workspace/api-client-react';
import type { FieldDefinition, RegisterDefinition, RegisterRecord } from '@workspace/api-client-react';
import { EmptyState, PageIntro } from '@/components/ops-ui';
import { canCreateRegisterRecord, useAuth } from '@/lib/auth';
import {
  calculateServiceDuration,
  currentIndiaTime,
  entryDateBounds,
  formatClockDuration,
  formatDate,
  formatDuration,
  formatTotalDays,
  getAllDateKeys,
  indiaDateKey,
  isBlankValue,
  isYes,
  overtimeMinutesFor,
  timeToMinutes,
  toInputDate,
} from '@/lib/date-utils';

const editWindowForRole = (role?: string) => {
  if (role === 'admin' || role === 'hr') return null;
  if (role === 'manager') return 7;
  if (role === 'security') return 3;
  return undefined;
};

const canEditRecord = (
  createdAt?: string,
  role?: string,
  module?: RegisterDefinition['module'],
  recordDate?: unknown,
  _slug?: string,
) => {
  if (role === 'hr' || role === 'admin') return true;
  if (module === 'master' && ['manager'].includes(role ?? '')) return true;
  const windowDays = editWindowForRole(role);
  if (windowDays === null) return true;
  if (windowDays === undefined || !createdAt) return false;

  const today = indiaDateKey(new Date());
  const todayDate = new Date(`${today}T00:00:00Z`);
  const createdDate = new Date(`${indiaDateKey(new Date(createdAt))}T00:00:00Z`);
  const daysSinceCreation = Math.floor((todayDate.getTime() - createdDate.getTime()) / 86_400_000);
  if (daysSinceCreation < 0 || daysSinceCreation > windowDays) return false;

  const parsedRecordDate = toInputDate(recordDate);
  if (parsedRecordDate && /^\d{4}-\d{2}-\d{2}$/.test(parsedRecordDate)) {
    const rDate = new Date(`${parsedRecordDate}T00:00:00Z`);
    const daysSinceRecordDate = Math.floor((todayDate.getTime() - rDate.getTime()) / 86_400_000);
    if (daysSinceRecordDate < 0 || daysSinceRecordDate > windowDays) return false;
  }
  return true;
};

const canDeleteRecord = (createdAt?: string, role?: string) =>
  role === 'admin' || (role === 'manager' && canEditRecord(createdAt, role));

const editWindowLabel = (role?: string, module?: RegisterDefinition['module']) => module === 'master' && ['admin', 'manager', 'hr'].includes(role ?? '')
  ? 'anytime'
  : role === 'hr' || role === 'admin' ? 'anytime'
  : role === 'security' ? 'today only (current date)'
  : role === 'manager' ? '7 days' : 'your access window';
const moduleLabel = (module: RegisterDefinition['module']) => module === 'security' ? 'Security operations' : module === 'main-gate' ? 'Main gate security' : 'Master data';
const moduleTitle = (module: RegisterDefinition['module']) => module === 'security' ? 'Security registers' : module === 'main-gate' ? 'Main gate registers' : 'Master registers';
const moduleEyebrow = (module: RegisterDefinition['module']) => module === 'security' ? 'Security' : module === 'main-gate' ? 'Main gate security' : 'Master data';
const isSecuritySignField = (field: FieldDefinition) => /sign/i.test(`${field.key} ${field.label}`);
const isNameField = (field: FieldDefinition) => field.key !== 'station_name' && (field.key === 'name' || field.key === 'labour_name' || field.key.includes('name'));
const driverRegisterSlugs = ['driver-attendance', 'outgoing-vehicles', 'outgoing-vehicle-log', 'driver-schedule'];

const normalizeDriverAttendanceValues = (data: Record<string, unknown>) => ({ ...data });

const normalizeOutgoingVehicleValues = (data: Record<string, unknown>) => {
  const values = { ...data };
  const rawStation = String(values.station ?? values.station_choice ?? '').trim();
  const place = String(values.station_name ?? values.location ?? '').trim();

  if (rawStation.toLowerCase() === 'unit 2' || rawStation.toLowerCase() === 'unit-2' || rawStation.toLowerCase() === 'unit2') {
    values.station = 'Unit 2';
    values.station_name = 'Unit 2';
  } else if (rawStation.toLowerCase() === 'out of station' || rawStation.toLowerCase() === 'out-station' || (!rawStation && values.location)) {
    values.station = 'Out of Station';
    values.station_name = place;
  } else if (rawStation.toLowerCase() === 'local' || rawStation.toLowerCase() === 'other') {
    values.station = 'Local';
    values.station_name = place;
  } else if (rawStation) {
    values.station = 'Local';
    values.station_name = place || rawStation;
  }
  return values;
};

export default function RegistersPage() {
  const { slug = '' } = useParams<{ slug: string }>();
  const [, setLocation] = useLocation();
  const registers = useListRegisters({ query: { queryKey: getListRegistersQueryKey() } });
  const definition = registers.data?.find((r) => r.slug === slug);
  const isModule = slug === 'security' || slug === 'main-gate' || slug === 'master';
  const moduleName = slug === 'security' ? 'security' : slug === 'main-gate' ? 'main-gate' : slug === 'master' ? 'master' : undefined;
  if (registers.isLoading) return <div className="p-5 md:p-8"><div className="h-16 w-1/2 animate-pulse rounded bg-muted" /><div className="mt-6 h-96 animate-pulse rounded-xl bg-muted" /></div>;
  if (registers.isError) return <div className="p-5 md:p-8"><div className="rounded-xl border border-destructive/30 bg-destructive/5 p-8 text-sm text-destructive">Register library unavailable. <button onClick={() => registers.refetch()} className="font-semibold underline" data-testid="button-retry-registers">Retry</button></div></div>;
  if (isModule) return <ModuleLibrary module={moduleName!} registers={registers.data ?? []} onOpen={(s) => setLocation(`/registers/${s}`)} />;
  if (!definition) return <div className="p-8"><EmptyState title="Register not found" description="This register may have moved or is not available in this workspace." /></div>;
  return <RegisterDetail definition={definition} />;
}

function ModuleLibrary({ module, registers, onOpen }: { module: 'security' | 'main-gate' | 'master'; registers: RegisterDefinition[]; onOpen: (slug: string) => void }) {
  const [search, setSearch] = useState('');
  const shown = registers.filter((r) => r.module === module && `${r.title} ${r.description}`.toLowerCase().includes(search.toLowerCase()));
  return <div className="ops-grid min-h-[100dvh] bg-background px-5 py-6 md:px-10 lg:px-16"><div className="mx-auto max-w-7xl"><div className="mb-8 flex items-center justify-between border-b border-border pb-5"><Link href="/" className="flex items-center gap-3 text-sm font-semibold text-foreground" data-testid="link-back-to-modules"><span className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground"><ArrowLeft size={16} /></span><span>Watchroom <span className="font-normal text-muted-foreground">/ Modules</span></span></Link><span className="font-mono text-[10px] uppercase tracking-[.18em] text-muted-foreground">Restricted workspace</span></div><PageIntro eyebrow={module === 'security' ? 'Security' : module === 'main-gate' ? 'Main gate security' : 'Master data'} title={moduleTitle(module === 'security' ? 'security' : module === 'main-gate' ? 'main-gate' : 'master')} description={`${shown.length} registers available in this workspace. Choose a register to review records or add a new entry.`} /><div className="mb-6 flex items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-sm"><Search size={17} className="ml-2 text-muted-foreground" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search registers by name or purpose…" className="w-full bg-transparent text-sm outline-none" data-testid="input-search-registers" /></div>{shown.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{shown.map((reg, i) => <button key={reg.slug} onClick={() => onOpen(reg.slug)} className="animate-in group rounded-xl border border-border bg-card p-5 text-left shadow-sm hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md" style={{ animationDelay: `${i * 35}ms` }} data-testid={`button-open-register-${reg.slug}`}><div className="mb-6 flex items-start justify-between"><span className="rounded bg-secondary px-2 py-1 font-mono text-[9px] uppercase tracking-[.12em] text-primary">{reg.fields.length} fields</span><span className="font-mono text-xs text-muted-foreground">{reg.recordCount.toLocaleString()}</span></div><h2 className="font-serif text-lg font-bold leading-tight">{reg.title}</h2><p className="mt-2 line-clamp-2 min-h-[40px] text-sm leading-relaxed text-muted-foreground">{reg.description}</p><div className="mt-5 flex items-center justify-between border-t border-border pt-4 text-xs text-primary"><span>Open register</span><span className="transition-transform group-hover:translate-x-1">→</span></div></button>)}</div> : <EmptyState title="No matching registers" description="Try a different search term." />}</div></div>;
}

function RegisterFilters({
  hasNameField,
  searchDraft,
  search,
  from,
  to,
  showFilters,
  onSearchDraftChange,
  onApplySearch,
  onClearSearch,
  onFromChange,
  onToChange,
  onToggleFilters,
  onClearFilters,
  onExport,
  sortOrder,
  onSortChange,
}: {
  hasNameField: boolean;
  searchDraft: string;
  search: string;
  from: string;
  to: string;
  showFilters: boolean;
  onSearchDraftChange: (value: string) => void;
  onApplySearch: () => void;
  onClearSearch: () => void;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  onToggleFilters: () => void;
  onClearFilters: () => void;
  onExport: () => void;
  sortOrder: 'none' | 'asc' | 'desc';
  onSortChange: (value: 'none' | 'asc' | 'desc') => void;
}) {
  const activeFilters = [search ? `Name: ${search}` : '', from ? `From: ${from}` : '', to ? `To: ${to}` : ''].filter(Boolean);
  return <section className="mb-5 rounded-2xl border border-border bg-card p-3 shadow-sm" data-testid="register-filters">
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
      {hasNameField && <form className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-input bg-background px-3 py-2 focus-within:border-primary" onSubmit={(event) => { event.preventDefault(); onApplySearch(); }}>
        <Search size={16} className="shrink-0 text-muted-foreground" />
        <input value={searchDraft} onChange={(event) => onSearchDraftChange(event.target.value)} placeholder="Filter by name…" className="min-w-0 flex-1 bg-transparent text-sm outline-none" data-testid="input-search-records" />
        {searchDraft && <button type="button" onClick={onClearSearch} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Clear search"><X size={15} /></button>}
        <button type="submit" className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90" data-testid="button-apply-search">Filter</button>
      </form>}
      <div className="flex items-center gap-2">
        <button onClick={onToggleFilters} className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-semibold ${showFilters || from || to ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border hover:bg-muted'}`} data-testid="button-toggle-filters"><SlidersHorizontal size={15} /> Filters {activeFilters.length > 1 && <span className="grid size-5 place-items-center rounded-full bg-primary text-[10px] text-primary-foreground">{activeFilters.length}</span>}<ChevronDown size={14} className={showFilters ? 'rotate-180 transition-transform' : 'transition-transform'} /></button>
        {activeFilters.length > 0 && <button onClick={onClearFilters} className="rounded-xl border border-border px-3 py-2.5 text-xs font-semibold text-muted-foreground hover:bg-muted" data-testid="button-clear-filters">Clear all</button>}
        <div className="flex items-center gap-1 rounded-xl border border-border p-1" aria-label="Sort records">
          {([['asc', 'Ascending'], ['desc', 'Descending'], ['none', 'None']] as const).map(([value, label]) => <button key={value} onClick={() => onSortChange(value)} className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold ${sortOrder === value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`} data-testid={`button-sort-${value}`}>{label}</button>)}
        </div>
        <button onClick={onExport} className="flex items-center gap-2 rounded-xl border border-border px-3 py-2.5 text-xs font-semibold hover:bg-muted" data-testid="button-export-csv"><Download size={15} /> <span className="hidden sm:inline">Export</span></button>
      </div>
    </div>
    {showFilters && <div className="mt-3 grid gap-4 rounded-xl border border-border bg-muted/30 p-4 md:grid-cols-[1fr_1fr_auto_auto] md:items-end" data-testid="filter-panel">
      <label><span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold"><CalendarDays size={13} /> From date</span><input type="date" value={from} onChange={(event) => onFromChange(event.target.value)} className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary" data-testid="input-from-date" /></label>
      <label><span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold"><CalendarDays size={13} /> To date</span><input type="date" value={to} onChange={(event) => onToChange(event.target.value)} className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary" data-testid="input-to-date" /></label>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            const today = indiaDateKey(new Date());
            onFromChange(today);
            onToChange(today);
          }}
          className="h-[42px] whitespace-nowrap rounded-lg border border-primary/30 bg-primary/10 px-3 text-xs font-semibold text-primary hover:bg-primary/20"
        >
          Today
        </button>
      </div>
      <div className="text-xs text-muted-foreground"><div className="font-semibold text-foreground">Search and date filters</div><p className="mt-1 max-w-xs leading-relaxed">Filters only hide non-matching rows. They never delete register data.</p></div>
    </div>}
    {activeFilters.length > 0 && <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3"><span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Active</span>{activeFilters.map((filter) => <span key={filter} className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs text-primary">{filter}{filter.startsWith('Search:') && <button onClick={onClearSearch} className="rounded-full hover:bg-primary/15" aria-label="Remove search filter"><X size={12} /></button>}</span>)}</div>}
  </section>;
}

function RegisterDetail({ definition }: { definition: RegisterDefinition }) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [location, setLocation] = useLocation();
  const editParams = useMemo(() => new URLSearchParams(location.split('?')[1] ?? ''), [location]);
  const editRecordId = editParams.get('edit');
  const [search, setSearch] = useState('');
  const [searchDraft, setSearchDraft] = useState('');
  const [from, setFrom] = useState(() => editParams.get('from') ?? '');
  const [to, setTo] = useState(() => editParams.get('to') ?? '');
  const [showFilters, setShowFilters] = useState(false);
  const [sortOrder, setSortOrder] = useState<'none' | 'asc' | 'desc'>('none');
  const [dialog, setDialog] = useState<'create' | RegisterRecord | null>(null);
  const [breakdownModalOpen, setBreakdownModalOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const hasNameField = definition.fields.some((field) => field.key.includes('name') || field.key === 'labour_name');
  const params = useMemo(() => ({ name: hasNameField ? search || undefined : undefined, from: from || undefined, to: to || undefined, limit: 500 }), [hasNameField, search, from, to]);
  const recordsQuery = useListRegisterRecords(definition.slug, params, { query: { enabled: true, queryKey: getListRegisterRecordsQueryKey(definition.slug, params) } });
  const labourMasterParams = useMemo(() => ({ limit: 500 }), []);
  const labourMasterQuery = useListRegisterRecords('labour-master', labourMasterParams, {
    query: {
      enabled: ['daily-attendance', 'chowk-labour'].includes(definition.slug),
      queryKey: getListRegisterRecordsQueryKey('labour-master', labourMasterParams),
    },
  });
  const keyMasterQuery = useListRegisterRecords('key-master', labourMasterParams, {
    query: {
      enabled: definition.slug === 'key-movement',
      queryKey: getListRegisterRecordsQueryKey('key-master', labourMasterParams),
    },
  });
  const securityMasterQuery = useListRegisterRecords('security-master', labourMasterParams, {
    query: {
      enabled: definition.module === 'main-gate' && definition.fields.some(isSecuritySignField),
      queryKey: getListRegisterRecordsQueryKey('security-master', labourMasterParams),
    },
  });
  const driverMasterQuery = useListRegisterRecords('driver-master', labourMasterParams, {
    query: {
      enabled: driverRegisterSlugs.includes(definition.slug),
      queryKey: getListRegisterRecordsQueryKey('driver-master', labourMasterParams),
    },
  });
  const kothiMasterQuery = useListRegisterRecords('kothi-master', labourMasterParams, {
    query: {
      enabled: definition.slug === 'kothi-attendance',
      queryKey: getListRegisterRecordsQueryKey('kothi-master', labourMasterParams),
    },
  });
  const driverAttendanceParams = useMemo(() => ({ limit: 500 }), []);
  const driverAttendanceQuery = useListRegisterRecords('driver-attendance', driverAttendanceParams, {
    query: {
      enabled: ['outgoing-vehicles', 'outgoing-vehicle-log'].includes(definition.slug),
      queryKey: getListRegisterRecordsQueryKey('driver-attendance', driverAttendanceParams),
      staleTime: 0,
    },
  });

  const outgoingVehicleParams = useMemo(() => ({ limit: 500 }), []);
  const activeVehiclesQuery = useListRegisterRecords('outgoing-vehicles', outgoingVehicleParams, {
    query: {
      enabled: ['outgoing-vehicles', 'outgoing-vehicle-log'].includes(definition.slug),
      queryKey: getListRegisterRecordsQueryKey('outgoing-vehicles', outgoingVehicleParams),
      staleTime: 0,
    },
  });

  useEffect(() => {
    if (dialog && ['outgoing-vehicles', 'outgoing-vehicle-log'].includes(definition.slug)) {
      void driverAttendanceQuery.refetch();
      void activeVehiclesQuery.refetch();
    }
  }, [dialog, definition.slug]);

  useEffect(() => {
    if (!['outgoing-vehicles', 'outgoing-vehicle-log'].includes(definition.slug)) return;
    const onWindowFocus = () => {
      void driverAttendanceQuery.refetch();
      void activeVehiclesQuery.refetch();
    };
    window.addEventListener('focus', onWindowFocus);
    return () => window.removeEventListener('focus', onWindowFocus);
  }, [definition.slug]);

  const activeDriverTrips = useMemo(() => {
    if (!['outgoing-vehicles', 'outgoing-vehicle-log'].includes(definition.slug)) {
      return new Map<string, { station: string; stationName: string; carName: string; outTime: string; date: string }>();
    }
    const map = new Map<string, { station: string; stationName: string; carName: string; outTime: string; date: string }>();
    const recs = activeVehiclesQuery.data?.records ?? [];

    for (const rec of recs) {
      const data = rec.data ?? {};
      const driver = String(data.driver_name ?? data.driver ?? '').trim();
      if (!driver) continue;
      const key = driver.toLowerCase();

      const outTime = String(data.out_time ?? '').trim();
      const inTime = String(data.in_time ?? '').trim();
      const finalReading = Number(data.final_reading);
      const hasFinal = Number.isFinite(finalReading) && finalReading > 0;
      const hasReturned = Boolean(inTime || hasFinal);

      // If vehicle went out and hasn't returned to the office yet
      if (outTime && !hasReturned) {
        if (!map.has(key)) {
          const rawStation = String(data.station ?? data.station_choice ?? 'Out of Station').trim();
          const stationName = String(data.station_name ?? data.location ?? '').trim();
          const carName = String(data.car_name ?? data.vehicle_name ?? '').trim();
          const tripDate = String(data.date ?? rec.createdAt ?? '').trim();
          map.set(key, {
            station: rawStation,
            stationName,
            carName,
            outTime,
            date: tripDate,
          });
        }
      }
    }
    return map;
  }, [definition.slug, activeVehiclesQuery.data?.records]);

  const {
    activeAttendanceDriversByDate,
    loggedOutDriversByDate,
    allAttendanceDriversByDate,
  } = useMemo(() => {
    const activeMap: Record<string, string[]> = {};
    const loggedOutMap: Record<string, Array<{ driverName: string; outTime: string }>> = {};
    const allMap: Record<string, string[]> = {};

    const addActive = (dateKey: string, driverName: string) => {
      if (!dateKey || !driverName) return;
      const cleanKey = dateKey.trim();
      if (!activeMap[cleanKey]) activeMap[cleanKey] = [];
      if (!activeMap[cleanKey].includes(driverName)) activeMap[cleanKey].push(driverName);
    };

    const addLoggedOut = (dateKey: string, driverName: string, outTime: string) => {
      if (!dateKey || !driverName) return;
      const cleanKey = dateKey.trim();
      if (!loggedOutMap[cleanKey]) loggedOutMap[cleanKey] = [];
      if (!loggedOutMap[cleanKey].some((x) => x.driverName.toLowerCase() === driverName.toLowerCase())) {
        loggedOutMap[cleanKey].push({ driverName, outTime });
      }
    };

    const addAll = (dateKey: string, driverName: string) => {
      if (!dateKey || !driverName) return;
      const cleanKey = dateKey.trim();
      if (!allMap[cleanKey]) allMap[cleanKey] = [];
      if (!allMap[cleanKey].includes(driverName)) allMap[cleanKey].push(driverName);
    };

    const recs = driverAttendanceQuery.data?.records ?? [];
    for (const rec of recs) {
      const data = rec.data ?? {};
      const driverName = String(data.name ?? data.driver_name ?? data.driver ?? '').trim();
      if (!driverName) continue;

      const keys = new Set<string>();
      if (data.date_of_in_time) getAllDateKeys(data.date_of_in_time).forEach((k) => keys.add(k));
      if (data.date) getAllDateKeys(data.date).forEach((k) => keys.add(k));
      const recordDate = (rec as unknown as { recordDate?: unknown }).recordDate;
      if (recordDate) getAllDateKeys(recordDate).forEach((k) => keys.add(k));
      if (rec.createdAt) getAllDateKeys(rec.createdAt).forEach((k) => keys.add(k));

      if (keys.size === 0) continue;

      const outTime = String(data.out_time ?? '').trim();
      const isLoggedOut = Boolean(outTime && outTime !== '—');

      for (const k of keys) {
        addAll(k, driverName);
        if (isLoggedOut) {
          addLoggedOut(k, driverName, outTime);
        } else {
          addActive(k, driverName);
        }
      }
    }

    return {
      activeAttendanceDriversByDate: activeMap,
      loggedOutDriversByDate: loggedOutMap,
      allAttendanceDriversByDate: allMap,
    };
  }, [driverAttendanceQuery.data?.records]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListRegisterRecordsQueryKey(definition.slug, params) });
    queryClient.invalidateQueries({ queryKey: getListRegistersQueryKey() });
    queryClient.invalidateQueries({ queryKey: ['/api/registers/driver-attendance/records'] });
    queryClient.invalidateQueries({ queryKey: ['/api/registers/outgoing-vehicles/records'] });
    queryClient.invalidateQueries({ queryKey: ['/api/reports/driver-presence'] });
  };
  const create = useCreateRegisterRecord();
  const update = useUpdateRegisterRecord();
  const remove = useDeleteRegisterRecord();
  const records = recordsQuery.data?.records ?? [];
  const sortedRecords = useMemo(() => {
    if (sortOrder === 'none') return records;
    const dateValue = (record: RegisterRecord) => String(record.data.date ?? record.createdAt ?? '');
    return [...records].sort((a, b) => {
      const comparison = dateValue(a).localeCompare(dateValue(b));
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [records, sortOrder]);
  const dialogFields = useMemo(
    () => definition.fields.filter((field) => !(definition.slug === 'daily-attendance' && user?.role === 'security' && ['payment_status', 'overtime_payment_status'].includes(field.key))),
    [definition.fields, definition.slug, user?.role],
  );
  const visibleFields = useMemo(
    () => dialogFields.filter((field) => !(field.key === 'station_name' && ['outgoing-vehicles', 'outgoing-vehicle-log'].includes(definition.slug))),
    [dialogFields, definition.slug],
  );
  const incompleteSet = useMemo(() => {
    const set = new Set<string>();
    for (const r of sortedRecords) {
      if (isRecordIncomplete(r, definition, visibleFields)) {
        set.add(r.id);
      }
    }
    return set;
  }, [sortedRecords, definition, visibleFields]);
  const isVehicleRegister = ['outgoing-vehicles', 'outgoing-vehicle-log'].includes(definition.slug);
  const activeVehiclesOnRoadCount = useMemo(() => {
    if (!isVehicleRegister) return 0;
    return sortedRecords.filter((r) => isBlankValue(r.data.in_time) || isBlankValue(r.data.final_reading)).length;
  }, [isVehicleRegister, sortedRecords]);
  const labourNames = useMemo(() => {
    const names = (labourMasterQuery.data?.records ?? [])
      .map((record) => String(record.data.name ?? '').trim())
      .filter(Boolean);
    return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b));
  }, [labourMasterQuery.data?.records]);
  const keyNames = useMemo(() => {
    const names = (keyMasterQuery.data?.records ?? [])
      .map((record) => String(record.data.location ?? '').trim())
      .filter(Boolean);
    return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b));
  }, [keyMasterQuery.data?.records]);
  const securityNames = useMemo(() => {
    const names = (securityMasterQuery.data?.records ?? [])
      .map((record) => String(record.data.name ?? '').trim())
      .filter(Boolean);
    return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b));
  }, [securityMasterQuery.data?.records]);
  const driverNames = useMemo(() => {
    const names = (driverMasterQuery.data?.records ?? [])
      .map((record) => String(record.data.name ?? '').trim())
      .filter(Boolean);
    return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b));
  }, [driverMasterQuery.data?.records]);
  const driverPhones = useMemo(() => Object.fromEntries(
    (driverMasterQuery.data?.records ?? [])
      .map((record) => [String(record.data.name ?? '').trim().toLowerCase(), String(record.data.mobile_no ?? '').trim()])
      .filter(([name, phone]) => Boolean(name && phone)),
  ), [driverMasterQuery.data?.records]);
  const kothiNames = useMemo(() => {
    const names = (kothiMasterQuery.data?.records ?? [])
      .map((record) => String(record.data.name ?? '').trim())
      .filter(Boolean);
    return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b));
  }, [kothiMasterQuery.data?.records]);
  const nameOptions = definition.slug === 'chowk-labour' ? labourNames : definition.slug === 'kothi-attendance' ? kothiNames : [];
  const driverFieldOptions = driverRegisterSlugs.includes(definition.slug) ? driverNames : [];
  const passCounts = useMemo(() => {
    if (!['personal-gate-pass', 'official-gate-pass', 'contractor-gate-pass', 'unit-2-gate-pass'].includes(definition.slug)) return [];
    const counts = new Map<string, number>();
    sortedRecords.forEach((record) => {
      const name = String(record.data.name ?? '').trim();
      if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
    });
    return Array.from(counts, ([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [definition.slug, sortedRecords]);
  const exportCsv = async () => {
    const query = new URLSearchParams();
    if (search) query.set('name', search);
    if (from) query.set('from', from);
    if (to) query.set('to', to);
    const response = await fetch(`/api/registers/${definition.slug}/records/export?${query.toString()}`, { credentials: 'include' });
    if (!response.ok) { setNotice('CSV export could not be generated'); return; }
    const payload = await response.json() as { records: RegisterRecord[] };
    const cols = ['Register', 'registerSlug', ...visibleFields.map((f) => f.key)];
    const rows = payload.records.map((r) => cols.map((c) => JSON.stringify(
      c === 'Register' ? definition.title
        : c === 'registerSlug' ? definition.slug
          : c === 'station' && ['outgoing-vehicles', 'outgoing-vehicle-log'].includes(definition.slug)
            ? (r.data.station_name && r.data.station ? `${r.data.station} - ${r.data.station_name}` : String(r.data.station ?? r.data.location ?? ''))
            : String(r.data[c] ?? ''),
    )).join(','));
    const blob = new Blob([[cols.join(','), ...rows].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${definition.slug}.csv`; a.click(); URL.revokeObjectURL(url); setNotice(`CSV export ready (${payload.records.length} records)`);
  };
  const onSubmit = (data: { data: Record<string, unknown> }, editing: RegisterRecord | undefined, onError: (message: string) => void) => {
    const showMutationError = (error: unknown) => {
      onError(error instanceof Error ? error.message.replace(/^HTTP \d+ [^:]+:\s*/, '') : 'The record could not be saved. Check the fields and try again.');
    };
    if (editing) {
      if (editing.paymentStatus === 'paid') {
        onError('Payment done: this attendance record cannot be edited or deleted.');
        return;
      }
      update.mutate(
        { slug: definition.slug, id: editing.id, data },
        { onSuccess: () => { invalidate(); setDialog(null); setNotice('Record updated'); }, onError: showMutationError },
      );
    } else {
      create.mutate(
        { slug: definition.slug, data },
        { onSuccess: () => { invalidate(); setDialog(null); setNotice('Record added to the register'); }, onError: showMutationError },
      );
    }
  };
  const onDelete = (record: RegisterRecord) => {
    if (record.paymentStatus === 'paid') {
      setNotice('Payment done: this attendance record cannot be edited or deleted.');
      return;
    }
    if (!window.confirm(`Delete this ${definition.title} record? This cannot be undone.`)) return;
    remove.mutate({ slug: definition.slug, id: record.id }, {
      onSuccess: () => { invalidate(); setNotice('Record deleted'); },
      onError: (error) => setNotice(error instanceof Error ? error.message : 'Record could not be deleted'),
    });
  };
  const onQuickPunchOut = (record: RegisterRecord) => {
    const currentTime = currentIndiaTime();
    const currentDate = indiaDateKey(new Date());
    const driverName = String(record.data.name ?? record.data.driver_name ?? 'Driver').trim();
    if (!window.confirm(`Clock out driver ${driverName} now at ${currentTime}?`)) return;
    update.mutate(
      {
        slug: 'driver-attendance',
        id: record.id,
        data: {
          data: {
            ...record.data,
            out_time: currentTime,
            date_of_out_time: record.data.date_of_out_time || currentDate,
          },
        },
      },
      {
        onSuccess: () => {
          invalidate();
          setNotice(`Driver ${driverName} clocked out at ${currentTime}`);
        },
        onError: (error) => {
          setNotice(error instanceof Error ? error.message : 'Record could not be updated');
        },
      },
    );
  };
  const applySearch = () => setSearch(searchDraft.trim());
  const clearSearch = () => { setSearchDraft(''); setSearch(''); };
  const clearFilters = () => { clearSearch(); setFrom(''); setTo(''); setShowFilters(false); };
  useEffect(() => {
    if (!editRecordId || dialog || !records.length) return;
    const record = records.find((item) => item.id === editRecordId);
    if (!record) return;
    if (record.paymentStatus === 'paid') {
      setNotice('Payment done: this attendance record cannot be edited or deleted.');
      setLocation(`/registers/${definition.slug}`);
      return;
    }
    setDialog(record);
    setLocation(`/registers/${definition.slug}`);
  }, [definition.slug, dialog, editRecordId, records, setLocation]);
  useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(''), 3200); return () => window.clearTimeout(timer); }, [notice]);
   const isSingletonSettings = definition.slug === 'chowk-labour-master';
   return <div className="min-h-[100dvh] px-5 py-8 md:px-8 lg:px-10"><Link href={`/registers/${definition.module}`} className="mb-5 inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground" data-testid="link-back-to-module"><ArrowLeft size={14} /> {moduleLabel(definition.module)}</Link><PageIntro eyebrow={moduleEyebrow(definition.module)} title={definition.title} description={definition.description} action={<div className="flex flex-wrap items-center gap-2">{['outgoing-vehicles', 'outgoing-vehicle-log', 'driver-attendance'].includes(definition.slug) && <Link href="/driver-board" className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300 shadow-sm transition" data-testid="button-open-driver-board" title="Open Real-time Driver & Fleet Board"><span className="size-2 rounded-full bg-emerald-500 animate-pulse" /><Car size={15} /> Live Fleet Board</Link>}{['mango-tree-meter', 'clinic-gate-meter'].includes(definition.slug) && <button type="button" onClick={() => setBreakdownModalOpen(true)} className="flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-500/20 dark:text-red-400 shadow-sm transition" data-testid="button-breakdown"><AlertTriangle size={16} /> Breakdown</button>}{canCreateRegisterRecord(user?.role) ? <button onClick={() => setDialog(isSingletonSettings && records[0] ? records[0] : 'create')} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90" data-testid="button-add-record"><FilePlus2 size={16} /> {isSingletonSettings && records[0] ? 'Edit settings' : 'Add record'}</button> : <span className="rounded-lg border border-border bg-muted/45 px-3 py-2 text-xs font-semibold text-muted-foreground">Read-only access</span>}</div>} />
    {notice && <div className="mb-5 flex items-center gap-2 rounded-lg border border-[hsl(var(--chart-3))]/30 bg-[hsl(var(--chart-3))]/10 px-4 py-3 text-sm text-[hsl(var(--chart-3))]" data-testid="status-success"><Check size={16} />{notice}</div>}
        <RegisterFilters hasNameField={hasNameField} searchDraft={searchDraft} search={search} from={from} to={to} showFilters={showFilters} onSearchDraftChange={setSearchDraft} onApplySearch={applySearch} onClearSearch={clearSearch} onFromChange={setFrom} onToChange={setTo} onToggleFilters={() => setShowFilters((value) => !value)} onClearFilters={clearFilters} onExport={exportCsv} sortOrder={sortOrder} onSortChange={setSortOrder} />
        {isVehicleRegister && activeVehiclesOnRoadCount > 0 && (
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-500/40 bg-red-500/10 p-3.5 shadow-sm text-red-700 dark:text-red-300" data-testid="banner-active-dispatches">
            <div className="flex items-center gap-2.5">
              <span className="relative flex size-2.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex size-2.5 rounded-full bg-red-500"></span>
              </span>
              <span className="text-xs font-bold">
                {activeVehiclesOnRoadCount} vehicle{activeVehiclesOnRoadCount === 1 ? '' : 's'} currently out on trip — In-Time & Final Reading pending (highlighted in RED)
              </span>
            </div>
            <span className="font-mono text-[10px] uppercase font-bold rounded-full bg-red-500/20 px-2 py-0.5 text-red-700 dark:text-red-300">
              Active Dispatches
            </span>
          </div>
        )}
        {passCounts.length > 0 && <section className="mb-5 rounded-xl border border-primary/20 bg-primary/5 p-4 shadow-sm" data-testid="section-pass-counts"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2 text-sm font-semibold"><span className="grid size-6 place-items-center rounded-md bg-primary/15 text-primary"><Check size={14} /></span>Gate passes by person</div><p className="mt-1 text-xs text-muted-foreground">Auto-counted from the records currently shown.</p></div><span className="rounded-full border border-primary/20 bg-card px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-primary">Auto-counted</span></div><div className="mt-4 flex flex-wrap gap-2">{passCounts.map(({ name, count }) => <span key={name} className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs"><span className="font-semibold">{name}</span><span className="rounded-full bg-primary/10 px-1.5 py-0.5 font-mono text-primary">{count}</span></span>)}</div></section>}
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          {recordsQuery.isLoading ? (
            <div className="space-y-3 p-5">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-12 animate-pulse rounded bg-muted" />
              ))}
            </div>
          ) : recordsQuery.isError ? (
            <div className="p-8 text-center text-sm text-destructive">
              Records could not be loaded.{' '}
              <button
                onClick={() => recordsQuery.refetch()}
                className="font-semibold underline"
                data-testid="button-retry-records"
              >
                Retry
              </button>
            </div>
          ) : records.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title={search || from || to ? 'No records match these filters' : 'This register is clear'}
                description={
                  search || from || to
                    ? 'Remove a filter or try another search.'
                    : 'Start the shift by adding the first record.'
                }
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] text-left">
                <thead className="border-b border-border bg-muted/45">
                  <tr>
                    {visibleFields.map((field) => (
                      <th
                        key={field.key}
                        className="px-4 py-3 font-mono text-[10px] uppercase tracking-[.12em] text-muted-foreground"
                      >
                        {field.label}
                        {field.derived && !field.label.toLowerCase().includes('(liter)') && (
                          <span className="ml-1 text-primary">(auto)</span>
                        )}
                      </th>
                    ))}
                    <th className="px-5 py-3 text-right font-mono text-[10px] uppercase tracking-[.12em] text-muted-foreground">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {sortedRecords.map((record) => {
                    const paymentDone = record.paymentStatus === 'paid';
                    const editable = !paymentDone && canEditRecord(record.createdAt, user?.role, definition.module, record.data.date, definition.slug);
                    const deletable = !paymentDone && canDeleteRecord(record.createdAt, user?.role);
                    const incomplete = incompleteSet.has(record.id);
                    const isPendingVehicleReturn = isVehicleRegister && (isBlankValue(record.data.in_time) || isBlankValue(record.data.final_reading));

                    return (
                      <tr
                        key={record.id}
                        className={`group transition-colors ${
                          isPendingVehicleReturn
                            ? 'bg-red-500/[0.09] text-red-700 hover:bg-red-500/[0.15] dark:bg-red-950/40 dark:text-red-300 font-semibold border-l-4 border-l-red-500 shadow-[inset_0_1px_0_rgba(239,68,68,0.1)]'
                            : incomplete
                              ? 'bg-red-500/[0.06] text-red-800 hover:bg-red-500/10 dark:bg-red-950/25 dark:text-red-400 font-medium'
                              : 'hover:bg-secondary/35 text-foreground'
                        }`}
                        title={
                          isPendingVehicleReturn
                            ? 'Trip in progress: In-Time and Final Reading not entered yet (Vehicle on road)'
                            : incomplete
                              ? 'Incomplete record: data is not filled fully'
                              : undefined
                        }
                        data-testid={`row-record-${record.id}`}
                      >
                        {visibleFields.map((field) => {
                          let cellValue = record.data[field.key];
                          if (isVehicleRegister && field.key === 'station') {
                            const station = String(record.data.station ?? '').trim();
                            const place = String(record.data.station_name ?? record.data.location ?? '').trim();
                            if (station.toLowerCase() === 'unit 2' || station.toLowerCase() === 'unit-2') {
                              cellValue = 'Unit 2';
                            } else if (station && place && station.toLowerCase() !== place.toLowerCase()) {
                              cellValue = `${station} (${place})`;
                            } else if (place) {
                              cellValue = station ? `${station} (${place})` : place;
                            } else if (station) {
                              cellValue = station;
                            }
                          }
                          if (definition.slug === 'driver-attendance' && field.key === 'out_time') {
                            const isOutBlank = isBlankValue(cellValue);
                            return (
                              <td key={field.key} className="max-w-[190px] truncate px-4 py-4 text-sm">
                                {isOutBlank ? (
                                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                                    <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" /> On Duty
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold text-slate-800 dark:text-slate-200">
                                    <Clock size={12} className="text-muted-foreground" /> {String(cellValue)}
                                  </span>
                                )}
                              </td>
                            );
                          }
                          if (isVehicleRegister && field.key === 'in_time') {
                            const isInBlank = isBlankValue(cellValue);
                            return (
                              <td key={field.key} className="max-w-[190px] truncate px-4 py-4 text-sm font-semibold">
                                {isInBlank ? (
                                  <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/40 bg-red-500/15 px-2.5 py-1 text-xs font-bold text-red-700 dark:text-red-300">
                                    <span className="size-1.5 rounded-full bg-red-500 animate-pulse" /> Pending (Out)
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold text-slate-800 dark:text-slate-200">
                                    <Clock size={12} className="text-muted-foreground" /> {String(cellValue)}
                                  </span>
                                )}
                              </td>
                            );
                          }
                          if (isVehicleRegister && field.key === 'final_reading') {
                            const isFinalBlank = isBlankValue(cellValue);
                            return (
                              <td key={field.key} className="max-w-[190px] truncate px-4 py-4 text-sm font-semibold">
                                {isFinalBlank ? (
                                  <span className="inline-flex items-center gap-1 rounded-md border border-red-500/40 bg-red-500/15 px-2 py-0.5 text-xs font-bold text-red-700 dark:text-red-300">
                                    Not entered
                                  </span>
                                ) : (
                                  <span className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200">
                                    {Number(cellValue).toLocaleString()}
                                  </span>
                                )}
                              </td>
                            );
                          }
                          if (isVehicleRegister && field.key === 'total_km_car_run') {
                            const isKmBlank = isBlankValue(cellValue);
                            return (
                              <td key={field.key} className="max-w-[190px] truncate px-4 py-4 text-sm">
                                {isKmBlank ? (
                                  <span className="font-mono text-xs text-red-500/80 italic font-medium">Pending in-time</span>
                                ) : (
                                  <span className="font-mono text-xs font-bold text-primary">{String(cellValue)} km</span>
                                )}
                              </td>
                            );
                          }
                          return (
                            <td
                              key={field.key}
                              className={`max-w-[190px] truncate px-4 py-4 text-sm ${
                                isPendingVehicleReturn
                                  ? 'font-semibold text-red-700 dark:text-red-300'
                                  : incomplete
                                    ? 'font-medium text-red-800 dark:text-red-400'
                                    : field.derived
                                      ? 'font-medium text-primary'
                                      : ''
                              }`}
                            >
                              {formatValue(cellValue, field, incomplete || isPendingVehicleReturn)}
                            </td>
                          );
                        })}
                        <td className="px-5 py-4">
                          <div className="flex justify-end gap-1 items-center">
                            {paymentDone ? (
                              <span
                                className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2.5 py-2 text-[10px] font-semibold text-emerald-700"
                                title="This attendance has been paid and cannot be edited or deleted"
                                data-testid={`status-payment-done-${record.id}`}
                              >
                                <CheckCircle2 size={14} /> Payment done
                              </span>
                            ) : (
                              <>
                                {isPendingVehicleReturn && editable && (
                                  <button
                                    type="button"
                                    onClick={() => setDialog(record)}
                                    className="inline-flex items-center gap-1 rounded-md border border-red-500/40 bg-red-500/15 px-2.5 py-1.5 text-xs font-bold text-red-700 hover:bg-red-500/25 dark:text-red-300 shadow-sm transition mr-1"
                                    title="Enter In-Time and Final Reading when vehicle returns"
                                    data-testid={`button-enter-return-${record.id}`}
                                  >
                                    <Clock size={12} /> Enter Return
                                  </button>
                                )}
                                {definition.slug === 'driver-attendance' && editable && isBlankValue(record.data.out_time) && (
                                  <button
                                    type="button"
                                    onClick={() => onQuickPunchOut(record)}
                                    disabled={update.isPending}
                                    className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-500/20 dark:text-amber-300 shadow-sm transition mr-1"
                                    title="Punch out this driver now (sets out-time to current IST time)"
                                    data-testid={`button-quick-clockout-${record.id}`}
                                  >
                                    <LogOut size={13} /> Punch Out
                                  </button>
                                )}
                                {editable && (
                                  <button
                                    onClick={() => setDialog(record)}
                                    className="rounded-md p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
                                    data-testid={`button-edit-record-${record.id}`}
                                    title={
                                      user?.role === 'admin'
                                        ? 'Edit record'
                                        : `Edit within ${editWindowLabel(user?.role, definition.module)} of entry`
                                    }
                                  >
                                    <Edit3 size={14} />
                                  </button>
                                )}
                                {deletable && (
                                  <button
                                    onClick={() => onDelete(record)}
                                    disabled={remove.isPending}
                                    className="rounded-md p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                                    data-testid={`button-delete-record-${record.id}`}
                                    title={
                                      user?.role === 'admin'
                                        ? 'Delete record'
                                        : 'Delete within 7 days of entry'
                                    }
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                )}
                                {!editable && !deletable && (user?.role === 'manager' || user?.role === 'security') ? (
                                  <span
                                    className="inline-flex items-center gap-1 px-2 py-2 text-[10px] font-medium text-muted-foreground"
                                    title={`Editing and deletion are locked after ${editWindowLabel(user?.role, definition.module)}`}
                                  >
                                    <LockKeyhole size={13} /> Locked
                                  </span>
                                ) : (
                                  !editable &&
                                  !deletable && (
                                    <span className="px-2 py-2 text-[10px] font-medium text-muted-foreground">
                                      View only
                                    </span>
                                  )
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between border-t border-border px-5 py-3 text-xs text-muted-foreground">
            <div>
              Showing <span className="font-mono text-foreground">{records.length}</span> of{' '}
              <span className="font-mono text-foreground">{recordsQuery.data?.total ?? definition.recordCount}</span> records
            </div>
            {incompleteSet.size > 0 && (
              <div className="font-semibold text-red-800 dark:text-red-400">
                {incompleteSet.size} incomplete entry/entries (data not filled fully)
              </div>
            )}
          </div>
        </div>
       {dialog && (
         <RecordDialog
           definition={definition}
           fields={dialogFields}
           labourNames={labourNames}
           keyNames={keyNames}
           driverNames={driverFieldOptions}
           driverPhones={driverPhones}
           securityNames={securityNames}
           nameOptions={nameOptions}
           role={user?.role}
           initial={dialog === 'create' ? undefined : dialog}
           pending={create.isPending || update.isPending}
           activeAttendanceDriversByDate={activeAttendanceDriversByDate}
           loggedOutDriversByDate={loggedOutDriversByDate}
           allAttendanceDriversByDate={allAttendanceDriversByDate}
           activeDriverTrips={activeDriverTrips}
           isAttendanceLoading={driverAttendanceQuery.isLoading || driverAttendanceQuery.isFetching}
           attendanceError={driverAttendanceQuery.isError ? ((driverAttendanceQuery.error as Error)?.message || 'Could not load driver attendance') : undefined}
           onRetryAttendance={() => void driverAttendanceQuery.refetch()}
           driverAttendanceRecords={driverAttendanceQuery.data?.records ?? []}
           onClose={() => setDialog(null)}
           onSubmit={onSubmit}
         />
       )}
       {breakdownModalOpen && (
         <BreakdownModal
           definition={definition}
           onClose={() => setBreakdownModalOpen(false)}
           onSuccess={(msg) => setNotice(msg)}
         />
       )}
  </div>;
}

export const isRecordIncomplete = (
  record: RegisterRecord,
  definition: RegisterDefinition,
  visibleFields: FieldDefinition[],
): boolean => {
  const data = record.data ?? {};
  const slug = definition.slug;

  // 1. Driver Attendance
  if (slug === 'driver-attendance') {
    if (isBlankValue(data.name) || isBlankValue(data.in_time) || isBlankValue(data.out_time)) return true;
    return false;
  }

  // 2. Training / Labour Attendance (daily-attendance)
  if (slug === 'daily-attendance') {
    if (isBlankValue(data.labour_name) || isBlankValue(data.shift)) return true;
    const hasMorningIn = !isBlankValue(data.morning_in);
    const hasMorningOut = !isBlankValue(data.morning_out);
    const hasEveningIn = !isBlankValue(data.evening_in);
    const hasEveningOut = !isBlankValue(data.evening_out);
    if (!hasMorningIn && !hasEveningIn) return true;
    if (hasMorningIn && !hasMorningOut) return true;
    if (hasEveningIn && !hasEveningOut) return true;
    if (isYes(data.has_gate_pass)) {
      if (isBlankValue(data.gate_pass_out_time) || isBlankValue(data.gate_pass_in_time)) return true;
    }
    return false;
  }

  // 3. Chowk Labour
  if (slug === 'chowk-labour') {
    if (
      isBlankValue(data.name) ||
      isBlankValue(data.work_location) ||
      isBlankValue(data.supervisor) ||
      isBlankValue(data.shift)
    ) {
      return true;
    }
    const hasMorningIn = !isBlankValue(data.morning_in);
    const hasMorningOut = !isBlankValue(data.morning_out);
    const hasEveningIn = !isBlankValue(data.evening_in);
    const hasEveningOut = !isBlankValue(data.evening_out);
    if (!hasMorningIn && !hasEveningIn) return true;
    if (hasMorningIn && !hasMorningOut) return true;
    if (hasEveningIn && !hasEveningOut) return true;
    return false;
  }

  // 4. Kothi Attendance
  if (slug === 'kothi-attendance') {
    if (isBlankValue(data.name)) return true;
    const hasMorningIn = !isBlankValue(data.morning_in_time);
    const hasMorningOut = !isBlankValue(data.morning_out_time);
    const hasEveningIn = !isBlankValue(data.evening_in_time);
    const hasEveningOut = !isBlankValue(data.evening_out_time);
    if (!hasMorningIn && !hasEveningIn) return true;
    if (hasMorningIn && !hasMorningOut) return true;
    if (hasEveningIn && !hasEveningOut) return true;
    if (isBlankValue(data.sign_of_security)) return true;
    return false;
  }

  // 5. Solar Panel Cleaning
  if (slug === 'solar-panel-cleaning') {
    if (isBlankValue(data.name) || isBlankValue(data.in_time) || isBlankValue(data.out_time)) return true;
    return false;
  }

  // 6. Food Registers
  if (['guest-food', 'jain-food-service'].includes(slug)) {
    if (isBlankValue(data.name) || isBlankValue(data.count_guest)) return true;
    const hasMeal =
      !isBlankValue(data.breakfast) ||
      !isBlankValue(data.lunch) ||
      !isBlankValue(data.dinner) ||
      !isBlankValue(data.add);
    if (!hasMeal) return true;
    if (isBlankValue(data.sign)) return true;
    return false;
  }

  // 7. Driver Schedule
  if (slug === 'driver-schedule') {
    if (
      isBlankValue(data.choosen_driver) ||
      isBlankValue(data.car_name) ||
      isBlankValue(data.location) ||
      isBlankValue(data.schedule_time)
    ) {
      return true;
    }
    return false;
  }

  // 8. Outgoing Vehicles Register
  if (slug === 'outgoing-vehicles' || slug === 'outgoing-vehicle-log') {
    if (
      isBlankValue(data.driver_name) ||
      isBlankValue(data.car_name) ||
      isBlankValue(data.initial_reading) ||
      isBlankValue(data.name_of_the_person_in_car)
    ) {
      return true;
    }
    const st = String(data.station ?? data.station_choice ?? '').trim();
    if (isBlankValue(st)) return true;
    if (
      st.toLowerCase() !== 'unit 2' &&
      st.toLowerCase() !== 'unit-2' &&
      isBlankValue(data.station_name) &&
      isBlankValue(data.location)
    ) {
      return true;
    }
    // Until both in_time and final_reading are entered, the outgoing vehicle record is incomplete/active and must be red!
    if (isBlankValue(data.in_time) || isBlankValue(data.final_reading)) {
      return true;
    }
    return false;
  }

  // 9. Car Breakdowns
  if (slug === 'car-breakdowns' || slug === 'car-breakdown') {
    if (isBlankValue(data.car_name) || isBlankValue(data.car_out_time_for_service)) return true;
    if (isBlankValue(data.car_in_time_after_service)) return true;
    return false;
  }

  // 10. General Registers (Gate passes, Outgoing vehicles, Key movement, Visitor record, Service bill, Meters, Masters, etc.)
  const fieldsToCheck = visibleFields.filter(
    (f) => !f.derived && f.type !== 'checkbox' && f.key !== 'remark' && f.key !== 'print_batch',
  );
  return fieldsToCheck.some((f) => isBlankValue(data[f.key]));
};

function formatValue(value: unknown, field: FieldDefinition, incomplete = false) {
  if (isBlankValue(value)) {
    return (
      <span className={incomplete ? 'font-bold text-red-800 dark:text-red-400' : 'text-muted-foreground/60'}>
        —
      </span>
    );
  }
  if (field.type === 'checkbox') {
    return value ? (
      <Check size={15} className={incomplete ? 'text-red-800 dark:text-red-400' : 'text-[hsl(var(--chart-3))]'} />
    ) : (
      <X size={15} className={incomplete ? 'text-red-800/60 dark:text-red-400/60' : 'text-muted-foreground'} />
    );
  }
  if (field.type === 'date') return formatDate(value);
  if (field.key === 'overtime' && String(value).startsWith('-')) {
    return <span className="font-semibold text-destructive">{String(value)}</span>;
  }
  return String(value);
}

const trainingDurationMinutes = (values: Record<string, unknown>) => {
  const periodMinutes = (value: unknown, _period: 'morning' | 'evening') => timeToMinutes(value);
  const morningIn = periodMinutes(values.morning_in, 'morning');
  const morningOut = periodMinutes(values.morning_out, 'morning');
  const eveningIn = periodMinutes(values.evening_in, 'evening');
  const eveningOut = periodMinutes(values.evening_out, 'evening');
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

function RecordDialog({
  definition,
  fields,
  labourNames,
  keyNames,
  driverNames,
  driverPhones,
  securityNames,
  nameOptions,
  role: userRole,
  initial,
  pending,
  activeAttendanceDriversByDate,
  loggedOutDriversByDate,
  allAttendanceDriversByDate,
  activeDriverTrips,
  isAttendanceLoading,
  attendanceError,
  onRetryAttendance,
  driverAttendanceRecords,
  onClose,
  onSubmit,
}: {
  definition: RegisterDefinition;
  fields: FieldDefinition[];
  labourNames: string[];
  keyNames: string[];
  driverNames: string[];
  driverPhones: Record<string, string>;
  securityNames: string[];
  nameOptions: string[];
  role?: string;
  initial?: RegisterRecord;
  pending: boolean;
  activeAttendanceDriversByDate?: Record<string, string[]>;
  loggedOutDriversByDate?: Record<string, Array<{ driverName: string; outTime: string }>>;
  allAttendanceDriversByDate?: Record<string, string[]>;
  activeDriverTrips?: Map<string, { station: string; stationName: string; carName: string; outTime: string; date: string }>;
  isAttendanceLoading?: boolean;
  attendanceError?: string;
  onRetryAttendance?: () => void;
  driverAttendanceRecords?: RegisterRecord[];
  onClose: () => void;
  onSubmit: (data: { data: Record<string, unknown> }, editing: RegisterRecord | undefined, onError: (message: string) => void) => void;
}) {
  const role = definition.slug === 'key-movement' ? undefined : userRole;
  const updateRecord = useUpdateRegisterRecord();
  const todayDate = indiaDateKey(new Date());
  const initialValues = useMemo(() => {
    const raw: Record<string, unknown> =
      definition.slug === 'driver-attendance'
        ? normalizeDriverAttendanceValues(initial?.data ?? {})
        : ['outgoing-vehicles', 'outgoing-vehicle-log'].includes(definition.slug)
          ? normalizeOutgoingVehicleValues(initial?.data ?? {})
          : { ...(initial?.data ?? {}) };

    // Auto-select date by current date for all date fields across all registers
    fields.forEach((field) => {
      if (field.type === 'date' || field.key === 'date') {
        const val = raw[field.key];
        if (isBlankValue(val) || !initial) {
          raw[field.key] = todayDate;
        } else {
          raw[field.key] = toInputDate(val);
        }
      }
    });

    if (definition.slug === 'daily-attendance') {
      raw.has_gate_pass = raw.has_gate_pass ?? 'No';
    }

    if (definition.slug === 'driver-attendance' && !initial) {
      raw.date_of_out_time = '';
      if (isBlankValue(raw.date_of_in_time)) {
        raw.date_of_in_time = raw.date || todayDate;
      }
    }

    return raw;
  }, [definition.slug, fields, initial, todayDate]);
  const [values, setValues] = useState<Record<string, unknown>>(initialValues);
  const [error, setError] = useState('');
  const setValue = (key: string, value: unknown) => setValues((prev) => {
    const next = { ...prev, [key]: value };
    if (definition.slug === 'driver-attendance') {
      if (key === 'date' && (!next.date_of_in_time || next.date_of_in_time === prev.date)) {
        next.date_of_in_time = value;
      }
      if (key === 'out_time' && value && isBlankValue(next.date_of_out_time)) {
        next.date_of_out_time = next.date_of_in_time || next.date || todayDate;
      }
    }
    if (['outgoing-vehicles', 'outgoing-vehicle-log'].includes(definition.slug)) {
      if (key === 'station') {
        const strVal = String(value ?? '').trim().toLowerCase();
        if (strVal === 'unit 2' || strVal === 'unit-2') {
          next.station_name = 'Unit 2';
        } else if (strVal === 'local' || strVal === 'out of station') {
          if (next.station_name === 'Unit 2') {
            next.station_name = '';
          }
        } else if (!value) {
          next.station_name = '';
        }
      }
    }
    if (definition.slug === 'daily-attendance' && key === 'has_gate_pass' && !isYes(value)) {
      delete next.gate_pass_out_time;
      delete next.gate_pass_in_time;
    }
    return next;
  });
  const formFields = useMemo(() => fields.filter((field) => {
    if (definition.slug === 'daily-attendance' && ['gate_pass_out_time', 'gate_pass_in_time'].includes(field.key)) {
      return isYes(values.has_gate_pass);
    }
    if (['outgoing-vehicles', 'outgoing-vehicle-log'].includes(definition.slug) && field.key === 'station_name') {
      const st = String(values.station ?? '').trim().toLowerCase();
      return st === 'local' || st === 'out of station' || st === 'other';
    }
    return true;
  }).map((field) => {
    if (['outgoing-vehicles', 'outgoing-vehicle-log'].includes(definition.slug) && field.key === 'station_name') {
      return { ...field, required: true };
    }
    return field;
  }), [definition.slug, fields, values.has_gate_pass, values.station]);
  const orderedFields = useMemo(() => {
    if (!['daily-attendance', 'chowk-labour'].includes(definition.slug)) return formFields;
    const timeOrder = String(values.shift ?? '').toLowerCase() === 'evening'
      ? ['evening_in', 'evening_out', 'morning_in', 'morning_out']
      : ['morning_in', 'morning_out', 'evening_in', 'evening_out'];
    const orderedKeys = [
      definition.slug === 'daily-attendance' ? 'labour_name' : 'name',
      'shift',
      ...timeOrder,
      ...(definition.slug === 'daily-attendance' ? ['has_gate_pass', 'gate_pass_out_time', 'gate_pass_in_time'] : []),
    ];
    const ordered = orderedKeys
      .map((key) => formFields.find((field) => field.key === key))
      .filter((field): field is FieldDefinition => Boolean(field));
    const orderedKeySet = new Set(ordered.map((field) => field.key));
    return [...ordered, ...formFields.filter((field) => !orderedKeySet.has(field.key))];
  }, [definition.slug, formFields, values.shift]);
  const derivedValues = useMemo(() => {
    const calculated: Record<string, unknown> = {};
    if (['daily-attendance', 'chowk-labour'].includes(definition.slug)) {
      const totalMinutes = trainingDurationMinutes(values);
      if (totalMinutes !== undefined) {
        calculated.total_hours = formatClockDuration(totalMinutes);
        calculated.total_days = formatTotalDays(totalMinutes);
        calculated.overtime = formatClockDuration(overtimeMinutesFor(totalMinutes));
      }
    }


    if (definition.slug === 'driver-schedule') {
      const driverName = String(values.choosen_driver ?? '').trim().toLowerCase();
      calculated.fetched_phone = driverPhones[driverName] ?? '';
    }

    if (definition.slug === 'mango-tree-meter' || definition.slug === 'clinic-gate-meter') {
      const officeInitial = Number(values.office_initial);
      const officeFinal = Number(values.office_final);
      const minutes = Number.isFinite(officeInitial) && Number.isFinite(officeFinal) ? (officeFinal - officeInitial) / 1.6 : undefined;
      const onMinutes = timeToMinutes(values.on_time);
      const kothiInitial = Number(values.kothi_initial);
      const kothiFinal = Number(values.kothi_final);
      const water = Number.isFinite(kothiInitial) && Number.isFinite(kothiFinal) ? kothiFinal - kothiInitial : undefined;
      const roundedMinutes = minutes !== undefined ? Math.round(minutes) : undefined;
      const offMinutes = roundedMinutes !== undefined && onMinutes !== undefined ? onMinutes + roundedMinutes : undefined;
      if (roundedMinutes !== undefined) calculated.minutes_consumed = roundedMinutes;
      if (offMinutes !== undefined) calculated.off_time = `${String(Math.floor((((offMinutes % 1440) + 1440) % 1440) / 60)).padStart(2, '0')}:${String(((offMinutes % 60) + 60) % 60).padStart(2, '0')}`;
      if (water !== undefined) calculated.total_water_consumed = Math.round(water);
      if (water !== undefined && roundedMinutes) calculated.per_minute_water_consumed = Math.round(water / roundedMinutes);
    }

    if (definition.slug === 'outgoing-vehicles' || definition.slug === 'outgoing-vehicle-log') {
      const initialReading = Number(values.initial_reading);
      const finalReading = Number(values.final_reading);
      if (Number.isFinite(initialReading) && Number.isFinite(finalReading)) calculated.total_km_car_run = finalReading - initialReading;
    }

    if (definition.slug === 'unit-2-gate-pass') {
      const unit12 = timeToMinutes(values.in_time_in_unit_2);
      const unit12Start = timeToMinutes(values.out_time_from_unit_1);
      const unit21 = timeToMinutes(values.in_time_in_unit_1);
      const unit21Start = timeToMinutes(values.out_time_from_unit_2);
      if (unit12 !== undefined && unit12Start !== undefined) calculated.time_taken_to_travel_from_unit1_to_2 = formatDuration((unit12 - unit12Start + 1440) % 1440);
      if (unit21 !== undefined && unit21Start !== undefined) calculated.time_taken_to_travel_from_unit_2_to_1 = formatDuration((unit21 - unit21Start + 1440) % 1440);
    }

    if (definition.slug === 'solar-panel-cleaning') {
      const inM = timeToMinutes(values.in_time);
      const outM = timeToMinutes(values.out_time);
      if (inM !== undefined && outM !== undefined) {
        calculated.man_power = formatDuration((outM - inM + 1440) % 1440);
      }
    }

    if (definition.slug === 'folk-lifter' || definition.slug === 'fork-lifter') {
      const initial = Number(values.initial_meter_reading);
      const final = Number(values.final_meter_reading);
      if (Number.isFinite(initial) && Number.isFinite(final)) {
        calculated.today_total_reading = Math.round((final - initial) * 100) / 100;
      }
    }

    if (definition.slug === 'car-breakdowns' || definition.slug === 'car-breakdown') {
      const duration = calculateServiceDuration(
        values.date || todayDate,
        values.car_out_time_for_service,
        values.car_in_date,
        values.car_in_time_after_service,
      );
      if (duration !== undefined) {
        calculated.total_time_consumed_in_service = duration;
      }
    }

    return calculated;
  }, [definition.slug, driverPhones, values]);
  useEffect(() => { setValues(initialValues); setError(''); }, [initialValues]);
  const displayValues: Record<string, unknown> = { ...values, ...derivedValues };

  const isVehicleRegister = ['outgoing-vehicles', 'outgoing-vehicle-log'].includes(definition.slug);
  const initialHadOutTime = Boolean(initial?.data?.out_time);
  const currentFinalReading = Number(values.final_reading);
  const isEnteringFinalReading = Number.isFinite(currentFinalReading) && currentFinalReading > 0;
  const isReturningTrip = Boolean(initial && isVehicleRegister && initialHadOutTime && isEnteringFinalReading);
  const [clockOutDriverOnReturn, setClockOutDriverOnReturn] = useState(false);
  const [overrideAttendance, setOverrideAttendance] = useState(false);

  const selectedDateRaw = String(values.date ?? todayDate).trim();
  const selectedDateIso = toInputDate(selectedDateRaw);
  const selectedDateDmy = formatDate(selectedDateRaw);
  const dateKeys = useMemo(() => {
    const s = new Set<string>();
    getAllDateKeys(selectedDateRaw).forEach((k) => s.add(k));
    if (selectedDateIso) getAllDateKeys(selectedDateIso).forEach((k) => s.add(k));
    if (selectedDateDmy && selectedDateDmy !== '—') getAllDateKeys(selectedDateDmy).forEach((k) => s.add(k));
    return Array.from(s);
  }, [selectedDateRaw, selectedDateIso, selectedDateDmy]);

  // All drivers who attended on this date (active or logged out)
  const allAttendingDrivers = useMemo(() => {
    if (!isVehicleRegister) return null;
    const set = new Set<string>();
    dateKeys.forEach((k) => {
      (allAttendanceDriversByDate?.[k] ?? []).forEach((d) => set.add(d));
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [isVehicleRegister, allAttendanceDriversByDate, dateKeys]);

  // Drivers who are punched in and NOT logged out yet
  const activeAttendingDrivers = useMemo(() => {
    if (!isVehicleRegister) return null;
    const set = new Set<string>();
    dateKeys.forEach((k) => {
      (activeAttendanceDriversByDate?.[k] ?? []).forEach((d) => set.add(d));
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [isVehicleRegister, activeAttendanceDriversByDate, dateKeys]);

  // Drivers who have already logged out / ended shift on this date
  const loggedOutDrivers = useMemo(() => {
    if (!isVehicleRegister) return [];
    const map = new Map<string, string>();
    dateKeys.forEach((k) => {
      (loggedOutDriversByDate?.[k] ?? []).forEach(({ driverName, outTime }) => {
        if (!map.has(driverName.toLowerCase())) {
          map.set(driverName.toLowerCase(), outTime);
        }
      });
    });
    return Array.from(map.entries()).map(([k, outTime]) => {
      const original = allAttendingDrivers?.find((d) => d.toLowerCase() === k) || k.toUpperCase();
      return { driverName: original, outTime };
    });
  }, [isVehicleRegister, loggedOutDriversByDate, dateKeys, allAttendingDrivers]);

  // Drivers attending on this date who are currently out on a trip / out of station and haven't returned to the office
  const busyDriversOnDate = useMemo(() => {
    if (!activeAttendingDrivers || !activeDriverTrips) return [];
    return activeAttendingDrivers
      .filter((driver) => {
        const key = driver.toLowerCase();
        if (initial && String(initial.data.driver_name ?? '').trim().toLowerCase() === key) {
          return false;
        }
        return activeDriverTrips.has(key);
      })
      .map((driver) => {
        const info = activeDriverTrips.get(driver.toLowerCase())!;
        return {
          driverName: driver,
          ...info,
        };
      });
  }, [activeAttendingDrivers, activeDriverTrips, initial]);

  // Available drivers: attending on this date, NOT logged out, AND NOT currently out of station / on an active trip
  const attendingDrivers = useMemo(() => {
    if (!activeAttendingDrivers) return null;
    return activeAttendingDrivers.filter((driver) => {
      const key = driver.toLowerCase();
      if (initial && String(initial.data.driver_name ?? '').trim().toLowerCase() === key) {
        return true;
      }
      return !activeDriverTrips?.has(key);
    });
  }, [activeAttendingDrivers, activeDriverTrips, initial]);

  const submit = () => {
    const missing = formFields.filter((field) => field.required && !field.derived && (displayValues[field.key] === undefined || displayValues[field.key] === '')).map((field) => field.label);
    if (missing.length) { setError(`Enter the required fields: ${missing.join(', ')}`); return; }
    const data = { ...displayValues };
    fields.forEach((field) => {
      if ((field.type === 'date' || field.key === 'date') && (!data[field.key] || isBlankValue(data[field.key]))) {
        data[field.key] = todayDate;
      }
    });

    if (definition.slug === 'driver-attendance') {
      if (!data.date_of_in_time && data.date) {
        data.date_of_in_time = data.date;
      }
      if (!data.date && data.date_of_in_time) {
        data.date = data.date_of_in_time;
      }
    }

    if (isVehicleRegister && !overrideAttendance) {
      if (attendingDrivers && attendingDrivers.length === 0) {
        if (busyDriversOnDate.length > 0 && loggedOutDrivers.length > 0) {
          setError(`Cannot dispatch: All attending drivers for ${selectedDateDmy && selectedDateDmy !== '—' ? selectedDateDmy : selectedDateRaw} are either on a trip or have logged out for the day.`);
        } else if (busyDriversOnDate.length > 0) {
          setError(`Cannot dispatch: All attending drivers for ${selectedDateDmy && selectedDateDmy !== '—' ? selectedDateDmy : selectedDateRaw} are currently out of station or on an active trip. Record their return (final reading) before logging a new outgoing vehicle.`);
        } else if (loggedOutDrivers.length > 0) {
          setError(`Cannot dispatch: All attending drivers for ${selectedDateDmy && selectedDateDmy !== '—' ? selectedDateDmy : selectedDateRaw} have already logged out / ended their shift for the day.`);
        } else {
          setError(`No driver attendance recorded on ${selectedDateDmy && selectedDateDmy !== '—' ? selectedDateDmy : selectedDateRaw}. Please mark attendance in Driver Attendance first or enable Override.`);
        }
        return;
      }

      const chosenDriver = String(data.driver_name ?? '').trim().toLowerCase();
      if (!initial && chosenDriver && loggedOutDrivers.some((d) => d.driverName.toLowerCase() === chosenDriver)) {
        const lo = loggedOutDrivers.find((d) => d.driverName.toLowerCase() === chosenDriver);
        setError(`Driver ${data.driver_name} has already logged out / ended shift for today (Clocked Out: ${lo?.outTime}). Assign an active on-duty driver.`);
        return;
      }

      if (!initial && chosenDriver && activeDriverTrips?.has(chosenDriver)) {
        const trip = activeDriverTrips.get(chosenDriver)!;
        setError(`Driver ${data.driver_name} is currently out of office on an active trip (${trip.station}${trip.stationName ? ` - ${trip.stationName}` : ''}). Record their return (final reading) before dispatching a new vehicle.`);
        return;
      }

      const stationChoice = String(data.station ?? '').trim().toLowerCase();
      if (stationChoice === 'unit 2' || stationChoice === 'unit-2') {
        data.station = 'Unit 2';
        data.station_choice = 'Unit 2';
        data.station_name = 'Unit 2';
      } else if (stationChoice === 'local') {
        data.station = 'Local';
        data.station_choice = 'Local';
        const placeName = String(data.station_name ?? '').trim();
        if (!placeName) {
          setError('Enter the required fields: Destination / Name of Place');
          return;
        }
        data.station_name = placeName;
      } else if (stationChoice === 'out of station' || stationChoice === 'out-station') {
        data.station = 'Out of Station';
        data.station_choice = 'Out of Station';
        const placeName = String(data.station_name ?? '').trim();
        if (!placeName) {
          setError('Enter the required fields: Destination / Name of Place');
          return;
        }
        data.station_name = placeName;
      }
    }
    if (definition.slug === 'daily-attendance' && !isYes(data.has_gate_pass)) {
      delete data.gate_pass_out_time;
      delete data.gate_pass_in_time;
    }
    onSubmit({ data }, initial, setError);

    // If clockOutDriverOnReturn was selected, update the driver attendance record out_time
    if (clockOutDriverOnReturn && isReturningTrip) {
      const driverName = String(data.driver_name ?? '').trim().toLowerCase();
      const attendanceRec = (driverAttendanceRecords ?? []).find((rec) => {
        const recDriver = String(rec.data.name ?? rec.data.driver_name ?? '').trim().toLowerCase();
        if (recDriver !== driverName) return false;
        const inDate = rec.data.date_of_in_time ?? rec.data.date ?? rec.createdAt;
        const recKeys = getAllDateKeys(inDate);
        return dateKeys.some((k) => recKeys.includes(k));
      });
      if (attendanceRec && isBlankValue(attendanceRec.data.out_time)) {
        const outTime = String(data.in_time || currentIndiaTime()).trim();
        const outDate = String(data.date || todayDate).trim();
        updateRecord.mutate({
          slug: 'driver-attendance',
          id: attendanceRec.id,
          data: {
            data: {
              ...attendanceRec.data,
              out_time: outTime,
              date_of_out_time: attendanceRec.data.date_of_out_time || outDate,
            },
          },
        });
      }
    }
  };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/35 p-4" role="dialog" aria-modal="true">
      <div className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-card shadow-2xl">
        <div className="sticky top-0 flex items-start justify-between border-b border-border bg-card px-6 py-5">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[.16em] text-primary">{initial ? 'Edit record' : 'New record'}</div>
            <h2 className="mt-1 font-serif text-2xl font-bold">{definition.title}</h2>
            <p className="mt-2 text-xs text-muted-foreground">
              Fields marked <span className="font-semibold text-primary">Auto-filled</span> are calculated or assigned automatically.
              {initial && ['manager', 'security'].includes(role ?? '') && <span> Name fields are locked after entry.</span>}
            </p>
          </div>
          <button onClick={onClose} className="rounded-md p-2 text-muted-foreground hover:bg-muted" data-testid="button-close-record-dialog">
            <X size={18} />
          </button>
        </div>
        <div className="grid gap-4 p-6 sm:grid-cols-2">
          {orderedFields.map((field) => (
            <FieldInput
              key={field.key}
              field={field}
              value={displayValues[field.key]}
              labourNames={labourNames}
              keyNames={keyNames}
              driverNames={driverNames}
              securityNames={securityNames}
              nameOptions={nameOptions}
              editable={!initial || !['manager', 'security'].includes(role ?? '') || !isNameField(field)}
              onChange={(v) => setValue(field.key, v)}
              attendingDrivers={overrideAttendance ? driverNames : attendingDrivers}
              allAttendingDrivers={allAttendingDrivers}
              busyDriversOnDate={busyDriversOnDate}
              loggedOutDrivers={loggedOutDrivers}
              isAttendanceLoading={isAttendanceLoading}
              attendanceError={attendanceError}
              onRetryAttendance={onRetryAttendance}
              selectedDateFormatted={selectedDateDmy && selectedDateDmy !== '—' ? selectedDateDmy : selectedDateRaw}
              role={role}
              overrideAttendance={overrideAttendance}
              onToggleOverride={() => setOverrideAttendance((prev) => !prev)}
            />
          ))}
        </div>
        {isReturningTrip && (
          <div className="mx-6 mb-4 rounded-xl border border-primary/25 bg-primary/5 p-3.5 shadow-sm">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={clockOutDriverOnReturn}
                onChange={(e) => setClockOutDriverOnReturn(e.target.checked)}
                className="mt-0.5 size-4 rounded accent-primary cursor-pointer"
              />
              <div>
                <span className="text-xs font-semibold text-foreground">
                  Also punch out driver ({String(displayValues.driver_name)}) from duty upon return
                </span>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Automatically marks out-time in Driver Attendance to {displayValues.in_time ? String(displayValues.in_time) : 'current time'} so their shift is ended.
                </p>
              </div>
            </label>
          </div>
        )}
        {error && (
          <div className="mx-6 mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive" role="alert">
            {error}
          </div>
        )}
        <div className="flex justify-end gap-3 border-t border-border px-6 py-4">
          <button onClick={onClose} className="rounded-lg border border-border px-4 py-2.5 text-sm font-semibold hover:bg-muted" data-testid="button-cancel-record">
            Cancel
          </button>
          <button disabled={pending} onClick={submit} className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50" data-testid="button-save-record">
            {pending ? 'Saving…' : initial ? 'Save changes' : 'Add record'}
          </button>
        </div>
      </div>
    </div>
  );
}

function FieldInput({
  field,
  value,
  labourNames,
  keyNames,
  driverNames,
  securityNames,
  nameOptions,
  editable = true,
  onChange,
  attendingDrivers,
  allAttendingDrivers,
  busyDriversOnDate = [],
  loggedOutDrivers = [],
  isAttendanceLoading,
  attendanceError,
  onRetryAttendance,
  selectedDateFormatted,
  role,
  overrideAttendance,
  onToggleOverride,
}: {
  field: FieldDefinition;
  value: unknown;
  labourNames: string[];
  keyNames: string[];
  driverNames: string[];
  securityNames: string[];
  nameOptions: string[];
  editable?: boolean;
  onChange: (value: unknown) => void;
  attendingDrivers?: string[] | null;
  allAttendingDrivers?: string[] | null;
  busyDriversOnDate?: Array<{ driverName: string; station: string; stationName: string; carName: string; outTime: string; date: string }>;
  loggedOutDrivers?: Array<{ driverName: string; outTime: string }>;
  isAttendanceLoading?: boolean;
  attendanceError?: string;
  onRetryAttendance?: () => void;
  selectedDateFormatted?: string;
  role?: string;
  overrideAttendance?: boolean;
  onToggleOverride?: () => void;
}) {
  const isDateField = field.type === 'date' || field.key === 'date';
  const todayDate = indiaDateKey(new Date());
  const rawDate = isDateField ? toInputDate(value) : '';
  const dateValue = isDateField ? (rawDate || todayDate) : '';
  const displayValue = isDateField ? dateValue : String(value ?? '');

  const common = {
    value: displayValue,
    placeholder: field.key === 'serial_number' && !value ? 'Assigned automatically' : undefined,
    required: Boolean(field.required && !field.derived),
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => onChange(e.target.value),
    className: 'w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary',
  };
  const negativeOvertime = field.key === 'overtime' && String(value ?? '').startsWith('-');
  const inputClass = `${common.className} ${field.derived ? `border-primary/30 bg-primary/5 font-semibold ${negativeOvertime ? 'text-destructive' : 'text-primary'}` : ''}`;

  const isDriverField = ['driver_name', 'name', 'choosen_driver'].includes(field.key);
  const isOutgoingVehicleDriver = isDriverField && attendingDrivers !== undefined && attendingDrivers !== null;
  const baseDriverOptions = isOutgoingVehicleDriver ? attendingDrivers : driverNames;

  const options = field.key === 'labour_name'
    ? labourNames
    : isOutgoingVehicleDriver
      ? attendingDrivers
      : isDriverField && baseDriverOptions.length
        ? baseDriverOptions
        : isSecuritySignField(field) && securityNames.length
          ? securityNames
      : field.key === 'location' && keyNames.length
        ? keyNames
        : field.key === 'name' && nameOptions.length
          ? nameOptions
          : field.options ?? [];

  const currentValue = String(value ?? '').trim();
  const selectOptions = currentValue && !options.some((o) => o.toLowerCase() === currentValue.toLowerCase())
    ? [currentValue, ...options]
    : options;

  const rendersSelect = field.type === 'select' || field.key === 'labour_name' || (isOutgoingVehicleDriver && !field.derived);
  const dateBounds = (field.key === 'date' || field.type === 'date') ? entryDateBounds(role) : undefined;

  return (
    <label className={field.type === 'textarea' ? 'sm:col-span-2' : ''}>
      <span className="mb-1.5 block text-xs font-semibold">
        {field.label}
        {field.required && <span className="ml-1 text-destructive">*</span>}
        {field.derived && <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">Auto-filled</span>}
        {!editable && <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Locked</span>}
      </span>
      {field.type === 'textarea' ? (
        <textarea {...common} className={inputClass} readOnly={field.derived || !editable} rows={3} data-testid={`input-field-${field.key}`} />
      ) : rendersSelect ? (
        <div>
          <select
            {...common}
            className={inputClass}
            disabled={field.derived || !editable}
            data-testid={`input-field-${field.key}`}
          >
            <option value="">
              {isOutgoingVehicleDriver && isAttendanceLoading
                ? 'Loading attending drivers…'
                : isOutgoingVehicleDriver && attendanceError
                  ? 'Error loading driver attendance'
                  : isOutgoingVehicleDriver && allAttendingDrivers && allAttendingDrivers.length === 0
                    ? 'No drivers marked present on this date'
                    : isOutgoingVehicleDriver && attendingDrivers && attendingDrivers.length === 0
                      ? 'No drivers available (all on trip or logged out)'
                      : 'Select driver…'}
            </option>
            {selectOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
          {isOutgoingVehicleDriver && (
            <div className="mt-1.5 text-[11px] leading-tight space-y-1.5">
              {isAttendanceLoading ? (
                <span className="text-muted-foreground animate-pulse flex items-center gap-1">
                  <RefreshCw size={11} className="animate-spin" /> Checking driver attendance and station status…
                </span>
              ) : attendanceError ? (
                <div className="flex items-center gap-1.5 text-destructive font-medium">
                  <AlertTriangle size={12} className="shrink-0" />
                  <span>{attendanceError}</span>
                  {onRetryAttendance && (
                    <button type="button" onClick={onRetryAttendance} className="underline ml-1 font-semibold">
                      Retry
                    </button>
                  )}
                </div>
              ) : allAttendingDrivers && allAttendingDrivers.length === 0 ? (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-amber-900 dark:text-amber-200">
                  <div className="flex items-center gap-1 font-medium">
                    <AlertTriangle size={12} className="shrink-0 text-amber-600 dark:text-amber-400" />
                    <span>
                      No driver attendance recorded on <strong>{selectedDateFormatted}</strong>. Please mark attendance in Driver Attendance first.
                    </span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-3">
                    <Link
                      href="/registers/driver-attendance"
                      target="_blank"
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary underline hover:opacity-80"
                    >
                      <ExternalLink size={11} /> Open Driver Attendance Record
                    </Link>
                    {onRetryAttendance && (
                      <button
                        type="button"
                        onClick={onRetryAttendance}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 dark:text-amber-200 underline hover:opacity-80"
                      >
                        <RefreshCw size={11} /> Refresh attendance
                      </button>
                    )}
                    {onToggleOverride && (
                      <button
                        type="button"
                        onClick={onToggleOverride}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-700 dark:text-indigo-300 underline hover:opacity-80"
                      >
                        🔓 Override (Show all drivers)
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {overrideAttendance && (
                    <div className="flex items-center justify-between rounded-lg border border-indigo-500/25 bg-indigo-500/10 px-2.5 py-1.5 text-[11px] text-indigo-900 dark:text-indigo-200 font-medium">
                      <span>🔓 Showing all registered drivers (Attendance override active)</span>
                      {onToggleOverride && (
                        <button
                          type="button"
                          onClick={onToggleOverride}
                          className="text-xs font-semibold underline text-indigo-700 dark:text-indigo-300 hover:opacity-80"
                        >
                          Revert
                        </button>
                      )}
                    </div>
                  )}
                  {attendingDrivers && attendingDrivers.length > 0 ? (
                    <span className="flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 size={12} className="shrink-0" />
                      <span>Showing {attendingDrivers.length} driver(s) available in office on {selectedDateFormatted}</span>
                    </span>
                  ) : (
                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-amber-900 dark:text-amber-200">
                      <div className="flex items-center gap-1 font-semibold text-amber-700 dark:text-amber-400">
                        <AlertTriangle size={12} className="shrink-0" />
                        <span>No drivers currently available for new dispatch</span>
                      </div>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        All attending drivers for this date are either currently out on a trip or have already logged out.
                      </p>
                    </div>
                  )}

                  {busyDriversOnDate.length > 0 && (
                    <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-2 text-[11px]">
                      <span className="font-semibold text-blue-700 dark:text-blue-300 flex items-center gap-1">
                        🚗 On trip / Out of office (excluded):
                      </span>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {busyDriversOnDate.map((b) => (
                          <span key={b.driverName} className="inline-flex items-center gap-1 rounded bg-blue-500/15 px-2 py-0.5 font-medium text-[11px] text-blue-800 dark:text-blue-200">
                            {b.driverName} — {b.station}{b.stationName ? ` (${b.stationName})` : ''} {b.outTime ? `[Out: ${b.outTime}]` : ''}
                          </span>
                        ))}
                      </div>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        Log their return (final reading) before they can be assigned again.
                      </p>
                    </div>
                  )}

                  {loggedOutDrivers && loggedOutDrivers.length > 0 && (
                    <div className="rounded-lg border border-slate-500/20 bg-slate-500/5 p-2 text-[11px]">
                      <span className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                        🚪 Shift ended / Logged out (excluded):
                      </span>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {loggedOutDrivers.map((d) => (
                          <span key={d.driverName} className="inline-flex items-center gap-1 rounded bg-slate-500/15 px-2 py-0.5 font-medium text-[11px] text-slate-700 dark:text-slate-300">
                            {d.driverName} [Clocked Out: {d.outTime}]
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      ) : field.type === 'checkbox' ? (
        <input type="checkbox" checked={Boolean(value)} disabled={field.derived || !editable} onChange={(e) => onChange(e.target.checked)} className="size-4 accent-[hsl(var(--primary))]" data-testid={`input-field-${field.key}`} />
      ) : (
        <input {...common} {...dateBounds} className={inputClass} readOnly={field.derived || !editable} type={field.type} data-testid={`input-field-${field.key}`} />
      )}
    </label>
  );
}

function BreakdownModal({
  definition,
  onClose,
  onSuccess,
}: {
  definition: RegisterDefinition;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const { user } = useAuth();
  const todayDate = indiaDateKey(new Date());
  const [date, setDate] = useState(todayDate);
  const [issue, setIssue] = useState('');
  const [reportedBy, setReportedBy] = useState(user?.displayName || '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  const submitBreakdown = async (e: FormEvent) => {
    e.preventDefault();
    if (!issue.trim()) {
      setError('Please describe the breakdown issue.');
      return;
    }
    setPending(true);
    setError('');
    try {
      const res = await fetch('/api/breakdowns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          registerSlug: definition.slug,
          tubewellName: definition.title,
          date,
          issue: issue.trim(),
          reportedBy: reportedBy.trim() || user?.displayName || 'Staff',
        }),
      });
      const text = await res.text();
      let data: any = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        throw new Error(
          res.status === 404
            ? 'Breakdowns endpoint not found (404). Please ensure the backend server has been restarted.'
            : `Server returned unexpected response (status ${res.status}): ${text.slice(0, 120)}`
        );
      }
      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit breakdown.');
      }
      const emailNote = data.emailSent
        ? `Alert email dispatched to ${data.emailRecipient}.`
        : data.emailError
          ? `(Email note: ${data.emailError})`
          : '';
      onSuccess(`Breakdown recorded successfully. ${emailNote}`);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to record breakdown. Please try again.');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/35 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg rounded-2xl border border-red-500/30 bg-card p-6 shadow-2xl">
        <div className="flex items-start justify-between border-b border-border pb-4">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-red-500/15 text-red-600 dark:text-red-400">
              <AlertTriangle size={20} />
            </span>
            <div>
              <div className="font-mono text-[10px] uppercase tracking-wider text-red-600 dark:text-red-400 font-bold">
                Incident Report
              </div>
              <h3 className="font-serif text-xl font-bold leading-tight">Report Breakdown</h3>
              <p className="text-xs text-muted-foreground">{definition.title}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
            data-testid="button-close-breakdown-modal"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={submitBreakdown} className="mt-5 space-y-4">
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-900 dark:text-amber-200">
            ⚠️ <strong>Alert Notice:</strong> Submitting this breakdown record will immediately dispatch an alert email to the incharge/admin so maintenance can be scheduled right away.
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold">
              Current Date <span className="text-destructive">*</span>
            </label>
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20"
              data-testid="input-breakdown-date"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold">
              Issue Details <span className="text-destructive">*</span>
            </label>
            <textarea
              required
              rows={4}
              value={issue}
              onChange={(e) => setIssue(e.target.value)}
              placeholder="Describe the breakdown issue in detail (e.g. Motor tripped, pipe leakage, low voltage, water discharge stopped)..."
              className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20"
              data-testid="input-breakdown-issue"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold">Reported By</label>
            <input
              type="text"
              value={reportedBy}
              onChange={(e) => setReportedBy(e.target.value)}
              placeholder="Your name / staff designation"
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              data-testid="input-breakdown-reported-by"
            />
          </div>

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive font-medium">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border px-4 py-2.5 text-sm font-semibold hover:bg-muted"
              data-testid="button-cancel-breakdown"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-5 py-2.5 text-sm font-semibold text-white shadow hover:bg-red-700 disabled:opacity-50"
              data-testid="button-submit-breakdown"
            >
              <Send size={15} /> {pending ? 'Sending alert…' : 'Record Breakdown & Send Email'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
