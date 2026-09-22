import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import Dashboard from '@/pages/dashboard';
import RegistersPage from '@/pages/registers';
import ModuleLogin from '@/pages/module-login';
import LoginPage from '@/pages/login';
import AdminUsersPage from '@/pages/admin-users';
import HrCenterPage from '@/pages/hr-center';
import ReportsPage from '@/pages/reports';
import { AuthProvider, canAccessWorkspace, useAuth } from '@/lib/auth';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={ModuleLogin} />
        <Route path="/registers/:slug" component={RegisterAccessRoute} />
        <Route>
          <Switch>
            <Route path="/dashboard" component={Dashboard} />
            <Route path="/registers/:slug" component={RegistersPage} />
            <Route path="/admin/users" component={AdminUsersPage} />
            <Route path="/hr" component={HrCenterAccessRoute} />
            <Route path="/reports" component={ReportsAccessRoute} />
            <Route component={NotFound} />
          </Switch>
        </Route>
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RegisterAccessRoute() {
  return <RegistersPage />;
}

function HrCenterAccessRoute() {
  const { user } = useAuth();
  return canAccessWorkspace(user?.role, 'hr') ? <HrCenterPage /> : <NotFound />;
}

function ReportsAccessRoute() {
  const { user } = useAuth();
  return canAccessWorkspace(user?.role, 'reports') ? <ReportsPage /> : <NotFound />;
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function AuthGate() {
  const { isLoading, user } = useAuth();
  if (isLoading) return <div className="grid min-h-[100dvh] place-items-center bg-[#061a2b] text-sm text-white/70">Loading workspace…</div>;
  if (!user) return <LoginPage />;
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
