import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://your-supabase-url.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'your-anon-key';

console.log('🔧 Configuración de Supabase:');
console.log('URL:', supabaseUrl);
console.log('Anon Key:', supabaseAnonKey ? `${supabaseAnonKey.substring(0, 20)}...` : 'NO CONFIGURADA');

// Validate environment variables
if (!supabaseUrl || supabaseUrl === 'https://your-supabase-url.supabase.co') {
  console.error('❌ VITE_SUPABASE_URL no está configurada correctamente');
}

if (!supabaseAnonKey || supabaseAnonKey === 'your-anon-key') {
  console.error('❌ VITE_SUPABASE_ANON_KEY no está configurada correctamente');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  },
  global: {
    headers: {
      'X-Client-Info': 'tourred-web-app'
    }
  }
});

// User roles
export enum UserRole {
  TRAVELER = 'traveler',
  AGENCY = 'agency',
  ADMIN = 'admin',
}

// Helper function to format date for database (YYYY-MM-DD)
export function formatDateForDB(date: string | Date): string {
  const d = new Date(date);
  // Use local timezone to avoid UTC conversion issues
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Helper function to parse date from database
export function parseDateFromDB(dateString: string): Date {
  // Parse as local date to avoid timezone issues
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
}

// Helper function to create user profile
async function createUserProfile(userId: string, role: UserRole, additionalData?: any) {
  console.log('👤 Creando perfil de usuario:', { userId, role, additionalData });
  
  try {
    // First check if profile already exists - use maybeSingle() to avoid PGRST116 error
    const { data: existingProfile } = await supabase
      .from('users')
      .select('id')
      .eq('id', userId)
      .maybeSingle();

    if (existingProfile) {
      console.log('✅ Perfil ya existe:', existingProfile);
      return { data: existingProfile, error: null };
    }

    // Create new profile
    const { data, error } = await supabase
      .from('users')
      .insert({
        id: userId,
        role: role,
        first_name: additionalData?.first_name || '',
        last_name: additionalData?.last_name || ''
      })
      .select()
      .single();
    
    console.log('📊 Resultado de creación de perfil:', { data, error });
    return { data, error };
    
  } catch (error: any) {
    console.error('❌ Error en createUserProfile:', error);
    return { data: null, error };
  }
}

// Auth helper functions
export async function signUp(email: string, password: string, role: UserRole = UserRole.TRAVELER, additionalData?: any) {
  console.log('🔐 Iniciando registro:', { email, role, additionalData });
  
  try {
    // 1. Try to create auth user
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          role,
          ...additionalData
        },
      },
    });
    
    console.log('📝 Resultado del registro en auth:', { data, error });
    
    // Handle case where user already exists
    if (error && error.message.includes('already registered')) {
      console.log('👤 Usuario ya existe, intentando login...');
      
      // Try to sign in the existing user
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      
      if (signInError) {
        return { 
          data: null, 
          error: { message: 'El usuario ya existe pero la contraseña es incorrecta' },
          profileData: null,
          isExistingUser: true 
        };
      }
      
      if (signInData.user) {
        // Check if profile exists, create if not
        const { data: profileData, error: profileError } = await createUserProfile(
          signInData.user.id, 
          role, 
          additionalData
        );
        
        return { 
          data: signInData, 
          error: null, // Return null error for successful existing user login
          profileData,
          isExistingUser: true 
        };
      }
    }
    
    if (error) {
      return { data: null, error, profileData: null, isExistingUser: false };
    }

    if (!data.user) {
      return { 
        data: null, 
        error: { message: 'No se pudo crear el usuario' },
        profileData: null,
        isExistingUser: false 
      };
    }

    // 2. Wait a moment for auth to complete
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 3. Create profile in public.users table
    const { data: profileData, error: profileError } = await createUserProfile(
      data.user.id, 
      role, 
      additionalData
    );
    
    if (profileError) {
      console.error('❌ Error al crear perfil:', profileError);
      // Don't throw here, just log the error
    }

    return { data, error: null, profileData, isExistingUser: false };
    
  } catch (error: any) {
    console.error('❌ Error en signUp:', error);
    return { data: null, error, profileData: null, isExistingUser: false };
  }
}

export async function signIn(email: string, password: string) {
  console.log('🔐 Iniciando sesión:', email);
  
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  
  console.log('📝 Resultado del login:', { data, error });
  
  // If login successful, ensure profile exists
  if (data.user && !error) {
    const role = data.user.user_metadata?.role || UserRole.TRAVELER;
    await createUserProfile(data.user.id, role, data.user.user_metadata);
  }
  
  return { data, error };
}

export async function signOut() {
  console.log('🚪 Cerrando sesión...');
  const { error } = await supabase.auth.signOut();
  console.log('📝 Resultado del logout:', { error });
  return { error };
}

export async function getCurrentUser() {
  console.log('👤 Obteniendo usuario actual...');
  
  try {
    // Test connection first
    const { data: connectionTest, error: connectionError } = await supabase
      .from('users')
      .select('count')
      .limit(1)
      .single();
    
    if (connectionError && connectionError.code !== 'PGRST116') {
      console.error('❌ Error de conexión a Supabase:', connectionError);
      throw new Error(`Conexión a Supabase falló: ${connectionError.message}`);
    }
    
    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (error) {
      // Check if this is an expected session-related error
      const sessionErrors = [
        'Auth session missing!',
        'session_not_found',
        'Session from session_id claim in JWT does not exist',
        'refresh_token_not_found'
      ];
      
      const isSessionError = sessionErrors.some(errMsg => 
        error.message.includes(errMsg)
      );
      
      if (isSessionError) {
        console.log('ℹ️ Sesión inválida o expirada:', error.message);
        // Clean up invalid session
        await supabase.auth.signOut();
      } else {
        // Log unexpected errors
        console.error('❌ Error obteniendo usuario actual:', error);
        throw error;
      }
      
      return null;
    }
    
    console.log('📝 Usuario actual:', user);
    return user;
  } catch (error: any) {
    console.error('❌ Error en getCurrentUser:', error);
    
    // Check if it's a network error
    if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
      throw new Error('Error de conexión: No se puede conectar al servidor. Verifica tu conexión a internet.');
    }
    
    // Clean up on unexpected errors
    const sessionErrors = ['session_not_found', 'refresh_token_not_found'];
    if (error.message && sessionErrors.some(errMsg => error.message.includes(errMsg))) {
      console.log('🔄 Token inválido, limpiando sesión...');
      await supabase.auth.signOut();
    }
    
    return null;
  }
}

export async function getCurrentSession() {
  console.log('🎫 Obteniendo sesión actual...');
  
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error) {
      // Check if this is an expected session-related error
      const sessionErrors = [
        'Auth session missing!',
        'session_not_found',
        'Session from session_id claim in JWT does not exist',
        'refresh_token_not_found'
      ];
      
      const isSessionError = sessionErrors.some(errMsg => 
        error.message.includes(errMsg)
      );
      
      if (isSessionError) {
        console.log('ℹ️ Sesión inválida o expirada:', error.message);
        // Clean up invalid session
        await supabase.auth.signOut();
      } else {
        // Log unexpected errors
        console.error('❌ Error obteniendo sesión actual:', error);
      }
      
      return null;
    }
    
    console.log('📝 Sesión actual:', session);
    return session;
  } catch (error: any) {
    console.error('❌ Error en getCurrentSession:', error);
    
    // Clean up on unexpected errors
    const sessionErrors = ['session_not_found', 'refresh_token_not_found'];
    if (error.message && sessionErrors.some(errMsg => error.message.includes(errMsg))) {
      console.log('🔄 Token inválido, limpiando sesión...');
      await supabase.auth.signOut();
    }
    
    return null;
  }
}

// Agency profile creation
export async function createAgencyProfile(userId: string, agencyName: string, email: string, phoneNumber: string) {
  console.log('🏢 Creando perfil de agencia para usuario:', userId);
  console.log('📊 Datos de agencia:', { agencyName, email, phoneNumber });
  
  try {
    // First, ensure we have a valid session
    const { data: { session } } = await supabase.auth.getSession();
    console.log('🎫 Sesión actual para crear agencia:', session?.user?.id);
    
    if (!session || session.user.id !== userId) {
      console.error('❌ No hay sesión válida o el usuario no coincide');
      return { data: null, error: { message: 'No hay sesión válida para crear la agencia' } };
    }

    // Check if agency profile already exists - use maybeSingle() to avoid PGRST116 error
    const { data: existingAgency } = await supabase
      .from('agencies')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();

    if (existingAgency) {
      console.log('✅ Perfil de agencia ya existe:', existingAgency);
      return { data: existingAgency, error: null };
    }

    // Create new agency profile
    console.log('➕ Insertando nueva agencia...');
    const { data, error } = await supabase
      .from('agencies')
      .insert({
        user_id: userId,
        name: agencyName,
        contact_email: email,
        contact_phone: phoneNumber,
        is_active: true
      })
      .select()
      .single();

    console.log('📝 Resultado de creación de agencia:', { data, error });
    
    if (error) {
      console.error('❌ Error detallado al crear agencia:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      });
    }
    
    return { data, error };
  } catch (error: any) {
    console.error('❌ Error en createAgencyProfile:', error);
    return { data: null, error };
  }
}

// Database helper functions

// Destinations
export async function searchDestinations(query: string) {
  console.log('🔍 Buscando destinos:', query);
  
  const { data, error } = await supabase
    .from('destinations')
    .select('id, name, country, description')
    .ilike('name', `%${query}%`)
    .eq('is_active', true)
    .limit(5);
  
  console.log('📝 Resultados de búsqueda de destinos:', { data, error });
  return { data, error };
}

export async function getAllDestinations() {
  console.log('🌍 Obteniendo todos los destinos...');
  
  const { data, error } = await supabase
    .from('destinations')
    .select(`
      *,
      destination_images(id, image_url, image_base64, caption, is_featured),
      tour_destinations(
        tours(id)
      )
    `)
    .eq('is_active', true)
    .order('name');
  
  console.log('📝 Resultado de consulta de destinos:', { data, error });
  return { data, error };
}

export async function getDestinationById(id: string) {
  console.log('🌍 Obteniendo destino por ID:', id);
  
  const { data, error } = await supabase
    .from('destinations')
    .select(`
      *,
      destination_images(id, image_url, image_base64, caption, is_featured, created_at),
      tour_destinations(
        tours(id, name, price, image_url)
      )
    `)
    .eq('id', id)
    .single();
  
  console.log('📝 Resultado de consulta de destino:', { data, error });
  return { data, error };
}

export async function createDestination(destinationData: any) {
  console.log('🌍 Creando destino:', destinationData);
  
  // Si destinationData es solo un string (nombre), crear objeto básico
  if (typeof destinationData === 'string') {
    const basicDestinationData = {
      name: destinationData,
      is_active: true
    };
    
    const { data, error } = await supabase
      .from('destinations')
      .insert(basicDestinationData)
      .select()
      .single();
    
    console.log('📝 Resultado de creación de destino básico:', { data, error });
    return { data, error };
  }
  
  // Si es un objeto completo, usar todos los campos disponibles
  const destinationToInsert: any = {
    name: destinationData.name,
    is_active: true
  };
  
  // Solo agregar campos opcionales si tienen valores
  if (destinationData.description) destinationToInsert.description = destinationData.description;
  if (destinationData.country) destinationToInsert.country = destinationData.country;
  if (destinationData.region) destinationToInsert.region = destinationData.region;
  if (destinationData.best_time_to_visit) destinationToInsert.best_time_to_visit = destinationData.best_time_to_visit;
  if (destinationData.average_temperature) destinationToInsert.average_temperature = destinationData.average_temperature;
  if (destinationData.currency) destinationToInsert.currency = destinationData.currency;
  if (destinationData.language) destinationToInsert.language = destinationData.language;
  if (destinationData.time_zone) destinationToInsert.time_zone = destinationData.time_zone;
  if (destinationData.main_image_url) destinationToInsert.main_image_url = destinationData.main_image_url;
  
  // Solo agregar campos de imagen base64 si están presentes
  if (destinationData.main_image_base64) {
    destinationToInsert.main_image_base64 = destinationData.main_image_base64;
    destinationToInsert.main_image_type = destinationData.main_image_type;
    destinationToInsert.main_image_size = destinationData.main_image_size;
  }
  
  const { data, error } = await supabase
    .from('destinations')
    .insert(destinationToInsert)
    .select()
    .single();
  
  console.log('📝 Resultado de creación de destino completo:', { data, error });
  return { data, error };
}

export async function updateDestination(id: string, updates: any) {
  console.log('✏️ Actualizando destino:', { id, updates });
  
  const { data, error } = await supabase
    .from('destinations')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  
  console.log('📝 Resultado de actualización de destino:', { data, error });
  return { data, error };
}

export async function addDestinationImage(destinationId: string, imageData: any) {
  console.log('📸 Agregando imagen a destino:', { destinationId, imageData });
  
  const { data, error } = await supabase
    .from('destination_images')
    .insert({
      destination_id: destinationId,
      ...imageData
    })
    .select()
    .single();
  
  console.log('📝 Resultado de agregar imagen:', { data, error });
  return { data, error };
}

export async function deleteDestinationImage(imageId: string) {
  console.log('🗑️ Eliminando imagen de destino:', imageId);
  
  const { error } = await supabase
    .from('destination_images')
    .delete()
    .eq('id', imageId);
  
  console.log('📝 Resultado de eliminación de imagen:', { error });
  return { error };
}

// Helper function to get or create destination
export async function getOrCreateDestination(name: string) {
  console.log('🌍 Obteniendo o creando destino:', name);
  
  try {
    // First, try to find existing destination
    const { data: existingDest, error: searchError } = await supabase
      .from('destinations')
      .select('id, name')
      .eq('name', name)
      .maybeSingle();

    if (searchError) {
      console.error('❌ Error buscando destino:', searchError);
      throw searchError;
    }

    if (existingDest) {
      console.log('✅ Destino existente encontrado:', existingDest);
      return { data: existingDest, error: null };
    }

    // If not found, create new destination with only the name
    console.log('➕ Creando nuevo destino básico:', name);
    const { data: newDest, error: createError } = await createDestination(name);
    
    if (createError) {
      console.error('❌ Error creando destino:', createError);
      throw createError;
    }

    console.log('✅ Nuevo destino básico creado:', newDest);
    return { data: newDest, error: null };
    
  } catch (error: any) {
    console.error('❌ Error en getOrCreateDestination:', error);
    return { data: null, error };
  }
}

// Get agency ID for the current user
async function getAgencyId(userId: string) {
  console.log('🏢 Obteniendo ID de agencia para usuario:', userId);
  
  const { data, error } = await supabase
    .from('agencies')
    .select('id')
    .eq('user_id', userId)
    .single();

  console.log('📝 Resultado de consulta de agencia:', { data, error });

  if (error) {
    throw new Error('Failed to get agency ID: ' + error.message);
  }

  if (!data) {
    throw new Error('No agency found for the current user');
  }

  return data.id;
}

// Tours
export async function createTour(tourData: any, destinations: string[], userId: string) {
  try {
    console.log('🎯 Creando tour para usuario:', userId);
    console.log('📊 Datos del tour:', tourData);
    console.log('🌍 Destinos:', destinations);
    
    if (!destinations || destinations.length === 0) {
      throw new Error('Debe proporcionar al menos un destino');
    }

    // Get the agency ID for the current user
    const agencyId = await getAgencyId(userId);
    console.log('🏢 ID de agencia encontrado:', agencyId);

    // Process destinations and get/create them
    const destinationIds: string[] = [];
    const processedDestinations: any[] = [];

    for (const destinationName of destinations) {
      console.log('🌍 Procesando destino:', destinationName);
      
      const { data: destination, error: destError } = await getOrCreateDestination(destinationName);
      
      if (destError || !destination) {
        console.error('❌ Error procesando destino:', destinationName, destError);
        throw new Error(`Error procesando destino "${destinationName}": ${destError?.message || 'Unknown error'}`);
      }

      destinationIds.push(destination.id);
      processedDestinations.push(destination);
    }

    console.log('✅ Destinos procesados:', processedDestinations);

    // Clean tour data - remove undefined values and format dates properly
    const cleanTourData = Object.fromEntries(
      Object.entries({
        ...tourData,
        agency_id: agencyId,
        destination: destinations[0], // Use the first destination as the primary destination
        // Format dates to ensure they're stored correctly
        start_date: formatDateForDB(tourData.start_date),
        end_date: formatDateForDB(tourData.end_date),
        booking_deadline: tourData.booking_deadline ? formatDateForDB(tourData.booking_deadline) : null,
        updated_at: new Date().toISOString()
      }).filter(([_, value]) => value !== undefined && value !== null && value !== '')
    );

    console.log('📊 Datos finales del tour (limpiados):', cleanTourData);

    // Create the tour
    const { data: tour, error: tourError } = await supabase
      .from('tours')
      .insert(cleanTourData)
      .select()
      .single();

    console.log('📝 Resultado de creación de tour:', { tour, tourError });

    if (tourError) {
      console.error('❌ Error creando tour:', tourError);
      throw new Error(`Error creando tour: ${tourError.message}`);
    }

    // Link all destinations to the tour
    for (let i = 0; i < destinationIds.length; i++) {
      const destinationId = destinationIds[i];
      const destinationName = destinations[i];
      
      console.log('🔗 Vinculando destino al tour:', { 
        tourId: tour.id, 
        destinationId, 
        destinationName 
      });
      
      const { error: linkError } = await supabase
        .from('tour_destinations')
        .insert({
          tour_id: tour.id,
          destination_id: destinationId
        });
      
      if (linkError) {
        console.error('❌ Error vinculando destino:', linkError);
        // Don't throw here, just log the error as the tour was created successfully
      } else {
        console.log('✅ Destino vinculado exitosamente');
      }
    }

    console.log('🎉 Tour creado exitosamente con todos los destinos');
    return { data: tour, error: null };
    
  } catch (error: any) {
    console.error('❌ Error en createTour:', error);
    return { data: null, error: { message: error.message } };
  }
}

export async function getTours({ 
  destination = null, 
  category = null, 
  startDate = null, 
  endDate = null,
  limit = 10,
  offset = 0
} = {}) {
  console.log('🔍 Obteniendo tours con filtros:', { destination, category, startDate, endDate, limit, offset });
  
  let query = supabase
    .from('tours')
    .select(`
      *,
      agencies(id, name, logo, rating),
      tour_destinations(
        destinations(id, name)
      )
    `)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (destination) {
    query = query.ilike('destination', `%${destination}%`);
  }

  if (category) {
    query = query.eq('category', category);
  }

  if (startDate && endDate) {
    query = query.gte('start_date', startDate).lte('end_date', endDate);
  } else if (startDate) {
    query = query.gte('start_date', startDate);
  } else if (endDate) {
    query = query.lte('end_date', endDate);
  }

  const { data, error } = await query;
  console.log('📝 Resultado de consulta de tours:', { data, error });
  return { data, error };
}

export async function getTourById(id: string) {
  console.log('🎯 Obteniendo tour por ID:', id);
  
  const { data, error } = await supabase
    .from('tours')
    .select(`
      *,
      agencies(id, name, logo, rating, description)
    `)
    .eq('id', id)
    .single();

  console.log('📝 Resultado de consulta de tour:', { data, error });
  return { data, error };
}

// Bookings
export async function createBooking(booking: any) {
  console.log('📅 Creando reserva:', booking);
  
  // Format booking date properly
  const formattedBooking = {
    ...booking,
    booking_date: formatDateForDB(booking.booking_date)
  };
  
  const { data, error } = await supabase
    .from('bookings')
    .insert(formattedBooking)
    .select()
    .single();

  console.log('📝 Resultado de creación de reserva:', { data, error });
  return { data, error };
}

export async function getUserBookings(userId: string) {
  console.log('📅 Obteniendo reservas del usuario:', userId);
  
  const { data, error } = await supabase
    .from('bookings')
    .select(`
      *,
      tours(id, name, destination, image_url, start_date, end_date),
      agencies(id, name)
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  console.log('📝 Resultado de consulta de reservas:', { data, error });
  return { data, error };
}

export async function getAgencyBookings(agencyId: string) {
  console.log('📅 Obteniendo reservas de la agencia:', agencyId);
  
  const { data, error } = await supabase
    .from('bookings')
    .select(`
      *,
      tours(id, name, destination, image_url, start_date, end_date),
      users(id, email, first_name, last_name)
    `)
    .eq('agency_id', agencyId)
    .order('created_at', { ascending: false });

  console.log('📝 Resultado de consulta de reservas de agencia:', { data, error });
  return { data, error };
}

// Reviews
export async function createReview(review: any) {
  console.log('⭐ Creando reseña:', review);
  
  const { data, error } = await supabase
    .from('reviews')
    .insert(review)
    .select()
    .single();

  console.log('📝 Resultado de creación de reseña:', { data, error });
  return { data, error };
}

export async function getTourReviews(tourId: string) {
  console.log('⭐ Obteniendo reseñas del tour:', tourId);
  
  const { data, error } = await supabase
    .from('reviews')
    .select(`
      *,
      users(id, first_name, last_name)
    `)
    .eq('tour_id', tourId)
    .order('created_at', { ascending: false });

  console.log('📝 Resultado de consulta de reseñas:', { data, error });
  return { data, error };
}

// Agency management
export async function updateTour(id: string, updates: any) {
  console.log('✏️ Actualizando tour:', { id, updates });
  
  try {
    // Clean updates - remove undefined values and format dates properly
    const cleanUpdates = Object.fromEntries(
      Object.entries({
        ...updates,
        // Format dates to ensure they're stored correctly
        start_date: updates.start_date ? formatDateForDB(updates.start_date) : undefined,
        end_date: updates.end_date ? formatDateForDB(updates.end_date) : undefined,
        booking_deadline: updates.booking_deadline ? formatDateForDB(updates.booking_deadline) : undefined,
        updated_at: new Date().toISOString()
      }).filter(([_, value]) => value !== undefined && value !== null && value !== '')
    );

    console.log('📊 Datos de actualización (limpiados):', cleanUpdates);

    const { data, error } = await supabase
      .from('tours')
      .update(cleanUpdates)
      .eq('id', id)
      .select()
      .single();

    console.log('📝 Resultado de actualización de tour:', { data, error });
    return { data, error };
  } catch (error: any) {
    console.error('❌ Error en updateTour:', error);
    return { data: null, error: { message: error.message } };
  }
}

export async function deleteTour(id: string) {
  console.log('🗑️ Eliminando tour:', id);
  
  const { error } = await supabase
    .from('tours')
    .delete()
    .eq('id', id);

  console.log('📝 Resultado de eliminación de tour:', { error });
  return { error };
}

// Admin functions
export async function getAllUsers() {
  console.log('👥 Obteniendo todos los usuarios...');
  
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .order('created_at', { ascending: false });

  console.log('📝 Resultado de consulta de usuarios:', { data, error });
  return { data, error };
}

export async function getAllAgencies() {
  console.log('🏢 Obteniendo todas las agencias...');
  
  const { data, error } = await supabase
    .from('agencies')
    .select('*')
    .order('created_at', { ascending: false });

  console.log('📝 Resultado de consulta de agencias:', { data, error });
  return { data, error };
}

export async function updateAgencyStatus(id: string, isActive: boolean) {
  console.log('🔄 Actualizando estado de agencia:', { id, isActive });
  
  const { data, error } = await supabase
    .from('agencies')
    .update({ is_active: isActive })
    .eq('id', id)
    .select()
    .single();

  console.log('📝 Resultado de actualización de estado:', { data, error });
  return { data, error };
}

export async function moderateReview(id: string, isVisible: boolean) {
  console.log('👁️ Moderando reseña:', { id, isVisible });
  
  const { data, error } = await supabase
    .from('reviews')
    .update({ is_visible: isVisible })
    .eq('id', id)
    .select()
    .single();

  console.log('📝 Resultado de moderación:', { data, error });
  return { data, error };
}

// Image utility functions
export function getImageSrc(base64?: string, url?: string): string {
  if (base64) {
    return base64;
  }
  if (url) {
    return url;
  }
  return 'https://images.pexels.com/photos/1271619/pexels-photo-1271619.jpeg'; // Default image
}

export function formatImageSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function validateImageBase64(base64: string, maxSizeMB: number = 5): { isValid: boolean; error?: string; size?: number } {
  try {
    // Check if it's a valid base64 data URL
    if (!base64.startsWith('data:image/')) {
      return { isValid: false, error: 'Formato de imagen inválido' };
    }

    // Calculate size
    const size = base64.length;
    const maxSizeBytes = maxSizeMB * 1024 * 1024 * 1.33; // Account for base64 overhead

    if (size > maxSizeBytes) {
      return { 
        isValid: false, 
        error: `Imagen demasiado grande. Máximo ${maxSizeMB}MB permitido.`,
        size 
      };
    }

    return { isValid: true, size };
  } catch (error) {
    return { isValid: false, error: 'Error al validar la imagen' };
  }
}