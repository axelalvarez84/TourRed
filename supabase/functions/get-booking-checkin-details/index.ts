import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.6";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No autenticado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "No autenticado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const url = new URL(req.url);
    const token = url.searchParams.get("token") || (await req.json().catch(() => ({}))).token;

    if (!token) {
      return new Response(
        JSON.stringify({ error: "Token es requerido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: tokenRecord, error: tokenError } = await supabase
      .from("booking_checkin_tokens")
      .select("id, booking_id, expires_at, redeemed_at, created_at")
      .eq("token", token)
      .maybeSingle();

    if (tokenError || !tokenRecord) {
      return new Response(
        JSON.stringify({ error: "Token no válido o no encontrado" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const now = new Date();
    const isExpired = new Date(tokenRecord.expires_at) < now;
    const isRedeemed = !!tokenRecord.redeemed_at;

    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select(`
        id,
        booking_code,
        status,
        total_price,
        deposit_amount,
        travelers_count,
        count_adultos,
        count_ninos,
        count_infantes,
        count_adultos_mayores,
        count_mascotas,
        checkin_status,
        checkin_at,
        selected_seats,
        user_id,
        agency_id,
        tour:tours(id, name, destination, start_date, end_date),
        traveler:users!bookings_user_id_fkey(id, first_name, last_name, email, phone_number),
        agency:agencies(id, name, user_id, contact_email, contact_phone)
      `)
      .eq("id", tokenRecord.booking_id)
      .maybeSingle();

    if (bookingError || !booking) {
      return new Response(
        JSON.stringify({ error: "Reserva no encontrada" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: currentUser } = await supabase
      .from("users")
      .select("id, role")
      .eq("id", user.id)
      .maybeSingle();

    const isBookingOwner = booking.user_id === user.id;
    const isAgency = booking.agency?.user_id === user.id;
    const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'super_admin';

    if (!isBookingOwner && !isAgency && !isAdmin) {
      return new Response(
        JSON.stringify({ error: "No tienes permiso para acceder a esta reserva" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: travelers } = await supabase
      .from("booking_travelers")
      .select("id, nombre, email, categoria_viajero, precio_aplicado, is_no_show")
      .eq("booking_id", tokenRecord.booking_id)
      .order("created_at", { ascending: true });

    const remainingAmount = booking.total_price - booking.deposit_amount;

    return new Response(
      JSON.stringify({
        success: true,
        token_info: {
          expires_at: tokenRecord.expires_at,
          redeemed_at: tokenRecord.redeemed_at,
          is_expired: isExpired,
          is_redeemed: isRedeemed,
        },
        booking: {
          id: booking.id,
          booking_code: booking.booking_code,
          status: booking.status,
          total_price: booking.total_price,
          deposit_amount: booking.deposit_amount,
          remaining_amount: remainingAmount,
          travelers_count: booking.travelers_count,
          count_adultos: booking.count_adultos,
          count_ninos: booking.count_ninos,
          count_infantes: booking.count_infantes,
          count_adultos_mayores: booking.count_adultos_mayores,
          count_mascotas: booking.count_mascotas,
          checkin_status: booking.checkin_status,
          checkin_at: booking.checkin_at,
          selected_seats: booking.selected_seats || [],
          tour: booking.tour,
          traveler: booking.traveler,
          agency: {
            id: booking.agency?.id,
            name: booking.agency?.name,
            contact_email: booking.agency?.contact_email,
            contact_phone: booking.agency?.contact_phone,
          },
        },
        travelers: travelers || [],
        viewer_role: isAgency ? 'agency' : isAdmin ? 'admin' : 'traveler',
        can_checkin: (isAgency || isAdmin) && !isExpired && !isRedeemed && booking.status !== 'cancelled',
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error en get-booking-checkin-details:", error);
    return new Response(
      JSON.stringify({ error: "Error interno del servidor", details: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
