import { createClient } from '@supabase/supabase-js';
import { Booking, Destination, DestinationImage, ImageUploadData, Tour } from '../types';

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
export async function signUp(
  email: string, 
  password: string, 
  role: UserRole,
  profileData: Record<string, any> = {}
) {
  try {
    console.log('🔐 Registrando usuario con email:', email, 'y rol:', role);
    
    // Check if user already exists
    const { data: { users }, error: getUserError } = await supabase.auth.admin.listUsers({
      filters: {
        email: email
      }
    });
    
    const userExists = users && users.length > 0;
    console.log('👤 ¿Usuario ya existe?', userExists);
    
    let authData;
    let isExistingUser = false;
    
    if (userExists) {
      // If user exists, sign in instead
      console.log('👤 Usuario ya existe, iniciando sesión...');
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });
      
      if (error) throw error;
      authData = data;
      isExistingUser = true;
    } else {
      // Create new user
      console.log('👤 Creando nuevo usuario...');
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            role: role
          }
        }
      });
      
      if (error) throw error;
      authData = data;
    }
    
    // Create or update user profile
    let profileResult = null;
    
    if (authData.user) {
      console.log('👤 Creando/actualizando perfil para usuario:', authData.user.id);
      
      const { data: existingProfile } = await supabase
        .from('users')
        .select('*')
        .eq('id', authData.user.id)
        .maybeSingle();
      
      if (existingProfile) {
        // Update existing profile
        console.log('👤 Actualizando perfil existente');
        const { data, error } = await supabase
          .from('users')
          .update({
            ...profileData,
            role: role,
            updated_at: new Date().toISOString()
          })
          .eq('id', authData.user.id)
          .select()
          .single();
          
        if (error) throw error;
        profileResult = data;
      } else {
        // Create new profile
        console.log('👤 Creando nuevo perfil');
        const { data, error } = await supabase
          .from('users')
          .insert({
            id: authData.user.id,
            email: email,
            role: role,
            ...profileData
          })
          .select()
          .single();
          
        if (error) throw error;
        profileResult = data;
      }
    }
    
    return { 
      data: authData, 
      error: null, 
      profileData: profileResult,
      isExistingUser
    };
  } catch (error: any) {
    console.error('❌ Error en signUp:', error);
    return { data: null, error, profileData: null, isExistingUser: false };
  }
}

export async function signIn(email: string, password: string) {
  try {
    console.log('🔐 Iniciando sesión con email:', email);
    
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    
    if (error) throw error;
    
    return { data, error: null };
  } catch (error: any) {
    console.error('❌ Error en signIn:', error);
    return { data: null, error };
  }
}

export async function signOut() {
  try {
    console.log('👋 Cerrando sesión...');
    
    const { error } = await supabase.auth.signOut();
    
    if (error) throw error;
    
    return { error: null };
  } catch (error: any) {
    console.error('❌ Error en signOut:', error);
    return { error };
  }
}

export async function getCurrentUser() {
  try {
    console.log('🔍 Obteniendo usuario actual...');
    
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error) throw error;
    
    return session?.user || null;
  } catch (error: any) {
    console.error('❌ Error en getCurrentUser:', error);
    return null;
  }
}

// Agency functions
export async function createAgencyProfile(
  userId: string,
  name: string,
  contactEmail: string,
  contactPhone?: string,
  website?: string,
  description?: string,
  logo?: string
) {
  try {
    console.log('🏢 Creando perfil de agencia para usuario:', userId);
    
    const { data, error } = await supabase
      .from('agencies')
      .insert({
        user_id: userId,
        name,
        description,
        logo,
        contact_email: contactEmail,
        contact_phone: contactPhone,
        website,
        is_active: true
      })
      .select()
      .single();
      
    if (error) throw error;
    
    return { data, error: null };
  } catch (error: any) {
    console.error('❌ Error en createAgencyProfile:', error);
    return { data: null, error };
  }
}

export async function updateAgencyStatus(agencyId: string, isActive: boolean) {
  try {
    console.log(`🏢 ${isActive ? 'Activando' : 'Desactivando'} agencia:`, agencyId);
    
    const { data, error } = await supabase
      .from('agencies')
      .update({ is_active: isActive })
      .eq('id', agencyId)
      .select()
      .single();
      
    if (error) throw error;
    
    return { data, error: null };
  } catch (error: any) {
    console.error('❌ Error en updateAgencyStatus:', error);
    return { data: null, error };
  }
}

export async function getAllAgencies() {
  try {
    console.log('🏢 Obteniendo todas las agencias...');
    
    const { data, error } = await supabase
      .from('agencies')
      .select(`
        *,
        users(first_name, last_name, email)
      `)
      .order('created_at', { ascending: false });
      
    if (error) throw error;
    
    return { data, error: null };
  } catch (error: any) {
    console.error('❌ Error en getAllAgencies:', error);
    return { data: null, error };
  }
}

// Tour functions
export async function createTour(tourData: any, destinationNames: string[], userId: string) {
  try {
    console.log('🏕️ Creando nuevo tour:', tourData.name);
    
    // First get the agency ID for this user
    const { data: agencyData, error: agencyError } = await supabase
      .from('agencies')
      .select('id')
      .eq('user_id', userId)
      .single();
      
    if (agencyError) throw agencyError;
    
    // Create the tour
    const { data: tour, error: tourError } = await supabase
      .from('tours')
      .insert({
        ...tourData,
        agency_id: agencyData.id
      })
      .select()
      .single();
      
    if (tourError) throw tourError;
    
    // Link tour to destinations
    if (destinationNames.length > 0) {
      // First, get or create the destinations
      for (const destName of destinationNames) {
        // Check if destination exists
        const { data: existingDest } = await supabase
          .from('destinations')
          .select('id')
          .eq('name', destName)
          .maybeSingle();
          
        let destId;
        
        if (existingDest) {
          destId = existingDest.id;
        } else {
          // Create new destination
          const { data: newDest, error: destError } = await supabase
            .from('destinations')
            .insert({
              name: destName,
              is_active: true,
              last_updated_by: userId
            })
            .select('id')
            .single();
            
          if (destError) throw destError;
          destId = newDest.id;
        }
        
        // Link tour to destination
        const { error: linkError } = await supabase
          .from('tour_destinations')
          .insert({
            tour_id: tour.id,
            destination_id: destId
          });
          
        if (linkError) throw linkError;
      }
    }
    
    return { data: tour, error: null };
  } catch (error: any) {
    console.error('❌ Error en createTour:', error);
    return { data: null, error };
  }
}

export async function updateTour(tourId: string, tourData: any) {
  try {
    console.log('🏕️ Actualizando tour:', tourId);
    
    const { data, error } = await supabase
      .from('tours')
      .update(tourData)
      .eq('id', tourId)
      .select()
      .single();
      
    if (error) throw error;
    
    return { data, error: null };
  } catch (error: any) {
    console.error('❌ Error en updateTour:', error);
    return { data: null, error };
  }
}

export async function deleteTour(tourId: string) {
  try {
    console.log('🏕️ Eliminando tour:', tourId);
    
    const { error } = await supabase
      .from('tours')
      .delete()
      .eq('id', tourId);
      
    if (error) throw error;
    
    return { error: null };
  } catch (error: any) {
    console.error('❌ Error en deleteTour:', error);
    return { error };
  }
}

export async function getTours(filters: {
  destination?: string | null;
  category?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  limit?: number;
} = {}) {
  try {
    console.log('🏕️ Obteniendo tours con filtros:', filters);
    
    let query = supabase
      .from('tours')
      .select(`
        *,
        agencies(id, name, rating)
      `);
    
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
    
    // Order by featured first, then by creation date
    query = query.order('is_featured', { ascending: false }).order('created_at', { ascending: false });
    
    // Apply limit if specified
    if (filters.limit) {
      query = query.limit(filters.limit);
    }
    
    const { data, error } = await query;
    
    if (error) throw error;
    
    return { data, error: null };
  } catch (error: any) {
    console.error('❌ Error en getTours:', error);
    return { data: null, error };
  }
}

export async function getTourById(id: string) {
  try {
    console.log('🏕️ Obteniendo tour por ID:', id);
    
    const { data, error } = await supabase
      .from('tours')
      .select(`
        *,
        agencies(id, name, rating, logo, description, contact_email)
      `)
      .eq('id', id)
      .single();
      
    if (error) throw error;
    
    return { data, error: null };
  } catch (error: any) {
    console.error('❌ Error en getTourById:', error);
    return { data: null, error };
  }
}

// Booking functions
export async function createBooking(bookingData: Partial<Booking>) {
  try {
    console.log('🎫 Creando reserva para tour:', bookingData.tour_id);
    
    const { data, error } = await supabase
      .from('bookings')
      .insert(bookingData)
      .select()
      .single();
      
    if (error) throw error;
    
    return { data, error: null };
  } catch (error: any) {
    console.error('❌ Error en createBooking:', error);
    return { data: null, error };
  }
}

export async function getUserBookings(userId: string) {
  try {
    console.log('🎫 Obteniendo reservas para usuario:', userId);
    
    const { data, error } = await supabase
      .from('bookings')
      .select(`
        *,
        tours(id, name, destination, image_url, start_date, end_date),
        agencies(id, name, contact_email)
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
      
    if (error) throw error;
    
    return { data, error: null };
  } catch (error: any) {
    console.error('❌ Error en getUserBookings:', error);
    return { data: null, error };
  }
}

export async function getAgencyBookings(agencyId: string) {
  try {
    console.log('🎫 Obteniendo reservas para agencia:', agencyId);
    
    const { data, error } = await supabase
      .from('bookings')
      .select(`
        *,
        tours(id, name, destination, image_url, start_date, end_date),
        users(id, first_name, last_name, email)
      `)
      .eq('agency_id', agencyId)
      .order('created_at', { ascending: false });
      
    if (error) throw error;
    
    return { data, error: null };
  } catch (error: any) {
    console.error('❌ Error en getAgencyBookings:', error);
    return { data: null, error };
  }
}

// Review functions
export async function getTourReviews(tourId: string) {
  try {
    console.log('⭐ Obteniendo reseñas para tour:', tourId);
    
    const { data, error } = await supabase
      .from('reviews')
      .select(`
        *,
        users(first_name, last_name)
      `)
      .eq('tour_id', tourId)
      .eq('is_visible', true)
      .order('created_at', { ascending: false });
      
    if (error) throw error;
    
    return { data, error: null };
  } catch (error: any) {
    console.error('❌ Error en getTourReviews:', error);
    return { data: null, error };
  }
}

// Destination functions
export async function getAllDestinations() {
  try {
    console.log('🌍 Obteniendo todos los destinos...');
    
    const { data, error } = await supabase
      .from('destinations')
      .select(`
        *,
        destination_images(*),
        tour_destinations(*)
      `)
      .order('name', { ascending: true });
      
    if (error) throw error;
    
    return { data, error: null };
  } catch (error: any) {
    console.error('❌ Error en getAllDestinations:', error);
    return { data: null, error };
  }
}

export async function searchDestinations(query: string) {
  try {
    console.log('🔍 Buscando destinos con query:', query);
    
    const { data, error } = await supabase
      .from('destinations')
      .select('id, name')
      .ilike('name', `%${query}%`)
      .order('name')
      .limit(10);
      
    if (error) throw error;
    
    return { data, error: null };
  } catch (error: any) {
    console.error('❌ Error en searchDestinations:', error);
    return { data: null, error };
  }
}

export async function createDestination(destinationData: Partial<Destination>) {
  try {
    console.log('🌍 Creando nuevo destino:', destinationData.name);
    
    const { data, error } = await supabase
      .from('destinations')
      .insert(destinationData)
      .select()
      .single();
      
    if (error) throw error;
    
    return { data, error: null };
  } catch (error: any) {
    console.error('❌ Error en createDestination:', error);
    return { data: null, error };
  }
}

export async function updateDestination(id: string, destinationData: Partial<Destination>) {
  try {
    console.log('🌍 Actualizando destino:', id);
    
    const { data, error } = await supabase
      .from('destinations')
      .update(destinationData)
      .eq('id', id)
      .select()
      .single();
      
    if (error) throw error;
    
    return { data, error: null };
  } catch (error: any) {
    console.error('❌ Error en updateDestination:', error);
    return { data: null, error };
  }
}

export async function deleteDestination(id: string) {
  try {
    console.log('🌍 Eliminando destino:', id);
    
    const { error } = await supabase
      .from('destinations')
      .delete()
      .eq('id', id);
      
    if (error) throw error;
    
    return { error: null };
  } catch (error: any) {
    console.error('❌ Error en deleteDestination:', error);
    return { error };
  }
}

export async function addDestinationImage(destinationId: string, imageData: Partial<DestinationImage>) {
  try {
    console.log('🖼️ Agregando imagen a destino:', destinationId);
    
    const { data, error } = await supabase
      .from('destination_images')
      .insert({
        destination_id: destinationId,
        ...imageData
      })
      .select()
      .single();
      
    if (error) throw error;
    
    return { data, error: null };
  } catch (error: any) {
    console.error('❌ Error en addDestinationImage:', error);
    return { data: null, error };
  }
}

export async function deleteDestinationImage(imageId: string) {
  try {
    console.log('🖼️ Eliminando imagen:', imageId);
    
    const { error } = await supabase
      .from('destination_images')
      .delete()
      .eq('id', imageId);
      
    if (error) throw error;
    
    return { error: null };
  } catch (error: any) {
    console.error('❌ Error en deleteDestinationImage:', error);
    return { error };
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
    
    if (error) throw error;
    
    return { data, error: null };
  } catch (error: any) {
    console.error('❌ Error en getUserNotifications:', error);
    return { data: null, error };
  }
}

export async function markNotificationAsRead(notificationId: string) {
  console.log('✓ Marcando notificación como leída:', notificationId);
  
  try {
    const { data, error } = await supabase.rpc('mark_notification_as_read', { 
      notification_id: notificationId 
    });
    
    if (error) throw error;
    
    return { data, error: null };
  } catch (error: any) {
    console.error('❌ Error en markNotificationAsRead:', error);
    return { data: null, error };
  }
}

export async function markAllNotificationsAsRead() {
  console.log('✓ Marcando todas las notificaciones como leídas');
  
  try {
    const { data, error } = await supabase.rpc('mark_all_notifications_as_read');
    
    if (error) throw error;
    
    return { data, error: null };
  } catch (error: any) {
    console.error('❌ Error en markAllNotificationsAsRead:', error);
    return { data: null, error };
  }
}

export async function getUnreadNotificationCount() {
  console.log('🔢 Obteniendo conteo de notificaciones no leídas');
  
  try {
    const { data, error } = await supabase.rpc('get_unread_notifications_count');
    
    if (error) throw error;
    
    return { data, error: null };
  } catch (error: any) {
    console.error('❌ Error en getUnreadNotificationCount:', error);
    return { data: null, error };
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
  // Parse date in YYYY-MM-DD format
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function formatDateForDB(date: Date): string {
  // Format date as YYYY-MM-DD
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}