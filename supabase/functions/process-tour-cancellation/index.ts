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

    const { tour_id, cancellation_reason } = await req.json();

    if (!tour_id || !cancellation_reason) {
      throw new Error("Missing required fields");
    }

    if (cancellation_reason.trim().length < 50) {
      throw new Error("El motivo de cancelación debe tener al menos 50 caracteres");
    }

    const { data: tour, error: tourError } = await supabase
      .from("tours")
      .select("*, agency:agencies!tours_agency_id_fkey(id, user_id, name, contact_email)")
      .eq("id", tour_id)
      .single();

    if (tourError || !tour) {
      throw new Error("Tour no encontrado");
    }

    if (tour.agency.user_id !== user.id) {
      throw new Error("No tienes permiso para cancelar este tour");
    }

    if (tour.cancelled_by_agency) {
      throw new Error("Este tour ya fue cancelado por la agencia");
    }

    const tourStartDate = new Date(tour.start_date);
    const now = new Date();
    tourStartDate.setHours(0, 0, 0, 0);
    now.setHours(0, 0, 0, 0);

    if (tourStartDate <= now) {
      throw new Error("No se puede cancelar un tour que ya inició o está en curso");
    }

    const { data: activeBookings, error: bookingsError } = await supabase
      .from("bookings")
      .select("*, user:users!bookings_user_id_fkey(id, first_name, last_name, email)")
      .eq("tour_id", tour_id)
      .in("status", ["confirmed", "pending"])
      .eq("payment_status", "succeeded")
      .is("cancelled_at", null);

    if (bookingsError) {
      throw new Error("Error al obtener reservas");
    }

    if (!activeBookings || activeBookings.length === 0) {
      throw new Error("No hay reservas activas para cancelar en este tour");
    }

    const { data: cancellationRecord, error: cancellationError } = await supabase
      .from("tour_cancellations")
      .insert({
        tour_id: tour_id,
        agency_id: tour.agency_id,
        cancelled_by_user_id: user.id,
        cancellation_reason: cancellation_reason.trim(),
        original_tour_date: tour.start_date,
        affected_bookings_count: activeBookings.length
      })
      .select()
      .single();

    if (cancellationError || !cancellationRecord) {
      throw new Error("Error al crear el registro de cancelación");
    }

    let totalRefunded = 0;
    let successfulRefunds = 0;
    const failedRefunds: string[] = [];

    for (const booking of activeBookings) {
      try {
        let wallet = await supabase
          .from("toursred_cash_wallets")
          .select("*")
          .eq("user_id", booking.user_id)
          .maybeSingle();

        if (!wallet.data) {
          const { data: newWallet, error: walletError } = await supabase
            .from("toursred_cash_wallets")
            .insert({
              user_id: booking.user_id,
              balance: 0,
              currency: "MXN"
            })
            .select()
            .single();

          if (walletError || !newWallet) {
            throw new Error("Error creando wallet");
          }
          wallet.data = newWallet;
        }

        const refundAmount = Number(booking.deposit_amount) || 0;
        const newBalance = Number(wallet.data.balance) + refundAmount;

        const { error: transactionError } = await supabase
          .from("toursred_cash_transactions")
          .insert({
            wallet_id: wallet.data.id,
            user_id: booking.user_id,
            amount: refundAmount,
            balance_after: newBalance,
            type: "refund",
            description: `Reembolso completo por cancelación del tour: ${tour.name}`,
            reference_id: cancellationRecord.id,
            reference_type: "tour_cancellation"
          });

        if (transactionError) {
          throw new Error("Error creando transacción");
        }

        const { error: walletUpdateError } = await supabase
          .from("toursred_cash_wallets")
          .update({ balance: newBalance })
          .eq("id", wallet.data.id);

        if (walletUpdateError) {
          throw new Error("Error actualizando balance");
        }

        const { error: bookingUpdateError } = await supabase
          .from("bookings")
          .update({
            status: "cancelled",
            cancelled_at: new Date().toISOString(),
            cancellation_type: "agency_cancellation",
            cancellation_refund_amount: refundAmount,
            agency_cancellation_id: cancellationRecord.id
          })
          .eq("id", booking.id);

        if (bookingUpdateError) {
          throw new Error("Error actualizando reserva");
        }

        totalRefunded += refundAmount;
        successfulRefunds++;

        try {
          await supabase.functions.invoke("send-agency-cancellation-notification-traveler", {
            body: {
              booking_id: booking.id,
              tour_cancellation_id: cancellationRecord.id
            }
          });
        } catch (emailError) {
          console.error("Error sending email to traveler:", emailError);
        }

        await supabase
          .from("notifications")
          .insert({
            user_id: booking.user_id,
            type: "system_announcement",
            title: "Tour Cancelado por la Agencia",
            message: `El tour "${tour.name}" ha sido cancelado por la agencia. Has recibido un reembolso completo de $${refundAmount.toFixed(2)} en tu ToursRed Cash.`,
            data: {
              booking_id: booking.id,
              tour_id: tour_id,
              tour_cancellation_id: cancellationRecord.id,
              refund_amount: refundAmount
            }
          });

      } catch (err) {
        console.error("Error processing refund for booking:", booking.id, err);
        failedRefunds.push(booking.id);
      }
    }

    await supabase
      .from("tour_cancellations")
      .update({
        total_refunded_amount: totalRefunded,
        emails_sent_to_travelers: successfulRefunds
      })
      .eq("id", cancellationRecord.id);

    await supabase
      .from("tours")
      .update({
        cancelled_by_agency: true,
        agency_cancellation_id: cancellationRecord.id
      })
      .eq("id", tour_id);

    try {
      await supabase.functions.invoke("send-agency-cancellation-notification-admin", {
        body: {
          tour_cancellation_id: cancellationRecord.id
        }
      });

      await supabase
        .from("tour_cancellations")
        .update({ admin_email_sent: true })
        .eq("id", cancellationRecord.id);
    } catch (adminEmailError) {
      console.error("Error sending admin email:", adminEmailError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        cancellation_id: cancellationRecord.id,
        affected_bookings: activeBookings.length,
        successful_refunds: successfulRefunds,
        failed_refunds: failedRefunds.length,
        total_refunded: totalRefunded,
        message: `Tour cancelado exitosamente. ${successfulRefunds} reservas fueron reembolsadas.`
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );

  } catch (error: any) {
    console.error("Error in process-tour-cancellation:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "Error al procesar la cancelación del tour"
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
