import { Link } from 'react-router-dom';
import { Logo } from './logo/Logo';
import { NAV_LINKS } from './Navbar';
import { usePublicConfig } from '../hooks/usePublicConfig';
import { telHref } from '../lib/format';

const YEAR = new Date().getFullYear();

export function Footer() {
  const { config } = usePublicConfig();
  const s = config.settings;

  return (
    <footer className="relative border-t border-white/[0.07] bg-ink-950">
      <div className="container-lux grid gap-12 py-16 sm:grid-cols-2 md:grid-cols-12 md:gap-10 md:py-20">
        <div className="sm:col-span-2 md:col-span-4">
          <Link to="/" aria-label="Crescor Bilvård – till startsidan" className="inline-block">
            <Logo className="h-auto w-60 sm:w-72" />
          </Link>
          <p className="mt-8 max-w-sm text-sm leading-relaxed text-silver-400">
            Professionell bilvård med fokus på detaljer, noggrannhet och en smidig upplevelse från bokning till färdig bil.
          </p>
        </div>

        <nav aria-label="Sidfot" className="md:col-span-2">
          <p className="eyebrow">Navigation</p>
          <ul className="mt-5 space-y-3 text-sm">
            {NAV_LINKS.map((l) => (
              <li key={l.to}>
                <Link to={l.to} className="text-silver-300 transition-colors hover:text-white">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="Tjänster" className="md:col-span-3">
          <p className="eyebrow">Tjänster</p>
          <ul className="mt-5 space-y-3 text-sm">
            {config.services.map((v) => (
              <li key={v.id}>
                <Link to={`/tjanster/${encodeURIComponent(v.slug)}`} className="text-silver-300 transition-colors hover:text-white">
                  {v.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="md:col-span-3">
          <p className="eyebrow">Kontakt</p>
          <ul className="mt-5 space-y-3 text-sm text-silver-300">
            {s.company_phone && (
              <li>
                <a href={telHref(s.company_phone)} className="hover:text-white">
                  {s.company_phone}
                </a>
              </li>
            )}
            {s.company_email && (
              <li>
                <a href={`mailto:${s.company_email}`} className="break-all hover:text-white">
                  {s.company_email}
                </a>
              </li>
            )}
            {s.company_address && <li>{s.company_address}</li>}
            {s.opening_hours_text && <li>{s.opening_hours_text}</li>}
            {!s.company_phone && !s.company_email && (
              <li>
                <Link to="/kontakt" className="hover:text-white">
                  Skicka ett meddelande via kontaktformuläret
                </Link>
              </li>
            )}
          </ul>
        </div>
      </div>

      <div className="hairline" />
      <div className="container-lux flex flex-col gap-4 py-7 text-xs text-silver-500 sm:flex-row sm:items-center sm:justify-between">
        <p>
          © {YEAR} {s.company_name}
          {s.org_number ? ` · Org.nr ${s.org_number}` : ''}. Alla rättigheter förbehållna.
        </p>
        <ul className="flex flex-wrap gap-x-6 gap-y-2">
          <li>
            <Link to="/integritetspolicy" className="hover:text-white">
              Integritetspolicy
            </Link>
          </li>
          <li>
            <Link to="/integritetspolicy#cookies" className="hover:text-white">
              Cookies
            </Link>
          </li>
        </ul>
      </div>
    </footer>
  );
}
