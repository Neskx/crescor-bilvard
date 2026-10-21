import { useState, type RefObject } from 'react';
import { StepFooter, StepTitle } from './common';
import { Field, fieldAria } from '../../components/ui';
import { LIMITS, type FieldErrors } from '../../../supabase/functions/_shared/validation';
import type { DetailFields } from '../draft';

const ORDER: (keyof DetailFields)[] = [
  'customer_name',
  'customer_email',
  'customer_phone',
  'vehicle_information',
  'registration_number',
  'customer_notes',
];

export function StepDetails({
  details,
  errors,
  serverErrors,
  onChange,
  onBack,
  onNext,
  titleRef,
}: {
  details: DetailFields;
  errors: FieldErrors;
  serverErrors?: FieldErrors;
  onChange: (field: keyof DetailFields, value: string) => void;
  onBack: () => void;
  onNext: () => void;
  titleRef: RefObject<HTMLHeadingElement | null>;
}) {
  const [showAll, setShowAll] = useState(Boolean(serverErrors && Object.keys(serverErrors).length));
  const [touched, setTouched] = useState<Partial<Record<keyof DetailFields, boolean>>>({});
  const err = (f: keyof DetailFields) => (showAll || touched[f] ? errors[f] ?? serverErrors?.[f] : undefined);

  const next = () => {
    const first = ORDER.find((f) => errors[f]);
    if (first) {
      setShowAll(true);
      document.getElementById(`bk-${first}`)?.focus();
      return;
    }
    onNext();
  };

  const bind = (field: keyof DetailFields) => ({
    ...fieldAria(`bk-${field}`, err(field)),
    className: 'field-input',
    value: details[field],
    onChange: (e: { target: { value: string } }) => onChange(field, e.target.value),
    onBlur: () => setTouched((t) => ({ ...t, [field]: true })),
  });

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        next();
      }}
    >
      <StepTitle ref={titleRef} sub="Vi använder uppgifterna för att bekräfta bokningen och kontakta dig vid behov.">
        Dina uppgifter
      </StepTitle>
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field id="bk-customer_name" label="Namn" error={err('customer_name')}>
            <input {...bind('customer_name')} autoComplete="name" maxLength={LIMITS.name} />
          </Field>
        </div>
        <Field id="bk-customer_email" label="E-post" error={err('customer_email')}>
          <input {...bind('customer_email')} type="email" inputMode="email" autoComplete="email" maxLength={LIMITS.email} />
        </Field>
        <Field id="bk-customer_phone" label="Telefon" error={err('customer_phone')}>
          <input {...bind('customer_phone')} type="tel" inputMode="tel" autoComplete="tel" maxLength={LIMITS.phone} />
        </Field>
        <Field id="bk-vehicle_information" label="Bilmärke och modell" optional error={err('vehicle_information')}>
          <input {...bind('vehicle_information')} maxLength={LIMITS.vehicle} placeholder="t.ex. Volvo XC60" />
        </Field>
        <Field id="bk-registration_number" label="Registreringsnummer" optional error={err('registration_number')}>
          <input
            {...bind('registration_number')}
            maxLength={LIMITS.registration}
            autoCapitalize="characters"
            spellCheck={false}
            className="field-input uppercase"
            placeholder="ABC 123"
          />
        </Field>
        <div className="sm:col-span-2">
          <Field
            id="bk-customer_notes"
            label="Övrigt"
            optional
            error={err('customer_notes')}
            hint="Berätta gärna om bilens skick eller särskilda önskemål."
          >
            <textarea
              {...bind('customer_notes')}
              aria-describedby={err('customer_notes') ? 'bk-customer_notes-error' : 'bk-customer_notes-hint'}
              className="field-input resize-y"
              rows={4}
              maxLength={LIMITS.notes}
            />
          </Field>
        </div>
      </div>
      {/* Lets Enter submit the step */}
      <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      <StepFooter onBack={onBack} onNext={next} />
    </form>
  );
}
