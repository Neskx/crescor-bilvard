import { SiteLayout } from '../components/SiteLayout';
import { PageHero } from '../components/PageHero';
import { CtaBand, ProcessSteps } from '../components/Blocks';
import { About } from '../sections/About';
import { WhyUs } from '../sections/WhyUs';
import { usePageMeta } from '../hooks/usePageMeta';

export function AboutPage() {
  usePageMeta({
    title: 'Om oss',
    description: 'Crescor Bilvård utför professionell bilvård med fokus på precision, noggrannhet och en smidig upplevelse från bokning till färdig bil.',
    path: '/om-oss',
  });
  return (
    <SiteLayout>
      <PageHero
        eyebrow="Om oss"
        title={
          <>
            Precision är <span className="text-metal">vårt hantverk.</span>
          </>
        }
        lead="Vi tror att bilvård ska göras ordentligt – med tålamod, rätt metoder och respekt för både bilen och din tid."
        image="/images/about.webp"
        crumbs={[{ label: 'Om oss' }]}
      />
      <About />
      <WhyUs />
      <ProcessSteps />
      <CtaBand />
    </SiteLayout>
  );
}
