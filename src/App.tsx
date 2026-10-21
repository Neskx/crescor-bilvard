import { Component, lazy, Suspense, useEffect, type ReactNode } from 'react';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import { PublicConfigProvider } from './hooks/usePublicConfig';
import { HomePage } from './pages/HomePage';
import { ServicesPage } from './pages/ServicesPage';
import { ServiceDetailPage } from './pages/ServiceDetailPage';
import { BookingPage } from './pages/BookingPage';
import { AboutPage } from './pages/AboutPage';
import { ContactPage } from './pages/ContactPage';
import { PrivacyPage } from './pages/PrivacyPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { Spinner } from './components/ui';

/** Scroll to the top on page change, or to the #anchor when a link has one. */
function ScrollManager() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (!hash) {
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
      return;
    }
    const id = decodeURIComponent(hash.slice(1));
    if (!/^[a-z0-9-]+$/i.test(id)) return; // ignore malformed hashes
    // Wait for the target section to render.
    let tries = 0;
    const t = window.setInterval(() => {
      const el = document.getElementById(id);
      if (el || ++tries > 20) {
        window.clearInterval(t);
        el?.scrollIntoView({ block: 'start' });
      }
    }, 50);
    return () => window.clearInterval(t);
  }, [pathname, hash]);
  return null;
}

// The admin dashboard is a separate chunk: visitors never download it.
const AdminApp = lazy(() => import('./admin/AdminApp'));

/** Last line of defence: an unexpected render error shows a recovery screen, not a blank page. */
class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.error('[Crescor] Oväntat fel', error);
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-950 p-6 text-center">
        <div className="max-w-md">
          <p className="font-display text-4xl font-semibold text-white">Något gick fel</p>
          <p className="mt-4 text-silver-400">Ett oväntat fel uppstod. Ladda om sidan och försök igen. Ifyllda bokningsuppgifter finns kvar.</p>
          <button type="button" className="btn btn-metal mt-8" onClick={() => window.location.reload()}>
            Ladda om sidan
          </button>
        </div>
      </div>
    );
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route
            path="/admin/*"
            element={
              <Suspense
                fallback={
                  <div className="flex min-h-screen items-center justify-center bg-ink-950 text-silver-300">
                    <Spinner label="Laddar administrationen" />
                  </div>
                }
              >
                <AdminApp />
              </Suspense>
            }
          />
          <Route
            path="*"
            element={
              <PublicConfigProvider>
                <ScrollManager />
                <Routes>
                  <Route path="/" element={<HomePage />} />
                  <Route path="/tjanster" element={<ServicesPage />} />
                  <Route path="/tjanster/:slug" element={<ServiceDetailPage />} />
                  <Route path="/boka" element={<BookingPage />} />
                  <Route path="/om-oss" element={<AboutPage />} />
                  <Route path="/kontakt" element={<ContactPage />} />
                  <Route path="/integritetspolicy" element={<PrivacyPage />} />
                  <Route path="*" element={<NotFoundPage />} />
                </Routes>
              </PublicConfigProvider>
            }
          />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
