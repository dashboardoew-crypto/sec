import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import Dashboard from '@/pages/dashboard';
import RegistersPage from '@/pages/registers';
import SettingsPage from '@/pages/settings';
import ModuleLogin from '@/pages/module-login';
import { OpsShell } from '@/components/ops-shell';
import {
  Route,
  Switch,
  useParams,
  useLocation,
  Router as WouterRouter,
} from 'wouter';
import {
  getListRegistersQueryKey,
  useListRegisters,
} from '@workspace/api-client-react';

const queryClient = new QueryClient();

function Router() {
  return (
    // Keep a shared shell (sidebar, navbar) outside the boundary so it
    // survives a page crash.
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={ModuleLogin} />
        <Route path="/registers/:slug" component={RegisterAccessRoute} />
        <Route>
          <OpsShell>
            <Switch>
              <Route path="/dashboard" component={Dashboard} />
              <Route path="/registers/:slug" component={RegistersPage} />
              <Route path="/settings" component={SettingsPage} />
              <Route component={NotFound} />
            </Switch>
          </OpsShell>
        </Route>
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RegisterAccessRoute() {
  const { slug = '' } = useParams<{ slug: string }>();
  const isModuleLibrary = slug === 'security' || slug === 'main-gate';
  const registers = useListRegisters({
    query: {
      enabled: !isModuleLibrary,
      queryKey: getListRegistersQueryKey(),
    },
  });
  const definition = registers.data?.find((register) => register.slug === slug);

  if (isModuleLibrary) return <RegistersPage />;

  return (
    <OpsShell restrictedModule={definition?.module} hideSidebar>
      <RegistersPage />
    </OpsShell>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
