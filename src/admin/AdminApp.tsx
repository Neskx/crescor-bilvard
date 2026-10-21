import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { CalendarDays, CalendarOff, Clock, ExternalLink, Inbox, ListChecks, LogOut, PlusCircle, Settings, Sparkles } from 'lucide-react';
import { supabase, supabaseConfigured } from '../lib/supabase';
import { Logo } from '../components/logo/Logo';
import { Alert, Field, Spinner, fieldAria } from '../components/ui';
import { ConfirmProvider, ToastProvider } from './components';
import { checkIsAdmin, countPending } from './adminApi';
import { BookingsView } from './views/Bookings';
import { CalendarView } from './views/Calendar';
import { NewBookingView } from './views/NewBooking';
import { ServicesView } from './views/Services';
import { HoursView } from './views/Hours';
import { BlockedView } from './views/Blocked';
import { SettingsView } from './views/Settings';
import { MessagesView } from './views/Messages';
import { cx } from '../lib/format';

function useNoIndex() {
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    document.title = 'Administration – Crescor Bilvård';
    return () => meta.remove();
  }, []);
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-950 px-4 py-16">
      <div className="w-full max-w-md">
        <Logo className="mx-auto h-auto w-64" />
        <div className="panel mt-10 p-6 sm:p-8">{children}</div>
      </div>
    </div>
  );
}

function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!supabase || busy) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (err) {
      setError(
        err.code === 'invalid_credentials' || err.status === 400 || /invalid/i.test(err.message)
          ? 'Fel e-postadress eller lösenord.'
          : err.status === 429
            ? 'För många inloggningsförsök. Vänta en stund och försök igen.'
            : 'Inloggningen misslyckades. Kontrollera anslutningen och försök igen.',
      );
    }
  }

  async function forgot() {
    if (!supabase) return;
    if (!email.trim()) {
      setError('Fyll i din e-postadress först.');
      return;
    }
    setError(null);
    await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/admin` });
    // Same message whether or not the account exists (no account enumeration).
    setInfo('Om adressen tillhör ett administratörskonto skickas en länk för att välja nytt lösenord.');
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <h1 className="font-display text-3xl font-semibold text-white">Logga in</h1>
      <Field id="login-email" label="E-post">
        <input {...fieldAria('login-email')} type="email" autoComplete="username" className="field-input" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </Field>
      <Field id="login-password" label="Lösenord">
        <input {...fieldAria('login-password')} type="password" autoComplete="current-password" className="field-input" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </Field>
      {error && <Alert tone="error">{error}</Alert>}
      {info && <Alert tone="info">{info}</Alert>}
      <button type="submit" className="btn btn-metal w-full" disabled={busy || !email || !password}>
        {busy ? <Spinner className="h-4 w-4" label="Loggar in" /> : null} Logga in
      </button>
      <button type="button" onClick={() => void forgot()} className="w-full text-center text-xs text-silver-400 underline hover:text-white">
        Glömt lösenordet?
      </button>
    </form>
  );
}

function NewPasswordForm({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    if (password.length < 12 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
      setError('Lösenordet måste vara minst 12 tecken och innehålla gemener, versaler och siffror.');
      return;
    }
    if (password !== repeat) {
      setError('Lösenorden matchar inte.');
      return;
    }
    setBusy(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) setError('Lösenordet kunde inte sparas. Länken kan ha gått ut – begär en ny.');
    else onDone();
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <h1 className="font-display text-3xl font-semibold text-white">Välj nytt lösenord</h1>
      <Field id="np-1" label="Nytt lösenord" hint="Minst 12 tecken med gemener, versaler och siffror.">
        <input {...fieldAria('np-1', undefined, 'hint')} type="password" autoComplete="new-password" className="field-input" value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <Field id="np-2" label="Upprepa lösenordet">
        <input {...fieldAria('np-2')} type="password" autoComplete="new-password" className="field-input" value={repeat} onChange={(e) => setRepeat(e.target.value)} />
      </Field>
      {error && <Alert tone="error">{error}</Alert>}
      <button type="submit" className="btn btn-metal w-full" disabled={busy}>
        Spara lösenord
      </button>
    </form>
  );
}

const NAV = [
  { to: 'bokningar', label: 'Bokningar', icon: ListChecks },
  { to: 'kalender', label: 'Kalender', icon: CalendarDays },
  { to: 'ny-bokning', label: 'Ny bokning', icon: PlusCircle },
  { to: 'meddelanden', label: 'Meddelanden', icon: Inbox },
  { to: 'tjanster', label: 'Tjänster', icon: Sparkles },
  { to: 'oppettider', label: 'Öppettider', icon: Clock },
  { to: 'blockerat', label: 'Blockerade tider', icon: CalendarOff },
  { to: 'installningar', label: 'Inställningar', icon: Settings },
];

function Dashboard({ session }: { session: Session }) {
  const [pending, setPending] = useState<number | null>(null);
  const refreshPending = useCallback(() => {
    countPending().then(setPending).catch(() => setPending(null));
  }, []);
  useEffect(() => {
    refreshPending();
    const t = setInterval(refreshPending, 60_000);
    return () => clearInterval(t);
  }, [refreshPending]);

  return (
    <div className="min-h-screen bg-ink-950 text-white lg:grid lg:grid-cols-[250px_1fr]">
      <aside className="border-b border-white/[0.07] bg-ink-900 lg:sticky lg:top-0 lg:h-screen lg:border-r lg:border-b-0">
        <div className="flex items-center justify-between px-5 py-4 lg:block lg:px-6 lg:py-7">
          <Logo className="h-10 w-auto lg:h-auto lg:w-full lg:max-w-[190px]" />
          <p className="eyebrow hidden lg:mt-3 lg:block">Administration</p>
        </div>
        <nav aria-label="Administration" className="no-scrollbar flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:px-3 lg:pb-0">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cx(
                  'flex shrink-0 items-center gap-3 px-3 py-2.5 text-sm whitespace-nowrap transition-colors',
                  isActive ? 'bg-white/[0.08] text-white' : 'text-silver-400 hover:bg-white/[0.04] hover:text-white',
                )
              }
            >
              <Icon className="h-4 w-4" aria-hidden />
              {label}
              {to === 'bokningar' && pending ? (
                <span className="ml-auto bg-amber-200 px-1.5 text-[0.65rem] font-bold text-ink-950" aria-label={`${pending} väntar på bekräftelse`}>
                  {pending}
                </span>
              ) : null}
            </NavLink>
          ))}
        </nav>
        <div className="hidden border-t border-white/[0.07] p-4 lg:absolute lg:inset-x-0 lg:bottom-0 lg:block">
          <p className="truncate text-xs text-silver-500" title={session.user.email}>
            {session.user.email}
          </p>
          <div className="mt-3 flex gap-2">
            <a href="/" target="_blank" rel="noopener" className="btn btn-ghost btn-sm flex-1 !px-2 !tracking-[0.08em] whitespace-nowrap">
              <ExternalLink className="h-3.5 w-3.5" aria-hidden /> Sajten
            </a>
            <button type="button" className="btn btn-ghost btn-sm flex-1 !px-2 !tracking-[0.08em] whitespace-nowrap" onClick={() => void supabase?.auth.signOut()}>
              <LogOut className="h-3.5 w-3.5" aria-hidden /> Logga ut
            </button>
          </div>
        </div>
      </aside>

      <main className="min-w-0 px-4 py-8 sm:px-8 lg:px-12 lg:py-12">
        <Routes>
          <Route index element={<Navigate to="bokningar" replace />} />
          <Route path="bokningar" element={<BookingsView onChanged={refreshPending} />} />
          <Route path="kalender" element={<CalendarView onChanged={refreshPending} />} />
          <Route path="ny-bokning" element={<NewBookingView onChanged={refreshPending} />} />
          <Route path="meddelanden" element={<MessagesView />} />
          <Route path="tjanster" element={<ServicesView />} />
          <Route path="oppettider" element={<HoursView />} />
          <Route path="blockerat" element={<BlockedView />} />
          <Route path="installningar" element={<SettingsView />} />
          <Route path="*" element={<Navigate to="bokningar" replace />} />
        </Routes>
        <div className="mt-16 flex justify-end gap-2 lg:hidden">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void supabase?.auth.signOut()}>
            <LogOut className="h-3.5 w-3.5" aria-hidden /> Logga ut
          </button>
        </div>
      </main>
    </div>
  );
}

type AuthState = 'loading' | 'signed_out' | 'recovery' | 'checking' | 'forbidden' | 'admin' | 'error';

export default function AdminApp() {
  useNoIndex();
  const [session, setSession] = useState<Session | null>(null);
  const [state, setState] = useState<AuthState>('loading');

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    const evaluate = async (s: Session | null) => {
      if (!active) return;
      setSession(s);
      if (!s) {
        setState('signed_out');
        return;
      }
      setState('checking');
      try {
        const ok = await checkIsAdmin();
        if (active) setState(ok ? 'admin' : 'forbidden');
      } catch {
        if (active) setState('error');
      }
    };
    supabase.auth.getSession().then(({ data }) => evaluate(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') {
        setSession(s);
        setState('recovery');
        return;
      }
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        // Defer: calling Supabase inside this callback can deadlock the auth client.
        setTimeout(() => void evaluate(s), 0);
      }
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (!supabaseConfigured) {
    return (
      <Shell>
        <Alert tone="error" title="Supabase är inte konfigurerat">
          Ange VITE_SUPABASE_URL och VITE_SUPABASE_ANON_KEY (se README) och bygg om webbplatsen.
        </Alert>
      </Shell>
    );
  }

  if (state === 'loading' || state === 'checking') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-950 text-silver-300">
        <Spinner label="Kontrollerar inloggning" />
      </div>
    );
  }
  if (state === 'recovery') {
    return (
      <Shell>
        <NewPasswordForm onDone={() => setState('admin')} />
      </Shell>
    );
  }
  if (state === 'signed_out' || !session) {
    return (
      <Shell>
        <LoginForm />
      </Shell>
    );
  }
  if (state === 'forbidden' || state === 'error') {
    return (
      <Shell>
        <Alert tone="error" title={state === 'forbidden' ? 'Ingen behörighet' : 'Kunde inte kontrollera behörighet'}>
          {state === 'forbidden'
            ? 'Kontot är inloggat men saknar administratörsbehörighet.'
            : 'Servern kunde inte nås. Försök igen om en stund.'}
        </Alert>
        <button type="button" className="btn btn-ghost mt-5 w-full" onClick={() => void supabase?.auth.signOut()}>
          Logga ut
        </button>
      </Shell>
    );
  }

  return (
    <ToastProvider>
      <ConfirmProvider>
        <Dashboard session={session} />
      </ConfirmProvider>
    </ToastProvider>
  );
}
