import { FormEvent, useEffect, useRef, useState } from 'react';
import { Clock3, Download, FileSpreadsheet, Mail, Pencil, Send, Trash2, Upload, UserPlus, UsersRound, X } from 'lucide-react';
import { PageIntro } from '@/components/ops-ui';
import { useAuth, type AuthUser, type UserRole } from '@/lib/auth';

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
  const [importPending, setImportPending] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

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
      setError(payload.error ?? 'The backup email could not be sent.');
      return;
    }
    setBackupLastSentAt(payload.lastSentAt ?? null);
    setNotice('Backup workbook sent.');
  };

  const importAllRegisters = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    resetMessages();
    setImportPending(true);
    const response = await fetch('/api/admin/data/import', {
      method: 'POST',
      headers: { 'Content-Type': file.name.toLowerCase().endsWith('.xlsx') ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'text/csv' },
      credentials: 'include',
      body: await file.arrayBuffer(),
    });
    const payload = await response.json().catch(() => ({}));
    setImportPending(false);
    if (!response.ok) {
      setError(payload.error ?? 'The workbook could not be imported.');
      return;
    }
    setNotice(`${payload.imported} records imported across ${payload.registers} registers.`);
  };

  const downloadWorkbook = async () => {
    const response = await fetch('/api/admin/data/export', { credentials: 'include' });
    if (!response.ok) {
      setError('The workbook could not be downloaded.');
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'security-operations-backup.xlsx';
    link.click();
    URL.revokeObjectURL(url);
  };

  if (user?.role !== 'admin') {
    return <div className="p-8 text-sm text-destructive">You do not have permission to manage users.</div>;
  }

  return (
    <div className="ops-grid min-h-[100dvh] px-5 py-8 md:px-8 lg:px-10">
      <PageIntro eyebrow="Administration" title="User access" description="Create accounts, update user details, assign roles, or remove access to the workspace." />
      {error && <div className="mb-5 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive" role="alert">{error}</div>}
      {notice && <div className="mb-5 rounded-lg border border-[hsl(var(--chart-3))]/30 bg-[hsl(var(--chart-3))]/10 px-4 py-3 text-sm text-[hsl(var(--chart-3))]">{notice}</div>}
      <div className="grid max-w-6xl gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-xl border border-border bg-card shadow-sm">
          <div className="flex items-center gap-3 border-b border-border px-5 py-4">
            <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary"><UsersRound size={17} /></span>
            <div><h2 className="font-serif text-lg font-bold">Workspace users</h2><p className="text-xs text-muted-foreground">Security users can access both operational modules.</p></div>
          </div>
          <div className="divide-y divide-border">
            {users.map((item) => editingId === item.id ? (
              <form key={item.id} onSubmit={(event) => void updateUser(event, item.id)} className="space-y-3 bg-muted/25 px-5 py-4">
                <div className="flex items-center justify-between"><div className="text-sm font-semibold">Edit {item.displayName}</div><button type="button" onClick={() => setEditingId(null)} className="rounded-md p-1 text-muted-foreground hover:bg-muted" aria-label="Cancel editing"><X size={16} /></button></div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <input required value={editForm.displayName} onChange={(event) => setEditForm({ ...editForm, displayName: event.target.value })} placeholder="Name" className="rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
                  <input required type="email" value={editForm.email} onChange={(event) => setEditForm({ ...editForm, email: event.target.value })} placeholder="ID / Email" className="rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
                  <input minLength={8} type="password" value={editForm.password} onChange={(event) => setEditForm({ ...editForm, password: event.target.value })} placeholder="New password (optional)" className="rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
                  <select value={editForm.role} onChange={(event) => setEditForm({ ...editForm, role: event.target.value as UserRole })} className="rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary">{roles.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}</select>
                </div>
                <button disabled={pending} type="submit" className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">{pending ? 'Saving…' : 'Save changes'}</button>
              </form>
            ) : (
              <div key={item.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0"><div className="text-sm font-semibold">{item.displayName}{item.id === user.id && <span className="ml-2 text-xs font-normal text-muted-foreground">(you)</span>}</div><div className="truncate text-xs text-muted-foreground">{item.email}</div></div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold capitalize">{item.role}</span>
                  <button onClick={() => startEditing(item)} className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground" title="Edit user" data-testid={`button-edit-user-${item.id}`}><Pencil size={15} /></button>
                  <button disabled={item.id === user.id} onClick={() => void deleteUser(item)} className="rounded-md p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-30" title={item.id === user.id ? 'You cannot delete your own account' : 'Delete user'} data-testid={`button-delete-user-${item.id}`}><Trash2 size={15} /></button>
                </div>
              </div>
            ))}
          </div>
        </section>
        <section className="rounded-xl border border-border bg-card shadow-sm">
          <div className="flex items-center gap-3 border-b border-border px-5 py-4">
            <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary"><UserPlus size={17} /></span>
            <div><h2 className="font-serif text-lg font-bold">Add a user</h2><p className="text-xs text-muted-foreground">Each account gets its own ID, password, and role.</p></div>
          </div>
          <form onSubmit={createUser} className="space-y-4 p-5">
            <label className="block"><span className="mb-1.5 block text-xs font-semibold">Name</span><input required value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary" /></label>
            <label className="block"><span className="mb-1.5 block text-xs font-semibold">ID / Email</span><input required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary" /></label>
            <label className="block"><span className="mb-1.5 block text-xs font-semibold">Temporary password</span><input required minLength={8} type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary" /></label>
            <label className="block"><span className="mb-1.5 block text-xs font-semibold">Role</span><select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as UserRole })} className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary">{roles.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}</select></label>
            <button disabled={pending} type="submit" className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50">{pending ? 'Creating…' : 'Create user'}</button>
          </form>
        </section>
        <section className="rounded-xl border border-border bg-card shadow-sm lg:col-span-2">
          <div className="flex items-center gap-3 border-b border-border px-5 py-4">
            <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary"><FileSpreadsheet size={17} /></span>
            <div><h2 className="font-serif text-lg font-bold">Register data tools</h2><p className="text-xs text-muted-foreground">Import every register from one CSV and keep a daily workbook backup.</p></div>
          </div>
          <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="rounded-xl border border-border bg-muted/20 p-4">
              <div className="flex items-start gap-3"><span className="grid size-8 place-items-center rounded-lg bg-background text-primary"><Upload size={16} /></span><div><h3 className="text-sm font-semibold">Import all registers</h3><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Upload one CSV containing a Register column and rows for any register. The import is validated before anything is saved.</p></div></div>
              <input ref={importInputRef} type="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" className="hidden" onChange={(event) => void importAllRegisters(event)} />
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" disabled={importPending} onClick={() => importInputRef.current?.click()} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"><Upload size={15} />{importPending ? 'Importing…' : 'Import workbook'}</button>
                <button type="button" onClick={() => void downloadWorkbook()} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2.5 text-sm font-semibold hover:bg-muted"><Download size={15} /> Export workbook</button>
              </div>
              <p className="mt-3 text-[11px] text-muted-foreground">Import or export the same multi-tab Excel workbook used by the daily email backup. Existing records are not overwritten; uploaded rows are added.</p>
            </div>
            <form onSubmit={(event) => void saveBackupSettings(event)} className="rounded-xl border border-border bg-muted/20 p-4">
              <div className="flex items-start gap-3"><span className="grid size-8 place-items-center rounded-lg bg-background text-primary"><Mail size={16} /></span><div><h3 className="text-sm font-semibold">Daily email backup</h3><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Every day at 6:00 PM India time, all registers are sent as one workbook with a separate tab for each register.</p></div></div>
              <label className="mt-4 block"><span className="mb-1.5 block text-xs font-semibold">Backup recipient email</span><input required={backupEnabled} type="email" value={backupEmail} onChange={(event) => setBackupEmail(event.target.value)} placeholder="admin@example.com" className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary" /></label>
              <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={backupEnabled} onChange={(event) => setBackupEnabled(event.target.checked)} className="size-4 accent-[hsl(var(--primary))]" /><span className="font-semibold">Enable daily backup at 6:00 PM</span></label>
              <div className="mt-4 flex flex-wrap gap-2">
                <button disabled={backupPending} type="submit" className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"><Clock3 size={15} />{backupPending ? 'Saving…' : 'Save schedule'}</button>
                <button disabled={backupPending || !backupEmail} type="button" onClick={() => void sendBackupNow()} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2.5 text-sm font-semibold hover:bg-muted disabled:opacity-50"><Send size={15} /> Send now</button>
              </div>
              <p className="mt-3 text-[11px] text-muted-foreground">{backupLastSentAt ? `Last sent ${new Date(backupLastSentAt).toLocaleString('en-IN')}.` : 'No backup has been sent yet.'} Gmail delivery uses the server-side Replit Secrets configuration.</p>
            </form>
          </div>
        </section>
      </div>
    </div>
  );
}