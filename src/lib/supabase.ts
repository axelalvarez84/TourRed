import { createClient } from '@supabase/supabase-js';
import { Booking, Destination, DestinationImage, ImageUploadData, Notification, Review, SearchFilters, Tour } from '../types';

// Initialize Supabase client
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL || '',
  import.meta.env.VITE_SUPABASE_ANON_KEY || ''
);

// User roles enum
export enum UserRole {
  ADMIN = 'admin',
  AGENCY = 'agency',
  TRAVELER = 'traveler'
}

// Authentication functions
export async function signUp(email: string, password: string, role: UserRole, additionalData: any = {}) {
  console.log('🔐 Registrando usuario:', email, 'con rol:', role);
  
  try {
    // Check if user already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id, role')
      .eq('email', email)
      .maybeSingle();
    
    if (existingUser) {
      console.log('👤 Usuario ya existe, iniciando sesión:', existingUser);
      
      // User exists, sign in instead
      const { data, error } = await signIn(email, password);
      
      if (error) throw error;
      
      return { 
        data, 
        error: null, 
        isExistingUser: true,
        profileData: existingUser
      };
    }
    
    // Create new user
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          role
        }
      }
    });
    
    if (error) throw error;
    
    if (!data.user) {
      throw new Error('No se pudo crear el usuario');
    }
    
    console.log('✅ Usuario creado en Auth:', data.user.id);
    
    // Create user profile
    const profileData = {
      id: data.user.id,
      email,
      role,
      ...additionalData
    };
    
    const { error: profileError, data: profile } = await supabase
      .from('users')
      .insert(profileData)
      .select()
      .single();
    
    if (profileError) {
      console.error('❌ Error creando perfil:', profileError);
      throw new Error(`Error creating user profile: ${profileError.message}`);
    }
    
    console.log('✅ Perfil creado en BD:', profile);
    
    return { data, error: null, profileData: profile, isExistingUser: false };
  } catch (err: any) {
    console.error('❌ Error en signUp:', err);
    return { data: null, error: err, profileData: null, isExistingUser: false };
  }
}

export async function signIn(email: string, password: string) {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    
    return { data, error };
  } catch (err: any) {
    return { data: null, error: err };
  }
}

export async function signOut() {
  return await supabase.auth.signOut();
}

export async function getCurrentUser() {
  const { data } = await supabase.auth.getSession();
  return data.session?.user || null;
}

// Agency functions
export async function createAgencyProfile(userId: string, name: string, contactEmail: string, contactPhone: string) {
  try {
    const { data, error } = await supabase
      .from('agencies')
      .insert({
        user_id: userId,
        name,
        contact_email: contactEmail,
        contact_phone: contactPhone
      })
      .select()
      .single();
    
    return { data, error };
  } catch (err: any) {
    return { data: null, error: err };
  }
}

export async function updateAgencyStatus(agencyId: string, isActive: boolean) {
  try {
    const { data, error } = await supabase
      .from('agencies')
      .update({ is_active: isActive })
      .eq('id', agencyId)
      .select()
      .single();
    
    return { data, error };
  } catch (err: any) {
    return { data: null, error: err };
  }
}

export async function getAllAgencies() {
  try {
    const { data, error } = await supabase
      .from('agencies')
      .select('*, users(first_name, last_name, email)')
      .order('created_at', { ascending: false });
    
    return { data, error };
  } catch (err: any) {
    return { data: null, error: err };
  }
}

// Tour functions
export async function getTours(filters: SearchFilters = {}) {
  try {
    console.log('🔍 Buscando tours con filtros:', filters);
    
    let query = supabase
      .from('tours')
      .select(`
        *,
        agencies(id, name, rating)
      `)
      .order('created_at', { ascending: false });
    
    // Apply filters
    if (filters.destination) {
      query = query.ilike('destination', `%${filters.destination}%`);
    }
    
    if (filters.category) {
      query = query.eq('category', filters.category);
    }
    
    if (filters.startDate) {
      query = query.gte('start_date', filters.startDate);
    }
    
    if (filters.endDate) {
      query = query.lte('end_date', filters.endDate);
    }
    
    if (filters.limit) {
      query = query.limit(filters.limit);
    }
    
    const { data, error } = await query;
    
    return { data, error };
  } catch (err: any) {
    return { data: null, error: err };
  }
}

export async function getTourById(id: string) {
  try {
    const { data, error } = await supabase
      .from('tours')
      .select(`
        *,
        agencies(id, name, logo, rating, contact_email, description)
      `)
      .eq('id', id)
      .single();
    
    return { data, error };
  } catch (err: any) {
    return { data: null, error: err };
  }
}

export async function createTour(tourData: any, destinations: string[], userId: string) {
  try {
    console.log('🏞️ Creando tour con datos:', tourData);
    
    // First get the agency ID for this user
    const { data: agencyData, error: agencyError } = await supabase
      .from('agencies')
      .select('id')
      .eq('user_id', userId)
      .single();
    
    if (agencyError) {
      throw new Error(`Error getting agency: ${agencyError.message}`);
    }
    
    if (!agencyData) {
      throw new Error('No agency found for this user');
    }
    
    // Create the tour
    const { data: tour, error: tourError } = await supabase
      .from('tours')
      .insert({
        ...tourData,
        agency_id: agencyData.id
      })
      .select()
      .single();
    
    if (tourError) {
      throw new Error(`Error creating tour: ${tourError.message}`);
    }
    
    // Add tour-destination relationships
    if (destinations.length > 0) {
      const tourDestinations = destinations.map(destination => ({
        tour_id: tour.id,
        destination_name: destination
      }));
      
      // First try to find existing destinations
      for (const dest of destinations) {
        // Check if destination exists
        const { data: existingDest } = await supabase
          .from('destinations')
          .select('id')
          .eq('name', dest)
          .maybeSingle();
        
        if (existingDest) {
          // Add relationship with existing destination
          await supabase
            .from('tour_destinations')
            .insert({
              tour_id: tour.id,
              destination_id: existingDest.id
            });
        } else {
          // Create new destination
          const { data: newDest } = await supabase
            .from('destinations')
            .insert({
              name: dest,
              is_active: true,
              last_updated_by: userId
            })
            .select('id')
            .single();
          
          if (newDest) {
            // Add relationship with new destination
            await supabase
              .from('tour_destinations')
              .insert({
                tour_id: tour.id,
                destination_id: newDest.id
              });
          }
        }
      }
    }
    
    return { data: tour, error: null };
  } catch (err: any) {
    console.error('❌ Error en createTour:', err);
    return { data: null, error: err };
  }
}

export async function updateTour(tourId: string, tourData: any) {
  try {
    const { data, error } = await supabase
      .from('tours')
      .update(tourData)
      .eq('id', tourId)
      .select()
      .single();
    
    return { data, error };
  } catch (err: any) {
    return { data: null, error: err };
  }
}

export async function deleteTour(tourId: string) {
  try {
    const { error } = await supabase
      .from('tours')
      .delete()
      .eq('id', tourId);
    
    return { error };
  } catch (err: any) {
    return { error: err };
  }
}

// Booking functions
export async function createBooking(bookingData: any) {
  try {
    const { data, error } = await supabase
      .from('bookings')
      .insert(bookingData)
      .select()
      .single();
    
    return { data, error };
  } catch (err: any) {
    return { data: null, error: err };
  }
}

export async function getUserBookings(userId: string) {
  try {
    const { data, error } = await supabase
      .from('bookings')
      .select(`
        *,
        tours(id, name, destination, image_url, start_date, end_date),
        agencies(id, name, contact_email),
        users(id, first_name, last_name, email)
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    
    return { data, error };
  } catch (err: any) {
    return { data: null, error: err };
  }
}

export async function getAgencyBookings(agencyId: string) {
  try {
    const { data, error } = await supabase
      .from('bookings')
      .select(`
        *,
        tours(id, name, destination, image_url, start_date, end_date),
        users(id, first_name, last_name, email)
      `)
      .eq('agency_id', agencyId)
      .order('created_at', { ascending: false });
    
    return { data, error };
  } catch (err: any) {
    return { data: null, error: err };
  }
}

// Destination functions
export async function getAllDestinations() {
  try {
    const { data, error } = await supabase
      .from('destinations')
      .select(`
        *,
        destination_images(*),
        tour_destinations(*)
      `)
      .order('name');
    
    return { data, error };
  } catch (err: any) {
    return { data: null, error: err };
  }
}

export async function searchDestinations(query: string) {
  try {
    const { data, error } = await supabase
      .from('destinations')
      .select('id, name')
      .ilike('name', `%${query}%`)
      .limit(5);
    
    return { data, error };
  } catch (err: any) {
    return { data: null, error: err };
  }
}

export async function createDestination(destinationData: Partial<Destination>) {
  try {
    const { data, error } = await supabase
      .from('destinations')
      .insert(destinationData)
      .select()
      .single();
    
    return { data, error };
  } catch (err: any) {
    return { data: null, error: err };
  }
}

export async function updateDestination(id: string, destinationData: Partial<Destination>) {
  try {
    const { data, error } = await supabase
      .from('destinations')
      .update(destinationData)
      .eq('id', id)
      .select()
      .single();
    
    return { data, error };
  } catch (err: any) {
    return { data: null, error: err };
  }
}

export async function deleteDestination(id: string) {
  try {
    const { error } = await supabase
      .from('destinations')
      .delete()
      .eq('id', id);
    
    return { error };
  } catch (err: any) {
    return { error: err };
  }
}

export async function addDestinationImage(destinationId: string, imageData: Partial<DestinationImage>) {
  try {
    const { data, error } = await supabase
      .from('destination_images')
      .insert({
        destination_id: destinationId,
        ...imageData
      })
      .select()
      .single();
    
    return { data, error };
  } catch (err: any) {
    return { data: null, error: err };
  }
}

export async function deleteDestinationImage(imageId: string) {
  try {
    const { error } = await supabase
      .from('destination_images')
      .delete()
      .eq('id', imageId);
    
    return { error };
  } catch (err: any) {
    return { error: err };
  }
}

// Review functions
export async function getTourReviews(tourId: string) {
  try {
    const { data, error } = await supabase
      .from('reviews')
      .select(`
        *,
        users(first_name, last_name)
      `)
      .eq('tour_id', tourId)
      .eq('is_visible', true)
      .order('created_at', { ascending: false });
    
    return { data, error };
  } catch (err: any) {
    return { data: null, error: err };
  }
}

// Notification functions
export async function getUserNotifications(limit = 10, offset = 0, includeRead = false) {
  console.log('🔔 Obteniendo notificaciones del usuario...');
  
  try {
    const { data, error } = await supabase.rpc('get_user_notifications', { 
      limit_count: limit,
      offset_count: offset,
      include_read: includeRead
    });
    
    return { data, error };
  } catch (err: any) {
    console.error('❌ Error en getUserNotifications:', err);
    return { data: null, error: err };
  }
}

export async function markNotificationAsRead(notificationId: string) {
  console.log('✓ Marcando notificación como leída:', notificationId);
  
  try {
    const { data, error } = await supabase.rpc('mark_notification_as_read', { notification_id: notificationId });
    return { data, error };
  } catch (err: any) {
    console.error('❌ Error en markNotificationAsRead:', err);
    return { data: null, error: err };
  }
}

export async function markAllNotificationsAsRead() {
  console.log('✓ Marcando todas las notificaciones como leídas');
  
  try {
    const { data, error } = await supabase.rpc('mark_all_notifications_as_read');
    return { data, error };
  } catch (err: any) {
    console.error('❌ Error en markAllNotificationsAsRead:', err);
    return { data: null, error: err };
  }
}

export async function getUnreadNotificationCount() {
  console.log('🔢 Obteniendo conteo de notificaciones no leídas');
  
  try {
    const { data, error } = await supabase.rpc('get_unread_notifications_count');
    return { data, error };
  } catch (err: any) {
    console.error('❌ Error en getUnreadNotificationCount:', err);
    return { data: null, error: err };
  }
}

// Helper functions
export function getImageSrc(base64?: string, url?: string): string {
  if (base64) {
    return base64;
  }
  if (url) {
    return url;
  }
  return 'https://images.pexels.com/photos/1271619/pexels-photo-1271619.jpeg';
}

export function parseDateFromDB(dateString: string): Date {
  // Handle ISO date format (YYYY-MM-DD)
  const parts = dateString.split('-');
  if (parts.length === 3) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; // JS months are 0-indexed
    const day = parseInt(parts[2], 10);
    return new Date(year, month, day);
  }
  
  // Fallback to standard date parsing
  return new Date(dateString);
}

export function formatDateForDB(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}