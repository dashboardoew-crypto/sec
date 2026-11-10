import { AlertTriangle, ArrowRight, BarChart3, Car, Gauge, LogOut, ShieldCheck, UsersRound, WalletCards } from 'lucide-react';
import { Link } from 'wouter';
import { canAccessWorkspace, useAuth, type WorkspaceSlug } from '@/lib/auth';

const modules: Array<{
  slug: WorkspaceSlug;
  href: string;
  label: string;
  description: string;
  icon: typeof ShieldCheck;
  highlight?: boolean;
}> = [
  {
    slug: 'driver-board',
    href: '/driver-board',
    label: 'Live Driver & Vehicle Board',
    description: 'Real-time driver presence, vehicle assignments, active trips en-route & fleet service',
    icon: Car,
    highlight: true,
  },
  {
    slug: 'security',
    href: '/registers/security',
    label: 'Security',
    description: 'Security operations registers',
    icon: ShieldCheck,
  },
  {
    slug: 'main-gate',
    href: '/registers/main-gate',
    label: 'Main Gate Security',
    description: 'Gate, visitor, vehicle and pass registers',
    icon: Gauge,
  },
  {
    slug: 'master',
    href: '/registers/master',
    label: 'Master',
    description: 'Labour, driver and security master registers',
    icon: UsersRound,
  },
  {
    slug: 'hr',
    href: '/hr',
    label: 'HR',
    description: 'People, payroll, payments and the daily ledger',
    icon: WalletCards,
  },
  {
    slug: 'reports',
    href: '/reports',
    label: 'Reports 3.0',
    description: 'Module Report 3.0 (Solar Cleaning Man Power), Report 2.0 (Driver & Vehicle) & HR reports',
    icon: BarChart3,
  },
];

export default function ModuleLogin() {
  const { user, logout } = useAuth();
  const availableModules = modules.filter(({ slug }) => canAccessWorkspace(user?.role, slug));
  return (
    <main className="module-login min-h-[100dvh] bg-[#061a2b] text-white">

      <section className="relative mx-auto flex min-h-[100dvh] w-full max-w-[1280px] flex-col justify-center px-6 py-12 sm:px-10 lg:px-16">
        <div className="absolute right-6 top-6 flex items-center gap-3 sm:right-10 sm:top-8">
          <span className="hidden text-xs text-white/60 sm:inline">{user?.displayName}</span>
          <Link
            href="/driver-board"
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/20 px-3 py-2 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/30"
            data-testid="link-header-driver-board"
          >
            <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
            <Car size={14} /> Live Fleet Board
          </Link>
          {user?.role === 'admin' && (
            <>
              <Link
                href="/admin/users?tab=breakdowns"
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/40 bg-red-500/20 px-3 py-2 text-xs font-semibold text-red-200 transition hover:bg-red-500/30"
                data-testid="link-header-breakdown-report"
              >
                <AlertTriangle size={14} className="text-red-400" /> Breakdown Report
              </Link>
              <Link
                href="/admin/users"
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/15"
                data-testid="link-header-admin-panel"
              >
                <ShieldCheck size={14} /> Admin Panel
              </Link>
            </>
          )}
          <button onClick={() => void logout()} className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/15" data-testid="button-module-logout">
            <LogOut size={14} /> Sign out
          </button>
        </div>
        <div className="mb-12 max-w-2xl">
          <div className="mb-5 flex items-center gap-3 text-xs font-semibold uppercase tracking-[.26em] text-white/65">
            <span className="grid size-9 place-items-center rounded-lg border border-white/20 bg-white/10 text-[#f5c34b] shadow-lg backdrop-blur-sm">
              <ShieldCheck size={19} />
            </span>
            Watchroom ERP
          </div>
          <p className="mb-3 text-sm font-medium uppercase tracking-[.24em] text-[#f5c34b]">
            Operations modules
          </p>
          <h1 className="max-w-xl font-serif text-4xl font-bold leading-[1.04] tracking-[-.04em] sm:text-6xl">
            Choose your workspace
          </h1>
          <p className="mt-5 max-w-lg text-sm leading-7 text-white/65 sm:text-base">
            Select a module to continue. HR brings people, payroll, payment recording and the daily ledger into one workspace.
          </p>
        </div>

        <div className="grid max-w-5xl gap-5 sm:grid-cols-2">
          {availableModules.map(({ slug, href, label, description, icon: Icon }) => (
            <Link
              key={slug}
              href={href}
              className="group flex min-h-[156px] items-center gap-5 rounded-xl border border-white/35 bg-white px-6 py-6 text-slate-900 shadow-[0_18px_55px_rgba(0,0,0,.25)] transition duration-200 hover:-translate-y-1 hover:border-[#f5c34b] hover:shadow-[0_24px_70px_rgba(0,0,0,.36)] focus:outline-none focus:ring-4 focus:ring-[#f5c34b]/40 sm:px-8"
              data-testid={`link-login-module-${slug}`}
            >
              <span className="grid size-16 shrink-0 place-items-center rounded-xl bg-[#eaf4f7] text-[#176b76] transition duration-200 group-hover:bg-[#176b76] group-hover:text-white">
                <Icon size={31} strokeWidth={1.7} />
              </span>
              <span className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="block font-serif text-2xl font-bold tracking-[-.02em]">
                    {label}
                  </span>
                  {slug === 'driver-board' && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold tracking-wide text-emerald-800">
                      <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      LIVE
                    </span>
                  )}
                </div>
                <span className="mt-1 block text-sm leading-6 text-slate-500">
                  {description}
                </span>
              </span>
              <ArrowRight className="shrink-0 text-slate-400 transition duration-200 group-hover:translate-x-1 group-hover:text-[#176b76]" size={20} />
            </Link>
          ))}
        </div>

        <div className="mt-12 flex items-center gap-3 text-xs uppercase tracking-[.18em] text-white/45">
          <span className="size-2 rounded-full bg-[#f5c34b] shadow-[0_0_16px_rgba(245,195,75,.9)]" />
          Secure operations workspace
        </div>
      </section>
    </main>
  );
}