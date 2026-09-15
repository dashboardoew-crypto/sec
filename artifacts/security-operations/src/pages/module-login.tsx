import { ArrowRight, Gauge, LogOut, ShieldCheck } from 'lucide-react';
import { Link } from 'wouter';
import { useAuth } from '@/lib/auth';

const modules = [
  {
    slug: 'security',
    label: 'Security',
    description: 'Security operations registers',
    icon: ShieldCheck,
  },
  {
    slug: 'main-gate',
    label: 'Main Gate Security',
    description: 'Gate, visitor, vehicle and pass registers',
    icon: Gauge,
  },
];

export default function ModuleLogin() {
  const { user, logout } = useAuth();
  const availableModules = modules;
  return (
    <main className="module-login min-h-[100dvh] bg-[#061a2b] text-white">

      <section className="relative mx-auto flex min-h-[100dvh] w-full max-w-[1280px] flex-col justify-center px-6 py-12 sm:px-10 lg:px-16">
        <div className="absolute right-6 top-6 flex items-center gap-3 sm:right-10 sm:top-8">
          <span className="hidden text-xs text-white/60 sm:inline">{user?.displayName}</span>
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
            Select a module to continue to its operational registers and enter today&apos;s details.
          </p>
        </div>

        <div className="grid max-w-5xl gap-5 sm:grid-cols-2">
          {availableModules.map(({ slug, label, description, icon: Icon }) => (
            <Link
              key={slug}
              href={`/registers/${slug}`}
              className="group flex min-h-[156px] items-center gap-5 rounded-xl border border-white/35 bg-white px-6 py-6 text-slate-900 shadow-[0_18px_55px_rgba(0,0,0,.25)] transition duration-200 hover:-translate-y-1 hover:border-[#f5c34b] hover:shadow-[0_24px_70px_rgba(0,0,0,.36)] focus:outline-none focus:ring-4 focus:ring-[#f5c34b]/40 sm:px-8"
              data-testid={`link-login-module-${slug}`}
            >
              <span className="grid size-16 shrink-0 place-items-center rounded-xl bg-[#eaf4f7] text-[#176b76] transition duration-200 group-hover:bg-[#176b76] group-hover:text-white">
                <Icon size={31} strokeWidth={1.7} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-serif text-2xl font-bold tracking-[-.02em]">
                  {label}
                </span>
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