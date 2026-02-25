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

    const { formData, preferenceId } = await req.json();

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
