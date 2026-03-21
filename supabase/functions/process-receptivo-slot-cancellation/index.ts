import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ success: false, error: "No autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const adminClient = createClient(supabaseUrl, serviceKey);

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ success: false, error: "No autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { slot_id, tour_id, cancellation_reason, reschedule_to_date, reschedule_to_time } = body;

    if (!slot_id || !tour_id || !cancellation_reason) {
      return new Response(JSON.stringify({ success: false, error: "Faltan campos requeridos" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isReschedule = !!(reschedule_to_date && reschedule_to_time);

    const { data: slot, error: slotError } = await adminClient
      .from("tour_slots")
      .select("*, tours!inner(id, name, agency_id, agencies!inner(user_id, name))")
      .eq("id", slot_id)
      .eq("tour_id", tour_id)
      .single();

    if (slotError || !slot) {
      return new Response(JSON.stringify({ success: false, error: "Slot no encontrado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const agencyUserId = (slot.tours as any).agencies?.user_id;
    const { data: userData } = await adminClient
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();

    const isAdmin = userData?.role === "admin" || userData?.role === "super_admin";
    const isAgencyOwner = agencyUserId === user.id;

    if (!isAdmin && !isAgencyOwner) {
      const { data: staffData } = await adminClient
        .from("agency_staff_members")
        .select("permissions")
        .eq("user_id", user.id)
        .eq("agency_id", (slot.tours as any).agency_id)
        .eq("is_active", true)
        .single();

      const canManage = (staffData?.permissions as any)?.canManageTours;
      if (!canManage) {
        return new Response(JSON.stringify({ success: false, error: "Sin permisos para esta accion" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const { data: affectedBookings, error: bookingsError } = await adminClient
      .from("bookings")
      .select("id, user_id, deposit_amount, service_charge, toursred_cash_used")
      .eq("tour_id", tour_id)
      .eq("selected_date", slot.slot_date)
      .eq("selected_time", slot.departure_time)
      .in("status", ["confirmed", "pending"])
      .is("cancelled_at", null);

    if (bookingsError) throw bookingsError;

    const refundPromises = (affectedBookings || []).map(async (booking: any) => {
      const depositAmount = Number(booking.deposit_amount || 0);
      const toursredCashUsed = Number(booking.toursred_cash_used || 0);

      const walletRefund = toursredCashUsed > 0
        ? await adminClient.rpc("update_wallet_balance", {
            p_user_id: booking.user_id,
            p_amount: depositAmount,
            p_type: "refund",
            p_description: isReschedule
              ? `Reembolso por reagendamiento de slot: ${(slot.tours as any).name} - ${slot.slot_date}`
              : `Reembolso por cancelacion de slot: ${(slot.tours as any).name} - ${slot.slot_date}`,
            p_reference_id: booking.id,
            p_reference_type: "slot_cancellation",
          })
        : await adminClient.rpc("update_wallet_balance", {
            p_user_id: booking.user_id,
            p_amount: depositAmount,
            p_type: "refund",
            p_description: isReschedule
              ? `Reembolso por reagendamiento de slot: ${(slot.tours as any).name} - ${slot.slot_date}`
              : `Reembolso por cancelacion de slot: ${(slot.tours as any).name} - ${slot.slot_date}`,
            p_reference_id: booking.id,
            p_reference_type: "slot_cancellation",
          });

      await adminClient
        .from("bookings")
        .update({
          status: "cancelled",
          cancelled_at: new Date().toISOString(),
          cancellation_type: "no_refund",
          cancellation_refund_amount: depositAmount,
        })
        .eq("id", booking.id);

      await adminClient.rpc("create_user_notification", {
        p_user_id: booking.user_id,
        p_type: "booking_cancelled",
        p_title: isReschedule ? "Cambio de Fecha en tu Tour" : "Cancelacion de Fecha de Tour",
        p_message: isReschedule
          ? `Tu reserva en "${(slot.tours as any).name}" ha cambiado de fecha: ${slot.slot_date} → ${reschedule_to_date}. Se ha procesado un reembolso completo. Puedes volver a reservar en la nueva fecha.`
          : `La fecha ${slot.slot_date} de "${(slot.tours as any).name}" fue cancelada. Se ha procesado un reembolso del 100% del anticipo.`,
        p_data: {
          booking_id: booking.id,
          tour_id: tour_id,
          slot_date: slot.slot_date,
          new_date: reschedule_to_date || null,
          is_reschedule: isReschedule,
        },
      });

      return walletRefund;
    });

    await Promise.all(refundPromises);

    await adminClient
      .from("tour_slots")
      .update({
        status: "cancelled",
        cancellation_reason: cancellation_reason,
        cancelled_at: new Date().toISOString(),
      })
      .eq("id", slot_id);

    if (isReschedule) {
      await adminClient.from("tour_slots").insert({
        tour_id: tour_id,
        agency_id: (slot.tours as any).agency_id,
        schedule_id: slot.schedule_id,
        slot_date: reschedule_to_date,
        departure_time: reschedule_to_time + ":00",
        capacity: slot.capacity,
        booked_count: 0,
        status: "available",
        is_auto_generated: false,
        min_travelers_reached: false,
        notes: `Reagendado desde ${slot.slot_date} ${slot.departure_time}. Motivo: ${cancellation_reason}`,
      });
    }

    const tourName = (slot.tours as any).name;
    const affectedCount = affectedBookings?.length || 0;
    const supabaseAnonKey = anonKey;
    const supabaseUrlStr = supabaseUrl;

    if (affectedCount > 0) {
      fetch(`${supabaseUrlStr}/functions/v1/send-agency-cancellation-notification-admin`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({
          tour_id,
          slot_date: slot.slot_date,
          slot_time: slot.departure_time,
          is_slot_cancellation: true,
          is_reschedule: isReschedule,
          new_date: reschedule_to_date,
          new_time: reschedule_to_time,
          affected_count: affectedCount,
          cancellation_reason,
          tour_name: tourName,
        }),
      }).catch(() => {});
    }

    return new Response(
      JSON.stringify({
        success: true,
        affected_bookings: affectedCount,
        is_reschedule: isReschedule,
        message: isReschedule
          ? `Slot reagendado. ${affectedCount} viajero(s) notificados y reembolsados.`
          : `Slot cancelado. ${affectedCount} viajero(s) notificados y reembolsados.`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || "Error interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
