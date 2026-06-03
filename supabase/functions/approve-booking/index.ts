import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.6";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ApproveBookingRequest {
  booking_id: string;
  action: "approve" | "reject";
  notes?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verificar que el usuario autenticado sea agencia o admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "No autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { booking_id, action, notes }: ApproveBookingRequest = await req.json();

    if (!booking_id || !action) {
      return new Response(JSON.stringify({ error: "Parámetros requeridos: booking_id, action" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Leer la reserva con todos los campos necesarios
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select(`
        id,
        user_id,
        user_payment,
        points_used,
        toursred_cash_used,
        travel_insurance_cost,
        travel_insurance_included,
        total_price,
        service_charge,
        service_charge_discount,
        used_membership_benefit,
        agency_id,
        tours(name)
      `)
      .eq("id", booking_id)
      .maybeSingle();

    if (bookingError || !booking) {
      return new Response(JSON.stringify({ error: "Reserva no encontrada" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verificar permisos: admin/super_admin, dueño de agencia, o staff de la agencia
    const { data: currentUser } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    const isAdmin = currentUser?.role === "admin" || currentUser?.role === "super_admin";

    // El dueño de la agencia tiene agencies.user_id = user.id
    const { data: ownedAgency } = await supabase
      .from("agencies")
      .select("id")
      .eq("user_id", user.id)
      .eq("id", booking.agency_id)
      .maybeSingle();

    const isAgencyOwner = !!ownedAgency;

    // Staff de agencia: agency_staff.user_id = user.id y agency_staff.agency_id = booking.agency_id
    let isAgencyStaff = false;
    if (!isAdmin && !isAgencyOwner) {
      const { data: staffRecord } = await supabase
        .from("agency_staff")
        .select("id")
        .eq("user_id", user.id)
        .eq("agency_id", booking.agency_id)
        .eq("is_active", true)
        .maybeSingle();
      isAgencyStaff = !!staffRecord;
    }

    if (!isAdmin && !isAgencyOwner && !isAgencyStaff) {
      return new Response(JSON.stringify({ error: "Sin permisos para esta reserva" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const approvalStatus = action === "approve" ? "approved" : "rejected";
    const now = new Date().toISOString();

    // Si es rechazo, solo actualizar approval_status
    if (action === "reject") {
      const { error: updateError } = await supabase
        .from("bookings")
        .update({
          approval_status: "rejected",
          approval_notes: notes || null,
          approved_at: null,
          approved_by: user.id,
          updated_at: now,
        })
        .eq("id", booking_id);

      if (updateError) throw new Error(updateError.message);

      return new Response(
        JSON.stringify({ success: true, auto_confirmed: false, action: "rejected" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- FLUJO DE APROBACION ---

    // Calcular cuánto está ya cubierto por puntos y cash
    const pointsValue = (booking.points_used || 0) / 100;
    const cashUsed = booking.toursred_cash_used || 0;
    const totalCovered = pointsValue + cashUsed;
    const totalToPay = booking.user_payment || 0;

    // ¿Está completamente cubierto sin necesidad de otro método de pago?
    const autoConfirm = totalToPay > 0 && totalCovered >= totalToPay;

    if (autoConfirm) {
      // Aprobar Y confirmar en una sola operacion atomica
      const { error: updateError } = await supabase
        .from("bookings")
        .update({
          approval_status: "approved",
          approval_notes: notes || null,
          approved_at: now,
          approved_by: user.id,
          payment_status: "succeeded",
          status: "confirmed",
          payment_method: pointsValue > 0 && cashUsed > 0
            ? "toursred_points_and_cash"
            : cashUsed > 0
              ? "toursred_cash"
              : "toursred_points",
          paid_at: now,
          updated_at: now,
        })
        .eq("id", booking_id);

      if (updateError) throw new Error(updateError.message);

      // Descontar ToursRed Cash del monedero si se usó
      if (cashUsed > 0) {
        const { error: walletError } = await supabase.rpc("update_wallet_balance", {
          p_user_id: booking.user_id,
          p_amount: -cashUsed,
          p_type: "debit",
          p_description: `Pago de reserva para ${(booking as any).tours?.name || "tour"}`,
          p_reference_id: booking_id,
          p_reference_type: "booking",
        });

        if (walletError) {
          console.error("Error al descontar cash del monedero:", walletError);
          // No fallar aqui — la reserva ya está confirmada, revertir seria peor
          // El error queda en logs para revision manual si ocurre
        }
      }

      // Descontar puntos si se usaron
      if (booking.points_used > 0) {
        const { error: pointsError } = await supabase.rpc("deduct_points", {
          p_user_id: booking.user_id,
          p_points: booking.points_used,
          p_description: `Canje de puntos para reserva ${booking_id}`,
          p_reference_id: booking_id,
          p_reference_type: "booking",
        });

        if (pointsError) {
          console.error("Error al descontar puntos:", pointsError);
          // Igual: no fallar, loguear para revision
        }
      }

      // Actualizar service_fee_exemption_used en la membresía si aplica
      if (!booking.used_membership_benefit) {
        const { data: platformSettings } = await supabase
          .from("platform_settings")
          .select("service_charge_percentage")
          .maybeSingle();

        const serviceChargeRate = platformSettings?.service_charge_percentage || 5;
        const fullServiceCharge = ((booking.total_price || 0) * serviceChargeRate) / 100;
        const actualServiceCharge = parseFloat(booking.service_charge || 0);
        const codeDiscount = parseFloat(booking.service_charge_discount || 0);
        const exemptionUsed = fullServiceCharge - actualServiceCharge - codeDiscount;

        if (exemptionUsed > 0) {
          const { data: membership } = await supabase
            .from("memberships")
            .select("id, service_fee_exemption_used")
            .eq("user_id", booking.user_id)
            .eq("status", "active")
            .maybeSingle();

          if (membership) {
            await supabase
              .from("memberships")
              .update({
                service_fee_exemption_used: (membership.service_fee_exemption_used || 0) + exemptionUsed,
              })
              .eq("id", membership.id);
          }

          await supabase
            .from("bookings")
            .update({ used_membership_benefit: true })
            .eq("id", booking_id);
        }
      }

      return new Response(
        JSON.stringify({ success: true, auto_confirmed: true, action: "approved" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Aprobacion normal: solo actualizar approval_status
    const { error: updateError } = await supabase
      .from("bookings")
      .update({
        approval_status: "approved",
        approval_notes: notes || null,
        approved_at: now,
        approved_by: user.id,
        updated_at: now,
      })
      .eq("id", booking_id);

    if (updateError) throw new Error(updateError.message);

    return new Response(
      JSON.stringify({ success: true, auto_confirmed: false, action: "approved" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Error en approve-booking:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || "Error interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
