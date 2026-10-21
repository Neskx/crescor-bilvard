import { CalendarCheck, Clock3, ShieldCheck } from 'lucide-react';
import { SiteLayout } from '../components/SiteLayout';
import { PageHero } from '../components/PageHero';
import { BookingSection } from '../booking/BookingSection';
import { usePageMeta } from '../hooks/usePageMeta';
import { usePublicConfig } from '../hooks/usePublicConfig';

export function BookingPage() {
  usePageMeta({
    title: 'Boka bilvård online',
    description: 'Se lediga tider i realtid och boka biltvätt med valfria tillägg hos Crescor Bilvård direkt online.',
    path: '/boka',
  });
  const { config } = usePublicConfig();
  const s = config.settings;

  const facts = [
    { icon: CalendarCheck, title: 'Lediga tider i realtid', text: 'Kalendern visar aktuella tider direkt från vårt bokningssystem.' },
    {
      icon: ShieldCheck,
      title: 'Tiden reserveras direkt',
      text: s.auto_confirm ? 'Bokningen bekräftas direkt när du skickar den.' : 'Vi bekräftar bokningen så snart vi gått igenom den.',
    },
    {
      icon: Clock3,
      title: 'Boka i god tid',
      text: s.booking_notice_hours > 0 ? `Onlinebokning kräver minst ${s.booking_notice_hours} timmars framförhållning.` : 'Boka när det passar dig.',
    },
  ];

  return (
    <SiteLayout bookingBar={false}>
      <PageHero
        eyebrow="Boka tid"
        title={
          <>
            Boka din tid <span className="text-metal">online.</span>
          </>
        }
        lead="Välj tjänst, plats och en tid som passar dig. Det tar bara ett par minuter."
        image="/images/service-polering.webp"
        crumbs={[{ label: 'Boka tid' }]}
      >
        <ul className="grid max-w-4xl gap-px overflow-hidden border border-white/10 bg-white/10 sm:grid-cols-3">
          {facts.map(({ icon: Icon, title, text }) => (
            <li key={title} className="bg-ink-950/80 p-5 backdrop-blur">
              <Icon className="h-5 w-5 text-silver-300" strokeWidth={1.5} aria-hidden />
              <p className="mt-3 text-sm font-semibold text-white">{title}</p>
              <p className="mt-1 text-xs leading-relaxed text-silver-400">{text}</p>
            </li>
          ))}
        </ul>
      </PageHero>
      <BookingSection showHeading={false} />
    </SiteLayout>
  );
}
