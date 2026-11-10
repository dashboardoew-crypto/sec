import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type UserRole = 'admin' | 'manager' | 'hr' | 'security';
export type WorkspaceSlug = 'security' | 'main-gate' | 'master' | 'hr' | 'reports' | 'payments' | 'payment-report' | 'driver-board';
export type AuthUser = {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  createdAt: string;
};

export const canCreateRegisterRecord = (role?: UserRole | null) =>
  role === 'admin' || role === 'manager' || role === 'hr' || role === 'security';

export const canAccessWorkspace = (role: UserRole | undefined | null, workspace: WorkspaceSlug) => {
  if (workspace === 'master' || workspace === 'hr' || workspace === 'payments' || workspace === 'reports' || workspace === 'payment-report') return role === 'admin' || role === 'manager' || role === 'hr';
  return role === 'admin' || role === 'manager' || role === 'hr' || role === 'security';
};

export const canEditPayments = (role: UserRole | undefined | null) =>
  role === 'admin' || role === 'hr';

type AuthContextValue = {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<string | null>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function readError(response: Response) {
  const payload = await response.json().catch(() => ({}));
  return typeof payload.error === 'string' ? payload.error : 'Something went wrong. Try again.';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) return;
        const payload = await response.json();
        setUser(payload.user ?? null);
      })
      .catch(() => setUser(null))
      .finally(() => setIsLoading(false));
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    isLoading,
    login: async (email, password) => {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) return readError(response);
      const payload = await response.json();
      setUser(payload.user ?? null);
      return null;
    },
    logout: async () => {
      try {
        await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
      } finally {
        setUser(null);
      }
    },
  }), [isLoading, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider');
  return value;
}