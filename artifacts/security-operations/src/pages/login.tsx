import { FormEvent, useState } from 'react';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { useLocation } from 'wouter';
import { useAuth } from '@/lib/auth';

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError('');
    const loginError = await login(email, password);
    setPending(false);
    if (loginError) {
      setError(loginError);
      return;
    }
    const returnPath = window.location.pathname.startsWith('/login') ? '/' : window.location.pathname;
    setLocation(returnPath);
  };

  return (
    <main className="grid min-h-[100dvh] place-items-center bg-[#061a2b] px-5 py-10 text-white">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center gap-3 text-xs font-semibold uppercase tracking-[.26em] text-white/65">
          <span className="grid size-10 place-items-center rounded-lg border border-white/20 bg-white/10 text-[#f5c34b]">
            <ShieldCheck size={20} />
          </span>
          Watchroom ERP
        </div>
        <div className="rounded-2xl border border-white/15 bg-white/[.07] p-6 shadow-2xl backdrop-blur-sm sm:p-8">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[.22em] text-[#f5c34b]">Secure access</p>
          <h1 className="font-serif text-3xl font-bold tracking-[-.03em]">Sign in to your workspace</h1>
          <p className="mt-3 text-sm leading-6 text-white/60">Use your assigned ID and password to open the operations desk.</p>
          <form onSubmit={submit} className="mt-7 space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-white/75">ID / Email</span>
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                autoComplete="username"
                required
                className="w-full rounded-lg border border-white/20 bg-black/20 px-3 py-3 text-sm outline-none placeholder:text-white/35 focus:border-[#f5c34b]"
                placeholder="name@company.com"
                data-testid="input-login-email"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-white/75">Password</span>
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                autoComplete="current-password"
                required
                className="w-full rounded-lg border border-white/20 bg-black/20 px-3 py-3 text-sm outline-none placeholder:text-white/35 focus:border-[#f5c34b]"
                placeholder="Enter your password"
                data-testid="input-login-password"
              />
            </label>
            {error && <div className="rounded-lg border border-red-300/30 bg-red-400/10 px-3 py-2.5 text-sm text-red-100" role="alert">{error}</div>}
            <button
              disabled={pending}
              type="submit"
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#f5c34b] px-4 py-3 text-sm font-bold text-[#061a2b] transition hover:bg-[#ffd66c] disabled:cursor-not-allowed disabled:opacity-60"
              data-testid="button-login"
            >
              {pending ? 'Signing in…' : 'Sign in'}
              {!pending && <ArrowRight size={16} />}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}