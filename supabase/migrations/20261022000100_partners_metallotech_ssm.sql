-- =============================================================================
-- Partners, confirmed by the business (2026-10-22):
-- * The pickaxe/M logo belongs to Metallotech.
-- * SSM is not to be shown as a partner.
-- =============================================================================

update public.partners
   set logo_url = '/partners/metallotech.webp',
       logo_background = 'light',
       admin_note = null
 where lower(btrim(name)) = 'metallotech';

delete from public.partners where lower(btrim(name)) = 'ssm';
