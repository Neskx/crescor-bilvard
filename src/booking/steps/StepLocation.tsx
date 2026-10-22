import { useState, type InputHTMLAttributes, type RefObject } from 'react';
import { Info, MapPin, Truck, Warehouse } from 'lucide-react';
import { OptionCard, StepFooter, StepTitle } from './common';
import { Field, fieldAria } from '../../components/ui';
import { LIMITS, type FieldErrors } from '../../../supabase/functions/_shared/validation';
import { needsAddress, type AddressFields } from '../draft';
import { formatAmount } from '../../lib/format';
import { DEFAULT_PICKUP_INFO, LOCATION_LABEL, locationAvailable, locationFee } from '../locations';
import type { LocationType, PublicSettings, Service } from '../../types';

function feeMeta(fee: number | null) {
  if (fee === null) return null;
  return <span className="font-semibold text-white">{fee > 0 ? `+${formatAmount(fee)}` : 'Ingen extra avgift'}</span>;
}

export function StepLocation({
  settings,
  service,
  locationType,
  address,
  errors,
  onLocation,
  onAddress,
  onBack,
  onNext,
  titleRef,
}: {
  settings: PublicSettings;
  service: Service | null;
  locationType: LocationType | null;
  address: AddressFields;
  errors: FieldErrors;
  onLocation: (v: LocationType) => void;
  onAddress: (field: keyof AddressFields, value: string) => void;
  onBack: () => void;
  onNext: () => void;
  titleRef: RefObject<HTMLHeadingElement | null>;
}) {
  const [showErrors, setShowErrors] = useState(false);
  const [touched, setTouched] = useState<Partial<Record<keyof AddressFields, boolean>>>({});
  const err = (f: keyof AddressFields) => (showErrors || touched[f] ? errors[f] : undefined);

  const next = () => {
    if (!locationType) return;
    if (needsAddress(locationType) && Object.keys(errors).length) {
      setShowErrors(true);
      const first = (['service_address', 'service_postal_code', 'service_city', 'address_instructions'] as const).find((f) => errors[f]);
      if (first) document.getElementById(`bk-${first}`)?.focus();
      return;
    }
    onNext();
  };

  const input = (field: keyof AddressFields, props: InputHTMLAttributes<HTMLInputElement>) => (
    <input
      {...fieldAria(`bk-${field}`, err(field))}
      className="field-input"
      value={address[field]}
      onChange={(e) => onAddress(field, e.target.value)}
      onBlur={() => setTouched((t) => ({ ...t, [field]: true }))}
      {...props}
    />
  );

  const options: { type: LocationType; icon: typeof MapPin; text: string; meta?: string | null }[] = [
    {
      type: 'workshop',
      icon: Warehouse,
      text: 'Du lämnar bilen hos oss och hämtar den när arbetet är klart.',
      meta: settings.company_address,
    },
    {
      type: 'pickup',
      icon: Truck,
      text: 'Vi hämtar bilen hos dig och lämnar tillbaka den när den är klar.',
      meta: settings.pickup_area_text,
    },
    {
      type: 'customer_address',
      icon: MapPin,
      text: 'Vi tvättar bilen där den står – hemma eller på jobbet.',
      meta: settings.service_area_text,
    },
  ];
  const visible = options.filter((o) => locationAvailable(settings, service, o.type).enabled);
  const pickupInfo = settings.pickup_info_text?.trim() || DEFAULT_PICKUP_INFO;

  return (
    <div>
      <StepTitle ref={titleRef} sub="Välj hur du vill att vi tar hand om bilen.">
        Välj plats
      </StepTitle>

      <div role="radiogroup" aria-label="Plats" className="grid gap-3 md:grid-cols-3">
        {visible.map((o) => {
          const { allowed } = locationAvailable(settings, service, o.type);
          const Icon = o.icon;
          const fee = feeMeta(locationFee(settings, o.type));
          return (
            <OptionCard
              key={o.type}
              selected={locationType === o.type}
              onSelect={() => onLocation(o.type)}
              disabled={!allowed}
              title={LOCATION_LABEL[o.type]}
              icon={<Icon className="h-[18px] w-[18px]" strokeWidth={1.5} />}
              meta={
                allowed && (o.meta || fee) ? (
                  <>
                    {o.meta && <span>{o.meta}</span>}
                    {fee}
                  </>
                ) : undefined
              }
            >
              {allowed ? o.text : `Erbjuds inte för ${service?.name ?? 'vald tjänst'}.`}
            </OptionCard>
          );
        })}
      </div>

      {locationType === 'workshop' && (
        <div className="mt-6 flex gap-3 border border-white/[0.08] bg-ink-900 p-5 text-sm leading-relaxed text-silver-300" aria-live="polite">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-silver-400" aria-hidden />
          <div>
            <p className="font-semibold text-white">
              {settings.company_name}
              {settings.company_address ? `, ${settings.company_address}` : ''}
            </p>
            {settings.workshop_instructions && <p className="mt-1 whitespace-pre-line">{settings.workshop_instructions}</p>}
          </div>
        </div>
      )}

      {needsAddress(locationType) && (
        <fieldset className="mt-8 grid gap-5 border-t border-white/[0.07] pt-8 sm:grid-cols-6">
          <legend className="sr-only">{locationType === 'pickup' ? 'Adress där vi hämtar bilen' : 'Adress där arbetet ska utföras'}</legend>
          {locationType === 'pickup' && (
            <div className="flex gap-3 border border-white/[0.08] bg-ink-900 p-4 text-sm leading-relaxed text-silver-300 sm:col-span-6">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-silver-400" aria-hidden />
              <p className="whitespace-pre-line">{pickupInfo}</p>
            </div>
          )}
          <div className="sm:col-span-6">
            <Field id="bk-service_address" label={locationType === 'pickup' ? 'Hämtadress' : 'Gatuadress'} error={err('service_address')}>
              {input('service_address', { autoComplete: 'street-address', maxLength: LIMITS.address })}
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field id="bk-service_postal_code" label="Postnummer" error={err('service_postal_code')}>
              {input('service_postal_code', { autoComplete: 'postal-code', inputMode: 'numeric', maxLength: LIMITS.postalCode, placeholder: '123 45' })}
            </Field>
          </div>
          <div className="sm:col-span-4">
            <Field id="bk-service_city" label="Ort" error={err('service_city')}>
              {input('service_city', { autoComplete: 'address-level2', maxLength: LIMITS.city })}
            </Field>
          </div>
          <div className="sm:col-span-6">
            <Field
              id="bk-address_instructions"
              label={locationType === 'pickup' ? 'Instruktioner för hämtning' : 'Parkering och tillgång'}
              optional
              error={err('address_instructions')}
              hint={
                locationType === 'pickup'
                  ? 'Till exempel var bilen står, var nyckeln finns eller portkod.'
                  : 'Till exempel var bilen står parkerad, portkod eller tillgång till el och vatten.'
              }
            >
              <textarea
                {...fieldAria('bk-address_instructions', err('address_instructions'), 'hint')}
                className="field-input resize-y"
                rows={3}
                maxLength={LIMITS.instructions}
                value={address.address_instructions}
                onChange={(e) => onAddress('address_instructions', e.target.value)}
              />
            </Field>
          </div>
        </fieldset>
      )}

      <StepFooter onBack={onBack} onNext={next} nextDisabled={!locationType} />
    </div>
  );
}
