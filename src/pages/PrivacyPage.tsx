import type { ReactNode } from 'react';
import { SiteLayout } from '../components/SiteLayout';
import { usePublicConfig } from '../hooks/usePublicConfig';
import { usePageMeta } from '../hooks/usePageMeta';
import { turnstileEnabled } from '../components/Turnstile';

/*
 * EDITABLE PRIVACY POLICY TEMPLATE (Swedish).
 * This text is a starting point that matches how the website technically
 * handles data. It is NOT legal advice and does not by itself make the business
 * GDPR-compliant. Have it reviewed and adjust it to the business's routines
 * before publishing. Company details are filled in from /admin → Inställningar.
 */

const LAST_UPDATED = '2026-10-19';

function H({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <h2 id={id} className="font-display mt-14 scroll-mt-28 text-3xl font-semibold text-white">
      {children}
    </h2>
  );
}

export function PrivacyPage() {
  const { config } = usePublicConfig();
  const s = config.settings;
  const retentionYears = 2; // matches the default retention_days (730) in business_settings

  usePageMeta({
    title: 'Integritetspolicy',
    description: 'Hur Crescor Bilvård behandlar personuppgifter vid bokning och kontakt, och vilka rättigheter du har.',
    path: '/integritetspolicy',
  });

  const controller = [s.company_name, s.org_number ? `org.nr ${s.org_number}` : null, s.company_address].filter(Boolean).join(', ');
  const contact = [s.company_email, s.company_phone].filter(Boolean).join(' eller ');

  return (
    <SiteLayout bookingBar={false}>
      <div className="bg-ink-950 pt-32 pb-24">
        <article className="container-lux max-w-3xl text-[0.98rem] leading-relaxed text-silver-300 [&_li]:mt-2 [&_p]:mt-4 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-6">
          <p className="eyebrow">Integritet</p>
          <h1 className="font-display mt-4 text-5xl font-semibold text-white sm:text-6xl">Integritetspolicy</h1>
          <p className="text-sm text-silver-500">Senast uppdaterad: {LAST_UPDATED}</p>

          <p>
            Vi värnar om din integritet. Här beskriver vi vilka personuppgifter vi samlar in när du använder webbplatsen,
            varför vi gör det och vilka rättigheter du har.
          </p>

          <H>Personuppgiftsansvarig</H>
          <p>
            Personuppgiftsansvarig är {controller || s.company_name}.
            {contact ? ` Du når oss på ${contact}.` : ' Du når oss via kontaktformuläret på webbplatsen.'}
          </p>

          <H>Vilka uppgifter vi samlar in</H>
          <p>När du bokar en tid samlar vi in:</p>
          <ul>
            <li>namn, e-postadress och telefonnummer,</li>
            <li>vald tjänst, datum och tid,</li>
            <li>adress, om vi hämtar bilen eller utför arbetet hos dig,</li>
            <li>bilmärke, modell och registreringsnummer om du väljer att ange dem,</li>
            <li>övrig information du själv skriver i bokningen,</li>
            <li>det välgörande ändamål du eventuellt väljer att stödja (sparas som en preferens kopplad till bokningen),</li>
            <li>en recension, om du väljer att lämna en via den personliga länk du får efter besöket. Publicerade recensioner visar endast ditt valda visningsnamn, betyg, text, tjänst och månad.</li>
          </ul>
          <p>När du använder kontaktformuläret samlar vi in namn, e-postadress, eventuellt telefonnummer och ditt meddelande.</p>
          <p>
            För att skydda tjänsten mot missbruk begränsar vi antalet förfrågningar per anslutning. Vi lagrar då inte din
            IP-adress, utan endast ett envägskrypterat (hashat) värde under högst två dygn.
          </p>

          <H>Varför vi behandlar uppgifterna</H>
          <ul>
            <li>
              <strong className="text-white">Hantera din bokning</strong> – planera, bekräfta, genomföra och vid behov flytta
              eller avboka besöket. Rättslig grund: fullgörande av avtal.
            </li>
            <li>
              <strong className="text-white">Kommunicera med dig</strong> – skicka bokningsbekräftelser och besvara frågor.
              Rättslig grund: fullgörande av avtal respektive berättigat intresse.
            </li>
            <li>
              <strong className="text-white">Bokföring</strong> – underlag för fakturering enligt bokföringslagen. Rättslig
              grund: rättslig förpliktelse.
            </li>
          </ul>
          <p>Vi använder inte dina uppgifter för marknadsföring och säljer dem aldrig vidare.</p>

          <H>Hur länge vi sparar uppgifterna</H>
          <p>
            Bokningsuppgifter avidentifieras automatiskt cirka {retentionYears} år efter besöket, och meddelanden från
            kontaktformuläret raderas efter samma tid. Uppgifter som krävs enligt bokföringslagen sparas så länge lagen
            kräver.
          </p>

          <H>Vem som kan ta del av uppgifterna</H>
          <p>
            Endast behörig personal hos oss har tillgång till bokningarna. Vi använder följande leverantörer
            (personuppgiftsbiträden) för att driva tjänsten:
          </p>
          <ul>
            <li>Supabase – databas och inloggning för administratörer. [Ange vald serverregion, t.ex. EU (Frankfurt/Stockholm).]</li>
            <li>Resend – utskick av bokningsbekräftelser via e-post (om aktiverat).</li>
            <li>[Webbhotell – ange leverantör av webbhotellet.]</li>
            {turnstileEnabled && <li>Cloudflare Turnstile – skydd mot automatiserade (spam-)förfrågningar i formulären.</li>}
          </ul>
          <p>
            Om en leverantör behandlar uppgifter utanför EU/EES sker det med stöd av EU-kommissionens standardavtalsklausuler
            eller annan giltig skyddsåtgärd.
          </p>

          <H>Dina rättigheter</H>
          <p>
            Du har rätt att begära tillgång till, rättelse eller radering av dina personuppgifter, att begära begränsning
            av behandlingen, att invända mot behandling som grundas på berättigat intresse samt att få ut uppgifterna i ett
            maskinläsbart format. Kontakta oss för att utöva dina rättigheter. Är du missnöjd med hur vi behandlar dina
            uppgifter kan du lämna klagomål till Integritetsskyddsmyndigheten (IMY), imy.se.
          </p>

          <H id="cookies">Cookies och lokal lagring</H>
          <p>
            Webbplatsen använder inga cookies för spårning, analys eller marknadsföring. Vi använder endast lagring som är
            nödvändig för att tjänsten ska fungera:
          </p>
          <ul>
            <li>
              <strong className="text-white">Sessionslagring (sessionStorage)</strong> – sparar en påbörjad bokning tills du
              stänger fliken, så att du inte förlorar ifyllda uppgifter om sidan laddas om. Raderas automatiskt.
            </li>
            <li>
              <strong className="text-white">Inloggning för administratörer</strong> – används enbart av personal som loggar
              in i bokningsadministrationen.
            </li>
            {turnstileEnabled && (
              <li>
                <strong className="text-white">Cloudflare Turnstile</strong> – kan använda tekniskt nödvändig lagring för att
                skilja människor från automatiserade program.
              </li>
            )}
          </ul>
          <p>Eftersom lagringen är nödvändig för tjänsten krävs inget samtycke, och därför visas ingen cookie-banner.</p>

          <H>Ändringar</H>
          <p>Vi kan komma att uppdatera denna policy. Den senaste versionen finns alltid på denna sida.</p>
        </article>
      </div>
    </SiteLayout>
  );
}
