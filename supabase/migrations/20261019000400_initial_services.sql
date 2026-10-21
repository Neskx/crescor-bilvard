-- =============================================================================
-- Initial service catalogue.
--
-- These are SUGGESTED categories so the site has content from day one.
-- Durations are scheduling defaults only and MUST be reviewed by the business
-- in /admin → Tjänster. No prices are set (price_type = 'on_request'), so no
-- price is ever shown until the business enters one.
-- =============================================================================

insert into public.services (slug, name, description, duration_minutes, buffer_minutes, price_type, image_key, sort_order)
values
  ('invandig-rekond', 'Invändig rekond',
   'Grundlig rengöring av bilens interiör – från golv och mattor till paneler, rutor och detaljer som ofta glöms bort.',
   180, 30, 'on_request', 'invandig', 10),
  ('utvandig-rekond', 'Utvändig rekond',
   'Noggrann handtvätt, avfettning och finish av lack, fälgar och glas för en ren och skyddad yta.',
   150, 30, 'on_request', 'utvandig', 20),
  ('helrekond', 'Helrekond',
   'Vår mest kompletta behandling: invändig och utvändig rekond i ett och samma besök.',
   360, 30, 'on_request', 'helrekond', 30),
  ('polering-lackvard', 'Polering & lackvård',
   'Maskinpolering som reducerar virvelmärken och matthet och återger lacken dess djup och glans.',
   300, 30, 'on_request', 'polering', 40),
  ('kladsel-satesrengoring', 'Klädsel- och sätesrengöring',
   'Djuprengöring av säten och klädsel i tyg eller skinn, anpassad efter materialets behov.',
   120, 30, 'on_request', 'kladsel', 50),
  ('specialbehandlingar', 'Specialbehandlingar',
   'Behandlingar utöver det vanliga – berätta vad du behöver så återkommer vi med ett upplägg.',
   120, 30, 'on_request', 'special', 60);
