import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Check, Star } from 'lucide-react';
import { SiteLayout } from '../components/SiteLayout';
import { Alert, Field, Spinner, fieldAria } from '../components/ui';
import { usePageMeta } from '../hooks/usePageMeta';
import { ApiError, getReviewInvitation, submitReview, type ReviewInvitation } from '../services/api';
import { errorMessage } from '../lib/messages';
import { formatDateLong } from '../lib/datetime';
import { cx } from '../lib/format';

const RATING_LABEL = ['', 'Inte nöjd', 'Mindre nöjd', 'Okej', 'Nöjd', 'Mycket nöjd'];

/** Personal review form, reached from the invitation e-mail after a completed booking. */
export function ReviewPage() {
  usePageMeta({ title: 'Lämna en recension', description: 'Berätta hur du upplevde ditt besök hos Crescor Bilvård.', path: '/recension', noindex: true });
  const [params] = useSearchParams();
  const token = params.get('t') ?? '';
  const [state, setState] = useState<'loading' | 'ready' | 'invalid' | 'done'>('loading');
  const [info, setInfo] = useState<ReviewInvitation | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [rating, setRating] = useState(0);
  const [name, setName] = useState('');
  const [body, setBody] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setProblem(errorMessage(new ApiError('business', 'invalid_token')));
      setState('invalid');
      return;
    }
    let active = true;
    getReviewInvitation(token)
      .then((r) => {
        if (!active) return;
        setInfo(r);
        setName(r.first_name ?? '');
        setState('ready');
      })
      .catch((e) => {
        if (!active) return;
        setProblem(errorMessage(e));
        setState('invalid');
      });
    return () => {
      active = false;
    };
  }, [token]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const errs: Record<string, string> = {};
    if (rating < 1) errs.rating = 'Välj ett betyg.';
    if (name.trim().length < 2) errs.display_name = 'Ange ett namn, till exempel ditt förnamn.';
    if (body.trim().length < 10) errs.body = 'Skriv minst några ord om din upplevelse.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    setSubmitError(null);
    try {
      await submitReview(token, { display_name: name.trim(), rating, body: body.trim() });
      setState('done');
    } catch (err) {
      const apiErr = err instanceof ApiError ? err : new ApiError('network', 'network');
      if (apiErr.code === 'invalid_input' && apiErr.field) setErrors({ [apiErr.field]: 'Kontrollera uppgiften.' });
      else if (['already_submitted', 'expired_token', 'invalid_token'].includes(apiErr.code)) {
        setProblem(errorMessage(apiErr));
        setState('invalid');
      } else setSubmitError(errorMessage(apiErr));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SiteLayout>
      <section className="bg-ink-950 pt-36 pb-24 sm:pt-44">
        <div className="container-lux max-w-2xl">
          <p className="eyebrow">Recension</p>
          <h1 className="font-display mt-4 text-5xl leading-none font-semibold text-white sm:text-6xl">
            Hur var ditt <span className="text-metal">besök?</span>
          </h1>

          <div className="panel mt-10 p-6 sm:p-9">
            {state === 'loading' && (
              <div className="flex items-center gap-3 text-silver-400">
                <Spinner label="Kontrollerar länken" /> <span className="text-sm">Kontrollerar länken…</span>
              </div>
            )}

            {state === 'invalid' && (
              <Alert tone="info" title="Länken kan inte användas">
                {problem}{' '}
                <Link to="/kontakt" className="text-white underline">
                  Kontakta oss
                </Link>{' '}
                om du har frågor.
              </Alert>
            )}

            {state === 'done' && (
              <div className="text-center">
                <span className="metal-ring mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white/[0.05]">
                  <Check className="h-7 w-7 text-white" strokeWidth={1.5} aria-hidden />
                </span>
                <p className="font-display mt-6 text-3xl font-semibold text-white">Tack för din recension!</p>
                <p className="mt-2 text-sm text-silver-400">Vi läser alla recensioner. Den publiceras på webbplatsen efter granskning.</p>
                <Link to="/" className="btn btn-ghost mt-8">
                  Till startsidan
                </Link>
              </div>
            )}

            {state === 'ready' && info && (
              <form onSubmit={submit} noValidate className="space-y-6">
                <p className="text-sm text-silver-300">
                  {info.service_name} · {formatDateLong(info.visit_date)}
                </p>

                <fieldset>
                  <legend className="field-label">Betyg</legend>
                  <div role="radiogroup" aria-label="Betyg" className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        role="radio"
                        aria-checked={rating === n}
                        aria-label={`${n} av 5 – ${RATING_LABEL[n]}`}
                        onClick={() => setRating(n)}
                        className="flex h-11 w-11 items-center justify-center transition-transform hover:scale-110"
                      >
                        <Star className={cx('h-7 w-7', n <= rating ? 'fill-silver-100 text-silver-100' : 'text-silver-600')} strokeWidth={1.5} aria-hidden />
                      </button>
                    ))}
                    <span className="ml-3 text-sm text-silver-300" aria-live="polite">
                      {RATING_LABEL[rating]}
                    </span>
                  </div>
                  {errors.rating && <p className="field-error">{errors.rating}</p>}
                </fieldset>

                <Field id="rv-name" label="Namn som visas" error={errors.display_name} hint="Till exempel ditt förnamn. Visas tillsammans med recensionen.">
                  <input {...fieldAria('rv-name', errors.display_name, 'hint')} className="field-input" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
                </Field>

                <Field id="rv-body" label="Din recension" error={errors.body}>
                  <textarea {...fieldAria('rv-body', errors.body)} className="field-input resize-y" rows={6} maxLength={1500} value={body} onChange={(e) => setBody(e.target.value)} />
                </Field>

                <p className="text-xs leading-relaxed text-silver-500">
                  Recensionen granskas innan den publiceras. Vi visar ditt valda namn, betyg, text, tjänst och månad – aldrig dina
                  kontaktuppgifter. Läs mer i vår{' '}
                  <Link to="/integritetspolicy" className="underline">
                    integritetspolicy
                  </Link>
                  .
                </p>

                {submitError && <Alert tone="error">{submitError}</Alert>}

                <button type="submit" className="btn btn-metal w-full sm:w-auto" disabled={busy}>
                  {busy && <Spinner className="h-4 w-4" label="Skickar" />} Skicka recension
                </button>
              </form>
            )}
          </div>
        </div>
      </section>
    </SiteLayout>
  );
}
