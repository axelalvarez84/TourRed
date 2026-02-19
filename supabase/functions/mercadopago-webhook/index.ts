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

    const mpAccessToken = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");
    if (!mpAccessToken) {
      return new Response(JSON.stringify({ error: "MercadoPago no configurado" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    const topic = url.searchParams.get("topic") || url.searchParams.get("type");
    const id = url.searchParams.get("id") || url.searchParams.get("data.id");

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      // body may be empty for GET-style webhooks
    }

    const notificationId = id || body?.data?.id;
    const notificationType = topic || body?.type;

    console.log("MercadoPago webhook received:", { notificationType, notificationId });

    if (!notificationId || notificationType !== "payment") {
      return new Response(JSON.stringify({ received: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const paymentResponse = await fetch(
      `https://api.mercadopago.com/v1/payments/${notificationId}`,
      {
        headers: { Authorization: `Bearer ${mpAccessToken}` },
      }
    );

    if (!paymentResponse.ok) {
      console.error("Failed to fetch MP payment:", notificationId);
      return new Response(JSON.stringify({ error: "Could not fetch payment" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payment = await paymentResponse.json();
    const externalReference = payment.external_reference;
    const status = payment.status;

    console.log("Payment details:", { externalReference, status });

    if (!externalReference) {
      return new Response(JSON.stringify({ received: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (status === "approved") {
      const { data: booking } = await supabase
        .from("bookings")
        .select("id, user_id, payment_status")
        .eq("id", externalReference)
        .maybeSingle();

      if (booking && booking.payment_status !== "succeeded") {
        await supabase
          .from("bookings")
          .update({
            payment_status: "succeeded",
            status: "confirmed",
            payment_method: "mercadopago",
            payment_provider: "mercadopago",
            paid_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", externalReference);

        try {
          await fetch(
            `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-booking-confirmation`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
              },
              body: JSON.stringify({ booking_id: externalReference }),
            }
          );
        } catch (emailErr) {
          console.error("Error sending confirmation email:", emailErr);
        }
      }

      const { data: giftCard } = await supabase
        .from("gift_cards")
        .select("id, payment_status")
        .eq("id", externalReference)
        .maybeSingle();

      if (giftCard && giftCard.payment_status !== "paid") {
        await supabase
          .from("gift_cards")
          .update({
            payment_status: "paid",
            payment_provider: "mercadopago",
            updated_at: new Date().toISOString(),
          })
          .eq("id", externalReference);

        try {
          await fetch(
            `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-gift-card-email`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
              },
              body: JSON.stringify({ gift_card_id: externalReference }),
            }
          );
        } catch (emailErr) {
          console.error("Error sending gift card email:", emailErr);
        }
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Error in mercadopago-webhook:", err);
    return new Response(JSON.stringify({ error: err.message || "Error interno" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
