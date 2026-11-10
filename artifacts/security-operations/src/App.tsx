import { lazy, Suspense, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AuthProvider, canAccessWorkspace, useAuth } from '@/lib/auth';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const ModuleLogin = lazy(() => import('@/pages/module-login'));
const LoginPage = lazy(() => import('@/pages/login'));
const Dashboard = lazy(() => import('@/pages/dashboard'));
const RegistersPage = lazy(() => import('@/pages/registers'));
const AdminUsersPage = lazy(() => import('@/pages/admin-users'));
const HrCenterPage = lazy(() => import('@/pages/hr-center'));
const ReportsPage = lazy(() => import('@/pages/reports'));
const DriverBoardPage = lazy(() => import('@/pages/driver-board'));
const NotFound = lazy(() => import('@/pages/not-found'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,
      gcTime: 10 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function LoadingScreen({ label = 'Loading workspace…' }: { label?: string }) {
  return (
    <div className="grid min-h-[100dvh] place-items-center bg-[#061a2b] text-sm text-white/70">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
        <span>{label}</span>
      </div>
    </div>
  );
}

function HrCenterAccessRoute() {
  const { user } = useAuth();
  return canAccessWorkspace(user?.role, 'hr') ? <HrCenterPage /> : <NotFound />;
}

function ReportsAccessRoute() {
  const { user } = useAuth();
  return canAccessWorkspace(user?.role, 'reports') ? <ReportsPage /> : <NotFound />;
}

function DriverBoardAccessRoute() {
  return <DriverBoardPage />;
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function Router() {
  return (
    <RoutedErrorBoundary>
      <Suspense fallback={<LoadingScreen label="Loading page…" />}>
        <Switch>
          <Route path="/" component={ModuleLogin} />
          <Route path="/dashboard" component={Dashboard} />
          <Route path="/driver-board" component={DriverBoardAccessRoute} />
          <Route path="/fleet" component={DriverBoardAccessRoute} />
          <Route path="/live" component={DriverBoardAccessRoute} />
          <Route path="/registers/:slug" component={RegistersPage} />
          <Route path="/admin/users" component={AdminUsersPage} />
          <Route path="/hr" component={HrCenterAccessRoute} />
          <Route path="/reports" component={ReportsAccessRoute} />
          <Route component={NotFound} />
        </Switch>
      </Suspense>
    </RoutedErrorBoundary>
  );
}

function AuthGate() {
  const { isLoading, user } = useAuth();
  const [location] = useLocation();

  if (isLoading) return <LoadingScreen label="Loading workspace…" />;

  // Allow anyone to view Live Driver & Fleet Board without requiring login
  const isDriverBoardRoute =
    location === '/driver-board' ||
    location.startsWith('/driver-board') ||
    location === '/fleet' ||
    location === '/live';

  if (!user && isDriverBoardRoute) {
    return (
      <RoutedErrorBoundary>
        <Suspense fallback={<LoadingScreen label="Loading Live Driver & Fleet Board…" />}>
          <DriverBoardPage />
        </Suspense>
      </RoutedErrorBoundary>
    );
  }

  if (!user) {
    return (
      <Suspense fallback={<LoadingScreen label="Loading login…" />}>
        <LoginPage />
      </Suspense>
    );
  }
  return <Router />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <AuthProvider>
            <AuthGate />
          </AuthProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
