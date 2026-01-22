import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      throw new Error("Invalid user token");
    }

    const { booking_id, response } = await req.json();

    if (!booking_id || !response) {
      throw new Error("Missing required fields");
    }

    if (!["accepted", "rejected"].includes(response)) {
      throw new Error("Invalid response value");
    }

    // Obtener la reserva con información completa
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", booking_id)
      .maybeSingle();

    if (bookingError || !booking) {
      console.error("Booking error:", bookingError);
      throw new Error("Booking not found");
    }

    // Obtener información adicional
    const { data: tour } = await supabase
      .from("tours")
      .select("id, name, start_date, end_date")
      .eq("id", booking.tour_id)
      .maybeSingle();

    const { data: agency } = await supabase
      .from("agencies")
      .select("id, name, commission_rate, user_id")
      .eq("id", booking.agency_id)
      .maybeSingle();

    const { data: userInfo } = await supabase
      .from("users")
      .select("id, first_name, last_name, email")
      .eq("id", booking.user_id)
      .maybeSingle();

    // Agregar la información al booking
    booking.tour = tour;
    booking.agency = agency;
    booking.user = userInfo;

    // Verificar que la reserva pertenece al usuario
    if (booking.user_id !== user.id) {
      throw new Error("No tienes permiso para responder a esta reserva");
    }

    // Verificar que la reserva tiene un reagendamiento pendiente
    if (!booking.has_pending_reschedule) {
      throw new Error("Esta reserva no tiene un reagendamiento pendiente");
    }

    // Obtener la respuesta de reagendamiento
    const { data: rescheduleResponse, error: responseError } = await supabase
      .from("booking_reschedule_responses")
      .select(`
        *,
        reschedule:tour_reschedules!booking_reschedule_responses_tour_reschedule_id_fkey(*)
      `)
      .eq("booking_id", booking_id)
      .eq("response", "pending")
      .single();

    if (responseError || !rescheduleResponse) {
      throw new Error("No se encontró el reagendamiento pendiente");
    }

    // Verificar que no haya expirado la fecha límite
    const deadline = new Date(rescheduleResponse.reschedule.response_deadline);
    if (deadline < new Date()) {
      throw new Error("La fecha límite para responder ha expirado");
    }

    // Verificar que no haya respondido ya
    if (rescheduleResponse.response !== "pending") {
      throw new Error("Ya has respondido a este reagendamiento");
    }

    const now = new Date().toISOString();

    if (response === "accepted") {
      // ACEPTAR: Actualizar la reserva con la nueva fecha

      // Actualizar respuesta de reagendamiento
      await supabase
        .from("booking_reschedule_responses")
        .update({
          response: "accepted",
          responded_at: now
        })
        .eq("id", rescheduleResponse.id);

      // Actualizar booking con nueva fecha
      await supabase
        .from("bookings")
        .update({
          has_pending_reschedule: false,
          reschedule_response: "accepted",
          reschedule_responded_at: now,
          booking_date: rescheduleResponse.reschedule.new_start_date
        })
        .eq("id", booking_id);

      // Crear notificaciones
      await supabase
        .from("notifications")
        .insert([
          {
            user_id: user.id,
            type: "booking_confirmed",
            title: "Reagendamiento Aceptado",
            message: `Has aceptado la nueva fecha para el tour "${booking.tour.name}". Tu reserva ha sido actualizada.`,
            data: {
              booking_id: booking_id,
              tour_id: booking.tour_id,
              new_date: rescheduleResponse.reschedule.new_start_date
            }
          },
          {
            user_id: booking.agency.user_id,
            type: "booking_confirmed",
            title: "Reagendamiento Aceptado",
            message: `${userInfo.first_name} ${userInfo.last_name} aceptó el reagendamiento del tour "${booking.tour.name}". La reserva continúa con la nueva fecha.`,
            data: {
              booking_id: booking_id,
              tour_id: booking.tour_id,
              new_date: rescheduleResponse.reschedule.new_start_date
            }
          }
        ]);

      // Enviar emails de confirmación
      console.log("=== ENVIANDO EMAILS DE CONFIRMACIÓN ===");

      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

      console.log("Supabase URL:", supabaseUrl);
      console.log("Service Role Key disponible:", supabaseKey ? "SÍ" : "NO");

      const serviceRoleClient = createClient(supabaseUrl!, supabaseKey!);

      // Enviar email al viajero
      console.log("\n[1/2] Enviando email de confirmación al viajero...");
      console.log("Función: send-reschedule-response-confirmation");
      console.log("Booking ID:", booking_id);

      try {
        const travelerResult = await serviceRoleClient.functions.invoke("send-reschedule-response-confirmation", {
          body: {
            booking_id: booking_id,
            response: "accepted"
          }
        });

        console.log("Resultado viajero:", JSON.stringify(travelerResult, null, 2));

        if (travelerResult.error) {
          console.error("❌ ERROR en email al viajero:", travelerResult.error);
        } else {
          console.log("✅ Email al viajero enviado exitosamente");
        }
      } catch (err) {
        console.error("❌ EXCEPCIÓN al enviar email al viajero:");
        console.error(err);
      }

      // Enviar email a la agencia
      console.log("\n[2/2] Enviando email de confirmación a la agencia...");
      console.log("Función: send-reschedule-response-agency");
      console.log("Booking ID:", booking_id);

      try {
        const agencyResult = await serviceRoleClient.functions.invoke("send-reschedule-response-agency", {
          body: {
            booking_id: booking_id,
            response: "accepted"
          }
        });

        console.log("Resultado agencia:", JSON.stringify(agencyResult, null, 2));

        if (agencyResult.error) {
          console.error("❌ ERROR en email a la agencia:", agencyResult.error);
        } else {
          console.log("✅ Email a la agencia enviado exitosamente");
        }
      } catch (err) {
        console.error("❌ EXCEPCIÓN al enviar email a la agencia:");
        console.error(err);
      }

      console.log("\n=== PROCESO DE EMAILS COMPLETADO ===");

      return new Response(
        JSON.stringify({
          success: true,
          response: "accepted",
          message: "Has aceptado la nueva fecha. Tu reserva ha sido actualizada exitosamente.",
          new_booking_date: rescheduleResponse.reschedule.new_start_date
        }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );

    } else if (response === "rejected") {
      // RECHAZAR: Procesar reembolso 100% y cancelar la reserva

      // Calcular monto de reembolso (100% del depósito pagado)
      const refundAmount = Number(booking.deposit_amount);

      // Si usó ToursRed Cash, también se reembolsa
      const toursredCashUsed = Number(booking.toursred_cash_used || 0);
      const totalRefund = refundAmount + toursredCashUsed;

      // Procesar reembolso a ToursRed Cash
      const { data: walletUpdate, error: walletError } = await supabase.rpc(
        "update_wallet_balance",
        {
          p_user_id: user.id,
          p_amount: totalRefund,
          p_type: "refund",
          p_description: `Reembolso por reagendamiento rechazado - ${booking.tour.name}`,
          p_reference_id: booking_id,
          p_reference_type: "reschedule_rejection"
        }
      );

      if (walletError) {
        throw new Error("Error al procesar el reembolso");
      }

      const transactionId = walletUpdate;

      // Actualizar respuesta de reagendamiento
      await supabase
        .from("booking_reschedule_responses")
        .update({
          response: "rejected",
          responded_at: now,
          refund_processed: true,
          refund_transaction_id: transactionId
        })
        .eq("id", rescheduleResponse.id);

      // Actualizar booking como cancelado
      await supabase
        .from("bookings")
        .update({
          status: "cancelled",
          has_pending_reschedule: false,
          reschedule_response: "rejected",
          reschedule_responded_at: now,
          cancelled_at: now,
          cancellation_type: "reschedule_rejection",
          cancellation_refund_amount: totalRefund
        })
        .eq("id", booking_id);

      // Revertir comisiones - la agencia no recibe nada
      const commissionRate = Number(booking.agency.commission_rate);
      const agencyAmount = refundAmount * (1 - commissionRate);
      const platformCommission = refundAmount * commissionRate;

      // Actualizar commission_records
      await supabase
        .from("commission_records")
        .update({
          status: "disputed",
          agency_net_amount: 0, // La agencia no recibe nada
          platform_total_revenue: 0 // La plataforma tampoco
        })
        .eq("booking_id", booking_id);

      // Crear notificaciones de reembolso
      await supabase
        .from("notifications")
        .insert([
          {
            user_id: user.id,
            type: "booking_cancelled",
            title: "Reembolso Procesado",
            message: `Has rechazado el reagendamiento del tour "${booking.tour.name}". Se ha procesado tu reembolso de $${totalRefund.toFixed(2)} MXN a tu monedero ToursRed Cash.`,
            data: {
              booking_id: booking_id,
              tour_id: booking.tour_id,
              refund_amount: totalRefund,
              transaction_id: transactionId
            }
          },
          {
            user_id: booking.agency.user_id,
            type: "booking_cancelled",
            title: "Reagendamiento Rechazado",
            message: `${userInfo.first_name} ${userInfo.last_name} rechazó el reagendamiento del tour "${booking.tour.name}". La reserva fue cancelada y se procesó el reembolso completo.`,
            data: {
              booking_id: booking_id,
              tour_id: booking.tour_id,
              refund_amount: totalRefund
            }
          }
        ]);

      // Enviar emails de confirmación de reembolso
      console.log("=== ENVIANDO EMAILS DE REEMBOLSO ===");

      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

      console.log("Supabase URL:", supabaseUrl);
      console.log("Service Role Key disponible:", supabaseKey ? "SÍ" : "NO");

      const serviceRoleClient = createClient(supabaseUrl!, supabaseKey!);

      // Enviar email al viajero
      console.log("\n[1/2] Enviando email de reembolso al viajero...");
      console.log("Función: send-reschedule-response-confirmation");
      console.log("Booking ID:", booking_id);

      try {
        const travelerResult = await serviceRoleClient.functions.invoke("send-reschedule-response-confirmation", {
          body: {
            booking_id: booking_id,
            response: "rejected"
          }
        });

        console.log("Resultado viajero:", JSON.stringify(travelerResult, null, 2));

        if (travelerResult.error) {
          console.error("❌ ERROR en email al viajero:", travelerResult.error);
        } else {
          console.log("✅ Email de reembolso al viajero enviado exitosamente");
        }
      } catch (err) {
        console.error("❌ EXCEPCIÓN al enviar email al viajero:");
        console.error(err);
      }

      // Enviar email a la agencia
      console.log("\n[2/2] Enviando email de rechazo a la agencia...");
      console.log("Función: send-reschedule-response-agency");
      console.log("Booking ID:", booking_id);

      try {
        const agencyResult = await serviceRoleClient.functions.invoke("send-reschedule-response-agency", {
          body: {
            booking_id: booking_id,
            response: "rejected"
          }
        });

        console.log("Resultado agencia:", JSON.stringify(agencyResult, null, 2));

        if (agencyResult.error) {
          console.error("❌ ERROR en email a la agencia:", agencyResult.error);
        } else {
          console.log("✅ Email de rechazo a la agencia enviado exitosamente");
        }
      } catch (err) {
        console.error("❌ EXCEPCIÓN al enviar email a la agencia:");
        console.error(err);
      }

      console.log("\n=== PROCESO DE EMAILS DE REEMBOLSO COMPLETADO ===");

      return new Response(
        JSON.stringify({
          success: true,
          response: "rejected",
          message: "Has rechazado el reagendamiento. Tu reembolso ha sido procesado exitosamente.",
          refund_amount: totalRefund,
          transaction_id: transactionId
        }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

  } catch (error: any) {
    console.error("Error in respond-to-reschedule:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "Error al procesar la respuesta"
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});
