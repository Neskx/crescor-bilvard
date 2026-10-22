import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Stepper } from './Stepper';
import { StepService } from './steps/StepService';
import { StepLocation } from './steps/StepLocation';
import { LOCATION_LABEL, locationAvailable } from './locations';
import { StepDateTime } from './steps/StepDateTime';
import { StepDetails } from './steps/StepDetails';
import { StepCharity } from './steps/StepCharity';
import { StepSummary } from './steps/StepSummary';
import { BookingSuccess, type SuccessInfo } from './steps/BookingSuccess';
import {
  addressErrors,
  clearDraft,
  detailErrors,
  isStepComplete,
  loadDraft,
  maxReachableIndex,
  needsAddress,
  nextStep,
  reducer,
  saveDraft,
  stepsFor,
  type Draft,
  type FlowContext,
  type StepId,
} from './draft';
import { invalidateSlots } from './useSlots';
import { onServiceBookingRequest } from './bookingEvents';
import { Alert } from '../components/ui';
import { turnstileEnabled, type TurnstileHandle } from '../components/Turnstile';
import { ApiError, createBooking } from '../services/api';
import { errorMessage } from '../lib/messages';
import type { FieldErrors } from '../../supabase/functions/_shared/validation';
import type { LocationType, PublicConfig } from '../types';

const SUCCESS_KEY = 'crescor-booking-success';
const ADDRESS_FIELDS = ['service_address', 'service_postal_code', 'service_city', 'address_instructions'];
const TIME_CODES = ['slot_unavailable', 'time_in_past', 'too_soon', 'too_far', 'outside_business_hours'];
const LOCATIONS: LocationType[] = ['workshop', 'pickup', 'customer_address'];

function loadSuccess(): SuccessInfo | null {
  try {
    const raw = sessionStorage.getItem(SUCCESS_KEY);
    return raw ? (JSON.parse(raw) as SuccessInfo) : null;
  } catch {
    return null;
  }
}

export function BookingFlow({ config, reload }: { config: PublicConfig; reload: () => Promise<PublicConfig | null> }) {
  const { settings, services, addons, business_hours, charities } = config;
  const [draft, dispatch] = useReducer(reducer, undefined, loadDraft);
  const [success, setSuccess] = useState<SuccessInfo | null>(loadSuccess);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [serverFieldErrors, setServerFieldErrors] = useState<FieldErrors | undefined>();
  const [notice, setNotice] = useState<string | null>(null);
  const [captcha, setCaptcha] = useState<string | null>(null);
  const captchaRef = useRef<TurnstileHandle>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const inFlight = useRef(false);
  const lastStep = useRef(draft.step);

  const ctx: FlowContext = useMemo(
    () => ({
      charityStep: Boolean(settings.charity_enabled) && charities.length > 0,
      pickupPrefixes: settings.pickup_postal_prefixes ?? [],
      mobilePrefixes: settings.mobile_postal_prefixes ?? [],
    }),
    [settings, charities],
  );
  const steps = stepsFor(ctx);
  const stepIndex = (s: StepId) => steps.findIndex((x) => x.id === s);

  const service = services.find((s) => s.id === draft.serviceId) ?? null;
  const chosenAddons = addons.filter((a) => draft.addonIds.includes(a.id));
  const chosenCharity = charities.find((c) => c.id === draft.charity) ?? null;

  useEffect(() => saveDraft(draft), [draft]);

  // ---- Keep the draft consistent with the live configuration ------------------
  // (service disabled, location switched off or not offered for the service,
  //  cause deactivated, chosen time passed, …)
  useEffect(() => {
    const patch: Partial<Draft> = {};
    let message: string | null = null;

    if (draft.serviceId && !services.some((s) => s.id === draft.serviceId)) {
      Object.assign(patch, { serviceId: null, slot: null });
      message = 'Den tjänst du hade valt går inte längre att boka. Välj en annan tjänst.';
    }
    if (!(patch.serviceId ?? draft.serviceId) && services.length === 1) {
      Object.assign(patch, { serviceId: services[0].id, slot: null });
    }
    const validAddons = draft.addonIds.filter((id) => addons.some((a) => a.id === id));
    if (validAddons.length !== draft.addonIds.length) {
      patch.addonIds = validAddons;
      message ??= 'Ett eller flera av dina valda tillägg erbjuds inte längre och har tagits bort.';
    }

    const svc = services.find((s) => s.id === (patch.serviceId !== undefined ? patch.serviceId : draft.serviceId)) ?? null;
    const usable = (t: LocationType) => {
      const a = locationAvailable(settings, svc, t);
      return a.enabled && a.allowed;
    };
    const options = LOCATIONS.filter(usable);
    if (draft.locationType && !usable(draft.locationType)) {
      Object.assign(patch, { locationType: options.length === 1 ? options[0] : null, slot: null });
      message ??= 'Det platsalternativ du valt är inte längre tillgängligt för den här tjänsten. Kontrollera ditt val.';
    } else if (!draft.locationType && options.length === 1) {
      patch.locationType = options[0];
    }

    if (draft.charity && draft.charity !== 'none' && !charities.some((c) => c.id === draft.charity)) {
      patch.charity = null;
      if (ctx.charityStep) message ??= 'Det ändamål du valt finns inte längre med. Välj ett annat ändamål.';
    }
    if (draft.slot && new Date(draft.slot.start).getTime() <= Date.now()) {
      patch.slot = null;
      message ??= 'Den tid du hade valt har passerat. Välj en ny tid.';
    }

    const merged = { ...draft, ...patch };
    const reachable = maxReachableIndex(merged, ctx);
    const idx = steps.findIndex((s) => s.id === merged.step);
    if (idx === -1 || idx > reachable) patch.step = steps[reachable].id;

    if (Object.keys(patch).length) dispatch({ type: 'repair', patch });
    if (message) setNotice(message);
    // Only re-run when the configuration changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);

  // /boka?tjanst=<slug> (links from service pages) pre-selects a service once.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const slug = params.get('tjanst');
    if (!slug) return;
    const match = services.find((s) => s.slug === slug);
    if (match) {
      setSuccess(null);
      dispatch({ type: 'selectService', id: match.id });
      dispatch({ type: 'goTo', step: 'location' });
    }
    params.delete('tjanst');
    const qs = params.toString();
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`);
  }, [services]);

  // "Boka" buttons elsewhere on the page pre-select a service.
  useEffect(
    () =>
      onServiceBookingRequest((id) => {
        if (!services.some((s) => s.id === id)) return;
        setSuccess(null);
        dispatch({ type: 'selectService', id });
        dispatch({ type: 'goTo', step: 'location' });
      }),
    [services],
  );

  // A newly selected service may not be offered at the chosen location.
  useEffect(() => {
    if (!draft.locationType || !service) return;
    const a = locationAvailable(settings, service, draft.locationType);
    if (!a.allowed) {
      dispatch({ type: 'setLocation', value: null });
      setNotice(`${LOCATION_LABEL[draft.locationType]} erbjuds inte för ${service.name}. Välj ett annat platsalternativ.`);
    }
  }, [service, draft.locationType, settings]);

  // Move focus to the new step's heading — only when the step actually
  // changes, never on page load (also safe under StrictMode's double effects).
  useEffect(() => {
    if (lastStep.current === draft.step) return;
    lastStep.current = draft.step;
    titleRef.current?.focus({ preventScroll: true });
    const top = rootRef.current?.getBoundingClientRect().top ?? 0;
    if (top < 0 || top > window.innerHeight * 0.6) rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [draft.step]);

  // Warn before leaving while a booking is being sent.
  useEffect(() => {
    if (!submitting) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [submitting]);

  const go = useCallback((step: StepId) => {
    setSubmitError(null);
    dispatch({ type: 'goTo', step });
  }, []);

  const onSlot = useCallback((slot: { start: string; end: string } | null) => dispatch({ type: 'selectSlot', slot }), []);
  const onWeek = useCallback((weekStart: string) => dispatch({ type: 'setWeek', weekStart }), []);

  const locationText = (d: Draft) => {
    if (d.locationType === 'workshop') return `${settings.company_name}${settings.company_address ? `, ${settings.company_address}` : ''}`;
    const address = `${d.address.service_address}, ${d.address.service_postal_code} ${d.address.service_city}`;
    return d.locationType === 'pickup' ? `Vi hämtar bilen: ${address}` : `Tvätt på plats: ${address}`;
  };

  // ---- Submit ---------------------------------------------------------------------
  async function submit() {
    if (inFlight.current) return; // guards rapid double clicks synchronously
    setSubmitError(null);

    for (const s of steps.slice(0, -1)) {
      if (!isStepComplete(draft, s.id, ctx)) {
        go(s.id);
        return;
      }
    }
    if (!draft.privacyAccepted) {
      setSubmitError('Du behöver godkänna integritetsinformationen innan du skickar bokningen.');
      return;
    }
    if (turnstileEnabled && !captcha) {
      setSubmitError('Vänta tills säkerhetskontrollen är klar och försök igen.');
      return;
    }
    if (!service || !draft.slot || !draft.locationType) return;

    inFlight.current = true;
    setSubmitting(true);
    const d = draft.details;
    try {
      const result = await createBooking({
        idempotency_key: draft.idempotencyKey,
        service_id: service.id,
        addon_ids: chosenAddons.map((a) => a.id),
        charity_id: ctx.charityStep && chosenCharity ? chosenCharity.id : undefined,
        start_time: draft.slot.start,
        location_type: draft.locationType,
        customer_name: d.customer_name,
        customer_email: d.customer_email,
        customer_phone: d.customer_phone,
        vehicle_information: d.vehicle_information || undefined,
        registration_number: d.registration_number || undefined,
        customer_notes: d.customer_notes || undefined,
        ...(needsAddress(draft.locationType) ? draft.address : {}),
        privacy_accepted: true,
        captcha_token: captcha ?? undefined,
      });

      const info: SuccessInfo = { ...result, customer_email: d.customer_email, location: locationText(draft) };
      try {
        sessionStorage.setItem(SUCCESS_KEY, JSON.stringify(info));
      } catch {
        /* ignore */
      }
      clearDraft();
      invalidateSlots();
      dispatch({ type: 'reset' });
      setSuccess(info);
      setNotice(null);
      rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError('network', 'network');
      const msg = errorMessage(err);

      if (TIME_CODES.includes(err.code)) {
        invalidateSlots();
        dispatch({ type: 'selectSlot', slot: null });
        setNotice(msg);
        go('time');
      } else if (err.code === 'service_unavailable') {
        await reload();
        dispatch({ type: 'repair', patch: { serviceId: null, slot: null } });
        setNotice(msg);
        go('service');
      } else if (err.code === 'addon_unavailable') {
        // The configuration effect drops add-ons that are no longer offered.
        await reload();
        setNotice(msg);
        go('service');
      } else if (err.code === 'location_unavailable') {
        await reload();
        dispatch({ type: 'setLocation', value: null });
        setNotice(msg);
        go('location');
      } else if (err.code === 'postal_code_unsupported') {
        await reload();
        setServerFieldErrors({ service_postal_code: msg });
        setNotice(msg);
        go('location');
      } else if (err.code === 'charity_unavailable') {
        // Nothing else is lost: only the cause needs to be chosen again.
        await reload();
        dispatch({ type: 'setCharity', value: null });
        setNotice(msg);
        go('charity');
      } else if (err.code === 'booking_disabled') {
        setSubmitError(msg);
        void reload();
      } else if (err.code === 'invalid_input' && (err.fieldErrors || err.field)) {
        const fields = err.fieldErrors ?? { [err.field!]: 'Kontrollera uppgiften.' };
        setServerFieldErrors(fields);
        setNotice(msg);
        go(Object.keys(fields).some((f) => ADDRESS_FIELDS.includes(f)) ? 'location' : Object.keys(fields).includes('charity_id') ? 'charity' : 'details');
      } else if (err.kind === 'timeout' || err.kind === 'network' || err.kind === 'offline') {
        setSubmitError(
          `${msg} Om anslutningen bröts medan bokningen skickades kan den redan vara registrerad – försök igen, du blir inte dubbelbokad.`,
        );
      } else {
        setSubmitError(msg);
      }
      captchaRef.current?.reset();
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  // ---- Render -----------------------------------------------------------------------
  if (success) {
    return (
      <div ref={rootRef} data-anchor>
        <BookingSuccess
          result={success}
          settings={settings}
          onNew={() => {
            try {
              sessionStorage.removeItem(SUCCESS_KEY);
            } catch {
              /* ignore */
            }
            setSuccess(null);
          }}
        />
      </div>
    );
  }

  const step = stepIndex(draft.step) === -1 ? steps[0].id : draft.step;
  const back = (s: StepId) => () => go(nextStep(s, ctx, -1));
  const forward = (s: StepId) => () => go(nextStep(s, ctx, 1));
  const locationErrors = { ...addressErrors(draft, ctx), ...Object.fromEntries(Object.entries(serverFieldErrors ?? {}).filter(([k]) => ADDRESS_FIELDS.includes(k))) };

  return (
    <div ref={rootRef} data-anchor>
      <Stepper steps={steps} current={step} maxReachable={maxReachableIndex(draft, ctx)} onGo={go} />

      {notice && (
        <Alert tone="warning" className="mb-8" action={<button type="button" className="text-xs underline" onClick={() => setNotice(null)}>Stäng</button>}>
          {notice}
        </Alert>
      )}

      {step === 'service' && (
        <StepService
          services={services}
          addons={addons}
          selectedId={draft.serviceId}
          selectedAddonIds={draft.addonIds}
          onSelect={(id) => dispatch({ type: 'selectService', id })}
          onToggleAddon={(id) => dispatch({ type: 'toggleAddon', id })}
          onNext={forward('service')}
          titleRef={titleRef}
        />
      )}

      {step === 'location' && (
        <StepLocation
          settings={settings}
          service={service}
          locationType={draft.locationType}
          address={draft.address}
          errors={locationErrors}
          onLocation={(value) => {
            setServerFieldErrors(undefined);
            dispatch({ type: 'setLocation', value });
          }}
          onAddress={(field, value) => {
            setServerFieldErrors(undefined);
            dispatch({ type: 'setAddress', field, value });
          }}
          onBack={back('location')}
          onNext={forward('location')}
          titleRef={titleRef}
        />
      )}

      {step === 'time' && service && (
        <StepDateTime
          service={service}
          location={draft.locationType}
          settings={settings}
          businessHours={business_hours}
          weekStart={draft.weekStart}
          slot={draft.slot}
          onWeek={onWeek}
          onSlot={onSlot}
          onBack={back('time')}
          onNext={() => {
            setNotice(null);
            forward('time')();
          }}
          titleRef={titleRef}
        />
      )}

      {step === 'details' && (
        <StepDetails
          details={draft.details}
          errors={detailErrors(draft)}
          serverErrors={serverFieldErrors}
          onChange={(field, value) => {
            setServerFieldErrors(undefined);
            dispatch({ type: 'setDetail', field, value });
          }}
          onBack={back('details')}
          onNext={forward('details')}
          titleRef={titleRef}
        />
      )}

      {step === 'charity' && ctx.charityStep && (
        <StepCharity
          charities={charities}
          value={draft.charity}
          onChange={(value) => dispatch({ type: 'setCharity', value })}
          onBack={back('charity')}
          onNext={forward('charity')}
          titleRef={titleRef}
        />
      )}

      {step === 'summary' && service && (
        <StepSummary
          draft={draft}
          service={service}
          addons={chosenAddons}
          settings={settings}
          charity={chosenCharity}
          charityStep={ctx.charityStep}
          submitting={submitting}
          error={submitError}
          onPrivacy={(value) => {
            setSubmitError(null);
            dispatch({ type: 'setPrivacy', value });
          }}
          onCaptcha={setCaptcha}
          captchaRef={captchaRef}
          onEdit={go}
          onBack={back('summary')}
          onSubmit={() => void submit()}
          titleRef={titleRef}
        />
      )}
    </div>
  );
}
