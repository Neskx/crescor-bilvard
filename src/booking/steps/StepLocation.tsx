import { useState, type InputHTMLAttributes, type RefObject } from 'react';
import { MapPin, Truck } from 'lucide-react';
import { OptionCard, StepFooter, StepTitle } from './common';
import { Field, fieldAria } from '../../components/ui';
import { LIMITS, type FieldErrors } from '../../../supabase/functions/_shared/validation';
import type { AddressFields } from '../draft';
import type { LocationType, PublicSettings } from '../../types';

export function StepLocation({
  settings,
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
    if (locationType === 'customer_address' && Object.keys(errors).length) {
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

  return (
    <div>
      <StepTitle ref={titleRef} sub="Välj var arbetet ska utföras.">
        Var ska vi utföra arbetet?
      </StepTitle>

      <div role="radiogroup" aria-label="Plats" className="grid gap-3 md:grid-cols-2">
        {settings.workshop_available && (
          <OptionCard
            selected={locationType === 'workshop'}
            onSelect={() => onLocation('workshop')}
            title={`Hos ${settings.company_name}`}
            meta={
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" aria-hidden /> {settings.company_address}
              </span>
            }
          >
            Du lämnar bilen hos oss och hämtar den när arbetet är klart.
          </OptionCard>
        )}
        {settings.mobile_available && (
          <OptionCard
            selected={locationType === 'customer_address'}
            onSelect={() => onLocation('customer_address')}
            title="På din adress"
            meta={
              settings.service_area_text ? (
                <span className="inline-flex items-center gap-1.5">
                  <Truck className="h-3.5 w-3.5" aria-hidden /> {settings.service_area_text}
                </span>
              ) : undefined
            }
          >
            Vi kommer till dig – hemma eller på jobbet.
          </OptionCard>
        )}
      </div>

      {locationType === 'customer_address' && (
        <fieldset className="mt-8 grid gap-5 border-t border-white/[0.07] pt-8 sm:grid-cols-6">
          <legend className="sr-only">Adress där arbetet ska utföras</legend>
          <div className="sm:col-span-6">
            <Field id="bk-service_address" label="Gatuadress" error={err('service_address')}>
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
              label="Instruktioner"
              optional
              error={err('address_instructions')}
              hint="Till exempel portkod, var bilen står parkerad eller tillgång till el och vatten."
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
