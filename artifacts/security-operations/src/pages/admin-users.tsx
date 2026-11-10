import { FormEvent, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, Download, FileSpreadsheet, KeyRound, Mail, Pencil, Search, Send, ShieldAlert, Trash2, Upload, UserPlus, UsersRound, X } from 'lucide-react';
import { Link } from 'wouter';
import { PageIntro } from '@/components/ops-ui';
import { useAuth, type AuthUser, type UserRole } from '@/lib/auth';
import { BreakdownReportView } from '@/components/breakdown-report-view';

const roles: Array<{ value: UserRole; label: string }> = [
  { value: 'admin', label: 'Admin' },
  { value: 'manager', label: 'Manager' },
  { value: 'hr', label: 'HR' },
  { value: 'security', label: 'Security' },
];

type UserForm = {
  displayName: string;
  email: string;
  password: string;
  role: UserRole;
};

type RegisterEmailConfig = {
  email: string;
  enabled: boolean;
  notifyOnNoEntries: boolean;
  notifyOnlyOnException: boolean;
};

type RegisterEmailItem = {
  slug: string;
  title: string;
  module: string;
  config?: RegisterEmailConfig;
};

const defaultRegisterConfig = (): RegisterEmailConfig => ({
  email: '',
  enabled: false,
  notifyOnNoEntries: true,
  notifyOnlyOnException: false,
});

const DEFAULT_REGISTERS: RegisterEmailItem[] = [
  { slug: "key-movement", title: "Key Movement Register", module: "security" },
  { slug: "mango-tree-meter", title: "Mango Tree Meter Reading (Tubewell 1)", module: "security" },
  { slug: "clinic-gate-meter", title: "Clinic Gate Meter Reading (Tube Well 2)", module: "security" },
  { slug: "chowk-labour", title: "Chowk Labour", module: "security" },
  { slug: "daily-attendance", title: "Training Register", module: "security" },
  { slug: "solar-panel-cleaning", title: "Solar Panel Cleaning Record", module: "security" },
  { slug: "driver-schedule", title: "Driver Daily Schedule", module: "security" },
  { slug: "service-bill", title: "Service Bill Entry", module: "security" },
  { slug: "jack-register", title: "Jack Register OEW", module: "security" },
  { slug: "fork-lifter", title: "Fork Lifter", module: "security" },
  { slug: "car-breakdowns", title: "Car Breakdowns", module: "security" },
  { slug: "personal-gate-pass", title: "Personal Gate Pass Register", module: "main-gate" },
  { slug: "official-gate-pass", title: "Official Gate Pass Register", module: "main-gate" },
  { slug: "outgoing-vehicles", title: "Outgoing Vehicles Register", module: "main-gate" },
  { slug: "visitor-record", title: "Visitor Record Register", module: "main-gate" },
  { slug: "kothi-attendance", title: "Kothi Attendance Register", module: "main-gate" },
  { slug: "contractor-gate-pass", title: "Contractor Personal Gate Pass", module: "main-gate" },
  { slug: "guest-food", title: "Guest Food Register", module: "main-gate" },
  { slug: "jain-food-service", title: "Jain Food Service Register", module: "main-gate" },
  { slug: "unit-2-gate-pass", title: "Unit 2 Gate Pass Register", module: "main-gate" },
  { slug: "driver-attendance", title: "Driver Attendance Record", module: "main-gate" },
];

const emptyForm = (): UserForm => ({ displayName: '', email: '', password: '', role: 'manager' });

export default function AdminUsersPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState(false);
  const [form, setForm] = useState<UserForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<UserForm>(emptyForm);
  const [backupEmail, setBackupEmail] = useState('');
  const [backupEnabled, setBackupEnabled] = useState(false);
  const [backupLastSentAt, setBackupLastSentAt] = useState<string | null>(null);
  const [backupPending, setBackupPending] = useState(false);
  const [signatories, setSignatories] = useState({ preparedBy: '', checkedBy: '', verifiedBy: '' });
  const [signatoryPending, setSignatoryPending] = useState(false);
  const [importPending, setImportPending] = useState(false);
  const [truncatePending, setTruncatePending] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  const [registersList, setRegistersList] = useState<RegisterEmailItem[]>(DEFAULT_REGISTERS);
  const [registerConfigsMap, setRegisterConfigsMap] = useState<Record<string, RegisterEmailConfig>>({});
  const [registerEmailsPending, setRegisterEmailsPending] = useState(false);
  const [sendingReportSlug, setSendingReportSlug] = useState<string | null>(null);
  const [registerSearch, setRegisterSearch] = useState('');
  const [selectedModuleFilter, setSelectedModuleFilter] = useState<'all' | 'security' | 'main-gate'>('all');
  const [adminTab, setAdminTab] = useState<'settings' | 'breakdowns'>(() => {
    const searchParams = new URLSearchParams(window.location.search);
    return searchParams.get('tab') === 'breakdowns' ? 'breakdowns' : 'settings';
  });
  const [openBreakdownsCount, setOpenBreakdownsCount] = useState(0);

  const loadUsers = async () => {
    const response = await fetch('/api/auth/users', { credentials: 'include' });
    if (!response.ok) {
      setError('Only admins can manage users.');
      return;
    }
    const payload = await response.json();
    setUsers(payload.users ?? []);
  };

  useEffect(() => {
    if (user?.role === 'admin') {
      void loadUsers();
      fetch('/api/admin/data/backup', { credentials: 'include' })
        .then(async (response) => {
          if (!response.ok) return;
          const payload = await response.json();
          setBackupEmail(payload.recipientEmail ?? '');
          setBackupEnabled(payload.enabled === true);
          setBackupLastSentAt(payload.lastSentAt ?? null);
        })
        .catch(() => setError('Backup settings could not be loaded.'));

      fetch('/api/admin/bill-signatories', { credentials: 'include' })
        .then(async (response) => {
          if (!response.ok) return;
          setSignatories(await response.json());
        })
        .catch(() => setError('Bill signatories could not be loaded.'));

      fetch('/api/admin/data/register-emails', { credentials: 'include' })
        .then(async (response) => {
          if (!response.ok) return;
          const payload = await response.json();
          if (payload.registers && payload.registers.length > 0) {
            setRegistersList(payload.registers.filter((r: RegisterEmailItem) => r.module !== 'master'));
          }
          if (payload.registerConfigs) {
            setRegisterConfigsMap(payload.registerConfigs);
          }
        })
        .catch(() => setError('Register email settings could not be loaded.'));
    }
  }, [user?.role]);

  const resetMessages = () => {
    setError('');
    setNotice('');
  };

  const updateUser = async (event: FormEvent, id: string) => {
    event.preventDefault();
    resetMessages();
    setPending(true);
    const response = await fetch(`/api/auth/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(editForm.password ? editForm : { ...editForm, password: undefined }),
    });
    const payload = await response.json().catch(() => ({}));
    setPending(false);
    if (!response.ok) {
      setError(payload.error ?? 'Could not update this user.');
      return;
    }
    setUsers((current) => current.map((item) => item.id === id ? payload.user : item));
    setEditingId(null);
    setNotice('User updated.');
  };

  const deleteUser = async (item: AuthUser) => {
    if (item.id === user?.id || !window.confirm(`Delete ${item.displayName}? This cannot be undone.`)) return;
    resetMessages();
    const response = await fetch(`/api/auth/users/${item.id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(payload.error ?? 'Could not delete this user.');
      return;
    }
    setUsers((current) => current.filter((currentUser) => currentUser.id !== item.id));
    setNotice('User deleted.');
  };

  const createUser = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    resetMessages();
    const response = await fetch('/api/auth/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(form),
    });
    const payload = await response.json().catch(() => ({}));
    setPending(false);
    if (!response.ok) {
      setError(payload.error ?? 'Could not create this user.');
      return;
    }
    setUsers((current) => [...current, payload.user]);
    setForm(emptyForm());
    setNotice('User created.');
  };

  const startEditing = (item: AuthUser) => {
    resetMessages();
    setEditingId(item.id);
    setEditForm({ displayName: item.displayName, email: item.email, password: '', role: item.role });
  };

  const saveBackupSettings = async (event: FormEvent) => {
    event.preventDefault();
    resetMessages();
    setBackupPending(true);
    const response = await fetch('/api/admin/data/backup', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ recipientEmail: backupEmail, enabled: backupEnabled }),
    });
    const payload = await response.json().catch(() => ({}));
    setBackupPending(false);
    if (!response.ok) {
      setError(payload.error ?? 'Backup settings could not be saved.');
      return;
    }
    setBackupEmail(payload.recipientEmail ?? '');
    setBackupEnabled(payload.enabled === true);
    setBackupLastSentAt(payload.lastSentAt ?? null);
    setNotice('Daily backup settings saved.');
  };

  const sendBackupNow = async () => {
    resetMessages();
    setBackupPending(true);
    const response = await fetch('/api/admin/data/backup/send-now', {
      method: 'POST',
      credentials: 'include',
    });
    const payload = await response.json().catch(() => ({}));
    setBackupPending(false);
    if (!response.ok) {
      setError(payload.error ?? 'Backup email could not be sent.');
      return;
    }
    setBackupLastSentAt(payload.lastSentAt ?? null);
    setNotice('Daily backup email sent successfully.');
  };

  const updateRegisterConfig = (slug: string, updates: Partial<RegisterEmailConfig>) => {
    setRegisterConfigsMap((prev) => {
      const current = prev[slug] ?? defaultRegisterConfig();
      return {
        ...prev,
        [slug]: {
          ...current,
          ...updates,
        },
      };
    });
  };

  const saveRegisterEmails = async (event: FormEvent) => {
    event.preventDefault();
    resetMessages();
    setRegisterEmailsPending(true);
    try {
      const response = await fetch('/api/admin/data/register-emails', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ registerConfigs: registerConfigsMap }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? 'Could not save register emails.');
      setRegisterConfigsMap(payload.registerConfigs ?? {});
      setNotice('Register report & alert email settings saved successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save register emails.');
    } finally {
      setRegisterEmailsPending(false);
    }
  };

  const sendRegisterReportNow = async (slug: string, title: string) => {
    resetMessages();
    const cfg = registerConfigsMap[slug] ?? defaultRegisterConfig();
    const email = (cfg.email || backupEmail || '').trim();
    if (!email) {
      setError(`Please enter an email address for ${title} before sending a report.`);
      return;
    }
    setSendingReportSlug(slug);
    try {
      const response = await fetch(`/api/admin/data/registers/${slug}/send-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ recipientEmail: email }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? 'Could not send report email.');
      if (slug === 'key-movement' && typeof payload.unreturnedCount === 'number') {
        if (payload.unreturnedCount > 0) {
          setNotice(`Key Movement alert sent to ${email}! ⚠️ ${payload.unreturnedCount} unreturned key(s) flagged.`);
        } else {
          setNotice(`Key Movement report sent to ${email}. All keys returned today.`);
        }
      } else {
        setNotice(`Report for ${title} sent to ${email} (${payload.totalRecords ?? 0} records).`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send report email.');
    } finally {
      setSendingReportSlug(null);
    }
  };

  const saveSignatories = async (event: FormEvent) => {
    event.preventDefault();
    resetMessages();
    setSignatoryPending(true);
    const response = await fetch('/api/admin/bill-signatories', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(signatories),
    });
    const payload = await response.json().catch(() => ({}));
    setSignatoryPending(false);
    if (!response.ok) {
      setError(payload.error ?? 'Signatories could not be saved.');
      return;
    }
    setSignatories(payload);
    setNotice('Bill signatories updated.');
  };

  const truncateAllData = async () => {
    const confirmation = window.prompt('Type TRUNCATE ALL DATA to delete every register row, payment, and bill.');
    if (!confirmation) return;
    resetMessages();
    setTruncatePending(true);
    const response = await fetch('/api/admin/data/truncate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ confirmation }),
    });
    const payload = await response.json().catch(() => ({}));
    setTruncatePending(false);
    if (!response.ok) {
      setError(payload.error ?? 'All data could not be cleared.');
      return;
    }
    setNotice(`Operational data cleared: ${payload.cleared?.records ?? 0} register rows, ${payload.cleared?.bills ?? 0} bills, and ${payload.cleared?.transactions ?? 0} payments removed.`);
  };

  const downloadWorkbook = async () => {
    resetMessages();
    const response = await fetch('/api/admin/data/export', { credentials: 'include' });
    if (!response.ok) {
      setError('Could not export the workbook.');
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `security-operations-backup-${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setNotice('Workbook downloaded.');
  };

  const importAllRegisters = async (event: FormEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    resetMessages();
    setImportPending(true);
    const body = await file.arrayBuffer();
    const response = await fetch('/api/admin/data/import', {
      method: 'POST',
      headers: { 'Content-Type': file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
      credentials: 'include',
      body,
    });
    const payload = await response.json().catch(() => ({}));
    setImportPending(false);
    if (importInputRef.current) importInputRef.current.value = '';
    if (!response.ok) {
      setError(payload.error ?? 'Could not import the workbook.');
      return;
    }
    setNotice(`Imported ${payload.imported ?? 0} rows across ${payload.registers ?? 0} registers, ${payload.payments ?? 0} payment rows, and ${payload.bills ?? 0} bills.`);
  };

  const filteredRegisters = registersList.filter((reg) => {
    if (reg.module === 'master') return false;
    const matchesModule = selectedModuleFilter === 'all' || reg.module === selectedModuleFilter;
    const matchesSearch = !registerSearch.trim() || reg.title.toLowerCase().includes(registerSearch.toLowerCase()) || reg.slug.toLowerCase().includes(registerSearch.toLowerCase());
    return matchesModule && matchesSearch;
  });

  return (
    <div className="min-h-full bg-background px-4 py-8 md:px-8">
      <div className="mx-auto max-w-6xl space-y-8">
        <PageIntro
          eyebrow="Administrative settings"
          title={adminTab === 'breakdowns' ? 'Breakdown Reports & Incident Desk' : 'User Management & System Settings'}
          description={
            adminTab === 'breakdowns'
              ? 'Review, filter, track and enter tubewell breakdown incidents. Log breakdowns and dispatch alert emails.'
              : 'Control accounts, register report email dispatches, daily backup schedules, bill signatories, and import/export tools.'
          }
        />

        {/* Admin Navigation Options */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setAdminTab('settings')}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                adminTab === 'settings'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'border border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
              data-testid="tab-admin-settings"
            >
              <UsersRound size={16} /> User & System Settings
            </button>
            <button
              type="button"
              onClick={() => setAdminTab('breakdowns')}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                adminTab === 'breakdowns'
                  ? 'bg-red-600 text-white shadow-sm'
                  : 'border border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20'
              }`}
              data-testid="tab-admin-breakdown-report"
            >
              <AlertTriangle size={16} /> Breakdown Report
              {openBreakdownsCount > 0 && (
                <span className={`grid size-5 place-items-center rounded-full text-[10px] font-bold ${adminTab === 'breakdowns' ? 'bg-white text-red-600' : 'bg-red-600 text-white'}`}>
                  {openBreakdownsCount}
                </span>
              )}
            </button>
          </div>

          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            ← Back to Workspaces
          </Link>
        </div>

        {adminTab === 'breakdowns' ? (
          <BreakdownReportView onBreakdownCountChange={(count) => setOpenBreakdownsCount(count)} />
        ) : (
          <>
            {error && <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm font-medium text-destructive">{error}</div>}
            {notice && <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm font-medium text-emerald-600 dark:text-emerald-400">{notice}</div>}

            <div className="grid gap-8 lg:grid-cols-3">
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm lg:col-span-2">
            <div className="flex items-center gap-3 border-b border-border pb-4">
              <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary"><UsersRound size={18} /></span>
              <div>
                <h2 className="font-serif text-lg font-bold">Workspace users</h2>
                <p className="text-xs text-muted-foreground">Admin, Manager, HR, and Security team access</p>
              </div>
            </div>
            <div className="mt-4 divide-y divide-border">
              {users.map((item) => (
                <div key={item.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">{item.displayName}</span>
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold capitalize text-primary">{item.role}</span>
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">{item.email}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => startEditing(item)} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted"><Pencil size={13} /> Edit</button>
                    {item.id !== user?.id && <button type="button" onClick={() => void deleteUser(item)} className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/30 px-3 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/10"><Trash2 size={13} /> Delete</button>}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center gap-3 border-b border-border pb-4">
              <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary"><UserPlus size={18} /></span>
              <div>
                <h2 className="font-serif text-lg font-bold">{editingId ? 'Edit account' : 'New account'}</h2>
                <p className="text-xs text-muted-foreground">{editingId ? 'Update credentials or permissions' : 'Invite a team member to access registers'}</p>
              </div>
            </div>
            {editingId ? (
              <form onSubmit={(event) => void updateUser(event, editingId)} className="mt-4 space-y-4">
                <label className="block"><span className="mb-1.5 block text-xs font-semibold">Name</span><input required type="text" value={editForm.displayName} onChange={(event) => setEditForm({ ...editForm, displayName: event.target.value })} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary" /></label>
                <label className="block"><span className="mb-1.5 block text-xs font-semibold">Login ID (Email)</span><input required type="email" value={editForm.email} onChange={(event) => setEditForm({ ...editForm, email: event.target.value })} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary" /></label>
                <label className="block"><span className="mb-1.5 block text-xs font-semibold">New password (leave blank to keep current)</span><input minLength={8} type="password" value={editForm.password} onChange={(event) => setEditForm({ ...editForm, password: event.target.value })} placeholder="••••••••" className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary" /></label>
                <label className="block"><span className="mb-1.5 block text-xs font-semibold">Role</span><select value={editForm.role} onChange={(event) => setEditForm({ ...editForm, role: event.target.value as UserRole })} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary">{roles.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}</select></label>
                <div className="flex gap-2">
                  <button disabled={pending} type="submit" className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50">{pending ? 'Saving…' : 'Save user'}</button>
                  <button type="button" onClick={() => setEditingId(null)} className="rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:bg-muted"><X size={15} /></button>
                </div>
              </form>
            ) : (
              <form onSubmit={(event) => void createUser(event)} className="mt-4 space-y-4">
                <label className="block"><span className="mb-1.5 block text-xs font-semibold">Name</span><input required type="text" value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} placeholder="Full name" className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary" /></label>
                <label className="block"><span className="mb-1.5 block text-xs font-semibold">Login ID (Email)</span><input required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="user@company.com" className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary" /></label>
                <label className="block"><span className="mb-1.5 block text-xs font-semibold">Temporary password</span><input required minLength={8} type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary" /></label>
                <label className="block"><span className="mb-1.5 block text-xs font-semibold">Role</span><select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as UserRole })} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary">{roles.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}</select></label>
                <button disabled={pending} type="submit" className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50">{pending ? 'Creating…' : 'Create user'}</button>
              </form>
            )}
          </section>
        </div>

        {/* Tubewell Breakdown Alert Email & Desk Link Banner */}
        <div className="flex flex-col gap-3 rounded-xl border border-red-500/25 bg-red-500/5 p-4 sm:flex-row sm:items-center sm:justify-between text-xs">
          <div className="flex items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-red-500/15 text-red-600 dark:text-red-400">
              <AlertTriangle size={18} />
            </span>
            <div>
              <div className="font-semibold text-foreground text-sm">Tubewell Breakdown Incidents & Alert Email</div>
              <div className="text-muted-foreground">
                Set dedicated alert email destinations and manage breakdown incidents for Mango Tree (Tubewell 1) & Clinic Gate (Tubewell 2).
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setAdminTab('breakdowns')}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-red-600 px-3.5 py-2 font-semibold text-white hover:bg-red-700 transition"
          >
            Configure Breakdown Alert Email →
          </button>
        </div>

        {/* REGISTER REPORT & ALERT EMAIL DESTINATIONS */}
        <section className="rounded-xl border border-border bg-card shadow-sm">
          <div className="flex flex-col gap-2 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-lg bg-amber-500/10 text-amber-500"><KeyRound size={18} /></span>
              <div>
                <h2 className="font-serif text-lg font-bold">Register Report & Alert Email Destinations</h2>
                <p className="text-xs text-muted-foreground">Configure recipient emails, automated daily 6:00 PM dispatches, zero-entry notices, and unreturned key exception alerts per register.</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={registerSearch}
                  onChange={(e) => setRegisterSearch(e.target.value)}
                  placeholder="Filter registers…"
                  className="rounded-lg border border-input bg-background pl-8 pr-3 py-1.5 text-xs outline-none focus:border-primary w-44"
                />
              </div>
            </div>
          </div>

          <div className="p-5 space-y-4">
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-3">
              <KeyRound size={18} className="text-amber-500 shrink-0 mt-0.5" />
              <div>
                <strong className="font-semibold text-sm">Key Movement Register & Automated Report Engine:</strong>
                <p className="mt-1 leading-relaxed">
                  • <strong>Whom is the email sent to?</strong> The alert or daily report is delivered directly to the <strong>Recipient Email</strong> entered below in each register's email box (e.g., Security Incharge, Admin, or Store Manager). If left blank, it automatically falls back to the Master Backup Email ({backupEmail || 'none configured'}).<br />
                  • <strong>Key Return Tracking:</strong> If any key is assigned today and has <strong>not been returned on that same day</strong>, an urgent red alert table containing the borrower name, checkout time, and location is immediately dispatched to that recipient.<br />
                  • <strong>Zero Entries Rule:</strong> Choose per-register whether an email should still be sent if no entries were logged today, or skipped.<br />
                  • <strong>Exception Only:</strong> Choose whether to send emails daily, or <em>only</em> when unreturned keys or pending items exist.<br />
                  • <strong>Automated Delivery:</strong> Runs automatically every day at 18:00 (Asia/Kolkata) alongside the master system backup.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 text-xs border-b border-border pb-3">
              <span className="text-muted-foreground mr-1">Filter Module:</span>
              {(['all', 'security', 'main-gate'] as const).map((mod) => (
                <button
                  key={mod}
                  type="button"
                  onClick={() => setSelectedModuleFilter(mod)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors ${
                    selectedModuleFilter === mod
                      ? 'bg-primary text-primary-foreground font-semibold'
                      : 'bg-muted hover:bg-muted/80 text-foreground'
                  }`}
                >
                  {mod === 'all' ? 'All Registers' : mod === 'security' ? 'Security' : 'Main Gate'}
                </button>
              ))}
            </div>

            <form onSubmit={(e) => void saveRegisterEmails(e)} className="space-y-4">
              <div className="grid gap-3.5 max-h-[560px] overflow-y-auto pr-1">
                {filteredRegisters.map((reg) => {
                  const isKeyMovement = reg.slug === 'key-movement';
                  const cfg = registerConfigsMap[reg.slug] ?? defaultRegisterConfig();

                  return (
                    <div
                      key={reg.slug}
                      className={`flex flex-col gap-3 rounded-xl border p-4 transition-all ${
                        isKeyMovement
                          ? 'border-amber-500/50 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent shadow-sm'
                          : 'border-border bg-card/60 hover:bg-muted/20'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-foreground">{reg.title}</span>
                          {isKeyMovement && (
                            <span className="inline-flex items-center gap-1 rounded bg-amber-500/20 px-2 py-0.5 text-[11px] font-bold text-amber-700 dark:text-amber-300 border border-amber-500/40">
                              <ShieldAlert size={12} />
                              Unreturned Keys Alert Engine
                            </span>
                          )}
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground uppercase font-mono">
                            {reg.module}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          {cfg.enabled ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                              <CheckCircle2 size={12} /> Auto 6:00 PM Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                              <Clock3 size={12} /> Manual / Inactive
                            </span>
                          )}
                        </div>
                      </div>

                      <div>
                        <span className="mb-1 block text-[11px] font-semibold text-foreground/80">
                          {isKeyMovement ? '⚠️ Alert & Report Recipient Email Address:' : 'Report Recipient Email Address:'}
                        </span>
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                          <div className="relative flex-1">
                            <Mail size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                            <input
                              type="email"
                              value={cfg.email}
                              onChange={(e) => updateRegisterConfig(reg.slug, { email: e.target.value })}
                              placeholder={backupEmail ? `Recipient email (or default: ${backupEmail})` : 'Enter email address for this register (e.g. supervisor@company.com)'}
                              className="w-full rounded-lg border border-input bg-background pl-8 pr-3 py-2 text-xs outline-none focus:border-primary"
                            />
                          </div>
                          <button
                            type="button"
                            disabled={sendingReportSlug === reg.slug || !(cfg.email || backupEmail)}
                            onClick={() => void sendRegisterReportNow(reg.slug, reg.title)}
                            title={`Send today's report for ${reg.title} now`}
                            className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold hover:bg-muted disabled:opacity-50"
                          >
                            <Send size={13} />
                            {sendingReportSlug === reg.slug ? 'Sending…' : 'Send now'}
                          </button>
                        </div>
                      </div>

                      {/* Admin Condition Controls */}
                      <div className="grid gap-2.5 pt-2 border-t border-border/70 sm:grid-cols-3 text-xs bg-muted/20 -mx-4 -mb-4 p-3 rounded-b-xl">
                        <label className="flex items-start gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={cfg.enabled}
                            onChange={(e) => updateRegisterConfig(reg.slug, { enabled: e.target.checked })}
                            className="mt-0.5 size-4 rounded border-input accent-[hsl(var(--primary))]"
                          />
                          <div>
                            <span className="font-semibold block text-foreground">Auto-send Daily</span>
                            <span className="text-[11px] text-muted-foreground block">
                              {cfg.enabled ? 'Runs daily at 6:00 PM IST' : 'Disabled (manual dispatch only)'}
                            </span>
                          </div>
                        </label>

                        <label className="flex items-start gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={cfg.notifyOnNoEntries}
                            onChange={(e) => updateRegisterConfig(reg.slug, { notifyOnNoEntries: e.target.checked })}
                            className="mt-0.5 size-4 rounded border-input accent-[hsl(var(--primary))]"
                          />
                          <div>
                            <span className="font-semibold block text-foreground">Send if 0 entries</span>
                            <span className="text-[11px] text-muted-foreground block">
                              {cfg.notifyOnNoEntries ? 'Notice sent when 0 logs' : 'Skip email when 0 logs'}
                            </span>
                          </div>
                        </label>

                        <label className="flex items-start gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={cfg.notifyOnlyOnException}
                            onChange={(e) => updateRegisterConfig(reg.slug, { notifyOnlyOnException: e.target.checked })}
                            className="mt-0.5 size-4 rounded border-input accent-[hsl(var(--primary))]"
                          />
                          <div>
                            <span className="font-semibold block text-foreground">
                              {isKeyMovement ? 'Alert only on unreturned' : 'Only send on exception'}
                            </span>
                            <span className="text-[11px] text-muted-foreground block">
                              {isKeyMovement
                                ? (cfg.notifyOnlyOnException ? 'Only alert if keys missing return' : 'Always send full report')
                                : (cfg.notifyOnlyOnException ? 'Only if pending issues flagged' : 'Always send full report')}
                            </span>
                          </div>
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-border">
                <button
                  disabled={registerEmailsPending}
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  <Clock3 size={15} />
                  {registerEmailsPending ? 'Saving settings…' : 'Save all register email settings'}
                </button>
                <span className="text-xs text-muted-foreground">
                  Saved settings govern both automated 6:00 PM dispatches and on-demand report sends.
                </span>
              </div>
            </form>
          </div>
        </section>

        {/* REGISTER DATA TOOLS */}
        <section className="rounded-xl border border-border bg-card shadow-sm">
          <div className="flex items-center gap-3 border-b border-border px-5 py-4">
            <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary"><FileSpreadsheet size={17} /></span>
            <div><h2 className="font-serif text-lg font-bold">Register data tools</h2><p className="text-xs text-muted-foreground">Import every register and keep payment history in the same daily workbook backup.</p></div>
          </div>
          <div className="grid gap-6 p-5 lg:grid-cols-2">
            <div className="rounded-xl border border-border bg-muted/20 p-4">
              <div className="flex items-start gap-3"><span className="grid size-8 place-items-center rounded-lg bg-background text-primary"><Upload size={16} /></span><div><h3 className="text-sm font-semibold">Import all registers</h3><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Upload one CSV containing a Register column and rows for any register. The import is validated before anything is saved.</p></div></div>
              <input ref={importInputRef} type="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" className="hidden" onChange={(event) => void importAllRegisters(event)} />
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" disabled={importPending} onClick={() => importInputRef.current?.click()} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"><Upload size={15} />{importPending ? 'Importing…' : 'Import workbook'}</button>
                <button type="button" onClick={() => void downloadWorkbook()} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2.5 text-sm font-semibold hover:bg-muted"><Download size={15} /> Export workbook</button>
              </div>
              <p className="mt-3 text-[11px] text-muted-foreground">Import or export the same multi-tab Excel workbook used by the daily email backup. Register record IDs are preserved so payment history stays linked after a truncate and restore. Payment History and Payment Bills tabs are included; existing records are not overwritten and duplicate backup rows are skipped.</p>
            </div>
            <form onSubmit={(event) => void saveBackupSettings(event)} className="rounded-xl border border-border bg-muted/20 p-4">
              <div className="flex items-start gap-3"><span className="grid size-8 place-items-center rounded-lg bg-background text-primary"><Mail size={16} /></span><div><h3 className="text-sm font-semibold">Daily email backup</h3><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Every day at 6:00 PM India time, registers, payment history, and payment bills are sent as one workbook.</p></div></div>
              <label className="mt-4 block"><span className="mb-1.5 block text-xs font-semibold">Backup recipient email</span><input required={backupEnabled} type="email" value={backupEmail} onChange={(event) => setBackupEmail(event.target.value)} placeholder="admin@example.com" className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary" /></label>
              <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={backupEnabled} onChange={(event) => setBackupEnabled(event.target.checked)} className="size-4 accent-[hsl(var(--primary))]" /><span className="font-semibold">Enable daily backup at 6:00 PM</span></label>
              <div className="mt-4 flex flex-wrap gap-2">
                <button disabled={backupPending} type="submit" className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"><Clock3 size={15} />{backupPending ? 'Saving…' : 'Save schedule'}</button>
                <button disabled={backupPending || !backupEmail} type="button" onClick={() => void sendBackupNow()} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2.5 text-sm font-semibold hover:bg-muted disabled:opacity-50"><Send size={15} /> Send now</button>
              </div>
              <p className="mt-3 text-[11px] text-muted-foreground">{backupLastSentAt ? `Last sent ${new Date(backupLastSentAt).toLocaleString('en-IN')}.` : 'No backup has been sent yet.'} Gmail delivery uses the server-side environment configuration (GMAIL_USER / GMAIL_APP_PASSWORD).</p>
            </form>
            <form onSubmit={(event) => void saveSignatories(event)} className="rounded-xl border border-border bg-muted/20 p-4 lg:col-span-2">
              <div className="flex items-start gap-3"><span className="grid size-8 place-items-center rounded-lg bg-background text-primary"><UsersRound size={16} /></span><div><h3 className="text-sm font-semibold">Bill signatories</h3><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Enter the three names printed on every driver, Chowk labour, and training bill. The fourth person is always the bill name.</p></div></div>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                {([
                  ['preparedBy', 'Prepared by'],
                  ['checkedBy', 'Checked by'],
                  ['verifiedBy', 'Verified by'],
                ] as const).map(([key, label]) => (
                  <label key={key} className="block"><span className="mb-1.5 block text-xs font-semibold">{label}</span><input type="text" value={signatories[key]} onChange={(event) => setSignatories({ ...signatories, [key]: event.target.value })} placeholder={`Enter ${label.toLowerCase()} name`} className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary" /></label>
                ))}
              </div>
              <button disabled={signatoryPending} type="submit" className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">{signatoryPending ? 'Saving…' : 'Save bill signatories'}</button>
            </form>
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 lg:col-span-2">
              <div className="flex items-start gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-destructive/10 text-destructive"><Trash2 size={16} /></span>
                <div>
                  <h3 className="text-sm font-semibold text-destructive">Clear all operational data</h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Permanently removes all register records, payment bills, payment transactions, and payment exclusions. Admin users and backup settings are preserved.</p>
                </div>
              </div>
              <button type="button" disabled={truncatePending} onClick={() => void truncateAllData()} className="mt-4 inline-flex items-center gap-2 rounded-lg border border-destructive/40 px-3 py-2.5 text-sm font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-50">
                <Trash2 size={15} /> {truncatePending ? 'Clearing…' : 'Truncate all data'}
              </button>
            </div>
          </div>
        </section>
        </>
        )}
      </div>
    </div>
  );
}
