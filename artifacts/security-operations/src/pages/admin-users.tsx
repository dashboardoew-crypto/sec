import { FormEvent, useEffect, useState } from 'react';
import { UserPlus, UsersRound } from 'lucide-react';
import { PageIntro } from '@/components/ops-shell';
import { useAuth, type AuthUser, type UserRole } from '@/lib/auth';

const roles: Array<{ value: UserRole; label: string }> = [
  { value: 'admin', label: 'Admin' },
  { value: 'manager', label: 'Manager' },
  { value: 'hr', label: 'HR' },
  { value: 'security', label: 'Security' },
];

export default function AdminUsersPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState(false);
  const [form, setForm] = useState({ displayName: '', email: '', password: '', role: 'manager' as UserRole });

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

  const updateRole = async (id: string, role: UserRole) => {
    setError('');
    setNotice('');
    const response = await fetch(`/api/auth/users/${id}/role`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ role }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setError(payload.error ?? 'Could not update this role.');
      return;
    }
    setUsers((current) => current.map((item) => item.id === id ? { ...item, role } : item));
    setNotice('Role updated.');
  };

  const createUser = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError('');
    setNotice('');
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
    setForm({ displayName: '', email: '', password: '', role: 'manager' });
    setNotice('User created.');
  };

  if (user?.role !== 'admin') {
    return <div className="p-8 text-sm text-destructive">You do not have permission to manage users.</div>;
  }

  return (
    <div className="ops-grid min-h-[calc(100dvh-68px)] px-5 py-8 md:px-8 lg:px-10">
      <PageIntro eyebrow="Administration" title="User access" description="Create accounts and assign the position that controls each person’s access." />
      {error && <div className="mb-5 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive" role="alert">{error}</div>}
      {notice && <div className="mb-5 rounded-lg border border-[hsl(var(--chart-3))]/30 bg-[hsl(var(--chart-3))]/10 px-4 py-3 text-sm text-[hsl(var(--chart-3))]">{notice}</div>}
      <div className="grid max-w-6xl gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-xl border border-border bg-card shadow-sm">
          <div className="flex items-center gap-3 border-b border-border px-5 py-4">
            <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary"><UsersRound size={17} /></span>
            <div><h2 className="font-serif text-lg font-bold">Workspace users</h2><p className="text-xs text-muted-foreground">The role is shared by all accounts with the same position.</p></div>
          </div>
          <div className="divide-y divide-border">
            {users.map((item) => (
              <div key={item.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div><div className="text-sm font-semibold">{item.displayName}</div><div className="text-xs text-muted-foreground">{item.email}</div></div>
                <select value={item.role} onChange={(event) => void updateRole(item.id, event.target.value as UserRole)} className="rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary" data-testid={`select-role-${item.id}`}>
                  {roles.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
                </select>
              </div>
            ))}
          </div>
        </section>
        <section className="rounded-xl border border-border bg-card shadow-sm">
          <div className="flex items-center gap-3 border-b border-border px-5 py-4">
            <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary"><UserPlus size={17} /></span>
            <div><h2 className="font-serif text-lg font-bold">Add a user</h2><p className="text-xs text-muted-foreground">Each account gets its own ID and password.</p></div>
          </div>
          <form onSubmit={createUser} className="space-y-4 p-5">
            <label className="block"><span className="mb-1.5 block text-xs font-semibold">Name</span><input required value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary" /></label>
            <label className="block"><span className="mb-1.5 block text-xs font-semibold">ID / Email</span><input required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary" /></label>
            <label className="block"><span className="mb-1.5 block text-xs font-semibold">Temporary password</span><input required minLength={8} type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary" /></label>
            <label className="block"><span className="mb-1.5 block text-xs font-semibold">Position</span><select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as UserRole })} className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary">{roles.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}</select></label>
            <button disabled={pending} type="submit" className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50">{pending ? 'Creating…' : 'Create user'}</button>
          </form>
        </section>
      </div>
    </div>
  );
}