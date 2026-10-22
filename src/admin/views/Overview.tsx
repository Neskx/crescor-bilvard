import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { adminMessage, countPending, getSettings, listAppointments } from '../adminApi';
import { listPartners, listReviews } from '../adminApiPhase2';
import { PageHeader } from '../components';
import { Alert, Spinner } from '../../components/ui';

interface Stats {
  pending: number;
  pickups: number;
  onsite: number;
  reviewsToModerate: number;
  reviewsReported: number;
  partnersWithoutLogo: number;
  charityEnabled: boolean;
  bookingEnabled: boolean;
}

function Card({ to, label, value, note }: { to: string; label: string; value: ReactNode; note?: string }) {
  return (
    <Link to={to} className="group flex flex-col justify-between border border-white/[0.07] bg-ink-900 p-5 transition-colors hover:border-white/25">
      <span className="eyebrow">{label}</span>
      <span className="font-display mt-3 text-4xl font-semibold text-white">{value}</span>
      <span className="mt-3 flex items-center justify-between text-xs text-silver-400">
        {note ?? ''} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden />
      </span>
    </Link>
  );
}

export function OverviewView() {
  const [s, setS] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      countPending(),
      listAppointments({ scope: 'upcoming', location: 'pickup', pageSize: 1 }),
      listAppointments({ scope: 'upcoming', location: 'customer_address', pageSize: 1 }),
      listReviews(),
      listPartners(),
      getSettings(),
    ])
      .then(([pending, pickups, onsite, reviews, partners, settings]) =>
        setS({
          pending,
          pickups: pickups.total,
          onsite: onsite.total,
          reviewsToModerate: reviews.filter((r) => r.status === 'pending').length,
          reviewsReported: reviews.filter((r) => r.reported_at).length,
          partnersWithoutLogo: partners.filter((p) => p.is_visible && !p.logo_url).length,
          charityEnabled: settings.charity_enabled,
          bookingEnabled: settings.booking_enabled,
        }),
      )
      .catch((e) => setError(adminMessage(e)));
  }, []);

  if (error) return <Alert tone="error">{error}</Alert>;
  if (!s) return <Spinner label="Laddar översikt" />;

  return (
    <div className="max-w-5xl">
      <PageHeader title="Översikt" sub="Det som behöver din uppmärksamhet." />
      {!s.bookingEnabled && (
        <Alert tone="warning" className="mb-6">
          Onlinebokningen är avstängd. Aktivera den under <Link to="/admin/installningar" className="underline">Inställningar</Link>.
        </Alert>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card to="/admin/bokningar" label="Väntar på bekräftelse" value={s.pending} note="Bokningar" />
        <Card to="/admin/platser" label="Kommande hämtningar" value={s.pickups} note="Platser & hämtning" />
        <Card to="/admin/platser" label="Kommande tvättar på plats" value={s.onsite} note="Platser & hämtning" />
        <Card to="/admin/recensioner" label="Recensioner att granska" value={s.reviewsToModerate} note={s.reviewsReported ? `${s.reviewsReported} rapporterade` : 'Recensioner'} />
        <Card to="/admin/partners" label="Partners utan logotyp" value={s.partnersWithoutLogo} note="Samarbetspartners" />
        <Card to="/admin/valgorenhet" label="Välgörenhet" value={s.charityEnabled ? 'På' : 'Av'} note="Visas på webbplatsen" />
      </div>
    </div>
  );
}
