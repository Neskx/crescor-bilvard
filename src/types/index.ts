export type PriceType = 'fixed' | 'from' | 'on_request';
export type LocationType = 'workshop' | 'pickup' | 'customer_address';
export type AppointmentStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed';
export type EmailStatus = 'sent' | 'failed' | 'not_configured';

export interface Service {
  id: string;
  slug: string;
  name: string;
  description: string;
  duration_minutes: number;
  price: number | null;
  price_type: PriceType;
  image_key: string | null;
  /** Customer-facing estimate, e.g. "1,5–2 timmar". Scheduling uses duration_minutes. */
  duration_text?: string | null;
  tagline?: string | null;
  features?: string[];
  is_highlighted?: boolean;
  allow_workshop?: boolean;
  allow_pickup?: boolean;
  allow_mobile?: boolean;
}

/** Optional extra (tillägg) booked together with a service. */
export interface Addon {
  id: string;
  slug: string;
  name: string;
  description: string;
  price: number;
}

/** Add-on as snapshotted on a booking. */
export interface BookedAddon {
  id: string;
  name: string;
  price: number;
}

export interface PublicSettings {
  company_name: string;
  company_phone: string | null;
  company_email: string | null;
  company_address: string | null;
  opening_hours_text: string | null;
  service_area_text: string | null;
  org_number: string | null;
  timezone: string;
  booking_enabled: boolean;
  workshop_available: boolean;
  pickup_available?: boolean;
  mobile_available: boolean;
  workshop_instructions?: string | null;
  pickup_info_text?: string | null;
  pickup_area_text?: string | null;
  pickup_fee?: number | null;
  mobile_fee?: number | null;
  pickup_postal_prefixes?: string[];
  mobile_postal_prefixes?: string[];
  charity_enabled?: boolean;
  auto_confirm: boolean;
  booking_notice_hours: number;
  booking_horizon_days: number;
}

export interface BusinessHour {
  weekday: number;
  opening_time: string;
  closing_time: string;
  is_closed: boolean;
}

export interface Partner {
  id: string;
  name: string;
  /** Bundled (/partners/…) or uploaded (https://…) logo. NULL = text placeholder. */
  logo_url: string | null;
  logo_background: 'light' | 'dark';
  website_url: string | null;
}

export interface Charity {
  id: string;
  slug: string;
  name: string;
  description: string;
  website_url: string | null;
  logo_url: string | null;
}

/** A completed (actually paid) donation total. Only these are ever public. */
export interface PublicDonation {
  charity_name: string;
  amount: number;
  last_completed_at: string | null;
}

export interface PublicReview {
  id: string;
  display_name: string;
  rating: number;
  body: string;
  service_name: string | null;
  verified: boolean;
  published_at: string | null;
}

export interface PublicConfig {
  settings: PublicSettings;
  services: Service[];
  addons: Addon[];
  business_hours: BusinessHour[];
  partners: Partner[];
  charities: Charity[];
  donations: PublicDonation[];
  reviews: PublicReview[];
}

export interface Slot {
  start: string;
  end: string;
  available: boolean;
}

export interface BookingResult {
  booking_reference: string;
  status: AppointmentStatus;
  start_time: string;
  end_time: string;
  service_name: string;
  addons?: BookedAddon[];
  addons_total?: number;
  location_type?: LocationType;
  location_fee?: number | null;
  charity_name?: string | null;
  email: EmailStatus;
  duplicate: boolean;
}

// ---- Admin -----------------------------------------------------------------

export interface Appointment {
  id: string;
  booking_reference: string;
  service_id: string;
  service_name: string;
  price_snapshot: number | null;
  price_type_snapshot: PriceType;
  addons: BookedAddon[];
  addons_total: number;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  vehicle_information: string | null;
  registration_number: string | null;
  location_type: LocationType;
  travel_minutes: number;
  location_fee: number | null;
  blocked_from: string;
  service_address: string | null;
  service_postal_code: string | null;
  service_city: string | null;
  address_instructions: string | null;
  start_time: string;
  end_time: string;
  blocked_until: string;
  status: AppointmentStatus;
  customer_notes: string | null;
  admin_notes: string | null;
  source: 'online' | 'admin';
  anonymized_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminService extends Service {
  duration_text: string | null;
  tagline: string | null;
  features: string[];
  is_highlighted: boolean;
  allow_workshop: boolean;
  allow_pickup: boolean;
  allow_mobile: boolean;
  buffer_minutes: number;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AdminAddon extends Addon {
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AdminSettings {
  company_name: string;
  company_phone: string | null;
  company_email: string | null;
  company_address: string | null;
  opening_hours_text: string | null;
  service_area_text: string | null;
  org_number: string | null;
  timezone: string;
  booking_enabled: boolean;
  workshop_service_enabled: boolean;
  pickup_service_enabled: boolean;
  mobile_service_enabled: boolean;
  workshop_instructions: string | null;
  pickup_info_text: string | null;
  pickup_area_text: string | null;
  pickup_fee: number | null;
  mobile_fee: number | null;
  pickup_travel_minutes: number;
  mobile_travel_minutes: number;
  pickup_postal_prefixes: string[];
  mobile_postal_prefixes: string[];
  charity_enabled: boolean;
  auto_confirm: boolean;
  booking_notice_hours: number;
  booking_horizon_days: number;
  slot_interval_minutes: number;
  retention_days: number;
  notification_email: string | null;
  updated_at: string;
}

export interface BlockedPeriod {
  id: string;
  start_time: string;
  end_time: string;
  reason: string | null;
  created_at: string;
}

export interface ContactMessage {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  message: string;
  is_read: boolean;
  created_at: string;
}

export interface NotificationLogEntry {
  id: string;
  appointment_id: string | null;
  kind: string;
  status: EmailStatus;
  error: string | null;
  created_at: string;
}

export type ReviewStatus = 'pending' | 'approved' | 'rejected' | 'hidden';

export interface AdminReview {
  id: string;
  appointment_id: string | null;
  display_name: string;
  rating: number;
  body: string;
  service_name: string | null;
  verified: boolean;
  status: ReviewStatus;
  admin_note: string | null;
  reported_at: string | null;
  created_at: string;
  moderated_at: string | null;
  published_at: string | null;
}

export interface AdminPartner extends Partner {
  sort_order: number;
  is_visible: boolean;
  admin_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminCharity extends Charity {
  is_active: boolean;
  sort_order: number;
  admin_note: string | null;
  created_at: string;
  updated_at: string;
}

export type DonationStatus = 'planned' | 'approved' | 'completed';

export interface DonationAllocation {
  id: string;
  charity_id: string;
  accounting_period: string;
  amount: number;
  status: DonationStatus;
  reference: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  approved_at: string | null;
  completed_at: string | null;
}

export interface CharitySummaryRow {
  charity_id: string;
  name: string;
  is_active: boolean;
  selections: number;
  planned_amount: number;
  approved_amount: number;
  completed_amount: number;
}
