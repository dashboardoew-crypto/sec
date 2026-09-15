import { FormEvent, useEffect, useState } from 'react';
import { Pencil, Trash2, UserPlus, UsersRound, X } from 'lucide-react';
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
    if (user?.role === 'admin') void loadUsers();
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
      </div>
    </div>
  );
}