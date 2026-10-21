import { useRef, type ReactNode, type RefObject } from 'react';
import { Link } from 'react-router-dom';
import { Lock, Pencil } from 'lucide-react';
import { StepFooter, StepTitle } from './common';
import { Alert, Spinner } from '../../components/ui';
import { Turnstile, turnstileEnabled, type TurnstileHandle } from '../../components/Turnstile';
import { formatDateLong, formatDuration, formatTime } from '../../lib/datetime';
import { formatAmount, formatTotal } from '../../lib/format';
import type { Draft, StepId } from '../draft';
import type { Addon, PublicSettings, Service } from '../../types';

function Row({ label, children, onEdit }: { label: string; children: ReactNode; onEdit?: () => void }) {
  return (
    <div className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 border-b border-white/[0.07] py-4 sm:grid-cols-[180px_1fr_auto]">
      <dt className="eyebrow self-center">{label}</dt>
      <dd className="col-start-1 text-[0.95rem] break-words text-white sm:col-start-2 sm:row-start-1">{children}</dd>
      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          className="col-start-2 row-span-2 row-start-1 inline-flex items-center gap-1.5 self-center text-xs text-silver-400 hover:text-white sm:col-start-3 sm:row-span-1"
          aria-label={`Ändra ${label.toLowerCase()}`}
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden /> Ändra
        </button>
      )}
    </div>
  );
}

export function StepSummary({
  draft,
  service,
  addons,
  settings,
  submitting,
  error,
  onPrivacy,
  onCaptcha,
  captchaRef,
  onEdit,
  onBack,
  onSubmit,
  titleRef,
}: {
  draft: Draft;
  service: Service;
  addons: Addon[];
  settings: PublicSettings;
  submitting: boolean;
  error: string | null;
  onPrivacy: (v: boolean) => void;
  onCaptcha: (t: string | null) => void;
  captchaRef: RefObject<TurnstileHandle | null>;
  onEdit: (step: StepId) => void;
  onBack: () => void;
  onSubmit: () => void;
  titleRef: RefObject<HTMLHeadingElement | null>;
}) {
  const tz = settings.timezone;
  const d = draft.details;
  const addonsTotal = addons.reduce((sum, a) => sum + a.price, 0);
  const price = formatTotal(service.price, service.price_type, addonsTotal);
  const privacyRef = useRef<HTMLInputElement>(null);
  const location =
    draft.locationType === 'workshop'
      ? `Hos ${settings.company_name}${settings.company_address ? `, ${settings.company_address}` : ''}`
      : [draft.address.service_address, `${draft.address.service_postal_code} ${draft.address.service_city}`].join(', ');

  return (
    <div>
      <StepTitle ref={titleRef} sub="Kontrollera att allt stämmer innan du skickar bokningen.">
        Sammanfattning
      </StepTitle>

      <dl className="border-t border-white/[0.07]">
        <Row label="Tjänst" onEdit={() => onEdit('service')}>
          {service.name}
        </Row>
        {draft.slot && (
          <Row label="Datum och tid" onEdit={() => onEdit('time')}>
            {formatDateLong(draft.slot.start, tz)}, {formatTime(draft.slot.start, tz)}–{formatTime(draft.slot.end, tz)}
            <span className="block text-sm text-silver-400">Beräknad tid: ca {formatDuration(service.duration_minutes)}</span>
          </Row>
        )}
        <Row label="Plats" onEdit={() => onEdit('location')}>
          {location}
          {draft.locationType === 'customer_address' && draft.address.address_instructions && (
            <span className="block text-sm whitespace-pre-line text-silver-400">{draft.address.address_instructions}</span>
          )}
        </Row>
        {addons.length > 0 && (
          <Row label="Tillägg" onEdit={() => onEdit('service')}>
            <ul className="space-y-1">
              {addons.map((a) => (
                <li key={a.id} className="flex justify-between gap-4">
                  <span>{a.name}</span>
                  <span className="text-silver-300 tabular-nums">+{formatAmount(a.price)}</span>
                </li>
              ))}
            </ul>
          </Row>
        )}
        <Row label="Pris">{price ?? 'Pris enligt offert – vi ger dig ett besked utifrån bilens skick.'}</Row>
        <Row label="Kontakt" onEdit={() => onEdit('details')}>
          {d.customer_name}
          <span className="block text-sm text-silver-400">
            {d.customer_email} · {d.customer_phone}
          </span>
        </Row>
        {(d.vehicle_information || d.registration_number) && (
          <Row label="Bil" onEdit={() => onEdit('details')}>
            {[d.vehicle_information, d.registration_number.toUpperCase()].filter(Boolean).join(' · ')}
          </Row>
        )}
        {d.customer_notes && (
          <Row label="Övrigt" onEdit={() => onEdit('details')}>
            <span className="whitespace-pre-line">{d.customer_notes}</span>
          </Row>
        )}
      </dl>

      {!settings.auto_confirm && (
        <p className="mt-6 text-sm leading-relaxed text-silver-400">
          Tiden reserveras direkt när du skickar. Bokningen bekräftas därefter av oss, och vi hör av oss om något behöver
          justeras.
        </p>
      )}

      <label className="mt-6 flex cursor-pointer items-start gap-3 border border-white/[0.09] bg-ink-900 p-4">
        <input
          ref={privacyRef}
          type="checkbox"
          checked={draft.privacyAccepted}
          onChange={(e) => onPrivacy(e.target.checked)}
          className="mt-0.5 h-5 w-5 shrink-0 accent-silver-200"
          aria-describedby="privacy-desc"
        />
        <span id="privacy-desc" className="text-sm leading-relaxed text-silver-300">
          Jag har tagit del av hur mina personuppgifter behandlas i{' '}
          <Link to="/integritetspolicy" target="_blank" className="text-white underline">
            integritetspolicyn
          </Link>{' '}
          (öppnas i ny flik). Uppgifterna används för att hantera bokningen.
        </span>
      </label>

      {turnstileEnabled && (
        <div className="mt-5">
          <Turnstile ref={captchaRef} onToken={onCaptcha} />
        </div>
      )}

      {error && (
        <Alert tone="error" className="mt-5">
          {error}
        </Alert>
      )}

      <StepFooter onBack={submitting ? undefined : onBack}>
        <button
          type="button"
          onClick={() => {
            if (!draft.privacyAccepted) privacyRef.current?.focus();
            onSubmit();
          }}
          disabled={submitting}
          className="btn btn-metal min-w-[220px]"
        >
          {submitting ? (
            <>
              <Spinner className="h-4 w-4" label="Skickar bokningen" /> Skickar…
            </>
          ) : (
            <>
              <Lock className="h-4 w-4" aria-hidden /> Bekräfta bokning
            </>
          )}
        </button>
      </StepFooter>
    </div>
  );
}
