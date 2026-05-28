import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    // Verificar JWT del usuario llamante
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Cliente con el JWT del usuario para verificar su rol
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verificar que el usuario sea admin o super_admin
    const { data: profile, error: profileError } = await userClient
      .from("users")
      .select("role, is_super_admin")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError || !profile || (profile.role !== "admin" && !profile.is_super_admin)) {
      return new Response(JSON.stringify({ error: "Forbidden: admin role required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Cliente service_role para bypass de RLS
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: bookings, error: bookingsError } = await adminClient
      .from("bookings")
      .select(`
        id, booking_code, user_id, tour_id, agency_id,
        booking_date, created_at, updated_at, status, payment_status,
        payment_method, total_price, deposit_amount, user_payment,
        service_charge, platform_revenue, commission_amount,
        travelers_count, count_adultos, count_ninos, count_infantes,
        count_adultos_mayores, count_mascotas,
        approval_status, approval_notes, approved_at,
        is_no_show, no_show_marked_at,
        has_pending_reschedule, has_pending_slot_reschedule,
        slot_reschedule_response, reschedule_response, original_booking_date,
        selected_date, selected_time, paid_at, confirmation_email_sent,
        payment_intent_id, cancelled_at, cancellation_type, cancellation_refund_amount,
        toursred_cash_used, points_used, points_earned, used_membership_benefit,
        service_charge_discount, membership_service_fee_saved,
        preventa_comision_descuento, discount_amount, es_reserva_preventa,
        needs_seat_reselection, selected_seats,
        users!bookings_user_id_fkey(
          first_name, last_name, email, profile_picture_url, phone_number,
          is_active, curp, rfc, razon_social, regimen_fiscal, uso_cfdi,
          is_foreign_traveler, passport_number
        ),
        tours!bookings_tour_id_fkey(
          name, destination, start_date, end_date, image_url, price,
          deposit_percentage, booking_approval_type, category
        ),
        agencies!bookings_agency_id_fkey(
          name, logo, contact_email, contact_phone, commission_rate
        ),
        commission_records!commission_records_booking_id_fkey(
          id, agency_commission_rate, agency_commission_amount,
          service_charge_rate, service_charge_amount,
          platform_total_revenue, agency_net_amount, status, processed_at
        )
      `)
      .order("created_at", { ascending: false });

    if (bookingsError) {
      return new Response(JSON.stringify({ error: bookingsError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(bookings), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
