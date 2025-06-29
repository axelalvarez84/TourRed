import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Types and Enums
export enum UserRole {
  TRAVELER = 'traveler',
  AGENCY = 'agency',
  ADMIN = 'admin'
}

export interface User {
  id: string
  email: string
  first_name?: string
  last_name?: string
  role: UserRole
  created_at: string
  updated_at: string
}

export interface Agency {
  id: string
  user_id: string
  name: string
  description?: string
  logo?: string
  contact_email: string
  contact_phone?: string
  website?: string
  rating?: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Tour {
  id: string
  agency_id: string
  name: string
  destination: string
  description: string
  category: string
  price: number
  deposit_percentage: number
  image_url: string
  gallery?: string[]
  start_date: string
  end_date: string
  max_travelers?: number
  is_featured: boolean
  created_at: string
  updated_at: string
  itinerary?: string
  includes?: string[]
  excludes?: string[]
  booking_deadline?: string
  booking_approval_type?: 'automatic' | 'manual'
  approval_required?: boolean
}

export interface Booking {
  id: string
  user_id: string
  tour_id: string
  agency_id: string
  deposit_amount: number
  commission_amount: number
  total_price: number
  status: string
  booking_date: string
  travelers_count: number
  created_at: string
  updated_at: string
  service_charge?: number
  user_payment?: number
  platform_revenue?: number
  payment_intent_id?: string
  payment_status?: string
  payment_method?: string
  paid_at?: string
  approval_status?: 'pending' | 'approved' | 'rejected'
  approval_notes?: string
  approved_at?: string
  approved_by?: string
}

export interface Destination {
  id: string
  name: string
  description?: string
  main_image_url?: string
  country?: string
  region?: string
  best_time_to_visit?: string
  average_temperature?: string
  currency?: string
  language?: string
  time_zone?: string
  is_active: boolean
  created_at: string
  updated_at: string
  last_updated_by?: string
  main_image_base64?: string
  main_image_size?: number
  main_image_type?: string
}

export interface Review {
  id: string
  user_id: string
  tour_id: string
  agency_id: string
  rating: number
  comment: string
  reply?: string
  is_visible: boolean
  created_at: string
  updated_at: string
}

// Utility functions
export function parseDateFromDB(dateString: string): Date {
  return new Date(dateString)
}

export function formatDateForDB(date: Date): string {
  return date.toISOString().split('T')[0]
}

export function getImageSrc(base64Data?: string, imageType?: string, fallbackUrl?: string): string {
  if (base64Data && imageType) {
    return `data:${imageType};base64,${base64Data}`
  }
  return fallbackUrl || '/placeholder-image.jpg'
}

// Auth functions
export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })
  return { data, error }
}

export async function signUp(email: string, password: string, userData: {
  first_name?: string
  last_name?: string
  role: UserRole
}) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: userData
    }
  })
  return { data, error }
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  return { error }
}

export async function getCurrentUser() {
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return { user: null, error }

  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single()

  return { user: profile, error: profileError }
}

// Agency functions
export async function createAgencyProfile(agencyData: Omit<Agency, 'id' | 'created_at' | 'updated_at'>) {
  const { data, error } = await supabase
    .from('agencies')
    .insert([agencyData])
    .select()
    .single()
  
  return { data, error }
}

export async function getAllAgencies() {
  const { data, error } = await supabase
    .from('agencies')
    .select('*')
    .order('created_at', { ascending: false })
  
  return { data, error }
}

export async function updateAgencyStatus(agencyId: string, isActive: boolean) {
  const { data, error } = await supabase
    .from('agencies')
    .update({ is_active: isActive })
    .eq('id', agencyId)
    .select()
    .single()
  
  return { data, error }
}

// Tour functions
export async function getTours(filters?: {
  category?: string
  destination?: string
  minPrice?: number
  maxPrice?: number
  startDate?: string
  endDate?: string
}) {
  let query = supabase
    .from('tours')
    .select(`
      *,
      agencies (
        id,
        name,
        rating
      )
    `)
    .order('created_at', { ascending: false })

  if (filters?.category) {
    query = query.eq('category', filters.category)
  }
  if (filters?.destination) {
    query = query.ilike('destination', `%${filters.destination}%`)
  }
  if (filters?.minPrice) {
    query = query.gte('price', filters.minPrice)
  }
  if (filters?.maxPrice) {
    query = query.lte('price', filters.maxPrice)
  }
  if (filters?.startDate) {
    query = query.gte('start_date', filters.startDate)
  }
  if (filters?.endDate) {
    query = query.lte('end_date', filters.endDate)
  }

  const { data, error } = await query
  return { data, error }
}

export async function getTourById(tourId: string) {
  const { data, error } = await supabase
    .from('tours')
    .select(`
      *,
      agencies (
        id,
        name,
        description,
        contact_email,
        contact_phone,
        website,
        rating
      )
    `)
    .eq('id', tourId)
    .single()
  
  return { data, error }
}

export async function createTour(tourData: Omit<Tour, 'id' | 'created_at' | 'updated_at'>) {
  const { data, error } = await supabase
    .from('tours')
    .insert([tourData])
    .select()
    .single()
  
  return { data, error }
}

export async function updateTour(tourId: string, tourData: Partial<Tour>) {
  const { data, error } = await supabase
    .from('tours')
    .update(tourData)
    .eq('id', tourId)
    .select()
    .single()
  
  return { data, error }
}

export async function deleteTour(tourId: string) {
  const { data, error } = await supabase
    .from('tours')
    .delete()
    .eq('id', tourId)
  
  return { data, error }
}

// Destination functions
export async function searchDestinations(query?: string) {
  let supabaseQuery = supabase
    .from('destinations')
    .select('*')
    .eq('is_active', true)
    .order('name')

  if (query) {
    supabaseQuery = supabaseQuery.or(`name.ilike.%${query}%,country.ilike.%${query}%,region.ilike.%${query}%`)
  }

  const { data, error } = await supabaseQuery
  return { data, error }
}

export async function addDestinationImage(imageData: {
  destination_id: string
  image_url?: string
  caption?: string
  is_featured?: boolean
  uploaded_by?: string
  image_base64?: string
  image_size?: number
  image_type?: string
}) {
  const { data, error } = await supabase
    .from('destination_images')
    .insert([imageData])
    .select()
    .single()
  
  return { data, error }
}

export async function deleteDestinationImage(imageId: string) {
  const { data, error } = await supabase
    .from('destination_images')
    .delete()
    .eq('id', imageId)
  
  return { data, error }
}

export async function deleteDestination(destinationId: string) {
  const { data, error } = await supabase
    .from('destinations')
    .delete()
    .eq('id', destinationId)
  
  return { data, error }
}

// Booking functions
export async function createBooking(bookingData: Omit<Booking, 'id' | 'created_at' | 'updated_at'>) {
  const { data, error } = await supabase
    .from('bookings')
    .insert([bookingData])
    .select()
    .single()
  
  return { data, error }
}

export async function getUserBookings(userId: string) {
  const { data, error } = await supabase
    .from('bookings')
    .select(`
      *,
      tours (
        id,
        name,
        destination,
        image_url,
        start_date,
        end_date
      ),
      agencies (
        id,
        name,
        contact_email
      )
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  
  return { data, error }
}

export async function getAgencyBookings(agencyId: string) {
  const { data, error } = await supabase
    .from('bookings')
    .select(`
      *,
      tours (
        id,
        name,
        destination,
        image_url,
        start_date,
        end_date
      ),
      users (
        id,
        first_name,
        last_name,
        email
      )
    `)
    .eq('agency_id', agencyId)
    .order('created_at', { ascending: false })
  
  return { data, error }
}

// Review functions
export async function getTourReviews(tourId: string) {
  const { data, error } = await supabase
    .from('reviews')
    .select(`
      *,
      users (
        id,
        first_name,
        last_name
      )
    `)
    .eq('tour_id', tourId)
    .eq('is_visible', true)
    .order('created_at', { ascending: false })
  
  return { data, error }
}