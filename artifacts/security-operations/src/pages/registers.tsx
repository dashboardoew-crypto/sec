import { type ChangeEvent, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CalendarDays, Check, ChevronDown, Download, Edit3, FilePlus2, LockKeyhole, Search, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { Link, useLocation, useParams } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { getListRegisterRecordsQueryKey, getListRegistersQueryKey, useCreateRegisterRecord, useDeleteRegisterRecord, useListRegisterRecords, useListRegisters, useUpdateRegisterRecord } from '@workspace/api-client-react';
import type { FieldDefinition, RegisterDefinition, RegisterRecord } from '@workspace/api-client-react';
import { EmptyState, PageIntro } from '@/components/ops-ui';
import { canCreateRegisterRecord, useAuth } from '@/lib/auth';

const formatDate = (value: unknown) => {
  if (!value) return '—';
  const text = String(value);
  const dayFirst = text.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (dayFirst) return text;
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? `${iso[3]}-${iso[2]}-${iso[1]}` : text;
};
const indiaDateKey = (value: Date) => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value);
  const get = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
};

const editWindowForRole = (role?: string) => {
  if (role === 'admin') return null;
  if (role === 'manager') return 7;
  if (role === 'security') return 3;
  return undefined;
};

const canEditRecord = (createdAt?: string, role?: string, module?: RegisterDefinition['module']) => {
  if (module === 'master' && ['admin', 'manager', 'hr'].includes(role ?? '')) return true;
  const windowDays = editWindowForRole(role);
  if (windowDays === null) return true;
  if (windowDays === undefined || !createdAt) return false;
  if (!createdAt) return false;
  const createdDate = new Date(`${indiaDateKey(new Date(createdAt))}T00:00:00Z`);
  const today = new Date(`${indiaDateKey(new Date())}T00:00:00Z`);
  const daysSinceCreation = Math.floor((today.getTime() - createdDate.getTime()) / 86_400_000);
  return daysSinceCreation >= 0 && daysSinceCreation <= windowDays;
};

const canDeleteRecord = (createdAt?: string, role?: string) =>
  role === 'admin' || (role === 'manager' && canEditRecord(createdAt, role));

const editWindowLabel = (role?: string, module?: RegisterDefinition['module']) => module === 'master' && ['admin', 'manager', 'hr'].includes(role ?? '')
  ? 'anytime'
  : role === 'manager' ? '7 days' : role === 'security' ? '3 days' : 'your access window';
const moduleLabel = (module: RegisterDefinition['module']) => module === 'security' ? 'Security operations' : module === 'main-gate' ? 'Main gate security' : 'Master data';
const moduleTitle = (module: RegisterDefinition['module']) => module === 'security' ? 'Security registers' : module === 'main-gate' ? 'Main gate registers' : 'Master registers';
const moduleEyebrow = (module: RegisterDefinition['module']) => module === 'security' ? 'Security' : module === 'main-gate' ? 'Main gate security' : 'Master data';
const isSecuritySignField = (field: FieldDefinition) => /sign/i.test(`${field.key} ${field.label}`);
const driverRegisterSlugs = ['driver-attendance', 'outgoing-vehicles', 'outgoing-vehicle-log', 'driver-schedule'];

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
    {showFilters && <div className="mt-3 grid gap-4 rounded-xl border border-border bg-muted/30 p-4 md:grid-cols-[1fr_1fr_auto] md:items-end" data-testid="filter-panel">
      <label><span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold"><CalendarDays size={13} /> From date</span><input type="date" value={from} onChange={(event) => onFromChange(event.target.value)} className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary" data-testid="input-from-date" /></label>
      <label><span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold"><CalendarDays size={13} /> To date</span><input type="date" value={to} onChange={(event) => onToChange(event.target.value)} className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary" data-testid="input-to-date" /></label>
      <div className="text-xs text-muted-foreground"><div className="font-semibold text-foreground">Search and date filters</div><p className="mt-1 max-w-xs leading-relaxed">Filters only hide non-matching rows. They never delete register data.</p></div>
    </div>}
    {activeFilters.length > 0 && <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3"><span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Active</span>{activeFilters.map((filter) => <span key={filter} className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs text-primary">{filter}{filter.startsWith('Search:') && <button onClick={onClearSearch} className="rounded-full hover:bg-primary/15" aria-label="Remove search filter"><X size={12} /></button>}</span>)}</div>}
  </section>;
}

function RegisterDetail({ definition }: { definition: RegisterDefinition }) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [searchDraft, setSearchDraft] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [sortOrder, setSortOrder] = useState<'none' | 'asc' | 'desc'>('none');
  const [dialog, setDialog] = useState<'create' | RegisterRecord | null>(null);
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
  const invalidate = () => { queryClient.invalidateQueries({ queryKey: getListRegisterRecordsQueryKey(definition.slug, params) }); queryClient.invalidateQueries({ queryKey: getListRegistersQueryKey() }); };
  const create = useCreateRegisterRecord();
  const update = useUpdateRegisterRecord();
  const remove = useDeleteRegisterRecord();
  const records = recordsQuery.data?.records ?? [];
  const sortedRecords = useMemo(() => {
    if (sortOrder === 'none') return records;
    const dateValue = (record: RegisterRecord) => String(record.recordDate ?? record.data.date ?? record.createdAt ?? '');
    return [...records].sort((a, b) => {
      const comparison = dateValue(a).localeCompare(dateValue(b));
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [records, sortOrder]);
  const visibleFields = useMemo(
    () => definition.fields.filter((field) => !(definition.slug === 'daily-attendance' && user?.role === 'security' && ['payment_status', 'overtime_payment_status'].includes(field.key))),
    [definition.fields, definition.slug, user?.role],
  );
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
    const cols = ['Register', 'registerSlug', 'recordDate', ...visibleFields.map((f) => f.key)];
    const rows = payload.records.map((r) => cols.map((c) => JSON.stringify(
      c === 'Register' ? definition.title
        : c === 'registerSlug' ? definition.slug
          : c === 'recordDate' ? r.recordDate ?? ''
            : String(r.data[c] ?? ''),
    )).join(','));
    const blob = new Blob([[cols.join(','), ...rows].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${definition.slug}.csv`; a.click(); URL.revokeObjectURL(url); setNotice(`CSV export ready (${payload.records.length} records)`);
  };
  const onSubmit = (data: { data: Record<string, unknown> }, editing?: RegisterRecord) => {
    if (editing) update.mutate({ slug: definition.slug, id: editing.id, data }, { onSuccess: () => { invalidate(); setDialog(null); setNotice('Record updated'); } });
    else create.mutate({ slug: definition.slug, data }, { onSuccess: () => { invalidate(); setDialog(null); setNotice('Record added to the register'); } });
  };
  const onDelete = (record: RegisterRecord) => {
    if (!window.confirm(`Delete this ${definition.title} record? This cannot be undone.`)) return;
    remove.mutate({ slug: definition.slug, id: record.id }, {
      onSuccess: () => { invalidate(); setNotice('Record deleted'); },
      onError: (error) => setNotice(error instanceof Error ? error.message : 'Record could not be deleted'),
    });
  };
  const applySearch = () => setSearch(searchDraft.trim());
  const clearSearch = () => { setSearchDraft(''); setSearch(''); };
  const clearFilters = () => { clearSearch(); setFrom(''); setTo(''); setShowFilters(false); };
  useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(''), 3200); return () => window.clearTimeout(timer); }, [notice]);
  return <div className="min-h-[100dvh] px-5 py-8 md:px-8 lg:px-10"><Link href={`/registers/${definition.module}`} className="mb-5 inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground" data-testid="link-back-to-module"><ArrowLeft size={14} /> {moduleLabel(definition.module)}</Link><PageIntro eyebrow={moduleEyebrow(definition.module)} title={definition.title} description={definition.description} action={canCreateRegisterRecord(user?.role) ? <button onClick={() => setDialog('create')} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90" data-testid="button-add-record"><FilePlus2 size={16} /> Add record</button> : <span className="rounded-lg border border-border bg-muted/45 px-3 py-2 text-xs font-semibold text-muted-foreground">Read-only access</span>} />
    {notice && <div className="mb-5 flex items-center gap-2 rounded-lg border border-[hsl(var(--chart-3))]/30 bg-[hsl(var(--chart-3))]/10 px-4 py-3 text-sm text-[hsl(var(--chart-3))]" data-testid="status-success"><Check size={16} />{notice}</div>}
        <RegisterFilters hasNameField={hasNameField} searchDraft={searchDraft} search={search} from={from} to={to} showFilters={showFilters} onSearchDraftChange={setSearchDraft} onApplySearch={applySearch} onClearSearch={clearSearch} onFromChange={setFrom} onToChange={setTo} onToggleFilters={() => setShowFilters((value) => !value)} onClearFilters={clearFilters} onExport={exportCsv} sortOrder={sortOrder} onSortChange={setSortOrder} />
        {passCounts.length > 0 && <section className="mb-5 rounded-xl border border-primary/20 bg-primary/5 p-4 shadow-sm" data-testid="section-pass-counts"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2 text-sm font-semibold"><span className="grid size-6 place-items-center rounded-md bg-primary/15 text-primary"><Check size={14} /></span>Gate passes by person</div><p className="mt-1 text-xs text-muted-foreground">Auto-counted from the records currently shown.</p></div><span className="rounded-full border border-primary/20 bg-card px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-primary">Auto-counted</span></div><div className="mt-4 flex flex-wrap gap-2">{passCounts.map(({ name, count }) => <span key={name} className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs"><span className="font-semibold">{name}</span><span className="rounded-full bg-primary/10 px-1.5 py-0.5 font-mono text-primary">{count}</span></span>)}</div></section>}
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">{recordsQuery.isLoading ? <div className="space-y-3 p-5">{[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-12 animate-pulse rounded bg-muted" />)}</div> : recordsQuery.isError ? <div className="p-8 text-center text-sm text-destructive">Records could not be loaded. <button onClick={() => recordsQuery.refetch()} className="font-semibold underline" data-testid="button-retry-records">Retry</button></div> : records.length === 0 ? <div className="p-5"><EmptyState title={search || from || to ? 'No records match these filters' : 'This register is clear'} description={search || from || to ? 'Remove a filter or try another search.' : 'Start the shift by adding the first record.'} /></div> : <div className="overflow-x-auto"><table className="w-full min-w-[1100px] text-left"><thead className="border-b border-border bg-muted/45"><tr>{visibleFields.map((field) => <th key={field.key} className="px-4 py-3 font-mono text-[10px] uppercase tracking-[.12em] text-muted-foreground">{field.label}{field.derived && <span className="ml-1 text-primary">(auto)</span>}</th>)}<th className="px-5 py-3 text-right font-mono text-[10px] uppercase tracking-[.12em] text-muted-foreground">Actions</th></tr></thead><tbody className="divide-y divide-border">{sortedRecords.map((record) => { const editable = canEditRecord(record.createdAt, user?.role, definition.module); const deletable = canDeleteRecord(record.createdAt, user?.role); return <tr key={record.id} className="group hover:bg-secondary/35" data-testid={`row-record-${record.id}`}>{visibleFields.map((field) => <td key={field.key} className={`max-w-[190px] truncate px-4 py-4 text-sm ${field.derived ? 'font-medium text-primary' : ''}`}>{formatValue(record.data[field.key], field)}</td>)}<td className="px-5 py-4"><div className="flex justify-end gap-1">{editable && <button onClick={() => setDialog(record)} className="rounded-md p-2 text-muted-foreground hover:bg-secondary hover:text-foreground" data-testid={`button-edit-record-${record.id}`} title={user?.role === 'admin' ? 'Edit record' : `Edit within ${editWindowLabel(user?.role, definition.module)} of entry`}><Edit3 size={14} /></button>}{deletable && <button onClick={() => onDelete(record)} disabled={remove.isPending} className="rounded-md p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50" data-testid={`button-delete-record-${record.id}`} title={user?.role === 'admin' ? 'Delete record' : 'Delete within 7 days of entry'}><Trash2 size={14} /></button>}{!editable && !deletable && (user?.role === 'manager' || user?.role === 'security') ? <span className="inline-flex items-center gap-1 px-2 py-2 text-[10px] font-medium text-muted-foreground" title={`Editing and deletion are locked after ${editWindowLabel(user?.role, definition.module)}`}><LockKeyhole size={13} /> Locked</span> : !editable && !deletable && <span className="px-2 py-2 text-[10px] font-medium text-muted-foreground">View only</span>}</div></td></tr>; })}</tbody></table></div>}<div className="border-t border-border px-5 py-3 text-xs text-muted-foreground">Showing <span className="font-mono text-foreground">{records.length}</span> of <span className="font-mono text-foreground">{recordsQuery.data?.total ?? definition.recordCount}</span> records</div></div>
      {dialog && <RecordDialog definition={definition} fields={visibleFields} labourNames={labourNames} keyNames={keyNames} driverNames={driverFieldOptions} driverPhones={driverPhones} securityNames={securityNames} nameOptions={nameOptions} initial={dialog === 'create' ? undefined : dialog} pending={create.isPending || update.isPending} onClose={() => setDialog(null)} onSubmit={onSubmit} />}
  </div>;
}

function formatValue(value: unknown, field: FieldDefinition) {
  if (value === undefined || value === null || value === '') return <span className="text-muted-foreground/60">—</span>;
  if (field.type === 'checkbox') return value ? <Check size={15} className="text-[hsl(var(--chart-3))]" /> : <X size={15} className="text-muted-foreground" />;
  if (field.type === 'date') return formatDate(value);
  if (field.key === 'overtime' && String(value).startsWith('-')) return <span className="font-semibold text-destructive">{String(value)}</span>;
  return String(value);
}

const timeToMinutes = (value: unknown) => {
  if (typeof value !== 'string') return undefined;
  const [hours, minutes] = value.split(':').map(Number);
  return Number.isFinite(hours) && Number.isFinite(minutes) ? hours * 60 + minutes : undefined;
};

const formatDuration = (minutes: number) => `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
const formatClockDuration = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
const formatSignedClockDuration = (minutes: number) => {
  const sign = minutes < 0 ? '-' : '';
  const absolute = Math.abs(minutes);
  return `${sign}${String(Math.floor(absolute / 60)).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')}`;
};
const formatTotalDays = (minutes: number) => {
  if (minutes < 300) return '0';
  if (minutes < 480) return '0.5';
  return '1';
};

const overtimeMinutesFor = (minutes: number) => {
  if (minutes < 300) return Math.max(minutes, 0);
  if (minutes < 480) return minutes - 300;
  return Math.max(minutes - 480, 0);
};

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

function RecordDialog({ definition, fields, labourNames, keyNames, driverNames, driverPhones, securityNames, nameOptions, initial, pending, onClose, onSubmit }: { definition: RegisterDefinition; fields: FieldDefinition[]; labourNames: string[]; keyNames: string[]; driverNames: string[]; driverPhones: Record<string, string>; securityNames: string[]; nameOptions: string[]; initial?: RegisterRecord; pending: boolean; onClose: () => void; onSubmit: (data: { data: Record<string, unknown> }, editing?: RegisterRecord) => void }) {
  const initialValues = useMemo(() => ({
    ...(initial?.data ?? {}),
    ...(!initial?.data?.date && definition.fields.some((field) => field.key === 'date')
      ? { date: initial?.recordDate ?? indiaDateKey(new Date()) }
      : {}),
  }), [definition.fields, initial]);
  const [values, setValues] = useState<Record<string, unknown>>(initialValues);
  const [error, setError] = useState('');
  const setValue = (key: string, value: unknown) => setValues((prev) => ({ ...prev, [key]: value }));
  const orderedFields = useMemo(() => {
    if (!['daily-attendance', 'chowk-labour'].includes(definition.slug)) return fields;
    const timeOrder = String(values.shift ?? '').toLowerCase() === 'evening'
      ? ['evening_in', 'evening_out', 'morning_in', 'morning_out']
      : ['morning_in', 'morning_out', 'evening_in', 'evening_out'];
    const orderedKeys = [definition.slug === 'daily-attendance' ? 'labour_name' : 'name', 'shift', ...timeOrder];
    const ordered = orderedKeys
      .map((key) => fields.find((field) => field.key === key))
      .filter((field): field is FieldDefinition => Boolean(field));
    const orderedKeySet = new Set(ordered.map((field) => field.key));
    return [...ordered, ...fields.filter((field) => !orderedKeySet.has(field.key))];
  }, [definition.slug, fields, values.shift]);
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
      const offMinutes = minutes !== undefined && onMinutes !== undefined ? Math.round(onMinutes + minutes) : undefined;
      if (minutes !== undefined) calculated.minutes_consumed = Number(minutes.toFixed(2));
      if (offMinutes !== undefined) calculated.off_time = `${String(Math.floor((((offMinutes % 1440) + 1440) % 1440) / 60)).padStart(2, '0')}:${String(((offMinutes % 60) + 60) % 60).padStart(2, '0')}`;
      if (water !== undefined) calculated.total_water_consumed = Math.round(water);
      if (water !== undefined && minutes) calculated.per_minute_water_consumed = Math.round(water / minutes);
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

    return calculated;
  }, [definition.slug, driverPhones, values]);
  useEffect(() => { setValues(initialValues); setError(''); }, [initialValues]);
  const displayValues: Record<string, unknown> = { ...values, ...derivedValues };
  const submit = () => {
    const missing = fields.filter((field) => field.required && !field.derived && (displayValues[field.key] === undefined || displayValues[field.key] === '')).map((field) => field.label);
    if (missing.length) { setError(`Enter the required fields: ${missing.join(', ')}`); return; }
    onSubmit({ data: displayValues }, initial);
  };
  return <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/35 p-4" role="dialog" aria-modal="true"><div className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-card shadow-2xl"><div className="sticky top-0 flex items-start justify-between border-b border-border bg-card px-6 py-5"><div><div className="font-mono text-[10px] uppercase tracking-[.16em] text-primary">{initial ? 'Edit record' : 'New record'}</div><h2 className="mt-1 font-serif text-2xl font-bold">{definition.title}</h2><p className="mt-2 text-xs text-muted-foreground">Fields marked <span className="font-semibold text-primary">Auto-filled</span> are calculated from the values you enter.</p></div><button onClick={onClose} className="rounded-md p-2 text-muted-foreground hover:bg-muted" data-testid="button-close-record-dialog"><X size={18} /></button></div><div className="grid gap-4 p-6 sm:grid-cols-2">{orderedFields.map((field) => <FieldInput key={field.key} field={field} value={displayValues[field.key]} labourNames={labourNames} keyNames={keyNames} driverNames={driverNames} securityNames={securityNames} nameOptions={nameOptions} onChange={(v) => setValue(field.key, v)} />)}</div>{error && <div className="mx-6 mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive" role="alert">{error}</div>}<div className="flex justify-end gap-3 border-t border-border px-6 py-4"><button onClick={onClose} className="rounded-lg border border-border px-4 py-2.5 text-sm font-semibold hover:bg-muted" data-testid="button-cancel-record">Cancel</button><button disabled={pending} onClick={submit} className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50" data-testid="button-save-record">{pending ? 'Saving…' : initial ? 'Save changes' : 'Add record'}</button></div></div></div>;
}

function FieldInput({ field, value, labourNames, keyNames, driverNames, securityNames, nameOptions, onChange }: { field: FieldDefinition; value: unknown; labourNames: string[]; keyNames: string[]; driverNames: string[]; securityNames: string[]; nameOptions: string[]; onChange: (value: unknown) => void }) {
  const common = { value: String(value ?? ''), required: Boolean(field.required && !field.derived), onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => onChange(e.target.value), className: 'w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary' };
  const negativeOvertime = field.key === 'overtime' && String(value ?? '').startsWith('-');
  const inputClass = `${common.className} ${field.derived ? `border-primary/30 bg-primary/5 font-semibold ${negativeOvertime ? 'text-destructive' : 'text-primary'}` : ''}`;
  const options = field.key === 'labour_name'
    ? labourNames
    : driverNames.length && ['name', 'driver_name', 'choosen_driver'].includes(field.key)
      ? driverNames
      : isSecuritySignField(field) && securityNames.length
        ? securityNames
    : field.key === 'location' && keyNames.length
      ? keyNames
      : field.key === 'name' && nameOptions.length
        ? nameOptions
        : field.options ?? [];
  const currentValue = String(value ?? '');
  const selectOptions = currentValue && !options.includes(currentValue) ? [currentValue, ...options] : options;
  return <label className={field.type === 'textarea' ? 'sm:col-span-2' : ''}><span className="mb-1.5 block text-xs font-semibold">{field.label}{field.required && <span className="ml-1 text-destructive">*</span>}{field.derived && <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">Auto-filled</span>}</span>{field.type === 'textarea' ? <textarea {...common} className={inputClass} readOnly={field.derived} rows={3} data-testid={`input-field-${field.key}`} /> : field.type === 'select' ? <select {...common} className={inputClass} disabled={field.derived} data-testid={`input-field-${field.key}`}><option value="">Select…</option>{selectOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select> : field.type === 'checkbox' ? <input type="checkbox" checked={Boolean(value)} disabled={field.derived} onChange={(e) => onChange(e.target.checked)} className="size-4 accent-[hsl(var(--primary))]" data-testid={`input-field-${field.key}`} /> : <input {...common} className={inputClass} readOnly={field.derived} type={field.type} data-testid={`input-field-${field.key}`} />}</label>;
}