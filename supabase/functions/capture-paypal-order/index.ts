import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

async function getPayPalAccessToken(clientId: string, clientSecret: string, isSandbox: boolean): Promise<string> {
  const base = isSandbox
    ? "https://api-m.sandbox.paypal.com"
    : "https://api-m.paypal.com";

  const credentials = btoa(`${clientId}:${clientSecret}`);
  const response = await fetch(`${base}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error("PayPal token error:", errorBody);
    throw new Error("Failed to get PayPal access token");
  }
  const data = await response.json();
  return data.access_token;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { orderId, bookingId, context, giftCardId } = await req.json();

    if (!orderId) {
      return new Response(JSON.stringify({ error: "order_id requerido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let paypalClientId = Deno.env.get("PAYPAL_CLIENT_ID");
    let paypalClientSecret = Deno.env.get("PAYPAL_CLIENT_SECRET");
    let isSandbox = Deno.env.get("PAYPAL_SANDBOX") === "true";

    const { data: settings } = await supabase
      .from("platform_settings")
      .select("paypal_client_id, paypal_client_secret, paypal_sandbox")
      .maybeSingle();

    if (!paypalClientId && settings?.paypal_client_id) paypalClientId = settings.paypal_client_id;
    if (!paypalClientSecret && settings?.paypal_client_secret) paypalClientSecret = settings.paypal_client_secret;
    if (settings?.paypal_sandbox !== undefined && settings?.paypal_sandbox !== null) {
      isSandbox = settings.paypal_sandbox;
    }

    if (!paypalClientId || !paypalClientSecret) {
      console.error("PayPal credentials missing. env:", !!Deno.env.get("PAYPAL_CLIENT_ID"), "settings:", !!settings?.paypal_client_id);
      return new Response(JSON.stringify({ error: "PayPal no configurado" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const base = isSandbox
      ? "https://api-m.sandbox.paypal.com"
      : "https://api-m.paypal.com";

    const accessToken = await getPayPalAccessToken(paypalClientId, paypalClientSecret, isSandbox);

    const captureResponse = await fetch(`${base}/v2/checkout/orders/${orderId}/capture`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!captureResponse.ok) {
      const errorBody = await captureResponse.text();
      console.error("PayPal capture error:", errorBody);
      return new Response(JSON.stringify({ error: "Error al capturar pago de PayPal", details: errorBody }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const captureData = await captureResponse.json();
    const captureStatus = captureData.status;

    console.log("PayPal capture status:", captureStatus, "orderId:", orderId);

    if (captureStatus === "COMPLETED") {
      const referenceId = giftCardId || bookingId || captureData.purchase_units?.[0]?.reference_id;
      const paypalTransactionId = captureData.purchase_units?.[0]?.payments?.captures?.[0]?.id || null;

      if (context === "gift_card" && referenceId) {
        const { error: updateError } = await supabase
          .from("gift_cards")
          .update({
            status: "active",
            payment_status: "paid",
            payment_provider: "paypal",
            paypal_transaction_id: paypalTransactionId,
            updated_at: new Date().toISOString(),
          })
          .eq("id", referenceId);

        if (updateError) {
          console.error("Error updating gift card:", updateError);
        }

        EdgeRuntime.waitUntil(
          fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-gift-card-email`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({ gift_card_id: referenceId }),
          })
        );
      } else if (referenceId) {
        const { error: updateError } = await supabase
          .from("bookings")
          .update({
            payment_status: "succeeded",
            status: "confirmed",
            payment_method: "paypal",
            payment_provider: "paypal",
            paypal_transaction_id: paypalTransactionId,
            paid_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", referenceId);

        if (updateError) {
          console.error("Error updating booking:", updateError);
        }

        EdgeRuntime.waitUntil(
          fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-booking-confirmation`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({ booking_id: referenceId }),
          })
        );
      }

      return new Response(JSON.stringify({ success: true, status: captureStatus }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: false, status: captureStatus }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Error in capture-paypal-order:", err);
    return new Response(JSON.stringify({ error: err.message || "Error interno" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
