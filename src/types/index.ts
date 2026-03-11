export interface User {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  role: 'traveler' | 'agency' | 'admin';
  created_at: string;
  curp?: string;
  passport_number?: string;
  is_foreign_traveler?: boolean;
  email_verified?: boolean;
  verification_code?: string;
  verification_code_expires_at?: string;
  verification_code_attempts?: number;
  phone_number?: string;
  profile_picture_url?: string;
  referred_by_user_id?: string;
  referral_code_used?: string;
}

export interface Agency {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  logo?: string;
  contact_email: string;
  contact_phone?: string;
  website?: string;
  rating?: number;
  is_active: boolean;
  created_at: string;
}

export interface Destination {
  id: string;
  name: string;
  description?: string;
  main_image_url?: string;
  main_image_base64?: string;
  main_image_size?: number;
  main_image_type?: string;
  country?: string;
  region?: string;
  best_time_to_visit?: string;
  average_temperature?: string;
  currency?: string;
  language?: string;
  time_zone?: string;
  is_active: boolean;
  last_updated_by?: string;
  created_at: string;
  updated_at: string;
  destination_images?: DestinationImage[];
  tour_destinations?: any[];
}

export interface DestinationImage {
  id: string;
  destination_id: string;
  image_url?: string;
  image_base64?: string;
  image_size?: number;
  image_type?: string;
  caption?: string;
  is_featured: boolean;
  uploaded_by?: string;
  created_at: string;
}

export interface DeparturePoint {
  id: string;
  name: string;
  city: string;
  municipality: string;
  google_maps_url?: string;
  is_active: boolean;
  usage_count: number;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface TourDeparturePoint {
  id: string;
  tour_id: string;
  departure_point_id: string;
  display_order: number;
  created_at: string;
  departure_points?: DeparturePoint;
}

export type TourType = 'excursion' | 'receptivo';
export type ReceptivoModality = 'compartido' | 'privado';
export type CancellationPolicy = 'flexible' | 'moderada' | 'estricta' | 'no_reembolsable';
export type SlotStatus = 'activo' | 'lleno' | 'bloqueado' | 'cancelado' | 'completado';

export interface Tour {
  id: string;
  agency_id: string;
  name: string;
  destination: string;
  description: string;
  category: string | string[];
  price: number;
  deposit_percentage: number;
  image_url: string;
  gallery?: string[];
  start_date: string;
  end_date: string;
  max_travelers?: number;
  available_spots?: number;
  is_featured?: boolean;
  created_at: string;
  agencies?: Agency;
  itinerary?: string;
  includes?: string[];
  excludes?: string[];
  departure_points?: string[];
  tour_departure_points?: TourDeparturePoint[];
  booking_deadline?: string;
  booking_approval_type?: 'automatic' | 'manual';
  approval_required?: boolean;
  pet_friendly?: boolean;
  precio_adulto?: number;
  precio_nino?: number;
  precio_infante?: number;
  precio_adulto_mayor?: number;
  precio_mascota?: number;
  admite_infantes?: boolean;
  admite_ninos?: boolean;
  admite_adultos?: boolean;
  admite_adultos_mayores?: boolean;
  tour_type?: TourType;
  receptivo_modality?: ReceptivoModality;
  operating_days?: number[];
  operating_months?: number[];
  min_advance_booking_hours?: number;
  max_advance_booking_days?: number;
  slot_duration_days?: number;
  max_daily_slots?: number;
  default_slot_capacity?: number;
  cancellation_policy?: CancellationPolicy;
  cancellation_hours_limit?: number;
  cancellation_refund_percentage?: number;
  flexible_hours?: number;
  flexible_refund_percentage?: number;
  moderate_hours?: number;
  moderate_refund_percentage?: number;
  min_travelers_required?: number;
  min_travelers_confirmation_hours?: number;
  pickup_available?: boolean;
  pickup_free_zone?: string;
  pickup_zones?: any[];
  tour_languages?: any[];
  restriction_pregnant?: boolean;
  restriction_disability?: boolean;
  restriction_physical?: boolean;
  name_changes_not_allowed?: boolean;
  cancellation_not_allowed?: boolean;
}

export interface TourSchedule {
  id: string;
  tour_id: string;
  agency_id: string;
  departure_point_id?: string;
  departure_time: string;
  label?: string;
  slot_capacity?: number;
  valid_from: string;
  valid_until?: string;
  days_of_week?: number[];
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
  departure_points?: DeparturePoint;
}

export interface TourSlot {
  id: string;
  tour_id: string;
  agency_id: string;
  schedule_id?: string;
  slot_date: string;
  departure_time: string;
  end_date?: string;
  capacity: number;
  booked_count: number;
  available_count?: number;
  status: SlotStatus;
  is_auto_generated: boolean;
  min_travelers_reached: boolean;
  confirmed_at?: string;
  cancellation_reason?: string;
  cancelled_at?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  tour_schedules?: TourSchedule;
}

export interface TourSlotBlackout {
  id: string;
  tour_id: string;
  agency_id: string;
  blackout_start: string;
  blackout_end: string;
  reason?: string;
  is_partial_day: boolean;
  blocked_schedule_ids?: string[];
  created_by?: string;
  created_at: string;
}

export interface Booking {
  id: string;
  booking_code: string;
  user_id: string;
  tour_id: string;
  agency_id: string;
  deposit_amount: number;
  commission_amount: number;
  total_price: number;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
  booking_date: string;
  travelers_count: number;
  created_at: string;
  tours?: Tour;
  agencies?: Agency;
  users?: User;
  service_charge?: number;
  user_payment?: number;
  platform_revenue?: number;
  payment_intent_id?: string;
  payment_status?: 'pending' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  payment_method?: string;
  paid_at?: string;
  approval_status?: 'pending' | 'approved' | 'rejected';
  approval_notes?: string;
  approved_at?: string;
  approved_by?: string;
  count_adultos?: number;
  count_ninos?: number;
  count_infantes?: number;
  count_adultos_mayores?: number;
  count_mascotas?: number;
  booking_approval_type?: 'automatic' | 'manual';
  toursred_cash_used?: number;
  has_pending_reschedule?: boolean;
  reschedule_response?: 'accepted' | 'rejected' | 'auto_accepted';
  reschedule_responded_at?: string;
  original_booking_date?: string;
  discount_code_id?: string;
  discount_amount?: number;
  service_charge_discount?: number;
  discount_codes?: DiscountCode;
  slot_id?: string;
  selected_date?: string;
  selected_time?: string;
  tour_slots?: TourSlot;
}

export interface BookingTraveler {
  id?: string;
  booking_id: string;
  categoria_viajero: 'adulto' | 'nino' | 'infante' | 'adulto_mayor' | 'mascota';
  nombre: string;
  email: string;
  telefono?: string;
  fecha_nacimiento: string;
  precio_aplicado: number;
  frequent_companion_id?: string;
  created_at?: string;
}

export interface FrequentCompanion {
  id: string;
  user_id: string;
  nombre: string;
  email: string;
  telefono?: string;
  fecha_nacimiento: string;
  created_at?: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: 'booking_pending_approval' | 'booking_approved' | 'booking_rejected' | 'booking_confirmed' | 'booking_cancelled' | 'message_received' | 'tour_updated' | 'system_announcement' | 'tour_rescheduled' | 'referral_signup' | 'referral_completed' | 'referral_bonus_earned';
  title: string;
  message: string;
  data?: any;
  is_read: boolean;
  created_at: string;
  updated_at: string;
  expires_at?: string;
  is_expired?: boolean;
}

export interface PaymentTransaction {
  id: string;
  booking_id: string;
  stripe_payment_intent_id: string;
  amount: number;
  currency: string;
  status: 'pending' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  payment_method_type?: string;
  stripe_fee?: number;
  net_amount: number;
  metadata?: any;
  created_at: string;
  updated_at: string;
}

export interface CommissionRecord {
  id: string;
  booking_id: string;
  agency_id: string;
  tour_id: string;
  total_tour_price: number;
  agency_commission_rate: number;
  agency_commission_amount: number;
  service_charge_rate: number;
  service_charge_amount: number;
  platform_total_revenue: number;
  agency_net_amount: number;
  status: 'pending' | 'processed' | 'paid_out' | 'disputed';
  processed_at?: string;
  created_at: string;
}

export interface Review {
  id: string;
  user_id: string;
  tour_id: string;
  agency_id: string;
  rating: number;
  comment: string;
  reply?: string;
  is_visible: boolean;
  created_at: string;
  users?: User;
}

export interface TourCategory {
  id: string;
  name: string;
  icon: string;
}

export interface SearchFilters {
  tourName?: string;
  destination?: string;
  category?: string;
  startDate?: string;
  endDate?: string;
  agency?: string;
  minPrice?: string;
  maxPrice?: string;
  petFriendly?: string;
  departurePoint?: string;
  lat?: string;
  lng?: string;
  radius?: string;
  locationName?: string;
  tourType?: TourType | 'all';
  travelDate?: string;
}

export interface ImageUploadData {
  base64: string;
  type: string;
  size: number;
}

export interface PaymentBreakdown {
  totalPrice: number;
  depositAmount: number;
  agencyCommission: number;
  serviceCharge: number;
  userPayment: number;
  platformRevenue: number;
  agencyReceives: number;
}

export interface FrequentCompanion {
  id: string;
  user_id: string;
  nombre: string;
  email: string;
  telefono?: string;
  fecha_nacimiento: string;
  created_at: string;
}

export interface BookingTraveler {
  id: string;
  booking_id: string;
  categoria_viajero: 'infante' | 'nino' | 'adulto' | 'adulto_mayor';
  nombre: string;
  email: string;
  telefono?: string;
  fecha_nacimiento: string;
  precio_aplicado: number;
  frequent_companion_id?: string;
  created_at: string;
}

export interface TravelerCategory {
  categoria: 'infante' | 'nino' | 'adulto' | 'adulto_mayor';
  cantidad: number;
  precio: number;
}

export interface TourReschedule {
  id: string;
  tour_id: string;
  agency_id: string;
  original_start_date: string;
  original_end_date: string;
  new_start_date: string;
  new_end_date: string;
  reason: string;
  created_by: string;
  affected_bookings_count: number;
  status: 'pending_responses' | 'completed' | 'cancelled';
  response_deadline: string;
  created_at: string;
}

export interface BookingRescheduleResponse {
  id: string;
  tour_reschedule_id: string;
  booking_id: string;
  user_id: string;
  response: 'pending' | 'accepted' | 'rejected' | 'auto_accepted';
  responded_at?: string;
  refund_processed: boolean;
  refund_transaction_id?: string;
  notification_sent: boolean;
  email_sent: boolean;
  reminder_sent_at?: string;
  created_at: string;
  reschedule?: TourReschedule;
}

export interface PendingReschedule {
  reschedule: {
    id: string;
    tour_id: string;
    tour_name: string;
    original_start_date: string;
    original_end_date: string;
    new_start_date: string;
    new_end_date: string;
    reason: string;
    response_deadline: string;
    created_at: string;
  };
  response: {
    id: string;
    response: string;
    responded_at?: string;
    notification_sent: boolean;
    email_sent: boolean;
  };
}

export interface DiscountCode {
  id: string;
  code: string;
  description: string;
  discount_type: 'tour_percentage' | 'tour_fixed' | 'membership_free_month' | 'membership_percentage' | 'membership_fixed' | 'gift_card_percentage' | 'gift_card_fixed' | 'agency_tour_percentage' | 'agency_tour_fixed';
  discount_value: number;
  applicable_to: 'tours' | 'memberships' | 'gift_cards';
  discount_applies_to: 'total_price' | 'payment_amount';
  is_single_use: boolean;
  is_active: boolean;
  valid_from: string;
  valid_until: string;
  max_uses?: number;
  max_discount_amount?: number | null;
  times_used: number;
  created_by?: string;
  created_at: string;
  updated_at: string;
  agency_id?: string;
  tour_id?: string;
  tour_name?: string;
  agencies?: Agency;
  tours?: Tour;
  membership_plan_type?: 'monthly' | 'annual' | 'both';
}

export interface AgencyDiscountCode extends DiscountCode {
  agency_id: string;
  discount_type: 'agency_tour_percentage' | 'agency_tour_fixed';
  applicable_to: 'tours';
}

export interface DiscountCodeUsage {
  id: string;
  discount_code_id: string;
  user_id: string;
  used_at: string;
  booking_id?: string;
  gift_card_id?: string;
  membership_id?: string;
  created_at: string;
}

export interface AgencyTour {
  id: string;
  name: string;
  destination: string;
  price: number;
  start_date: string;
  end_date: string;
  image_url: string;
}

export interface AgencyPayout {
  id: string;
  payout_code: string;
  agency_id: string;
  payout_batch_id?: string;
  amount: number;
  payment_method: string;
  bank_reference?: string;
  payment_date: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  receipt_url?: string;
  notes?: string;
  commission_records_count: number;
  processed_by?: string;
  external_transaction_id?: string;
  bank_account_id?: string;
  erp_sync_status: 'not_synced' | 'syncing' | 'synced' | 'failed';
  erp_invoice_id?: string;
  erp_reference?: string;
  email_sent: boolean;
  created_at: string;
  updated_at: string;
  agencies?: Agency;
  processed_by_user?: User;
}

export interface PayoutBatch {
  id: string;
  batch_code: string;
  period_start: string;
  period_end: string;
  total_amount: number;
  agencies_count: number;
  payouts_count: number;
  status: 'draft' | 'processing' | 'completed' | 'cancelled';
  processed_by?: string;
  processed_at?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  processed_by_user?: User;
  agency_payouts?: AgencyPayout[];
}

export interface FinancialTransaction {
  id: string;
  transaction_code: string;
  transaction_type: 'booking_confirmed' | 'cancellation_full' | 'cancellation_partial' | 'no_show' | 'tour_cancelled_by_agency' | 'adjustment' | 'payout';
  booking_id?: string;
  cancellation_id?: string;
  tour_id: string;
  agency_id: string;
  payout_id?: string;
  transaction_date: string;
  tour_start_date: string;
  gross_amount: number;
  commission_rate: number;
  commission_amount: number;
  net_to_agency: number;
  platform_revenue: number;
  reconciliation_status: 'pending' | 'reconciled' | 'disputed';
  payment_status: 'pending' | 'scheduled' | 'paid';
  notes?: string;
  metadata?: any;
  created_at: string;
  updated_at: string;
  bookings?: Booking;
  tours?: Tour;
  agencies?: Agency;
  payouts?: AgencyPayout;
}

export interface PayoutSchedule {
  id: string;
  agency_id: string;
  frequency: 'weekly' | 'biweekly' | 'monthly' | 'custom';
  payment_day?: number;
  minimum_amount: number;
  preferred_payment_method?: string;
  bank_name?: string;
  bank_account_number?: string;
  bank_account_holder?: string;
  bank_clabe?: string;
  is_active: boolean;
  auto_payout_enabled: boolean;
  last_payout_date?: string;
  next_scheduled_payout?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  agencies?: Agency;
}

export interface IntegrationConfig {
  id: string;
  provider: 'zoho_books' | 'odoo' | 'quickbooks' | 'bank_api' | 'other';
  agency_id?: string;
  is_active: boolean;
  credentials_encrypted?: string;
  api_endpoint?: string;
  sync_frequency?: 'hourly' | 'daily' | 'weekly' | 'manual';
  last_sync_at?: string;
  last_sync_status?: 'success' | 'failed' | 'in_progress';
  error_log?: any;
  config_data?: any;
  created_at: string;
  updated_at: string;
  agencies?: Agency;
}

export interface FinancialSummary {
  pending_balance: number;
  paid_this_month: number;
  total_lifetime: number;
  next_payout_date?: string;
  next_payout_amount?: number;
}

export interface TourFinancialSummary {
  tour_id: string;
  tour_name: string;
  tour_date: string;
  bookings_count: number;
  gross_revenue: number;
  platform_commission: number;
  net_to_agency: number;
  payment_status: 'pending' | 'scheduled' | 'paid';
  paid_date?: string;
}

export interface PayoutRequest {
  agency_id: string;
  commission_record_ids: string[];
  payment_method: string;
  bank_reference?: string;
  notes?: string;
}

export interface ReferralCode {
  id: string;
  user_id: string;
  code: string;
  is_active: boolean;
  successful_referrals_count: number;
  max_referrals_allowed: number;
  created_at: string;
  updated_at: string;
}

export interface ReferralRelationship {
  id: string;
  referrer_user_id: string;
  referred_user_id: string;
  referral_code_used: string;
  status: 'pending' | 'completed' | 'cancelled';
  referrer_bonus_awarded: boolean;
  referred_bonus_awarded: boolean;
  first_booking_id?: string;
  created_at: string;
  completed_at?: string;
  is_suspicious: boolean;
  referrer?: User;
  referred?: User;
  bookings?: Booking;
}

export interface ReferralBonus {
  id: string;
  referral_relationship_id: string;
  user_id: string;
  points_amount: number;
  status: 'pending' | 'awarded' | 'expired';
  awarded_at?: string;
  reason: string;
  created_at: string;
}

export interface ReferralStats {
  total_referrals: number;
  completed_referrals: number;
  pending_referrals: number;
  total_points_earned: number;
  referral_code: string;
  max_referrals: number;
  is_max_reached: boolean;
}

export interface ReferralValidationResult {
  valid: boolean;
  code?: string;
  referrer_name?: string;
  referrer_id?: string;
  message?: string;
}

export interface PointsWallet {
  id: string;
  user_id: string;
  balance: number;
  total_earned: number;
  total_used: number;
  total_expired: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PointsTransaction {
  id: string;
  user_id: string;
  amount: number;
  balance_after: number;
  type: 'earned' | 'redeemed' | 'expired' | 'refund' | 'adjustment';
  description: string;
  reference_type: string | null;
  reference_id: string | null;
  expires_at: string | null;
  created_at: string;
  booking_code?: string | null;
}