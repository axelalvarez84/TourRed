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
}

export interface Booking {
  id: string;
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
  type: 'booking_pending_approval' | 'booking_approved' | 'booking_rejected' | 'booking_confirmed' | 'booking_cancelled' | 'message_received' | 'tour_updated' | 'system_announcement';
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
  destination?: string;
  category?: string;
  startDate?: string;
  endDate?: string;
  agency?: string;
  minPrice?: string;
  maxPrice?: string;
  petFriendly?: string;
  departurePoint?: string;
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