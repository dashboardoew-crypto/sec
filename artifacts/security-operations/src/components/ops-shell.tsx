import { type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { Activity, ArrowRight, BookOpen, ChevronRight, ClipboardList, Command, Gauge, LogOut, Menu, Settings2, ShieldCheck, UsersRound, X } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/lib/auth';

const moduleLinks = [
  { slug: 'security', label: 'Security Operations', icon: ShieldCheck },
  { slug: 'main-gate', label: 'Main Gate Security', icon: Gauge },
];

export function OpsShell({
  children,
  restrictedModule,
  hideSidebar = false,
}: {
  children: ReactNode;
  restrictedModule?: 'security' | 'main-gate';
  hideSidebar?: boolean;
}) {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const { user, logout } = useAuth();
  const isRegister = location.startsWith('/registers/');
  return (
    <div className="ops-noise min-h-[100dvh] bg-background text-foreground">
      {!hideSidebar && <aside className={`fixed inset-y-0 left-0 z-40 w-[264px] border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-transform md:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-sidebar-border px-5 py-5">
            <Link href="/" onClick={() => setOpen(false)} className="flex items-center gap-3" data-testid="link-brand">
              <div className="grid size-9 place-items-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground"><Command size={18} /></div>
              <div><div className="font-serif text-[15px] font-bold tracking-tight">Watchroom</div><div className="font-mono text-[9px] uppercase tracking-[.18em] text-sidebar-foreground/55">Operations desk</div></div>
            </Link>
            <button className="text-sidebar-foreground/60 md:hidden" onClick={() => setOpen(false)} data-testid="button-close-menu"><X size={18} /></button>
          </div>
          <div className="px-3 py-5">
            {!restrictedModule && <><div className="mb-2 px-3 font-mono text-[10px] uppercase tracking-[.18em] text-sidebar-foreground/45">Workspace</div>
              <Link href="/" onClick={() => setOpen(false)} className={`mb-1 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${location === '/' ? 'bg-sidebar-accent text-sidebar-foreground' : 'text-sidebar-foreground/65 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground'}`} data-testid="link-overview"><Activity size={16} /><span>Operations overview</span></Link>
              <Link href="/settings" onClick={() => setOpen(false)} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${location === '/settings' ? 'bg-sidebar-accent text-sidebar-foreground' : 'text-sidebar-foreground/65 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground'}`} data-testid="link-settings"><Settings2 size={16} /><span>Workspace settings</span></Link>
               {user?.role === 'admin' && <Link href="/admin/users" onClick={() => setOpen(false)} className={`mt-1 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${location === '/admin/users' ? 'bg-sidebar-accent text-sidebar-foreground' : 'text-sidebar-foreground/65 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground'}`} data-testid="link-user-access"><UsersRound size={16} /><span>User access</span></Link>}
            </>}
          </div>
          <div className="px-3">
            <div className="mb-2 px-3 font-mono text-[10px] uppercase tracking-[.18em] text-sidebar-foreground/45">Registers</div>
            {moduleLinks.filter(({ slug }) => (!restrictedModule || slug === restrictedModule) && (user?.role !== 'security' || slug === 'security')).map(({ slug, label, icon: Icon }) => <Link key={slug} href={`/registers/${slug}`} onClick={() => setOpen(false)} className={`mb-1 flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium ${isRegister && location.includes(slug) ? 'bg-sidebar-accent text-sidebar-foreground' : 'text-sidebar-foreground/65 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground'}`} data-testid={`link-module-${slug}`}><span className="flex items-center gap-3"><Icon size={16} />{label}</span><ChevronRight size={14} className="opacity-40" /></Link>)}
          </div>
           <div className="mt-auto space-y-3 p-4">
            <div className="flex items-center justify-between rounded-xl border border-sidebar-border bg-sidebar-accent/45 px-3 py-3"><div className="min-w-0"><div className="truncate text-xs font-semibold">{user?.displayName}</div><div className="font-mono text-[9px] uppercase tracking-wider text-sidebar-foreground/50">{user?.role}</div></div><button onClick={() => void logout()} className="rounded-md p-2 text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground" title="Sign out" data-testid="button-logout"><LogOut size={15} /></button></div>
            <div className="rounded-xl border border-sidebar-border bg-sidebar-accent/45 p-4">
              <div className="mb-3 flex items-center gap-2"><span className="pulse-dot size-2 rounded-full bg-sidebar-primary" /><span className="font-mono text-[10px] uppercase tracking-[.14em] text-sidebar-foreground/70">System online</span></div>
              <p className="text-xs leading-relaxed text-sidebar-foreground/50">Records are synced and ready for the next shift.</p>
            </div>
          </div>
        </div>
      </aside>}
      {!hideSidebar && open && <button className="fixed inset-0 z-30 bg-foreground/30 md:hidden" onClick={() => setOpen(false)} aria-label="Close navigation" data-testid="button-overlay" />}
      <main className={hideSidebar ? '' : 'md:pl-[264px]'}>
        <header className="sticky top-0 z-20 flex h-[68px] items-center justify-between border-b border-border/80 bg-background/90 px-5 backdrop-blur-md md:px-8">
          <div className="flex items-center gap-3">{!hideSidebar && <button className="rounded-md p-2 hover:bg-muted md:hidden" onClick={() => setOpen(true)} data-testid="button-open-menu"><Menu size={20} /></button>}<div className="flex items-center gap-2 text-xs text-muted-foreground"><BookOpen size={14} /><span>Shift control /</span><span className="font-medium text-foreground">{location === '/' ? 'Overview' : location === '/settings' ? 'Settings' : 'Registers'}</span></div></div>
          <div className="flex items-center gap-4"><div className="hidden items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground sm:flex"><span className="size-1.5 rounded-full bg-[hsl(var(--chart-3))]" />Live workspace</div><div className="grid size-8 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">AS</div></div>
        </header>
        {children}
      </main>
    </div>
  );
}

export function PageIntro({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><div className="mb-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[.18em] text-primary"><span className="size-1.5 rounded-full bg-accent" />{eyebrow}</div><h1 className="font-serif text-3xl font-bold tracking-[-.03em] text-foreground sm:text-4xl">{title}</h1><p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p></div>{action}</div>;
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return <div className="grid min-h-[220px] place-items-center rounded-xl border border-dashed border-border bg-card/60 p-8 text-center"><div><div className="mx-auto mb-3 grid size-10 place-items-center rounded-full bg-muted text-muted-foreground"><ClipboardList size={18} /></div><h3 className="font-serif text-lg font-bold">{title}</h3><p className="mt-1 text-sm text-muted-foreground">{description}</p></div></div>;
}