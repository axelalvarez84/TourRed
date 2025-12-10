import { createClient } from '@supabase/supabase-js';
import { format, parse } from 'date-fns';
import { Tour, Booking, Destination, DestinationImage, ImageUploadData } from '../types';

// Initialize Supabase client
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// User roles enum
export enum UserRole {
  ADMIN = 'admin',
  AGENCY = 'agency',
  TRAVELER = 'traveler',
}

// Date formatting helpers
export const formatDateForDB = (date: Date): string => {
  return format(date, 'yyyy-MM-dd');
};

export const parseDateFromDB = (dateString: string): Date => {
  // Parse the date string and set it to midnight UTC
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date;
};

// Auth functions
export const signUp = async (
  email: string,
  password: string,
  role: UserRole,
  profileData: Record<string, any> = {}
) => {
  try {
    console.log('🔐 Registrando usuario con email:', email, 'y rol:', role);
    
    // Check if user already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id, email')
      .eq('email', email)
      .maybeSingle();
    
    let isExistingUser = false;
    
    if (existingUser) {
      console.log('⚠️ Usuario ya existe en la tabla users:', existingUser);
      isExistingUser = true;
      
      // Sign in instead
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      
      if (error) throw error;
      
      // Update user metadata with role
      await supabase.auth.updateUser({
        data: { role }
      });
      
      return { data, error: null, profileData: existingUser, isExistingUser };
    }
    
    // Create new user
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { role }
      }
    });
    
    if (error) throw error;
    
    if (!data.user) {
      throw new Error('No se pudo crear el usuario');
    }
    
    // Create user profile
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .insert({
        id: data.user.id,
        email: email,
        role: role,
        ...profileData
      })
      .select()
      .single();
    
    if (profileError) {
      console.error('❌ Error creando perfil:', profileError);
    }
    
    return { data, error: null, profileData: profile, isExistingUser };
  } catch (error: any) {
    console.error('❌ Error en signUp:', error);
    return { data: null, error, profileData: null, isExistingUser: false };
  }
};

export const signIn = async (email: string, password: string) => {
  try {
    console.log('🔐 Iniciando sesión con email:', email);
    
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    
    if (error) throw error;
    
    return { data, error: null };
  } catch (error: any) {
    console.error('❌ Error en signIn:', error);
    return { data: null, error };
  }
};

export const signOut = async () => {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    return { error: null };
  } catch (error: any) {
    console.error('❌ Error en signOut:', error);
    return { error };
  }
};

export const getCurrentUser = async () => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;
    
    const { data: { user } } = await supabase.auth.getUser();
    return user;
  } catch (error) {
    console.error('❌ Error en getCurrentUser:', error);
    return null;
  }
};

// Agency functions
export const createAgencyProfile = async (
  userId: string,
  name: string,
  contactEmail: string,
  contactPhone?: string
) => {
  try {
    const { data, error } = await supabase
      .from('agencies')
      .insert({
        user_id: userId,
        name,
        contact_email: contactEmail,
        contact_phone: contactPhone,
        is_active: true
      })
      .select()
      .single();
    
    return { data, error };
  } catch (error: any) {
    console.error('❌ Error en createAgencyProfile:', error);
    return { data: null, error };
  }
};

export const updateAgencyStatus = async (agencyId: string, isActive: boolean) => {
  try {
    const { data, error } = await supabase
      .from('agencies')
      .update({ is_active: isActive })
      .eq('id', agencyId)
      .select()
      .single();
    
    return { data, error };
  } catch (error: any) {
    console.error('❌ Error en updateAgencyStatus:', error);
    return { data: null, error };
  }
};

export const getAllAgencies = async () => {
  try {
    const { data, error } = await supabase
      .from('agencies')
      .select(`
        *,
        users(first_name, last_name, email)
      `)
      .order('created_at', { ascending: false });
    
    return { data, error };
  } catch (error: any) {
    console.error('❌ Error en getAllAgencies:', error);
    return { data: null, error };
  }
};

// Tour functions
export const getTours = async (filters: any = {}) => {
  try {
    console.log('🔍 Obteniendo tours con filtros:', filters);

    let query = supabase
      .from('tours')
      .select(`
        *,
        agencies(id, name, rating)
      `);

    // Only show tours that haven't ended yet (unless explicitly disabled)
    if (filters.includeExpired !== true) {
      const today = formatDateForDB(new Date());
      query = query.gte('end_date', today);
    }

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

    // Order by featured first, then created_at
    query = query.order('is_featured', { ascending: false }).order('created_at', { ascending: false });

    const { data, error } = await query;

    return { data, error };
  } catch (error: any) {
    console.error('❌ Error en getTours:', error);
    return { data: null, error };
  }
};

export const getTourById = async (id: string) => {
  try {
    const { data, error } = await supabase
      .from('tours')
      .select(`
        *,
        agencies(id, name, rating, logo, description, contact_email)
      `)
      .eq('id', id)
      .single();
    
    return { data, error };
  } catch (error: any) {
    console.error('❌ Error en getTourById:', error);
    return { data: null, error };
  }
};

export const createTour = async (tourData: any, destinations: string[], userId: string) => {
  try {
    console.log('🏞️ Creando tour con datos:', tourData);
    
    // First get the agency ID for this user
    const { data: agencyData, error: agencyError } = await supabase
      .from('agencies')
      .select('id')
      .eq('user_id', userId)
      .single();
    
    if (agencyError) {
      throw new Error('No se encontró la agencia para este usuario');
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
      throw new Error(`Error al crear el tour: ${tourError.message}`);
    }
    
    // Add tour-destination relationships
    if (destinations.length > 0) {
      const tourDestinations = destinations.map(destination => ({
        tour_id: tour.id,
        destination_id: destination
      }));
      
      const { error: relationError } = await supabase
        .from('tour_destinations')
        .insert(tourDestinations);
      
      if (relationError) {
        console.error('❌ Error al asociar destinos:', relationError);
      }
    }
    
    return { data: tour, error: null };
  } catch (error: any) {
    console.error('❌ Error en createTour:', error);
    return { data: null, error };
  }
};

export const updateTour = async (tourId: string, tourData: any) => {
  try {
    const { data, error } = await supabase
      .from('tours')
      .update(tourData)
      .eq('id', tourId)
      .select()
      .single();
    
    return { data, error };
  } catch (error: any) {
    console.error('❌ Error en updateTour:', error);
    return { data: null, error };
  }
};

export const deleteTour = async (tourId: string) => {
  try {
    const { error } = await supabase
      .from('tours')
      .delete()
      .eq('id', tourId);
    
    return { error };
  } catch (error: any) {
    console.error('❌ Error en deleteTour:', error);
    return { error };
  }
};

// Booking functions
export const createBooking = async (bookingData: any) => {
  try {
    const { data, error } = await supabase
      .from('bookings')
      .insert(bookingData)
      .select()
      .single();
    
    return { data, error };
  } catch (error: any) {
    console.error('❌ Error en createBooking:', error);
    return { data: null, error };
  }
};

export const getUserBookings = async (userId: string) => {
  try {
    const { data, error } = await supabase
      .from('bookings')
      .select(`
        *,
        tours(id, name, destination, image_url, start_date, end_date),
        agencies(id, name, contact_email)
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    
    return { data, error };
  } catch (error: any) {
    console.error('❌ Error en getUserBookings:', error);
    return { data: null, error };
  }
};

export const getAgencyBookings = async (agencyId: string) => {
  try {
    const { data, error } = await supabase
      .from('bookings')
      .select(`
        *,
        tours(id, name, destination, image_url, start_date, end_date),
        users!bookings_user_id_fkey(id, first_name, last_name, email)
      `)
      .eq('agency_id', agencyId)
      .order('created_at', { ascending: false });
    
    return { data, error };
  } catch (error: any) {
    console.error('❌ Error en getAgencyBookings:', error);
    return { data: null, error };
  }
};

// Review functions
export const getTourReviews = async (tourId: string) => {
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
  } catch (error: any) {
    console.error('❌ Error en getTourReviews:', error);
    return { data: null, error };
  }
};

// Destination functions
export const getAllDestinations = async () => {
  try {
    const { data, error } = await supabase
      .from('destinations')
      .select(`
        *,
        destination_images(id, image_url, image_base64, caption, is_featured),
        tour_destinations(tour_id)
      `)
      .order('name', { ascending: true });
    
    return { data, error };
  } catch (error: any) {
    console.error('❌ Error en getAllDestinations:', error);
    return { data: null, error };
  }
};

export const searchDestinations = async (query: string) => {
  try {
    const { data, error } = await supabase
      .from('destinations')
      .select('id, name')
      .ilike('name', `%${query}%`)
      .order('name', { ascending: true })
      .limit(5);
    
    return { data, error };
  } catch (error: any) {
    console.error('❌ Error en searchDestinations:', error);
    return { data: null, error };
  }
};

export const createDestination = async (destinationData: any) => {
  try {
    const { data, error } = await supabase
      .from('destinations')
      .insert(destinationData)
      .select()
      .maybeSingle();
    
    if (error) {
      return { data: null, error };
    }
    
    if (!data) {
      return { data: null, error: new Error('No se pudo crear el destino o recuperar el registro creado.') };
    }
    
    return { data, error };
  } catch (error: any) {
    console.error('❌ Error en createDestination:', error);
    return { data: null, error };
  }
};

export const updateDestination = async (destinationId: string, destinationData: any) => {
  try {
    const { data, error } = await supabase
      .from('destinations')
      .update(destinationData)
      .eq('id', destinationId)
      .select();
    
    if (error) {
      return { data: null, error };
    }
    
    if (!data || data.length === 0) {
      return { data: null, error: new Error('No se encontró el destino para actualizar o no se realizaron cambios.') };
    }
    
    return { data: data[0], error: null };
  } catch (error: any) {
    console.error('❌ Error en updateDestination:', error);
    return { data: null, error };
  }
};

export const deleteDestination = async (destinationId: string) => {
  try {
    const { error } = await supabase
      .from('destinations')
      .delete()
      .eq('id', destinationId);
    
    return { error };
  } catch (error: any) {
    console.error('❌ Error en deleteDestination:', error);
    return { error };
  }
};

export const addDestinationImage = async (destinationId: string, imageData: any) => {
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
  } catch (error: any) {
    console.error('❌ Error en addDestinationImage:', error);
    return { data: null, error };
  }
};

export const deleteDestinationImage = async (imageId: string) => {
  try {
    const { error } = await supabase
      .from('destination_images')
      .delete()
      .eq('id', imageId);
    
    return { error };
  } catch (error: any) {
    console.error('❌ Error en deleteDestinationImage:', error);
    return { error };
  }
};

// Notification functions
export const getUserNotifications = async (limit = 10, offset = 0, includeRead = false) => {
  try {
    const { data, error } = await supabase.rpc('get_user_notifications', { 
      limit_count: limit,
      offset_count: offset,
      include_read: includeRead
    });
    
    return { data, error };
  } catch (error: any) {
    console.error('❌ Error en getUserNotifications:', error);
    return { data: null, error };
  }
};

export const markNotificationAsRead = async (notificationId: string) => {
  try {
    const { data, error } = await supabase.rpc('mark_notification_as_read', { 
      notification_id: notificationId 
    });
    
    return { data, error };
  } catch (error: any) {
    console.error('❌ Error en markNotificationAsRead:', error);
    return { data: null, error };
  }
};

export const markAllNotificationsAsRead = async () => {
  try {
    const { data, error } = await supabase.rpc('mark_all_notifications_as_read');
    
    return { data, error };
  } catch (error: any) {
    console.error('❌ Error en markAllNotificationsAsRead:', error);
    return { data: null, error };
  }
};

export const getUnreadNotificationCount = async () => {
  try {
    const { data, error } = await supabase.rpc('get_unread_notifications_count');
    
    return { data, error };
  } catch (error: any) {
    console.error('❌ Error en getUnreadNotificationCount:', error);
    return { data: null, error };
  }
};

// Helper function to get image source (base64 or URL)
export const getImageSrc = (base64?: string, url?: string): string => {
  if (base64) {
    return base64;
  }
  if (url) {
    return url;
  }
  return 'https://images.pexels.com/photos/1271619/pexels-photo-1271619.jpeg'; // Default image
};