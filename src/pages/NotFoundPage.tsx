import { Link } from 'react-router-dom';
import { SiteLayout } from '../components/SiteLayout';
import { usePageMeta } from '../hooks/usePageMeta';

export function NotFoundContent({ title = 'Sidan finns inte.', text = 'Länken kan vara felaktig eller så har sidan flyttats.' }: { title?: string; text?: string }) {
  const [first, ...rest] = title.split(' ');
  return (
    <div className="flex min-h-[80vh] items-center bg-ink-950 pt-24">
      <div className="container-lux py-24">
        <p className="eyebrow">404</p>
        <h1 className="font-display mt-4 text-6xl font-semibold text-white sm:text-8xl">
          {first} <span className="text-metal">{rest.join(' ')}</span>
        </h1>
        <p className="mt-6 max-w-md text-silver-400">{text}</p>
        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <Link to="/" className="btn btn-metal">
            Till startsidan
          </Link>
          <Link to="/tjanster" className="btn btn-ghost">
            Se våra tjänster
          </Link>
        </div>
      </div>
    </div>
  );
}

export function NotFoundPage() {
  usePageMeta({ title: 'Sidan hittades inte', description: 'Sidan kunde inte hittas.', path: '/404', noindex: true });
  return (
    <SiteLayout bookingBar={false}>
      <NotFoundContent />
    </SiteLayout>
  );
}
