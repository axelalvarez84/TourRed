import { createClient } from '@supabase/supabase-js';
import { format, parse } from 'date-fns';
import { Tour, Booking, Destination, DestinationImage, ImageUploadData } from '../types';

// Initialize Supabase client
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storage: window.localStorage,
  }
});

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
  // Parse the date string and set it to midnight in local timezone
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(year, month - 1, day);
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

    // Check if CURP already exists (for travelers with CURP)
    if (role === UserRole.TRAVELER && profileData.curp) {
      const { data: existingCurp } = await supabase
        .from('users')
        .select('id, email, first_name, last_name')
        .eq('curp', profileData.curp.toUpperCase())
        .maybeSingle();

      if (existingCurp) {
        console.log('⚠️ CURP ya existe en la base de datos:', existingCurp);
        const error = new Error('CURP_DUPLICADO');
        (error as any).details = existingCurp;
        throw error;
      }
    }

    // Check if passport number already exists (for foreign travelers with passport)
    if (role === UserRole.TRAVELER && profileData.passport_number) {
      const { data: existingPassport } = await supabase
        .from('users')
        .select('id, email, first_name, last_name')
        .eq('passport_number', profileData.passport_number.toUpperCase())
        .maybeSingle();

      if (existingPassport) {
        console.log('⚠️ Número de pasaporte ya existe en la base de datos:', existingPassport);
        const error = new Error('PASAPORTE_DUPLICADO');
        (error as any).details = existingPassport;
        throw error;
      }
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

    // Normalize CURP and passport number to uppercase if provided
    if (profileData.curp) {
      profileData.curp = profileData.curp.toUpperCase();
    }
    if (profileData.passport_number) {
      profileData.passport_number = profileData.passport_number.toUpperCase();
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

      // Check if it's a unique constraint violation on CURP
      if (profileError.code === '23505' && profileError.message.includes('curp')) {
        const error = new Error('CURP_DUPLICADO');
        throw error;
      }

      // Check if it's a unique constraint violation on passport number
      if (profileError.code === '23505' && profileError.message.includes('passport_number')) {
        const error = new Error('PASAPORTE_DUPLICADO');
        throw error;
      }

      throw profileError;
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

    // Verificar si el usuario está activo
    if (data.user) {
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('is_active')
        .eq('id', data.user.id)
        .maybeSingle();

      if (userError) {
        console.error('❌ Error verificando estado del usuario:', userError);
      } else if (userData && userData.is_active === false) {
        // Usuario bloqueado, cerrar sesión inmediatamente
        await supabase.auth.signOut();
        throw new Error('USUARIO_BLOQUEADO');
      }
    }

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
    // Primero obtener el user_id de la agencia
    const { data: agencyData, error: agencyError } = await supabase
      .from('agencies')
      .select('user_id')
      .eq('id', agencyId)
      .single();

    if (agencyError) throw agencyError;

    // Actualizar is_active en la tabla agencies
    const { error: updateAgencyError } = await supabase
      .from('agencies')
      .update({ is_active: isActive })
      .eq('id', agencyId);

    if (updateAgencyError) throw updateAgencyError;

    // Actualizar is_active en la tabla users (esto controla el login)
    const { error: updateUserError } = await supabase
      .from('users')
      .update({ is_active: isActive })
      .eq('id', agencyData.user_id);

    if (updateUserError) throw updateUserError;

    // Retornar los datos actualizados
    const { data, error } = await supabase
      .from('agencies')
      .select()
      .eq('id', agencyId)
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

    // Variables para acumular IDs de tours filtrados
    let tourIdsByDestination: string[] | null = null;
    let tourIdsByDeparturePoint: string[] | null = null;

    // Si hay filtro de destino, buscar tours por la tabla de relaciones
    if (filters.destination) {
      const { data: matchingDestinations } = await supabase
        .from('destinations')
        .select('id')
        .ilike('name', `%${filters.destination}%`);

      if (matchingDestinations && matchingDestinations.length > 0) {
        const destinationIds = matchingDestinations.map(d => d.id);

        const { data: tourDestinations } = await supabase
          .from('tour_destinations')
          .select('tour_id')
          .in('destination_id', destinationIds);

        if (tourDestinations && tourDestinations.length > 0) {
          tourIdsByDestination = tourDestinations.map(td => td.tour_id);
        } else {
          tourIdsByDestination = [];
        }
      } else {
        tourIdsByDestination = [];
      }
    }

    // Si hay filtro de punto de partida, buscar tours por la tabla de relaciones
    if (filters.departurePoint) {
      console.log('🔍 Buscando punto de partida:', filters.departurePoint);

      const { data: matchingDeparturePoints, error: dpError } = await supabase
        .from('departure_points')
        .select('id, name')
        .ilike('name', `%${filters.departurePoint}%`);

      console.log('📍 Puntos de partida encontrados:', matchingDeparturePoints);
      if (dpError) console.error('❌ Error buscando departure points:', dpError);

      if (matchingDeparturePoints && matchingDeparturePoints.length > 0) {
        const departurePointIds = matchingDeparturePoints.map(dp => dp.id);

        const { data: tourDeparturePoints, error: tdpError } = await supabase
          .from('tour_departure_points')
          .select('tour_id')
          .in('departure_point_id', departurePointIds);

        console.log('🎯 Tours con estos puntos de partida:', tourDeparturePoints);
        if (tdpError) console.error('❌ Error buscando tour_departure_points:', tdpError);

        if (tourDeparturePoints && tourDeparturePoints.length > 0) {
          tourIdsByDeparturePoint = tourDeparturePoints.map(tdp => tdp.tour_id);
        } else {
          tourIdsByDeparturePoint = [];
        }
      } else {
        tourIdsByDeparturePoint = [];
      }
    }

    // Combinar los IDs de tours filtrados
    let finalTourIds: string[] | null = null;

    console.log('📊 tourIdsByDestination:', tourIdsByDestination);
    console.log('📊 tourIdsByDeparturePoint:', tourIdsByDeparturePoint);

    if (tourIdsByDestination !== null && tourIdsByDeparturePoint !== null) {
      // Intersección: tours que cumplen ambos filtros
      finalTourIds = tourIdsByDestination.filter(id => tourIdsByDeparturePoint!.includes(id));
      console.log('🔀 Intersección de ambos filtros:', finalTourIds);
    } else if (tourIdsByDestination !== null) {
      finalTourIds = tourIdsByDestination;
      console.log('📍 Solo filtro de destino:', finalTourIds);
    } else if (tourIdsByDeparturePoint !== null) {
      finalTourIds = tourIdsByDeparturePoint;
      console.log('🚩 Solo filtro de punto de partida:', finalTourIds);
    }

    console.log('✅ IDs finales a buscar:', finalTourIds);

    // Si tenemos IDs filtrados, aplicar filtro .in()
    if (finalTourIds !== null) {
      if (finalTourIds.length === 0) {
        console.log('❌ No hay tours que cumplan los criterios');
        // No hay tours que cumplan los criterios
        return { data: [], error: null };
      }

      let query = supabase
        .from('tours')
        .select(`
          *,
          agencies(id, name, rating, is_active)
        `)
        .in('id', finalTourIds);

      if (filters.includeExpired !== true) {
        const today = formatDateForDB(new Date());
        query = query.gte('end_date', today);
      }

      if (filters.category) {
        query = query.contains('category', [filters.category]);
      }

      if (filters.startDate && filters.endDate) {
        query = query.gte('start_date', filters.startDate).lte('start_date', filters.endDate);
      } else if (filters.startDate) {
        query = query.gte('start_date', filters.startDate);
      } else if (filters.endDate) {
        query = query.lte('start_date', filters.endDate);
      }

      if (filters.agency) {
        query = query.eq('agency_id', filters.agency);
      }

      if (filters.minPrice) {
        query = query.gte('price', parseFloat(filters.minPrice));
      }

      if (filters.maxPrice) {
        query = query.lte('price', parseFloat(filters.maxPrice));
      }

      if (filters.petFriendly === 'true') {
        query = query.eq('pet_friendly', true);
      } else if (filters.petFriendly === 'false') {
        query = query.eq('pet_friendly', false);
      }

      query = query.order('is_featured', { ascending: false }).order('created_at', { ascending: false });

      const { data, error } = await query;

      // Filtrar tours de agencias inactivas
      if (data && filters.includeInactiveAgencies !== true) {
        const filteredData = data.filter((tour: any) => tour.agencies?.is_active !== false);
        const finalData = filters.limit ? filteredData.slice(0, filters.limit) : filteredData;
        return { data: finalData, error };
      }

      return { data, error };
    }

    let query = supabase
      .from('tours')
      .select(`
        *,
        agencies(id, name, rating, is_active)
      `);

    if (filters.includeExpired !== true) {
      const today = formatDateForDB(new Date());
      query = query.gte('end_date', today);
    }

    if (filters.destination) {
      query = query.ilike('destination', `%${filters.destination}%`);
    }

    if (filters.category) {
      query = query.contains('category', [filters.category]);
    }

    if (filters.startDate && filters.endDate) {
      query = query.gte('start_date', filters.startDate).lte('start_date', filters.endDate);
    } else if (filters.startDate) {
      query = query.gte('start_date', filters.startDate);
    } else if (filters.endDate) {
      query = query.lte('start_date', filters.endDate);
    }

    if (filters.agency) {
      query = query.eq('agency_id', filters.agency);
    }

    if (filters.minPrice) {
      query = query.gte('price', parseFloat(filters.minPrice));
    }

    if (filters.maxPrice) {
      query = query.lte('price', parseFloat(filters.maxPrice));
    }

    if (filters.petFriendly === 'true') {
      query = query.eq('pet_friendly', true);
    } else if (filters.petFriendly === 'false') {
      query = query.eq('pet_friendly', false);
    }

    query = query.order('is_featured', { ascending: false }).order('created_at', { ascending: false });

    const { data, error } = await query;

    // Filtrar tours de agencias inactivas (excepto si se solicita explícitamente incluirlas)
    if (data && filters.includeInactiveAgencies !== true) {
      const filteredData = data.filter((tour: any) => tour.agencies?.is_active !== false);

      // Aplicar límite después del filtrado si es necesario
      const finalData = filters.limit ? filteredData.slice(0, filters.limit) : filteredData;

      return { data: finalData, error };
    }

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
        agencies(id, name, rating, logo, description, contact_email, is_active)
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
    const { data: bookings, error } = await supabase
      .from('bookings')
      .select(`
        id,
        user_id,
        tour_id,
        agency_id,
        booking_date,
        status,
        payment_status,
        total_price,
        deposit_amount,
        user_payment,
        service_charge,
        travelers_count,
        approval_status,
        approval_notes,
        approved_at,
        created_at,
        updated_at,
        tours:tour_id(id, name, destination, image_url, start_date, end_date),
        agencies:agency_id(id, name, contact_email)
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error || !bookings) {
      return { data: bookings, error };
    }

    const bookingsWithPaymentMethod = await Promise.all(
      bookings.map(async (booking) => {
        // Primero intentar usar el payment_method de la tabla bookings
        let paymentMethod = (booking as any).payment_method || null;

        // Si no existe, buscar en payment_transactions como respaldo
        if (!paymentMethod) {
          const { data: transaction } = await supabase
            .from('payment_transactions')
            .select('payment_method_type')
            .eq('booking_id', booking.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          paymentMethod = transaction?.payment_method_type || null;
        }

        return {
          ...booking,
          payment_method: paymentMethod
        };
      })
    );

    return { data: bookingsWithPaymentMethod, error: null };
  } catch (error: any) {
    console.error('❌ Error en getUserBookings:', error);
    return { data: null, error };
  }
};

export const getAgencyBookings = async (agencyId: string) => {
  try {
    const { data: bookings, error } = await supabase
      .from('bookings')
      .select(`
        *,
        tours:tour_id(id, name, destination, image_url, start_date, end_date),
        users:user_id(id, first_name, last_name, email, profile_picture_url, phone_number)
      `)
      .eq('agency_id', agencyId)
      .order('created_at', { ascending: false });

    if (error || !bookings) {
      return { data: bookings, error };
    }

    const bookingsWithPaymentMethod = await Promise.all(
      bookings.map(async (booking) => {
        // Primero intentar usar el payment_method de la tabla bookings
        let paymentMethod = (booking as any).payment_method || null;

        // Si no existe, buscar en payment_transactions como respaldo
        if (!paymentMethod) {
          const { data: transaction } = await supabase
            .from('payment_transactions')
            .select('payment_method_type')
            .eq('booking_id', booking.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          paymentMethod = transaction?.payment_method_type || null;
        }

        return {
          ...booking,
          payment_method: paymentMethod
        };
      })
    );

    return { data: bookingsWithPaymentMethod, error: null };
  } catch (error: any) {
    console.error('❌ Error en getAgencyBookings:', error);
    return { data: null, error };
  }
};

export const getTourBookingReport = async (tourId: string, agencyId: string) => {
  try {
    const { data: tour, error: tourError } = await supabase
      .from('tours')
      .select('id, name, destination, start_date, end_date')
      .eq('id', tourId)
      .eq('agency_id', agencyId)
      .maybeSingle();

    if (tourError || !tour) {
      return { data: null, error: tourError || new Error('Tour no encontrado') };
    }

    const { data: bookings, error: bookingsError } = await supabase
      .from('bookings')
      .select(`
        id,
        user_id,
        deposit_amount,
        total_price,
        user_payment,
        payment_method,
        booking_date,
        created_at,
        status,
        count_adultos,
        count_ninos,
        count_infantes,
        count_adultos_mayores,
        count_mascotas,
        toursred_cash_used,
        users:user_id(id, first_name, last_name, email, phone_number)
      `)
      .eq('tour_id', tourId)
      .in('status', ['confirmed', 'completed'])
      .order('created_at', { ascending: true });

    if (bookingsError) {
      return { data: null, error: bookingsError };
    }

    const bookingsWithTravelers = await Promise.all(
      (bookings || []).map(async (booking) => {
        const { data: travelers, error: travelersError } = await supabase
          .from('booking_travelers')
          .select('*')
          .eq('booking_id', booking.id)
          .order('created_at', { ascending: true });

        let paymentMethod = booking.payment_method || null;
        if (!paymentMethod) {
          const { data: transaction } = await supabase
            .from('payment_transactions')
            .select('payment_method_type')
            .eq('booking_id', booking.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          paymentMethod = transaction?.payment_method_type || null;
        }

        return {
          ...booking,
          travelers: travelers || [],
          payment_method: paymentMethod
        };
      })
    );

    const totalTravelers = bookingsWithTravelers.reduce((sum, b) => {
      return sum + (b.travelers?.length || 0);
    }, 0);

    const totalsByCategory = {
      adultos: bookingsWithTravelers.reduce((sum, b) => sum + (b.count_adultos || 0), 0),
      ninos: bookingsWithTravelers.reduce((sum, b) => sum + (b.count_ninos || 0), 0),
      infantes: bookingsWithTravelers.reduce((sum, b) => sum + (b.count_infantes || 0), 0),
      adultos_mayores: bookingsWithTravelers.reduce((sum, b) => sum + (b.count_adultos_mayores || 0), 0),
      mascotas: bookingsWithTravelers.reduce((sum, b) => sum + (b.count_mascotas || 0), 0)
    };

    const totalDeposit = bookingsWithTravelers.reduce((sum, b) => sum + Number(b.deposit_amount || 0), 0);
    const totalRemaining = bookingsWithTravelers.reduce((sum, b) => sum + (Number(b.total_price || 0) - Number(b.deposit_amount || 0)), 0);
    const totalRevenue = bookingsWithTravelers.reduce((sum, b) => sum + Number(b.total_price || 0), 0);

    return {
      data: {
        tour,
        bookings: bookingsWithTravelers,
        summary: {
          totalBookings: bookingsWithTravelers.length,
          totalTravelers,
          totalsByCategory,
          totalDeposit,
          totalRemaining,
          totalRevenue
        }
      },
      error: null
    };
  } catch (error: any) {
    console.error('❌ Error en getTourBookingReport:', error);
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

// Tour Categories functions
export const getTourCategories = async (includeInactive: boolean = false) => {
  try {
    let query = supabase
      .from('tour_categories')
      .select('*')
      .order('display_order', { ascending: true });

    if (!includeInactive) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;
    return { data, error };
  } catch (error: any) {
    console.error('❌ Error en getTourCategories:', error);
    return { data: null, error };
  }
};

export const createTourCategory = async (categoryData: {
  name: string;
  slug: string;
  description?: string;
  display_order?: number;
}) => {
  try {
    const { data, error } = await supabase
      .from('tour_categories')
      .insert(categoryData)
      .select()
      .single();

    return { data, error };
  } catch (error: any) {
    console.error('❌ Error en createTourCategory:', error);
    return { data: null, error };
  }
};

export const updateTourCategory = async (
  id: string,
  categoryData: Partial<{
    name: string;
    slug: string;
    description: string;
    is_active: boolean;
    display_order: number;
  }>
) => {
  try {
    const { data, error } = await supabase
      .from('tour_categories')
      .update(categoryData)
      .eq('id', id)
      .select()
      .single();

    return { data, error };
  } catch (error: any) {
    console.error('❌ Error en updateTourCategory:', error);
    return { data: null, error };
  }
};

export const deleteTourCategory = async (id: string) => {
  try {
    // Verificar si hay tours usando esta categoría
    const { data: tours } = await supabase
      .from('tours')
      .select('id')
      .contains('category', [id])
      .limit(1);

    if (tours && tours.length > 0) {
      return {
        data: null,
        error: { message: 'No se puede eliminar la categoría porque tiene tours asociados' }
      };
    }

    const { error } = await supabase
      .from('tour_categories')
      .delete()
      .eq('id', id);

    return { error };
  } catch (error: any) {
    console.error('❌ Error en deleteTourCategory:', error);
    return { error };
  }
};

// Booking Cancellation Functions

interface CancellationPolicy {
  policyType: '100_percent' | '50_percent' | 'no_refund' | 'no_show' | 'pending_approval';
  daysBeforeTour: number;
  originalDepositAmount: number;
  originalServiceCharge: number;
  refundAmountToTraveler: number;
  amountToAgency: number;
  amountToPlatform: number;
  canCancel: boolean;
  warningMessage?: string;
  refundMessage: string;
}

export const validateCancellationEligibility = async (bookingId: string) => {
  try {
    const { data: booking, error } = await supabase
      .from('bookings')
      .select(`
        *,
        tours:tour_id(id, name, start_date, cancellation_not_allowed)
      `)
      .eq('id', bookingId)
      .single();

    if (error || !booking) {
      return {
        eligible: false,
        error: 'No se encontró la reserva',
        booking: null
      };
    }

    if (booking.status === 'cancelled') {
      return {
        eligible: false,
        error: 'Esta reserva ya fue cancelada',
        booking
      };
    }

    if (booking.is_no_show) {
      return {
        eligible: false,
        error: 'Esta reserva ya está marcada como No Show',
        booking
      };
    }

    if (!['pending', 'confirmed'].includes(booking.status)) {
      return {
        eligible: false,
        error: 'Esta reserva no puede ser cancelada debido a su estado actual',
        booking
      };
    }

    const tourStartDate = parseDateFromDB((booking.tours as any).start_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (tourStartDate < today) {
      return {
        eligible: false,
        error: 'No se puede cancelar una reserva de un tour que ya pasó',
        booking
      };
    }

    return {
      eligible: true,
      error: null,
      booking
    };
  } catch (error: any) {
    console.error('❌ Error en validateCancellationEligibility:', error);
    return {
      eligible: false,
      error: error.message || 'Error al validar la elegibilidad de cancelación',
      booking: null
    };
  }
};

export const calculateCancellationPolicy = async (booking: any): Promise<CancellationPolicy> => {
  const tour = booking.tours;
  const tourStartDate = parseDateFromDB(tour.start_date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const millisecondsPerDay = 1000 * 60 * 60 * 24;
  const daysBeforeTour = Math.ceil((tourStartDate.getTime() - today.getTime()) / millisecondsPerDay);

  const originalDepositAmount = Number(booking.deposit_amount || 0);
  const originalServiceCharge = Number(booking.service_charge || 0);
  const isPending = booking.approval_status === 'pending';

  const { data: platformSettings } = await supabase
    .from('platform_settings')
    .select('commission_rate')
    .single();

  const commissionRate = platformSettings?.commission_rate || 0.10;

  if (isPending) {
    return {
      policyType: 'pending_approval',
      daysBeforeTour,
      originalDepositAmount: 0,
      originalServiceCharge: 0,
      refundAmountToTraveler: 0,
      amountToAgency: 0,
      amountToPlatform: 0,
      canCancel: true,
      refundMessage: 'Esta reserva está pendiente de aprobación y no ha sido pagada. Puedes cancelarla sin ninguna penalización.'
    };
  }

  if (daysBeforeTour >= 15) {
    return {
      policyType: '100_percent',
      daysBeforeTour,
      originalDepositAmount,
      originalServiceCharge,
      refundAmountToTraveler: originalDepositAmount,
      amountToAgency: 0,
      amountToPlatform: 0,
      canCancel: true,
      refundMessage: `Se reembolsará el 100% del anticipo ($${originalDepositAmount.toFixed(2)}) a tu ToursRed Cash. El cargo por servicio ($${originalServiceCharge.toFixed(2)}) no es reembolsable.`
    };
  }

  if (daysBeforeTour >= 7 && daysBeforeTour < 15) {
    const refundAmount = originalDepositAmount * 0.5;
    const penaltyAmount = originalDepositAmount * 0.5;
    const agencyShare = penaltyAmount * 0.7;
    const platformShare = penaltyAmount * 0.3;

    return {
      policyType: '50_percent',
      daysBeforeTour,
      originalDepositAmount,
      originalServiceCharge,
      refundAmountToTraveler: refundAmount,
      amountToAgency: agencyShare,
      amountToPlatform: platformShare,
      canCancel: true,
      refundMessage: `Se reembolsará el 50% del anticipo ($${refundAmount.toFixed(2)}) a tu ToursRed Cash. El otro 50% se distribuye entre la agencia y la plataforma. El cargo por servicio ($${originalServiceCharge.toFixed(2)}) no es reembolsable.`
    };
  }

  if (daysBeforeTour >= 1 && daysBeforeTour < 7) {
    const agencyAmount = originalDepositAmount * (1 - commissionRate);
    const platformCommission = originalDepositAmount * commissionRate;

    return {
      policyType: 'no_refund',
      daysBeforeTour,
      originalDepositAmount,
      originalServiceCharge,
      refundAmountToTraveler: 0,
      amountToAgency: agencyAmount,
      amountToPlatform: platformCommission,
      canCancel: true,
      warningMessage: tour.cancellation_not_allowed
        ? 'Este tour NO permite cancelaciones con reembolso. Solo puedes cancelar para evitar la penalización de No Show.'
        : undefined,
      refundMessage: 'No hay reembolso. El anticipo completo se pagará a la agencia (menos la comisión de la plataforma). Sin embargo, no se te marcará como No Show.'
    };
  }

  return {
    policyType: 'no_show',
    daysBeforeTour,
    originalDepositAmount,
    originalServiceCharge,
    refundAmountToTraveler: 0,
    amountToAgency: originalDepositAmount * (1 - commissionRate),
    amountToPlatform: originalDepositAmount * commissionRate,
    canCancel: true,
    warningMessage: 'ADVERTENCIA: Cancelar con menos de 1 día de anticipación resultará en una marca de No Show en tu perfil.',
    refundMessage: 'No hay reembolso y se te marcará como No Show. Esto puede afectar tu capacidad de hacer reservas futuras.'
  };
};

export const addCancellationRefund = async (
  userId: string,
  bookingId: string,
  refundAmount: number,
  tourName: string
) => {
  try {
    let { data: wallet, error: walletError } = await supabase
      .from('toursred_cash_wallets')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (walletError) throw walletError;

    if (!wallet) {
      const { data: newWallet, error: createError } = await supabase
        .from('toursred_cash_wallets')
        .insert({ user_id: userId, balance: 0 })
        .select()
        .single();

      if (createError) throw createError;
      wallet = newWallet;
    }

    const newBalance = Number(wallet.balance) + refundAmount;

    const { data: transaction, error: transactionError } = await supabase
      .from('toursred_cash_transactions')
      .insert({
        wallet_id: wallet.id,
        type: 'refund',
        amount: refundAmount,
        balance_after: newBalance,
        description: `Reembolso por cancelación de ${tourName}`,
        reference_id: bookingId,
        reference_type: 'booking_cancellation'
      })
      .select()
      .single();

    if (transactionError) throw transactionError;

    const { error: updateError } = await supabase
      .from('toursred_cash_wallets')
      .update({ balance: newBalance })
      .eq('id', wallet.id);

    if (updateError) throw updateError;

    return { data: transaction, error: null };
  } catch (error: any) {
    console.error('❌ Error en addCancellationRefund:', error);
    return { data: null, error };
  }
};

export const processCancellation = async (
  bookingId: string,
  userId: string,
  cancellationReason?: string
) => {
  try {
    console.log('🚫 Procesando cancelación de reserva:', bookingId);

    const eligibility = await validateCancellationEligibility(bookingId);
    if (!eligibility.eligible || !eligibility.booking) {
      throw new Error(eligibility.error || 'La reserva no es elegible para cancelación');
    }

    const booking = eligibility.booking;
    const policy = await calculateCancellationPolicy(booking);

    console.log('📋 Política de cancelación:', policy);

    let transactionId: string | null = null;

    if (policy.refundAmountToTraveler > 0) {
      const refundResult = await addCancellationRefund(
        userId,
        bookingId,
        policy.refundAmountToTraveler,
        (booking.tours as any).name
      );

      if (refundResult.error) {
        throw new Error(`Error al procesar reembolso: ${refundResult.error.message}`);
      }

      transactionId = refundResult.data!.id;
      console.log('💰 Reembolso procesado:', transactionId);
    }

    const { data: cancellation, error: cancellationError } = await supabase
      .from('booking_cancellations')
      .insert({
        booking_id: bookingId,
        cancelled_by_user_id: userId,
        tour_start_date: (booking.tours as any).start_date,
        days_before_tour: policy.daysBeforeTour,
        cancellation_policy_type: policy.policyType,
        original_deposit_amount: policy.originalDepositAmount,
        original_service_charge: policy.originalServiceCharge,
        refund_amount_to_traveler: policy.refundAmountToTraveler,
        amount_to_agency: policy.amountToAgency,
        amount_to_platform: policy.amountToPlatform,
        toursred_cash_transaction_id: transactionId,
        refund_processed: policy.refundAmountToTraveler > 0,
        cancellation_reason: cancellationReason || null
      })
      .select()
      .single();

    if (cancellationError) throw cancellationError;

    console.log('📝 Cancelación registrada:', cancellation.id);

    const { error: updateBookingError } = await supabase
      .from('bookings')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancellation_type: policy.policyType,
        cancellation_refund_amount: policy.refundAmountToTraveler,
        is_no_show: policy.policyType === 'no_show'
      })
      .eq('id', bookingId);

    if (updateBookingError) throw updateBookingError;

    if (policy.policyType === 'no_show') {
      const { error: noShowError } = await supabase
        .from('users')
        .update({
          no_show_count: supabase.raw('no_show_count + 1')
        })
        .eq('id', userId);

      if (noShowError) {
        console.error('⚠️ Error incrementando no_show_count:', noShowError);
      }
    }

    if (policy.amountToAgency > 0) {
      const { data: existingCommission } = await supabase
        .from('commission_records')
        .select('*')
        .eq('booking_id', bookingId)
        .maybeSingle();

      if (existingCommission) {
        const { error: updateCommissionError } = await supabase
          .from('commission_records')
          .update({
            agency_amount: policy.amountToAgency,
            platform_amount: policy.amountToPlatform,
            status: 'pending'
          })
          .eq('id', existingCommission.id);

        if (updateCommissionError) {
          console.error('⚠️ Error actualizando commission_record:', updateCommissionError);
        }
      } else {
        const { error: createCommissionError } = await supabase
          .from('commission_records')
          .insert({
            booking_id: bookingId,
            agency_id: booking.agency_id,
            agency_amount: policy.amountToAgency,
            platform_amount: policy.amountToPlatform,
            status: 'pending'
          });

        if (createCommissionError) {
          console.error('⚠️ Error creando commission_record:', createCommissionError);
        }
      }
    }

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      await Promise.all([
        fetch(`${supabaseUrl}/functions/v1/send-cancellation-notification-traveler`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseAnonKey}`
          },
          body: JSON.stringify({ booking_id: bookingId, cancellation_id: cancellation.id })
        }),
        fetch(`${supabaseUrl}/functions/v1/send-cancellation-notification-agency`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseAnonKey}`
          },
          body: JSON.stringify({ booking_id: bookingId, cancellation_id: cancellation.id })
        }),
        fetch(`${supabaseUrl}/functions/v1/send-cancellation-notification-admin`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseAnonKey}`
          },
          body: JSON.stringify({ booking_id: bookingId, cancellation_id: cancellation.id })
        })
      ]);

      await supabase
        .from('booking_cancellations')
        .update({ emails_sent: true })
        .eq('id', cancellation.id);

      console.log('📧 Emails de notificación enviados');
    } catch (emailError) {
      console.error('⚠️ Error enviando emails (no crítico):', emailError);
    }

    console.log('✅ Cancelación completada exitosamente');

    return {
      data: {
        cancellation,
        policy,
        booking
      },
      error: null
    };
  } catch (error: any) {
    console.error('❌ Error en processCancellation:', error);
    return {
      data: null,
      error: error.message || 'Error al procesar la cancelación'
    };
  }
};