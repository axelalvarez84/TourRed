import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

async function handleSeatAssignment(
  adminClient: any,
  bookingId: string,
  targetSlotId: string,
  tourId: string,
  originalSeats: number[],
  travelersCount: number
): Promise<{ assigned: boolean; needsReselection: boolean }> {
  if (!originalSeats || originalSeats.length === 0) {
    return { assigned: false, needsReselection: false };
  }

  const { data: occupiedSeats } = await adminClient
    .from("slot_seat_status")
    .select("seat_number")
    .eq("tour_id", tourId)
    .eq("slot_id", targetSlotId)
    .in("status", ["reservado_online", "bloqueado_agencia"]);

  const occupiedNumbers = new Set((occupiedSeats || []).map((s: any) => s.seat_number));
  const availableOriginalSeats = originalSeats.filter((n) => !occupiedNumbers.has(n));

  if (availableOriginalSeats.length === travelersCount) {
    const seatRecords = availableOriginalSeats.map((seatNum) => ({
      tour_id: tourId,
      slot_id: targetSlotId,
      agency_id: null,
      seat_number: seatNum,
      status: "reservado_online",
      booking_id: bookingId,
    }));

    await adminClient
      .from("slot_seat_status")
      .delete()
      .eq("booking_id", bookingId)
      .neq("slot_id", targetSlotId);

    await adminClient.from("slot_seat_status").upsert(seatRecords, {
      onConflict: "tour_id,slot_id,seat_number",
    });

    await adminClient
      .from("bookings")
      .update({ selected_seats: availableOriginalSeats, needs_seat_reselection: false })
      .eq("id", bookingId);

    return { assigned: true, needsReselection: false };
  } else {
    await adminClient
      .from("slot_seat_status")
      .delete()
      .eq("booking_id", bookingId)
      .neq("slot_id", targetSlotId);

    await adminClient
      .from("bookings")
      .update({
        needs_seat_reselection: true,
        previous_selected_seats: originalSeats,
        selected_seats: null,
      })
      .eq("id", bookingId);

    return { assigned: false, needsReselection: true };
  }
}

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
    const { booking_id, response } = body;

    if (!booking_id || !response) {
      return new Response(JSON.stringify({ success: false, error: "Faltan campos requeridos" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!["accepted", "rejected"].includes(response)) {
      return new Response(JSON.stringify({ success: false, error: "Respuesta invalida" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: booking, error: bookingError } = await adminClient
      .from("bookings")
      .select("id, user_id, deposit_amount, toursred_cash_used, tour_id, has_pending_slot_reschedule, slot_reschedule_response, selected_seats, travelers_count")
      .eq("id", booking_id)
      .single();

    if (bookingError || !booking) {
      return new Response(JSON.stringify({ success: false, error: "Reserva no encontrada" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (booking.user_id !== user.id) {
      return new Response(JSON.stringify({ success: false, error: "Sin permisos para esta reserva" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!booking.has_pending_slot_reschedule) {
      return new Response(JSON.stringify({ success: false, error: "Esta reserva no tiene un reagendado pendiente" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (booking.slot_reschedule_response) {
      return new Response(JSON.stringify({ success: false, error: "Ya respondiste a este reagendado" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: rescheduleResponse, error: responseError } = await adminClient
      .from("slot_reschedule_responses")
      .select("*, slot_reschedule_requests!inner(id, status, response_deadline, target_slot_id, reason, tour_id, original_slot_id)")
      .eq("booking_id", booking_id)
      .eq("response", "pending")
      .single();

    if (responseError || !rescheduleResponse) {
      return new Response(JSON.stringify({ success: false, error: "No se encontro la solicitud de reagendado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rescheduleRequest = (rescheduleResponse as any).slot_reschedule_requests;

    if (rescheduleRequest.status !== "pending_responses") {
      return new Response(JSON.stringify({ success: false, error: "Esta solicitud ya fue procesada" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (new Date(rescheduleRequest.response_deadline) < new Date()) {
      return new Response(JSON.stringify({ success: false, error: "El plazo para responder ha expirado" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date().toISOString();

    if (response === "accepted") {
      await adminClient
        .from("slot_reschedule_responses")
        .update({ response: "accepted", responded_at: now })
        .eq("id", rescheduleResponse.id);

      await adminClient
        .from("bookings")
        .update({
          has_pending_slot_reschedule: false,
          slot_reschedule_response: "accepted",
          slot_reschedule_responded_at: now,
        })
        .eq("id", booking_id);

      const { data: targetSlot } = await adminClient
        .from("tour_slots")
        .select("id, slot_date, departure_time")
        .eq("id", rescheduleRequest.target_slot_id)
        .single();

      let seatReselectionNeeded = false;

      if (targetSlot) {
        const { data: tourData } = await adminClient
          .from("tours")
          .select("vehicle_map_type")
          .eq("id", booking.tour_id)
          .single();

        const hasSeatMap = !!(tourData?.vehicle_map_type);

        if (hasSeatMap && booking.selected_seats && booking.selected_seats.length > 0) {
          const seatResult = await handleSeatAssignment(
            adminClient,
            booking_id,
            targetSlot.id,
            booking.tour_id,
            booking.selected_seats,
            booking.travelers_count || booking.selected_seats.length
          );
          seatReselectionNeeded = seatResult.needsReselection;
        }
      }

      const notifMessage = seatReselectionNeeded
        ? `Confirmado. Tu reserva fue movida al ${targetSlot?.slot_date} a las ${targetSlot?.departure_time?.substring(0, 5)}. Tus asientos anteriores no estaban disponibles, por favor selecciona nuevos asientos.`
        : `Confirmado. Tu reserva ha sido movida al ${targetSlot?.slot_date} a las ${targetSlot?.departure_time?.substring(0, 5)}.`;

      await adminClient.rpc("create_user_notification", {
        p_user_id: user.id,
        p_type: seatReselectionNeeded ? "slot_reschedule_seat_reselection" : "slot_reschedule_accepted",
        p_title: seatReselectionNeeded ? "Selecciona nuevos asientos" : "Has aceptado el nuevo horario",
        p_message: notifMessage,
        p_data: {
          booking_id: booking_id,
          request_id: rescheduleRequest.id,
          new_date: targetSlot?.slot_date,
          new_time: targetSlot?.departure_time,
          needs_seat_reselection: seatReselectionNeeded,
        },
      });

      const { data: allResponses } = await adminClient
        .from("slot_reschedule_responses")
        .select("response")
        .eq("request_id", rescheduleRequest.id);

      const stillPending = allResponses?.some((r: any) => r.response === "pending");

      if (!stillPending && targetSlot) {
        const acceptedResponses = allResponses?.filter((r: any) =>
          r.response === "accepted" || r.response === "auto_accepted"
        ) || [];

        const acceptedBookingIds: string[] = await adminClient
          .from("slot_reschedule_responses")
          .select("booking_id")
          .eq("request_id", rescheduleRequest.id)
          .in("response", ["accepted", "auto_accepted"])
          .then(({ data }: { data: any[] | null }) => (data || []).map((r: any) => r.booking_id));

        await adminClient
          .from("bookings")
          .update({
            selected_date: targetSlot.slot_date,
            selected_time: targetSlot.departure_time,
          })
          .in("id", acceptedBookingIds);

        if (acceptedResponses.length > 0) {
          await adminClient.rpc("update_slot_booked_count", {
            p_slot_id: rescheduleRequest.target_slot_id,
            p_increment: acceptedResponses.length,
          }).catch(async () => {
            const { data: ts } = await adminClient
              .from("tour_slots")
              .select("booked_count")
              .eq("id", rescheduleRequest.target_slot_id)
              .single();
            if (ts) {
              await adminClient
                .from("tour_slots")
                .update({ booked_count: ts.booked_count + acceptedResponses.length })
                .eq("id", rescheduleRequest.target_slot_id);
            }
          });
        }

        await adminClient
          .from("tour_slots")
          .update({
            status: "cancelado",
            cancellation_reason: "Reagendado: " + rescheduleRequest.reason,
            cancelled_at: now,
          })
          .eq("id", rescheduleRequest.original_slot_id);

        await adminClient
          .from("slot_reschedule_requests")
          .update({ status: "completed", completed_at: now })
          .eq("id", rescheduleRequest.id);
      }

      return new Response(
        JSON.stringify({
          success: true,
          response: "accepted",
          new_date: targetSlot?.slot_date,
          new_time: targetSlot?.departure_time,
          needs_seat_reselection: seatReselectionNeeded,
          message: seatReselectionNeeded
            ? "Has aceptado el nuevo horario. Tus asientos anteriores no estaban disponibles, por favor selecciona nuevos asientos."
            : "Has aceptado el nuevo horario. Tu reserva ha sido actualizada.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );

    } else {
      const depositAmount = Number(booking.deposit_amount || 0);
      const toursredCashUsed = Number(booking.toursred_cash_used || 0);
      const totalRefund = depositAmount + toursredCashUsed;

      let refundTransactionId: string | null = null;

      if (totalRefund > 0) {
        const { data: refundData, error: refundError } = await adminClient.rpc("update_wallet_balance", {
          p_user_id: user.id,
          p_amount: totalRefund,
          p_type: "refund",
          p_description: `Reembolso por rechazo de reagendado de slot`,
          p_reference_id: booking_id,
          p_reference_type: "slot_reschedule_rejection",
        });

        if (refundError) throw refundError;
        refundTransactionId = refundData?.transaction_id || null;
      }

      await adminClient
        .from("slot_reschedule_responses")
        .update({
          response: "rejected",
          responded_at: now,
          refund_processed: true,
          refund_amount: totalRefund,
          refund_transaction_id: refundTransactionId,
        })
        .eq("id", rescheduleResponse.id);

      await adminClient
        .from("bookings")
        .update({
          status: "cancelled",
          cancelled_at: now,
          cancellation_type: "slot_reschedule_rejection",
          cancellation_refund_amount: totalRefund,
          has_pending_slot_reschedule: false,
          slot_reschedule_response: "rejected",
          slot_reschedule_responded_at: now,
        })
        .eq("id", booking_id);

      await adminClient.rpc("create_user_notification", {
        p_user_id: user.id,
        p_type: "slot_reschedule_rejected",
        p_title: "Has rechazado el reagendamiento",
        p_message: `Has rechazado el nuevo horario. Se ha procesado un reembolso de $${totalRefund.toFixed(2)} a tu ToursRed Cash.`,
        p_data: {
          booking_id: booking_id,
          request_id: rescheduleRequest.id,
          refund_amount: totalRefund,
        },
      });

      const { data: allResponses } = await adminClient
        .from("slot_reschedule_responses")
        .select("response")
        .eq("request_id", rescheduleRequest.id);

      const stillPending = allResponses?.some((r: any) => r.response === "pending");

      if (!stillPending) {
        const acceptedResponses = allResponses?.filter((r: any) =>
          r.response === "accepted" || r.response === "auto_accepted"
        ) || [];

        if (acceptedResponses.length > 0) {
          const { data: targetSlot } = await adminClient
            .from("tour_slots")
            .select("slot_date, departure_time")
            .eq("id", rescheduleRequest.target_slot_id)
            .single();

          if (targetSlot) {
            const acceptedBookingIds: string[] = await adminClient
              .from("slot_reschedule_responses")
              .select("booking_id")
              .eq("request_id", rescheduleRequest.id)
              .in("response", ["accepted", "auto_accepted"])
              .then(({ data }: { data: any[] | null }) => (data || []).map((r: any) => r.booking_id));

            await adminClient
              .from("bookings")
              .update({
                selected_date: targetSlot.slot_date,
                selected_time: targetSlot.departure_time,
              })
              .in("id", acceptedBookingIds);

            const { data: currentSlot } = await adminClient
              .from("tour_slots")
              .select("booked_count")
              .eq("id", rescheduleRequest.target_slot_id)
              .single();

            if (currentSlot) {
              await adminClient
                .from("tour_slots")
                .update({ booked_count: currentSlot.booked_count + acceptedResponses.length })
                .eq("id", rescheduleRequest.target_slot_id);
            }
          }
        }

        await adminClient
          .from("tour_slots")
          .update({
            status: "cancelado",
            cancellation_reason: "Reagendado: " + rescheduleRequest.reason,
            cancelled_at: now,
          })
          .eq("id", rescheduleRequest.original_slot_id);

        await adminClient
          .from("slot_reschedule_requests")
          .update({ status: "completed", completed_at: now })
          .eq("id", rescheduleRequest.id);
      }

      return new Response(
        JSON.stringify({
          success: true,
          response: "rejected",
          refund_amount: totalRefund,
          message: `Has rechazado el reagendamiento. Se han reembolsado $${totalRefund.toFixed(2)} a tu ToursRed Cash.`,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (error: any) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || "Error interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
