export type PriceType = 'fixed' | 'from' | 'on_request';
export type LocationType = 'workshop' | 'customer_address';
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
  mobile_available: boolean;
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

export interface PublicConfig {
  settings: PublicSettings;
  services: Service[];
  addons: Addon[];
  business_hours: BusinessHour[];
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
  mobile_service_enabled: boolean;
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
