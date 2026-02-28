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
    // OPTIMIZED: Select only needed columns for admin listings
    const { data, error } = await supabase
      .from('agencies')
      .select(`
        id,
        name,
        is_active,
        created_at,
        contact_phone,
        contact_email,
        website,
        rating,
        commission_rate,
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

      // OPTIMIZED: Select only needed columns for listings
      let query = supabase
        .from('tours')
        .select(`
          id,
          name,
          image_url,
          destination,
          start_date,
          end_date,
          price,
          max_travelers,
          is_featured,
          agency_id,
          pet_friendly,
          category,
          agencies(id, name, rating, is_active)
        `)
        .in('id', finalTourIds);

      if (filters.includeExpired !== true) {
        const today = formatDateForDB(new Date());
        query = query.gte('end_date', today);
      }

      if (filters.tourName) {
        query = query.ilike('title', `%${filters.tourName}%`);
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

    // OPTIMIZED: Select only needed columns for listings
    let query = supabase
      .from('tours')
      .select(`
        id,
        name,
        image_url,
        destination,
        start_date,
        end_date,
        price,
        max_travelers,
        is_featured,
        agency_id,
        pet_friendly,
        category,
        agencies(id, name, rating, is_active)
      `);

    if (filters.includeExpired !== true) {
      const today = formatDateForDB(new Date());
      query = query.gte('end_date', today);
    }

    if (filters.tourName) {
      query = query.ilike('title', `%${filters.tourName}%`);
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

    if (error) {
      return { data: null, error };
    }

    // Nota: Los puntos NO se descuentan aquí. Solo se guarda points_used en la reserva.
    // Los puntos se descontarán del wallet en TravelersInfoPage cuando el usuario
    // confirme el pago después de ingresar la información de los viajeros.
    if (data && bookingData.points_used && bookingData.points_used > 0) {
      console.log(`📝 Reserva creada con ${bookingData.points_used} puntos marcados para uso (se descontarán al confirmar pago)`);
    }

    return { data, error: null };
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
        booking_code,
        user_id,
        tour_id,
        agency_id,
        booking_date,
        status,
        payment_status,
        payment_method,
        total_price,
        deposit_amount,
        user_payment,
        service_charge,
        travelers_count,
        approval_status,
        approval_notes,
        approved_at,
        is_no_show,
        no_show_marked_at,
        toursred_cash_used,
        points_used,
        points_earned,
        has_pending_reschedule,
        reschedule_response,
        reschedule_responded_at,
        discount_amount,
        discount_code_id,
        discount_codes:discount_code_id(code, discount_type, discount_value),
        created_at,
        updated_at,
        tours:tour_id(id, name, destination, image_url, start_date, end_date, name_changes_not_allowed),
        agencies:agency_id(id, name, contact_email)
      `)
      .eq('user_id', userId)
      .neq('status', 'draft')
      .order('created_at', { ascending: false });

    if (error || !bookings) {
      return { data: bookings, error };
    }

    // OPTIMIZED: Get all payment transactions in ONE query instead of N queries
    const bookingIds = bookings.map(b => b.id);
    const { data: allTransactions } = await supabase
      .from('payment_transactions')
      .select('booking_id, payment_method_type, created_at')
      .in('booking_id', bookingIds);

    // Group transactions by booking_id and get the most recent
    const transactionsByBooking: Record<string, any> = {};
    (allTransactions || []).forEach((tx: any) => {
      if (!transactionsByBooking[tx.booking_id] ||
          new Date(tx.created_at) > new Date(transactionsByBooking[tx.booking_id].created_at)) {
        transactionsByBooking[tx.booking_id] = tx;
      }
    });

    // Map bookings with payment methods (no more N+1!)
    const bookingsWithPaymentMethod = bookings.map((booking) => {
      let paymentMethod = (booking as any).payment_method || null;

      // If no payment_method, use the most recent transaction
      if (!paymentMethod && transactionsByBooking[booking.id]) {
        paymentMethod = transactionsByBooking[booking.id].payment_method_type || null;
      }

      return {
        ...booking,
        payment_method: paymentMethod
      };
    });

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
      .neq('status', 'draft')
      .order('created_at', { ascending: false });

    if (error || !bookings) {
      return { data: bookings, error };
    }

    // OPTIMIZED: Get all payment transactions in ONE query instead of N queries
    const bookingIds = bookings.map(b => b.id);
    const { data: allTransactions } = await supabase
      .from('payment_transactions')
      .select('booking_id, payment_method_type, created_at')
      .in('booking_id', bookingIds);

    // Group transactions by booking_id and get the most recent
    const transactionsByBooking: Record<string, any> = {};
    (allTransactions || []).forEach((tx: any) => {
      if (!transactionsByBooking[tx.booking_id] ||
          new Date(tx.created_at) > new Date(transactionsByBooking[tx.booking_id].created_at)) {
        transactionsByBooking[tx.booking_id] = tx;
      }
    });

    // Map bookings with payment methods (no more N+1!)
    const bookingsWithPaymentMethod = bookings.map((booking) => {
      let paymentMethod = (booking as any).payment_method || null;

      // If no payment_method, use the most recent transaction
      if (!paymentMethod && transactionsByBooking[booking.id]) {
        paymentMethod = transactionsByBooking[booking.id].payment_method_type || null;
      }

      return {
        ...booking,
        payment_method: paymentMethod
      };
    });

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
        booking_code,
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
        const { data: travelersRaw } = await supabase
          .from('booking_travelers')
          .select('*')
          .eq('booking_id', booking.id)
          .order('created_at', { ascending: true });

        // Build travelers list from count_* fields (source of truth) using booking_travelers data when available
        const categoryMap: { key: string; label: string; count: number }[] = [
          { key: 'adulto', label: 'adulto', count: booking.count_adultos || 0 },
          { key: 'nino', label: 'nino', count: booking.count_ninos || 0 },
          { key: 'infante', label: 'infante', count: booking.count_infantes || 0 },
          { key: 'adulto_mayor', label: 'adulto_mayor', count: booking.count_adultos_mayores || 0 },
          { key: 'mascota', label: 'mascota', count: booking.count_mascotas || 0 },
        ];

        const travelersFromCounts: any[] = [];
        for (const cat of categoryMap) {
          if (cat.count <= 0) continue;
          const registered = (travelersRaw || []).filter(
            (t: any) => t.categoria_viajero === cat.key
          );
          for (let i = 0; i < cat.count; i++) {
            if (registered[i]) {
              travelersFromCounts.push(registered[i]);
            } else {
              // Viajero sin datos de acompañante registrado (ej. 2x1)
              const firstName = (booking as any).users?.first_name || '';
              const lastName = (booking as any).users?.last_name || '';
              travelersFromCounts.push({
                id: `${booking.id}-${cat.key}-${i}`,
                booking_id: booking.id,
                categoria_viajero: cat.key,
                nombre: `${firstName} ${lastName}`.trim(),
                precio_aplicado: 0,
              });
            }
          }
        }

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
          travelers: travelersFromCounts,
          payment_method: paymentMethod
        };
      })
    );

    const totalsByCategory = {
      adultos: bookingsWithTravelers.reduce((sum, b) => sum + (b.count_adultos || 0), 0),
      ninos: bookingsWithTravelers.reduce((sum, b) => sum + (b.count_ninos || 0), 0),
      infantes: bookingsWithTravelers.reduce((sum, b) => sum + (b.count_infantes || 0), 0),
      adultos_mayores: bookingsWithTravelers.reduce((sum, b) => sum + (b.count_adultos_mayores || 0), 0),
      mascotas: bookingsWithTravelers.reduce((sum, b) => sum + (b.count_mascotas || 0), 0)
    };

    const totalTravelers =
      totalsByCategory.adultos +
      totalsByCategory.ninos +
      totalsByCategory.infantes +
      totalsByCategory.adultos_mayores +
      totalsByCategory.mascotas;

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
  optionalServicesRefundable?: number;
  optionalServicesNonRefundable?: number;
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

    if (booking.approval_status === 'rejected') {
      return {
        eligible: false,
        error: 'Esta reserva fue rechazada por la agencia y no puede ser cancelada',
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
    .select('agency_commission_percentage')
    .single();

  const commissionRate = (platformSettings?.agency_commission_percentage || 15) / 100;

  // Fetch optional services for this booking (to show refund info in modal)
  const { data: optionalServicesData } = await supabase
    .from('booking_optional_services')
    .select('subtotal, tour_optional_service_id, tour_optional_services(is_refundable)')
    .eq('booking_id', booking.id)
    .eq('is_cancelled', false);

  let optionalServicesRefundable = 0;
  let optionalServicesNonRefundable = 0;

  if (optionalServicesData) {
    for (const bos of optionalServicesData) {
      const isRefundable = (bos as any).tour_optional_services?.is_refundable !== false;
      if (isRefundable) {
        optionalServicesRefundable += Number(bos.subtotal || 0);
      } else {
        optionalServicesNonRefundable += Number(bos.subtotal || 0);
      }
    }
  }

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
      optionalServicesRefundable: 0,
      optionalServicesNonRefundable: 0,
      refundMessage: 'Esta reserva está pendiente de aprobación y no ha sido pagada. Puedes cancelarla sin ninguna penalización.'
    };
  }

  if (daysBeforeTour >= 15) {
    const totalRefund = originalDepositAmount + optionalServicesRefundable;
    return {
      policyType: '100_percent',
      daysBeforeTour,
      originalDepositAmount,
      originalServiceCharge,
      refundAmountToTraveler: totalRefund,
      amountToAgency: 0,
      amountToPlatform: 0,
      canCancel: true,
      optionalServicesRefundable,
      optionalServicesNonRefundable,
      refundMessage: `Se reembolsará el 100% del anticipo ($${originalDepositAmount.toFixed(2)})${optionalServicesRefundable > 0 ? ` más los servicios opcionales reembolsables ($${optionalServicesRefundable.toFixed(2)})` : ''} a tu ToursRed Cash. El cargo por servicio ($${originalServiceCharge.toFixed(2)}) no es reembolsable.${optionalServicesNonRefundable > 0 ? ` Los servicios no reembolsables ($${optionalServicesNonRefundable.toFixed(2)}) no se devuelven.` : ''}`
    };
  }

  if (daysBeforeTour >= 7 && daysBeforeTour < 15) {
    const refundAmount = originalDepositAmount * 0.5;
    const penaltyAmount = originalDepositAmount * 0.5;
    const agencyShare = penaltyAmount * 0.7;
    const platformShare = penaltyAmount * 0.3;
    const totalRefund = refundAmount + optionalServicesRefundable;

    return {
      policyType: '50_percent',
      daysBeforeTour,
      originalDepositAmount,
      originalServiceCharge,
      refundAmountToTraveler: totalRefund,
      amountToAgency: agencyShare,
      amountToPlatform: platformShare,
      canCancel: true,
      optionalServicesRefundable,
      optionalServicesNonRefundable,
      refundMessage: `Se reembolsará el 50% del anticipo ($${refundAmount.toFixed(2)})${optionalServicesRefundable > 0 ? ` más los servicios opcionales reembolsables ($${optionalServicesRefundable.toFixed(2)})` : ''} a tu ToursRed Cash. El cargo por servicio ($${originalServiceCharge.toFixed(2)}) no es reembolsable.${optionalServicesNonRefundable > 0 ? ` Los servicios no reembolsables ($${optionalServicesNonRefundable.toFixed(2)}) no se devuelven.` : ''}`
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
      refundAmountToTraveler: optionalServicesRefundable,
      amountToAgency: agencyAmount,
      amountToPlatform: platformCommission,
      canCancel: true,
      optionalServicesRefundable,
      optionalServicesNonRefundable,
      warningMessage: tour.cancellation_not_allowed
        ? 'Este tour NO permite cancelaciones con reembolso. Solo puedes cancelar para evitar la penalización de No Show.'
        : undefined,
      refundMessage: `No se reembolsará el anticipo del tour.${optionalServicesRefundable > 0 ? ` Los servicios opcionales reembolsables ($${optionalServicesRefundable.toFixed(2)}) sí se devuelven.` : ''}${optionalServicesNonRefundable > 0 ? ` Los servicios no reembolsables ($${optionalServicesNonRefundable.toFixed(2)}) no se devuelven.` : ''} Cancelar evita una penalización de No Show en tu perfil.`
    };
  }

  return {
    policyType: 'no_show',
    daysBeforeTour,
    originalDepositAmount,
    originalServiceCharge,
    refundAmountToTraveler: optionalServicesRefundable,
    amountToAgency: originalDepositAmount * (1 - commissionRate),
    amountToPlatform: originalDepositAmount * commissionRate,
    canCancel: true,
    optionalServicesRefundable,
    optionalServicesNonRefundable,
    warningMessage: 'ADVERTENCIA: Cancelar con menos de 1 día de anticipación resultará en una marca de No Show en tu perfil.',
    refundMessage: 'No hay reembolso del anticipo y se te marcará como No Show. Esto puede afectar tu capacidad de hacer reservas futuras.'
  };
};

export const addCancellationRefund = async (
  userId: string,
  bookingId: string,
  refundAmount: number,
  tourName: string
) => {
  try {
    const { data, error } = await supabase.rpc('update_wallet_balance', {
      p_user_id: userId,
      p_amount: refundAmount,
      p_type: 'refund',
      p_description: `Reembolso por cancelación de ${tourName}`,
      p_reference_id: bookingId,
      p_reference_type: 'booking_cancellation'
    });

    if (error) throw error;

    return {
      data: {
        id: data.transaction_id,
        amount: data.amount,
        balance_after: data.new_balance
      },
      error: null
    };
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

    // Cancel optional services (traveler cancellation — non-refundable ones are NOT refunded)
    await supabase.rpc('cancel_booking_optional_services', {
      p_booking_id: bookingId,
      p_cancelled_by_agency: false
    });

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

      console.log('📧 Enviando emails de notificación...');

      const responses = await Promise.all([
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

      const results = await Promise.all(
        responses.map(async (response, index) => {
          const type = ['traveler', 'agency', 'admin'][index];
          if (!response.ok) {
            const errorText = await response.text();
            console.error(`❌ Error enviando email a ${type}:`, response.status, errorText);
            return false;
          }
          console.log(`✅ Email enviado a ${type}`);
          return true;
        })
      );

      const allSent = results.every(r => r);

      await supabase
        .from('booking_cancellations')
        .update({ emails_sent: allSent })
        .eq('id', cancellation.id);

      console.log(`📧 Resultado envío emails: ${results.filter(r => r).length}/${results.length} exitosos`);
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

// ─── PARTIAL CANCELLATION SYSTEM ────────────────────────────────────────────

export interface PartialCancellationTraveler {
  id: string;
  nombre: string;
  categoria_viajero: string;
  precio_aplicado: number;
}

export interface PartialCancellationPolicy {
  policyType: '100_percent' | '50_percent' | 'no_refund';
  daysBeforeTour: number;
  originalPartialAmount: number;
  refundAmountToTraveler: number;
  amountToAgency: number;
  amountToPlatform: number;
  canCancel: boolean;
  warningMessage?: string;
  refundMessage: string;
}

export const calculatePartialCancellationPolicy = async (
  booking: any,
  travelersToCancel: PartialCancellationTraveler[]
): Promise<PartialCancellationPolicy> => {
  const tour = booking.tours;
  const tourStartDate = parseDateFromDB(tour.start_date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const millisecondsPerDay = 1000 * 60 * 60 * 24;
  const daysBeforeTour = Math.ceil((tourStartDate.getTime() - today.getTime()) / millisecondsPerDay);

  const originalPartialAmount = travelersToCancel.reduce(
    (sum, t) => sum + Number(t.precio_aplicado),
    0
  );

  const { data: platformSettings } = await supabase
    .from('platform_settings')
    .select('agency_commission_percentage')
    .single();

  const commissionRate = (platformSettings?.agency_commission_percentage || 15) / 100;

  const travelerNames = travelersToCancel.map(t => t.nombre).join(', ');

  if (daysBeforeTour >= 15) {
    return {
      policyType: '100_percent',
      daysBeforeTour,
      originalPartialAmount,
      refundAmountToTraveler: originalPartialAmount,
      amountToAgency: 0,
      amountToPlatform: 0,
      canCancel: true,
      refundMessage: `Se reembolsará el 100% del anticipo parcial ($${originalPartialAmount.toFixed(2)}) a tu ToursRed Cash.`
    };
  }

  if (daysBeforeTour >= 7 && daysBeforeTour < 15) {
    const refundAmount = originalPartialAmount * 0.5;
    const penaltyAmount = originalPartialAmount * 0.5;
    return {
      policyType: '50_percent',
      daysBeforeTour,
      originalPartialAmount,
      refundAmountToTraveler: refundAmount,
      amountToAgency: penaltyAmount * 0.7,
      amountToPlatform: penaltyAmount * 0.3,
      canCancel: true,
      refundMessage: `Se reembolsará el 50% del anticipo parcial ($${refundAmount.toFixed(2)}) a tu ToursRed Cash.`
    };
  }

  const agencyAmount = originalPartialAmount * (1 - commissionRate);
  const platformAmount = originalPartialAmount * commissionRate;

  return {
    policyType: 'no_refund',
    daysBeforeTour,
    originalPartialAmount,
    refundAmountToTraveler: 0,
    amountToAgency: agencyAmount,
    amountToPlatform: platformAmount,
    canCancel: true,
    warningMessage: tour.cancellation_not_allowed
      ? 'Este tour NO permite cancelaciones con reembolso.'
      : daysBeforeTour < 1
        ? 'Cancelar en este momento no genera reembolso.'
        : undefined,
    refundMessage: `No habrá reembolso por estos viajeros. La cancelación se procesa para evitar penalización de No Show.`
  };
};

export const processPartialCancellation = async (
  bookingId: string,
  userId: string,
  travelersToCancel: PartialCancellationTraveler[],
  cancellationReason?: string
): Promise<{ data: { partialCancellation: any; policy: PartialCancellationPolicy } | null; error: string | null }> => {
  try {
    console.log('🚫 Procesando cancelación parcial:', bookingId, travelersToCancel.length, 'viajeros');

    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select(`
        *,
        tours (id, name, start_date, cancellation_not_allowed),
        agencies (id, user_id)
      `)
      .eq('id', bookingId)
      .single();

    if (bookingError || !booking) {
      throw new Error('Reserva no encontrada');
    }

    if (!['confirmed', 'pending'].includes(booking.status)) {
      throw new Error('La reserva no está en un estado que permita cancelaciones parciales');
    }

    const { data: activeTravelers, error: travelersError } = await supabase
      .from('booking_travelers')
      .select('id')
      .eq('booking_id', bookingId)
      .eq('is_cancelled', false);

    if (travelersError) throw travelersError;

    const currentActiveCount = activeTravelers?.length || 0;
    if (travelersToCancel.length >= currentActiveCount) {
      throw new Error('No puedes cancelar todos los viajeros con cancelación parcial. Usa la cancelación total de la reserva.');
    }

    const policy = await calculatePartialCancellationPolicy(booking, travelersToCancel);

    let transactionId: string | null = null;

    if (policy.refundAmountToTraveler > 0) {
      const tourName = (booking.tours as any).name;
      const { data: refundData, error: refundError } = await supabase.rpc('update_wallet_balance', {
        p_user_id: userId,
        p_amount: policy.refundAmountToTraveler,
        p_type: 'refund',
        p_description: `Reembolso por cancelación parcial de ${tourName}`,
        p_reference_id: bookingId,
        p_reference_type: 'booking_partial_cancellation'
      });

      if (refundError) throw new Error(`Error al procesar reembolso: ${refundError.message}`);
      transactionId = refundData?.transaction_id || null;
      console.log('💰 Reembolso parcial procesado:', transactionId);
    }

    const { data: partialCancellation, error: insertError } = await supabase
      .from('booking_partial_cancellations')
      .insert({
        booking_id: bookingId,
        cancelled_by_user_id: userId,
        tour_start_date: (booking.tours as any).start_date,
        days_before_tour: policy.daysBeforeTour,
        cancellation_policy_type: policy.policyType,
        travelers_cancelled: travelersToCancel,
        original_partial_amount: policy.originalPartialAmount,
        refund_amount_to_traveler: policy.refundAmountToTraveler,
        amount_to_agency: policy.amountToAgency,
        amount_to_platform: policy.amountToPlatform,
        toursred_cash_transaction_id: transactionId,
        refund_processed: policy.refundAmountToTraveler > 0,
        cancellation_reason: cancellationReason || null
      })
      .select()
      .single();

    if (insertError) throw insertError;

    const travelerIds = travelersToCancel.map(t => t.id);
    const { error: updateTravelersError } = await supabase
      .from('booking_travelers')
      .update({
        is_cancelled: true,
        cancelled_at: new Date().toISOString(),
        partial_cancellation_id: partialCancellation.id
      })
      .in('id', travelerIds);

    if (updateTravelersError) throw updateTravelersError;

    const newActiveCount = currentActiveCount - travelersToCancel.length;
    const { error: updateBookingError } = await supabase
      .from('bookings')
      .update({
        has_partial_cancellations: true,
        active_travelers_count: newActiveCount
      })
      .eq('id', bookingId);

    if (updateBookingError) throw updateBookingError;

    if (policy.amountToAgency > 0) {
      const { data: existingCommission } = await supabase
        .from('commission_records')
        .select('id, agency_amount, platform_amount')
        .eq('booking_id', bookingId)
        .maybeSingle();

      if (existingCommission) {
        await supabase
          .from('commission_records')
          .update({
            agency_amount: Number(existingCommission.agency_amount || 0) + policy.amountToAgency,
            platform_amount: Number(existingCommission.platform_amount || 0) + policy.amountToPlatform,
            status: 'pending'
          })
          .eq('id', existingCommission.id);
      } else {
        await supabase
          .from('commission_records')
          .insert({
            booking_id: bookingId,
            agency_id: booking.agency_id,
            agency_amount: policy.amountToAgency,
            platform_amount: policy.amountToPlatform,
            status: 'pending'
          });
      }
    }

    try {
      const agencyUserId = (booking.agencies as any)?.user_id;
      if (agencyUserId) {
        await supabase.rpc('create_user_notification', {
          p_user_id: agencyUserId,
          p_type: 'booking_cancelled',
          p_title: 'Cancelación Parcial de Viajeros',
          p_message: `Se cancelaron ${travelersToCancel.length} viajero(s) de la reserva del tour "${(booking.tours as any).name}".`,
          p_data: {
            booking_id: bookingId,
            partial_cancellation_id: partialCancellation.id,
            travelers_count: travelersToCancel.length,
            refund_amount: policy.refundAmountToTraveler,
            policy_type: policy.policyType
          }
        });

        await supabase
          .from('booking_partial_cancellations')
          .update({ notification_sent: true })
          .eq('id', partialCancellation.id);
      }
    } catch (notifError) {
      console.error('⚠️ Error enviando notificación en tiempo real (no crítico):', notifError);
    }

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      const responses = await Promise.all([
        fetch(`${supabaseUrl}/functions/v1/send-partial-cancellation-notification-traveler`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseAnonKey}` },
          body: JSON.stringify({ booking_id: bookingId, partial_cancellation_id: partialCancellation.id })
        }),
        fetch(`${supabaseUrl}/functions/v1/send-partial-cancellation-notification-agency`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseAnonKey}` },
          body: JSON.stringify({ booking_id: bookingId, partial_cancellation_id: partialCancellation.id })
        }),
        fetch(`${supabaseUrl}/functions/v1/send-partial-cancellation-notification-admin`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseAnonKey}` },
          body: JSON.stringify({ booking_id: bookingId, partial_cancellation_id: partialCancellation.id })
        })
      ]);

      const allSent = responses.every(r => r.ok);
      await supabase
        .from('booking_partial_cancellations')
        .update({ emails_sent: allSent })
        .eq('id', partialCancellation.id);
    } catch (emailError) {
      console.error('⚠️ Error enviando emails de cancelación parcial (no crítico):', emailError);
    }

    console.log('✅ Cancelación parcial completada exitosamente');

    return {
      data: { partialCancellation, policy },
      error: null
    };
  } catch (error: any) {
    console.error('❌ Error en processPartialCancellation:', error);
    return {
      data: null,
      error: error.message || 'Error al procesar la cancelación parcial'
    };
  }
};