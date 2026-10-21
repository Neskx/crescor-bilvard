import { useRef, useState, type FormEvent } from 'react';
import { Clock, Mail, MapPin, Phone, Send } from 'lucide-react';
import { Alert, Field, SectionHeading, Spinner, fieldAria } from '../components/ui';
import { Turnstile, turnstileEnabled, type TurnstileHandle } from '../components/Turnstile';
import { usePublicConfig } from '../hooks/usePublicConfig';
import { useReveal } from '../hooks/useReveal';
import { sendContactMessage, ApiError } from '../services/api';
import { errorMessage } from '../lib/messages';
import { telHref } from '../lib/format';
import { LIMITS, validateContactInput, type FieldErrors } from '../../supabase/functions/_shared/validation';

const EMPTY = { name: '', email: '', phone: '', message: '' };

export function Contact() {
  const ref = useReveal<HTMLElement>();
  const { config, live } = usePublicConfig();
  const s = config.settings;
  const [form, setForm] = useState(EMPTY);
  const [honeypot, setHoneypot] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [failure, setFailure] = useState<string | null>(null);
  const [captcha, setCaptcha] = useState<string | null>(null);
  const captchaRef = useRef<TurnstileHandle>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const set = (key: keyof typeof EMPTY) => (e: { target: { value: string } }) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    if (errors[key]) setErrors((er) => ({ ...er, [key]: undefined }));
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (state === 'sending') return;
    setFailure(null);
    const parsed = validateContactInput(form);
    if (!parsed.ok) {
      setErrors(parsed.errors);
      const first = Object.keys(parsed.errors)[0];
      formRef.current?.querySelector<HTMLElement>(`#contact-${first}`)?.focus();
      return;
    }
    if (turnstileEnabled && !captcha) {
      setFailure('Vänta tills säkerhetskontrollen har laddats och försök igen.');
      return;
    }
    setState('sending');
    try {
      await sendContactMessage({ ...parsed.value, captcha_token: captcha ?? undefined, website: honeypot });
      setState('sent');
      setForm(EMPTY);
    } catch (err) {
      setState('idle');
      if (err instanceof ApiError && err.fieldErrors) setErrors(err.fieldErrors);
      setFailure(errorMessage(err));
      captchaRef.current?.reset();
    }
  }

  const hasContact = s.company_phone || s.company_email || s.company_address || s.opening_hours_text;
  const mapsHref = s.company_address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.company_address)}` : null;

  return (
    <section ref={ref} id="kontakt" aria-labelledby="kontakt-title" className="on-light relative bg-silver-50 py-24 text-ink-950 sm:py-32">
      <div className="container-lux grid gap-14 lg:grid-cols-12 lg:gap-20">
        <div className="lg:col-span-5">
          <SectionHeading
            id="kontakt-title"
            light
            eyebrow="Kontakt"
            title={
              <>
                Hör av dig <br />
                <span className="text-metal-dark">till oss.</span>
              </>
            }
            lead="Har du frågor om en behandling eller vill du ha ett upplägg för din bil? Skicka ett meddelande så återkommer vi."
          />
          <ul className="reveal mt-10 space-y-5 text-[0.95rem]">
            {s.company_phone && (
              <li className="flex items-start gap-4">
                <Phone className="mt-0.5 h-5 w-5 text-ink-600" strokeWidth={1.5} aria-hidden />
                <div>
                  <p className="eyebrow !text-silver-600">Telefon</p>
                  <a href={telHref(s.company_phone)} className="mt-1 block font-medium hover:underline">
                    {s.company_phone}
                  </a>
                </div>
              </li>
            )}
            {s.company_email && (
              <li className="flex items-start gap-4">
                <Mail className="mt-0.5 h-5 w-5 text-ink-600" strokeWidth={1.5} aria-hidden />
                <div>
                  <p className="eyebrow !text-silver-600">E-post</p>
                  <a href={`mailto:${s.company_email}`} className="mt-1 block font-medium break-all hover:underline">
                    {s.company_email}
                  </a>
                </div>
              </li>
            )}
            {s.company_address && (
              <li className="flex items-start gap-4">
                <MapPin className="mt-0.5 h-5 w-5 text-ink-600" strokeWidth={1.5} aria-hidden />
                <div>
                  <p className="eyebrow !text-silver-600">Adress</p>
                  <p className="mt-1 font-medium">{s.company_address}</p>
                  {mapsHref && (
                    <a href={mapsHref} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-sm text-ink-600 underline">
                      Visa på karta (öppnas i Google Maps)
                    </a>
                  )}
                </div>
              </li>
            )}
            {s.opening_hours_text && (
              <li className="flex items-start gap-4">
                <Clock className="mt-0.5 h-5 w-5 text-ink-600" strokeWidth={1.5} aria-hidden />
                <div>
                  <p className="eyebrow !text-silver-600">Öppettider</p>
                  <p className="mt-1 font-medium whitespace-pre-line">{s.opening_hours_text}</p>
                </div>
              </li>
            )}
            {!hasContact && (
              <li className="text-ink-600">Använd formuläret så återkommer vi till dig så snart vi kan.</li>
            )}
          </ul>
        </div>

        <div className="reveal lg:col-span-7">
          <div className="border border-ink-950/10 bg-white p-6 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.35)] sm:p-10">
            {state === 'sent' ? (
              <div role="status" className="py-10 text-center">
                <p className="font-display text-4xl font-semibold">Tack för ditt meddelande!</p>
                <p className="mx-auto mt-4 max-w-md text-ink-600">
                  Vi har tagit emot det och återkommer så snart vi kan.
                </p>
                <button type="button" onClick={() => setState('idle')} className="btn btn-dark mt-8">
                  Skicka ett nytt meddelande
                </button>
              </div>
            ) : (
              <form ref={formRef} onSubmit={submit} noValidate className="grid gap-5 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Field id="contact-name" label="Namn" error={errors.name}>
                    <input {...fieldAria('contact-name', errors.name)} className="field-input" autoComplete="name" maxLength={LIMITS.name} value={form.name} onChange={set('name')} />
                  </Field>
                </div>
                <Field id="contact-email" label="E-post" error={errors.email}>
                  <input {...fieldAria('contact-email', errors.email)} type="email" inputMode="email" className="field-input" autoComplete="email" maxLength={LIMITS.email} value={form.email} onChange={set('email')} />
                </Field>
                <Field id="contact-phone" label="Telefon" optional error={errors.phone}>
                  <input {...fieldAria('contact-phone', errors.phone)} type="tel" inputMode="tel" className="field-input" autoComplete="tel" maxLength={LIMITS.phone} value={form.phone} onChange={set('phone')} />
                </Field>
                <div className="sm:col-span-2">
                  <Field id="contact-message" label="Meddelande" error={errors.message}>
                    <textarea {...fieldAria('contact-message', errors.message)} rows={5} className="field-input resize-y" maxLength={LIMITS.contactMessage} value={form.message} onChange={set('message')} />
                  </Field>
                </div>
                {/* Honeypot for bots — hidden from people and assistive tech */}
                <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
                  <label>
                    Webbplats
                    <input tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} name="website" />
                  </label>
                </div>
                <div className="sm:col-span-2">
                  <Turnstile ref={captchaRef} onToken={setCaptcha} theme="light" />
                </div>
                {failure && (
                  <div className="sm:col-span-2">
                    <Alert tone="error">{failure}</Alert>
                  </div>
                )}
                <div className="flex flex-col gap-4 sm:col-span-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs leading-relaxed text-ink-600">
                    Vi använder dina uppgifter enbart för att besvara ditt meddelande. Läs mer i vår{' '}
                    <a href="/integritetspolicy" className="underline">
                      integritetspolicy
                    </a>
                    .
                  </p>
                  <button type="submit" className="btn btn-dark shrink-0" disabled={state === 'sending' || !live}>
                    {state === 'sending' ? <Spinner className="h-4 w-4" label="Skickar" /> : <Send className="h-4 w-4" aria-hidden />}
                    {state === 'sending' ? 'Skickar…' : 'Skicka meddelande'}
                  </button>
                </div>
                {!live && (
                  <p className="text-xs text-ink-600 sm:col-span-2">Formuläret är inte tillgängligt just nu. Försök igen senare.</p>
                )}
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
