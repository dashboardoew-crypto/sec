import { type ChangeEvent, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CalendarDays, Check, Download, Edit3, FilePlus2, Filter, LockKeyhole, Printer, Search, X } from 'lucide-react';
import { Link, useLocation, useParams } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { getListRegisterRecordsQueryKey, getListRegistersQueryKey, useCreateRegisterRecord, useListRegisterRecords, useListRegisters, useUpdateRegisterRecord } from '@workspace/api-client-react';
import type { FieldDefinition, RegisterDefinition, RegisterRecord } from '@workspace/api-client-react';
import { EmptyState, PageIntro } from '@/components/ops-shell';

const niceDate = (d?: string | null) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const EDIT_WINDOW_DAYS = 3;

const indiaDateKey = (value: Date) => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value);
  const get = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
};

const canEditRecord = (createdAt?: string) => {
  if (!createdAt) return false;
  const createdDate = new Date(`${indiaDateKey(new Date(createdAt))}T00:00:00Z`);
  const today = new Date(`${indiaDateKey(new Date())}T00:00:00Z`);
  const daysSinceCreation = Math.floor((today.getTime() - createdDate.getTime()) / 86_400_000);
  return daysSinceCreation >= 0 && daysSinceCreation <= EDIT_WINDOW_DAYS;
};

export default function RegistersPage() {
  const { slug = '' } = useParams<{ slug: string }>();
  const [, setLocation] = useLocation();
  const registers = useListRegisters({ query: { queryKey: getListRegistersQueryKey() } });
  const definition = registers.data?.find((r) => r.slug === slug);
  const isModule = slug === 'security' || slug === 'main-gate';
  const moduleName = slug === 'security' ? 'security' : slug === 'main-gate' ? 'main-gate' : undefined;
  if (registers.isLoading) return <div className="p-5 md:p-8"><div className="h-16 w-1/2 animate-pulse rounded bg-muted" /><div className="mt-6 h-96 animate-pulse rounded-xl bg-muted" /></div>;
  if (registers.isError) return <div className="p-5 md:p-8"><div className="rounded-xl border border-destructive/30 bg-destructive/5 p-8 text-sm text-destructive">Register library unavailable. <button onClick={() => registers.refetch()} className="font-semibold underline" data-testid="button-retry-registers">Retry</button></div></div>;
  if (isModule) return <ModuleLibrary module={moduleName!} registers={registers.data ?? []} onOpen={(s) => setLocation(`/registers/${s}`)} />;
  if (!definition) return <div className="p-8"><EmptyState title="Register not found" description="This register may have moved or is not available in this workspace." /></div>;
  return <RegisterDetail definition={definition} />;
}

function ModuleLibrary({ module, registers, onOpen }: { module: 'security' | 'main-gate'; registers: RegisterDefinition[]; onOpen: (slug: string) => void }) {
  const [search, setSearch] = useState('');
  const shown = registers.filter((r) => r.module === module && `${r.title} ${r.description}`.toLowerCase().includes(search.toLowerCase()));
  return <div className="ops-grid min-h-[100dvh] bg-background px-5 py-6 md:px-10 lg:px-16"><div className="mx-auto max-w-7xl"><div className="mb-8 flex items-center justify-between border-b border-border pb-5"><Link href="/" className="flex items-center gap-3 text-sm font-semibold text-foreground" data-testid="link-back-to-modules"><span className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground"><ArrowLeft size={16} /></span><span>Watchroom <span className="font-normal text-muted-foreground">/ Modules</span></span></Link><span className="font-mono text-[10px] uppercase tracking-[.18em] text-muted-foreground">Restricted workspace</span></div><PageIntro eyebrow={module === 'security' ? 'Security' : 'Main gate security'} title={module === 'security' ? 'Security registers' : 'Main gate registers'} description={`${shown.length} registers available in this workspace. Choose a register to review records or add a new entry.`} /><div className="mb-6 flex items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-sm"><Search size={17} className="ml-2 text-muted-foreground" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search registers by name or purpose…" className="w-full bg-transparent text-sm outline-none" data-testid="input-search-registers" /></div>{shown.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{shown.map((reg, i) => <button key={reg.slug} onClick={() => onOpen(reg.slug)} className="animate-in group rounded-xl border border-border bg-card p-5 text-left shadow-sm hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md" style={{ animationDelay: `${i * 35}ms` }} data-testid={`button-open-register-${reg.slug}`}><div className="mb-6 flex items-start justify-between"><span className="rounded bg-secondary px-2 py-1 font-mono text-[9px] uppercase tracking-[.12em] text-primary">{reg.fields.length} fields</span><span className="font-mono text-xs text-muted-foreground">{reg.recordCount.toLocaleString()}</span></div><h2 className="font-serif text-lg font-bold leading-tight">{reg.title}</h2><p className="mt-2 line-clamp-2 min-h-[40px] text-sm leading-relaxed text-muted-foreground">{reg.description}</p><div className="mt-5 flex items-center justify-between border-t border-border pt-4 text-xs text-primary"><span>Open register</span><span className="transition-transform group-hover:translate-x-1">→</span></div></button>)}</div> : <EmptyState title="No matching registers" description="Try a different search term." />}</div></div>;
}

function RegisterDetail({ definition }: { definition: RegisterDefinition }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [dialog, setDialog] = useState<'create' | RegisterRecord | null>(null);
  const [notice, setNotice] = useState('');
  const params = useMemo(() => ({ search: search || undefined, from: from || undefined, to: to || undefined, limit: 500 }), [search, from, to]);
  const recordsQuery = useListRegisterRecords(definition.slug, params, { query: { enabled: true, queryKey: getListRegisterRecordsQueryKey(definition.slug, params) } });
  const invalidate = () => { queryClient.invalidateQueries({ queryKey: getListRegisterRecordsQueryKey(definition.slug, params) }); queryClient.invalidateQueries({ queryKey: getListRegistersQueryKey() }); };
  const create = useCreateRegisterRecord();
  const update = useUpdateRegisterRecord();
  const records = recordsQuery.data?.records ?? [];
  const exportCsv = () => {
    const cols = ['recordDate', ...definition.fields.map((f) => f.key)];
    const rows = records.map((r) => cols.map((c) => JSON.stringify(c === 'recordDate' ? r.recordDate ?? '' : String(r.data[c] ?? ''))).join(','));
    const blob = new Blob([[cols.join(','), ...rows].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${definition.slug}.csv`; a.click(); URL.revokeObjectURL(url); setNotice('CSV export ready');
  };
  const onSubmit = (data: { recordDate?: string | null; data: Record<string, unknown> }, editing?: RegisterRecord) => {
    if (editing) update.mutate({ slug: definition.slug, id: editing.id, data }, { onSuccess: () => { invalidate(); setDialog(null); setNotice('Record updated'); } });
    else create.mutate({ slug: definition.slug, data }, { onSuccess: () => { invalidate(); setDialog(null); setNotice('Record added to the register'); } });
  };
  useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(''), 3200); return () => window.clearTimeout(timer); }, [notice]);
  return <div className="min-h-[calc(100dvh-68px)] px-5 py-8 md:px-8 lg:px-10"><Link href={`/registers/${definition.module}`} className="mb-5 inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground" data-testid="link-back-to-module"><ArrowLeft size={14} /> {definition.module === 'security' ? 'Security operations' : 'Main gate security'}</Link><PageIntro eyebrow={definition.module === 'security' ? 'Security operations' : 'Main gate security'} title={definition.title} description={definition.description} action={<button onClick={() => setDialog('create')} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90" data-testid="button-add-record"><FilePlus2 size={16} /> Add record</button>} />
    {notice && <div className="mb-5 flex items-center gap-2 rounded-lg border border-[hsl(var(--chart-3))]/30 bg-[hsl(var(--chart-3))]/10 px-4 py-3 text-sm text-[hsl(var(--chart-3))]" data-testid="status-success"><Check size={16} />{notice}</div>}
    <div className="mb-5 flex flex-col gap-3 rounded-xl border border-border bg-card p-3 shadow-sm lg:flex-row"><div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg bg-muted/60 px-3"><Search size={16} className="shrink-0 text-muted-foreground" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search records…" className="w-full bg-transparent py-2 text-sm outline-none" data-testid="input-search-records" /></div><div className="flex items-center gap-2"><div className="flex items-center gap-2 rounded-lg border border-border px-3"><CalendarDays size={14} className="text-muted-foreground" /><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="bg-transparent py-2 text-xs outline-none" data-testid="input-from-date" /><span className="text-muted-foreground">→</span><input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="bg-transparent py-2 text-xs outline-none" data-testid="input-to-date" /></div><button onClick={() => { setSearch(''); setFrom(''); setTo(''); }} className="rounded-lg border border-border p-2.5 text-muted-foreground hover:bg-muted" data-testid="button-clear-filters"><Filter size={15} /></button><button onClick={exportCsv} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2.5 text-xs font-semibold hover:bg-muted" data-testid="button-export-csv"><Download size={15} /> <span className="hidden sm:inline">Export</span></button><button onClick={() => window.print()} className="rounded-lg border border-border p-2.5 text-muted-foreground hover:bg-muted" data-testid="button-print-register"><Printer size={15} /></button></div></div>
     <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">{recordsQuery.isLoading ? <div className="space-y-3 p-5">{[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-12 animate-pulse rounded bg-muted" />)}</div> : recordsQuery.isError ? <div className="p-8 text-center text-sm text-destructive">Records could not be loaded. <button onClick={() => recordsQuery.refetch()} className="font-semibold underline" data-testid="button-retry-records">Retry</button></div> : records.length === 0 ? <div className="p-5"><EmptyState title="This register is clear" description="Start the shift by adding the first record." /></div> : <div className="overflow-x-auto"><table className="w-full min-w-[1100px] text-left"><thead className="border-b border-border bg-muted/45"><tr><th className="px-5 py-3 font-mono text-[10px] uppercase tracking-[.12em] text-muted-foreground">Date</th>{definition.fields.map((field) => <th key={field.key} className="px-4 py-3 font-mono text-[10px] uppercase tracking-[.12em] text-muted-foreground">{field.label}</th>)}<th className="px-5 py-3 text-right font-mono text-[10px] uppercase tracking-[.12em] text-muted-foreground">Actions</th></tr></thead><tbody className="divide-y divide-border">{records.map((record) => { const editable = canEditRecord(record.createdAt); return <tr key={record.id} className="group hover:bg-secondary/35" data-testid={`row-record-${record.id}`}><td className="whitespace-nowrap px-5 py-4 font-mono text-xs text-muted-foreground">{niceDate(record.recordDate)}</td>{definition.fields.map((field) => <td key={field.key} className="max-w-[190px] truncate px-4 py-4 text-sm">{formatValue(record.data[field.key], field)}</td>)}<td className="px-5 py-4"><div className="flex justify-end gap-1">{editable ? <button onClick={() => setDialog(record)} className="rounded-md p-2 text-muted-foreground hover:bg-secondary hover:text-foreground" data-testid={`button-edit-record-${record.id}`} title="Edit within three days of entry"><Edit3 size={14} /></button> : <span className="inline-flex items-center gap-1 px-2 py-2 text-[10px] font-medium text-muted-foreground" title="Editing is locked after three days"><LockKeyhole size={13} /> Locked</span>}</div></td></tr>; })}</tbody></table></div>}<div className="border-t border-border px-5 py-3 text-xs text-muted-foreground">Showing <span className="font-mono text-foreground">{records.length}</span> of <span className="font-mono text-foreground">{recordsQuery.data?.total ?? definition.recordCount}</span> records</div></div>
    {dialog && <RecordDialog definition={definition} initial={dialog === 'create' ? undefined : dialog} pending={create.isPending || update.isPending} onClose={() => setDialog(null)} onSubmit={onSubmit} />}
  </div>;
}

function formatValue(value: unknown, field: FieldDefinition) { if (value === undefined || value === null || value === '') return <span className="text-muted-foreground/60">—</span>; if (field.type === 'checkbox') return value ? <Check size={15} className="text-[hsl(var(--chart-3))]" /> : <X size={15} className="text-muted-foreground" />; return String(value); }

function RecordDialog({ definition, initial, pending, onClose, onSubmit }: { definition: RegisterDefinition; initial?: RegisterRecord; pending: boolean; onClose: () => void; onSubmit: (data: { recordDate?: string | null; data: Record<string, unknown> }, editing?: RegisterRecord) => void }) {
  const [date, setDate] = useState(initial?.recordDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
  const [values, setValues] = useState<Record<string, unknown>>(initial?.data ?? {});
  const [error, setError] = useState('');
  const setValue = (key: string, value: unknown) => setValues((prev) => ({ ...prev, [key]: value }));
  const derivedValues = useMemo(() => {
    if (definition.slug !== 'mango-tree-meter' && definition.slug !== 'clinic-gate-meter') return {};
    const officeInitial = Number(values.office_initial);
    const officeFinal = Number(values.office_final);
    const minutes = Number.isFinite(officeInitial) && Number.isFinite(officeFinal) ? (officeFinal - officeInitial) / 1.6 : undefined;
    const onParts = String(values.on_time ?? '').split(':').map(Number);
    const onMinutes = onParts.length === 2 && onParts.every(Number.isFinite) ? onParts[0] * 60 + onParts[1] : undefined;
    const kothiInitial = Number(values.kothi_initial);
    const kothiFinal = Number(values.kothi_final);
    const water = Number.isFinite(kothiInitial) && Number.isFinite(kothiFinal) ? kothiFinal - kothiInitial : undefined;
    const offMinutes = minutes !== undefined && onMinutes !== undefined
      ? Math.round(onMinutes + minutes)
      : undefined;
    return {
      ...(minutes !== undefined ? { minutes_consumed: Number(minutes.toFixed(2)) } : {}),
      ...(offMinutes !== undefined ? { off_time: `${String(Math.floor((((offMinutes % 1440) + 1440) % 1440) / 60)).padStart(2, '0')}:${String(((offMinutes % 60) + 60) % 60).padStart(2, '0')}` } : {}),
      ...(water !== undefined ? { total_water_consumed: water } : {}),
      ...(water !== undefined && minutes ? { per_minute_water_consumed: Number((water / minutes).toFixed(2)) } : {}),
    };
  }, [definition.slug, values]);
  useEffect(() => { setValues(initial?.data ?? {}); setDate(initial?.recordDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10)); setError(''); }, [initial?.id]);
  const displayValues: Record<string, unknown> = { ...values, ...derivedValues };
  const submit = () => {
    const missing = definition.fields.filter((field) => field.required && !field.derived && (displayValues[field.key] === undefined || displayValues[field.key] === '')).map((field) => field.label);
    if (!date) missing.unshift('Date');
    if (missing.length) { setError(`Enter the required fields: ${missing.join(', ')}`); return; }
    onSubmit({ recordDate: date, data: { ...displayValues, date } }, initial);
  };
  return <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/35 p-4" role="dialog" aria-modal="true"><div className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-card shadow-2xl"><div className="sticky top-0 flex items-start justify-between border-b border-border bg-card px-6 py-5"><div><div className="font-mono text-[10px] uppercase tracking-[.16em] text-primary">{initial ? 'Edit record' : 'New record'}</div><h2 className="mt-1 font-serif text-2xl font-bold">{definition.title}</h2></div><button onClick={onClose} className="rounded-md p-2 text-muted-foreground hover:bg-muted" data-testid="button-close-record-dialog"><X size={18} /></button></div><div className="grid gap-4 p-6 sm:grid-cols-2"><label className="sm:col-span-2"><span className="mb-1.5 block text-xs font-semibold">Record date<span className="ml-1 text-destructive">*</span></span><input required type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary" data-testid="input-record-date" /></label>{definition.fields.map((field) => <FieldInput key={field.key} field={field} value={displayValues[field.key]} onChange={(v) => setValue(field.key, v)} />)}</div>{error && <div className="mx-6 mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive" role="alert">{error}</div>}<div className="flex justify-end gap-3 border-t border-border px-6 py-4"><button onClick={onClose} className="rounded-lg border border-border px-4 py-2.5 text-sm font-semibold hover:bg-muted" data-testid="button-cancel-record">Cancel</button><button disabled={pending} onClick={submit} className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50" data-testid="button-save-record">{pending ? 'Saving…' : initial ? 'Save changes' : 'Add record'}</button></div></div></div>;
}

function FieldInput({ field, value, onChange }: { field: FieldDefinition; value: unknown; onChange: (value: unknown) => void }) {
  const common = { value: String(value ?? ''), onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => onChange(e.target.value), className: 'w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary' };
  return <label className={field.type === 'textarea' ? 'sm:col-span-2' : ''}><span className="mb-1.5 block text-xs font-semibold">{field.label}{field.required && <span className="ml-1 text-destructive">*</span>}{field.derived && <span className="ml-2 text-[10px] font-normal text-muted-foreground">(calculated)</span>}</span>{field.type === 'textarea' ? <textarea {...common} readOnly={field.derived} rows={3} data-testid={`input-field-${field.key}`} /> : field.type === 'select' ? <select {...common} disabled={field.derived} data-testid={`input-field-${field.key}`}><option value="">Select…</option>{(field.options ?? []).map((option) => <option key={option} value={option}>{option}</option>)}</select> : field.type === 'checkbox' ? <input type="checkbox" checked={Boolean(value)} disabled={field.derived} onChange={(e) => onChange(e.target.checked)} className="size-4 accent-[hsl(var(--primary))]" data-testid={`input-field-${field.key}`} /> : <input {...common} readOnly={field.derived} type={field.type} data-testid={`input-field-${field.key}`} />}</label>;
}