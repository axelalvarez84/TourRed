import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

async function verifyMercadoPagoSignature(
  req: Request,
  rawBody: string,
  secret: string
): Promise<boolean> {
  const xSignature = req.headers.get("x-signature");
  const xRequestId = req.headers.get("x-request-id");

  if (!xSignature) return false;

  const url = new URL(req.url);
  const dataId = url.searchParams.get("data.id") || url.searchParams.get("id");

  const parts = xSignature.split(",");
  let ts = "";
  let v1 = "";
  for (const part of parts) {
    const [key, value] = part.trim().split("=");
    if (key === "ts") ts = value;
    if (key === "v1") v1 = value;
  }

  if (!ts || !v1) return false;

  const manifest = [
    dataId ? `id:${dataId};` : "",
    xRequestId ? `request-id:${xRequestId};` : "",
    `ts:${ts};`,
  ].join("");

  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(manifest);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", cryptoKey, messageData);
  const hashArray = Array.from(new Uint8Array(signature));
  const computed = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

  return computed === v1;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const rawBody = await req.text();

    const webhookSecret = Deno.env.get("MERCADOPAGO_WEBHOOK_SECRET");
    if (webhookSecret) {
      const isValid = await verifyMercadoPagoSignature(req, rawBody, webhookSecret);
      if (!isValid) {
        console.error("Invalid MercadoPago webhook signature");
        return new Response(JSON.stringify({ error: "Invalid signature" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      console.warn("MERCADOPAGO_WEBHOOK_SECRET not configured, skipping signature validation");
    }

    let body: any = {};
    try {
      body = JSON.parse(rawBody);
    } catch {
      // body may be empty
    }

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
    const idParam = url.searchParams.get("id") || url.searchParams.get("data.id");

    const notificationId = idParam || body?.data?.id;
    const notificationType = topic || body?.type;
    const isLiveMode = body?.live_mode !== false;

    console.log("MercadoPago webhook received:", { notificationType, notificationId, isLiveMode });

    if (!notificationId || notificationType !== "payment") {
      return new Response(JSON.stringify({ received: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!isLiveMode && (notificationId === "123456" || notificationId === 123456)) {
      console.log("Simulated test notification received, skipping payment lookup");
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
      return new Response(JSON.stringify({ received: true }), {
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
              body: JSON.stringify({ giftCardId: externalReference }),
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
