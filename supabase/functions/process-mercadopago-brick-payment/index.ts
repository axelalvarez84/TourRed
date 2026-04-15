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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { formData, preferenceId, bookingId } = await req.json();

    if (!formData) {
      return new Response(JSON.stringify({ error: "Datos del formulario requeridos" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let mpAccessToken = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");
    if (!mpAccessToken) {
      const { data: settings } = await supabase
        .from("platform_settings")
        .select("mercadopago_access_token")
        .maybeSingle();
      if (settings?.mercadopago_access_token) mpAccessToken = settings.mercadopago_access_token;
    }

    if (!mpAccessToken) {
      return new Response(JSON.stringify({ error: "MercadoPago no configurado" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const paymentPayload = {
      ...formData,
      metadata: {
        ...(formData.metadata || {}),
        preference_id: preferenceId,
        booking_id: bookingId,
      },
    };

    const mpResponse = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${mpAccessToken}`,
        "X-Idempotency-Key": `${preferenceId}-${Date.now()}`,
      },
      body: JSON.stringify(paymentPayload),
    });

    const payment = await mpResponse.json();

    if (!mpResponse.ok) {
      console.error("MercadoPago payment error:", JSON.stringify(payment));
      return new Response(
        JSON.stringify({
          error: payment.message || "Error al procesar el pago",
          status_detail: payment.cause?.[0]?.description,
        }),
        {
          status: mpResponse.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (bookingId && payment.status === "approved") {
      const { data: giftCardCheck } = await supabase
        .from("gift_cards")
        .select("id")
        .eq("id", bookingId)
        .maybeSingle();

      if (giftCardCheck) {
        await supabase
          .from("gift_cards")
          .update({
            status: "active",
            payment_status: "paid",
          })
          .eq("id", bookingId);

        try {
          await fetch(
            `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-gift-card-email`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
              },
              body: JSON.stringify({ giftCardId: bookingId }),
            }
          );
          console.log("Gift card email sent for:", bookingId);
        } catch (emailErr) {
          console.error("Error sending gift card email:", emailErr);
        }

        return new Response(
          JSON.stringify({
            success: true,
            status: payment.status,
            status_detail: payment.status_detail,
            payment_id: payment.id,
            external_reference: payment.external_reference,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { error: updateError } = await supabase
        .from("bookings")
        .update({
          payment_status: "succeeded",
          status: "confirmed",
          paid_at: new Date().toISOString(),
          payment_method: "mercadopago",
        })
        .eq("id", bookingId);

      if (updateError) {
        console.error("Error updating booking after approved MP payment:", updateError);
      } else {
        console.log("Booking confirmed after MP payment approval:", bookingId);

        const { data: booking } = await supabase
          .from("bookings")
          .select("agency_id, deposit_amount, service_charge")
          .eq("id", bookingId)
          .maybeSingle();

        if (booking) {
          const { data: existing } = await supabase
            .from("commission_records")
            .select("id")
            .eq("booking_id", bookingId)
            .maybeSingle();

          if (!existing) {
            const { data: platformSettings } = await supabase
              .from("platform_settings")
              .select("agency_commission_percentage")
              .maybeSingle();

            const commissionRate = (platformSettings?.agency_commission_percentage || 15) / 100;
            const depositAmount = Number(booking.deposit_amount || 0);
            const platformAmount = depositAmount * commissionRate;
            const agencyAmount = depositAmount - platformAmount;

            await supabase.from("commission_records").insert({
              booking_id: bookingId,
              agency_id: booking.agency_id,
              agency_amount: agencyAmount,
              platform_amount: platformAmount,
              status: "pending",
            });
          }
        }

        try {
          await fetch(
            `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-booking-confirmation`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
              },
              body: JSON.stringify({ booking_id: bookingId }),
            }
          );
          console.log("Booking confirmation emails triggered for:", bookingId);
        } catch (emailErr) {
          console.error("Error sending booking confirmation email:", emailErr);
        }

        try {
          const { data: cfdiSettings } = await supabase
            .from("platform_settings")
            .select("pac_provider")
            .maybeSingle();
          if (cfdiSettings?.pac_provider && cfdiSettings.pac_provider !== "none") {
            await fetch(
              `${Deno.env.get("SUPABASE_URL")}/functions/v1/generate-booking-cfdi`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
                },
                body: JSON.stringify({ booking_id: bookingId }),
              }
            );
          }
        } catch (cfdiErr) {
          console.error("Error triggering booking CFDI (mp-brick):", cfdiErr);
        }
      }
    } else if (bookingId && (payment.status === "in_process" || payment.status === "pending")) {
      await supabase
        .from("bookings")
        .update({ payment_status: "processing" })
        .eq("id", bookingId);
    }

    return new Response(
      JSON.stringify({
        success: true,
        status: payment.status,
        status_detail: payment.status_detail,
        payment_id: payment.id,
        external_reference: payment.external_reference,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Error in process-mercadopago-brick-payment:", err);
    return new Response(JSON.stringify({ error: err.message || "Error interno" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
