import { useMemo } from 'react';
import { AlertTriangle, BarChart3, Car, ChevronRight, Gauge, Home, Layers, ShieldCheck, UsersRound, WalletCards } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { canAccessWorkspace, useAuth, type WorkspaceSlug } from '@/lib/auth';

const MODULE_NAV_ITEMS: Array<{
  slug: WorkspaceSlug | 'admin';
  href: string;
  label: string;
  icon: typeof ShieldCheck;
}> = [
  { slug: 'security', href: '/registers/security', label: 'Security', icon: ShieldCheck },
  { slug: 'main-gate', href: '/registers/main-gate', label: 'Main Gate', icon: Gauge },
  { slug: 'master', href: '/registers/master', label: 'Master', icon: UsersRound },
  { slug: 'hr', href: '/hr', label: 'HR Center', icon: WalletCards },
  { slug: 'reports', href: '/reports', label: 'Reports 3.0', icon: BarChart3 },
  { slug: 'driver-board', href: '/driver-board', label: 'Live Fleet', icon: Car },
];

const ALL_REGISTERS_BY_MODULE = [
  {
    moduleName: 'Security Registers',
    registers: [
      { slug: 'key-movement', title: 'Key Movement Register' },
      { slug: 'mango-tree-meter', title: 'Mango Tree Meter Reading (Tubewell 1)' },
      { slug: 'clinic-gate-meter', title: 'Clinic Gate Meter Reading (Tubewell 2)' },
      { slug: 'chowk-labour', title: 'Chowk Labour Register' },
      { slug: 'daily-attendance', title: 'Training / Daily Attendance' },
      { slug: 'solar-panel-cleaning', title: 'Solar Panel Cleaning Record' },
      { slug: 'driver-schedule', title: 'Driver Daily Schedule' },
      { slug: 'service-bill', title: 'Service Bill Entry' },
      { slug: 'jack-register', title: 'Jack Register OEW' },
      { slug: 'fork-lifter', title: 'Fork Lifter Register' },
      { slug: 'car-breakdowns', title: 'Car Breakdowns Register' },
      { slug: 'camera-breakdown', title: 'Camera Breakdown Register' },
    ],
  },
  {
    moduleName: 'Main Gate Registers',
    registers: [
      { slug: 'personal-gate-pass', title: 'Personal Gate Pass Register' },
      { slug: 'official-gate-pass', title: 'Official Gate Pass Register' },
      { slug: 'outgoing-vehicles', title: 'Outgoing Vehicles Register' },
      { slug: 'visitor-record', title: 'Visitor Record Register' },
      { slug: 'kothi-attendance', title: 'Kothi Attendance Register' },
      { slug: 'contractor-gate-pass', title: 'Contractor Personal Gate Pass' },
      { slug: 'guest-food', title: 'Guest Food Register' },
      { slug: 'jain-food-service', title: 'Jain Food Service Register' },
      { slug: 'unit-2-gate-pass', title: 'Unit 2 Gate Pass Register' },
      { slug: 'driver-attendance', title: 'Driver Attendance Record' },
    ],
  },
  {
    moduleName: 'Master Data',
    registers: [
      { slug: 'labour-master', title: 'Labour Master' },
      { slug: 'security-master', title: 'Security Master' },
      { slug: 'driver-master', title: 'Driver Master' },
      { slug: 'kothi-master', title: 'Kothi Master' },
      { slug: 'key-master', title: 'Key Master' },
      { slug: 'chowk-labour-master', title: 'Chowk Labour Settings' },
    ],
  },
];

export function ModuleNavBar({
  currentModule,
  currentRegisterSlug,
}: {
  currentModule?: string;
  currentRegisterSlug?: string;
}) {
  const { user } = useAuth();
  const [location, setLocation] = useLocation();
  const isSuperAdmin = user?.role === 'super_admin';
  const isAdmin = user?.role === 'admin' || isSuperAdmin;

  const accessibleNavItems = useMemo(() => {
    return MODULE_NAV_ITEMS.filter((item) => {
      if (item.slug === 'admin') return isAdmin;
      return canAccessWorkspace(user?.role, item.slug as WorkspaceSlug);
    });
  }, [user?.role, isAdmin]);

  return (
    <header className="mb-6 rounded-2xl border border-border bg-card/90 shadow-sm backdrop-blur-sm" data-testid="module-nav-bar">
      {/* Top Banner for Super Admin */}
      {isSuperAdmin && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-amber-700 dark:text-amber-300">
          <div className="flex items-center gap-2">
            <span className="flex size-2 rounded-full bg-amber-500 animate-pulse" />
            <span className="font-mono text-[11px] font-bold uppercase tracking-wider">Super Admin Unrestricted Mode</span>
            <span className="hidden sm:inline text-xs text-muted-foreground">• You can view all modules and edit any field in any register without restrictions</span>
          </div>
          <span className="rounded bg-amber-500/20 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-200">
            Full Edit Access
          </span>
        </div>
      )}

      {/* Main Nav Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 sm:px-4">
        {/* Left: Home link and Module Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition"
            title="Return to Workspace Selector"
            data-testid="link-nav-home"
          >
            <Home size={14} />
            <span className="hidden md:inline">Modules</span>
          </Link>

          <span className="text-muted-foreground/40 hidden sm:inline">|</span>

          {accessibleNavItems.map(({ slug, href, label, icon: Icon }) => {
            const isActive =
              currentModule === slug ||
              (slug === 'driver-board' && location.startsWith('/driver-board')) ||
              (slug === 'hr' && location.startsWith('/hr')) ||
              (slug === 'reports' && location.startsWith('/reports'));

            return (
              <Link
                key={slug}
                href={href}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
                data-testid={`link-nav-module-${slug}`}
              >
                <Icon size={14} />
                <span>{label}</span>
              </Link>
            );
          })}

          {isAdmin && (
            <Link
              href="/admin/users"
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                location.startsWith('/admin')
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
              data-testid="link-nav-module-admin"
            >
              <ShieldCheck size={14} />
              <span>Admin</span>
            </Link>
          )}
        </div>

        {/* Right: Quick Register Jump Selector */}
        <div className="flex items-center gap-2">
          <div className="relative flex items-center">
            <Layers size={13} className="pointer-events-none absolute left-2.5 text-muted-foreground" />
            <select
              value={currentRegisterSlug || ''}
              onChange={(e) => {
                const target = e.target.value;
                if (!target) return;
                if (target === 'hr') setLocation('/hr');
                else if (target === 'reports') setLocation('/reports');
                else if (target === 'driver-board') setLocation('/driver-board');
                else setLocation(`/registers/${target}`);
              }}
              className="h-8 rounded-lg border border-input bg-background pl-7 pr-3 text-xs font-medium text-foreground outline-none focus:border-primary"
              data-testid="select-quick-jump-register"
              aria-label="Quick jump to register"
            >
              <option value="">Jump to any register…</option>
              {ALL_REGISTERS_BY_MODULE.map((group) => (
                <optgroup key={group.moduleName} label={group.moduleName}>
                  {group.registers.map((reg) => (
                    <option key={reg.slug} value={reg.slug}>
                      {reg.title}
                    </option>
                  ))}
                </optgroup>
              ))}
              <optgroup label="Workspaces & Reports">
                <option value="driver-board">Live Driver & Vehicle Board</option>
                <option value="hr">HR Center & Payroll</option>
                <option value="reports">Reports 3.0 Analytics</option>
              </optgroup>
            </select>
          </div>
        </div>
      </div>
    </header>
  );
}
