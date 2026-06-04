import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@12.18.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No autenticado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "No autenticado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const {
      booking_supplement_id,
      payment_method,
      stripe_payment_intent_id,
      mp_form_data,
      paypal_order_id,
    } = await req.json();

    if (!booking_supplement_id || !payment_method) {
      return new Response(JSON.stringify({ error: "booking_supplement_id y payment_method son requeridos" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load supplement request with full context
    const { data: suppReq } = await supabase
      .from("booking_supplements")
      .select(`
        id, booking_id, status, quantity, unit_price, service_charge,
        membership_exemption_used, supplement_commission, total_paid, expires_at,
        tour_supplements!inner(id, name, tour_id),
        bookings!inner(id, user_id)
      `)
      .eq("id", booking_supplement_id)
      .maybeSingle();

    if (!suppReq) {
      return new Response(JSON.stringify({ error: "Solicitud de suplemento no encontrada" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if ((suppReq.bookings as any).user_id !== user.id) {
      return new Response(JSON.stringify({ error: "No autorizado" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!["pending_payment", "approved"].includes(suppReq.status)) {
      return new Response(JSON.stringify({ error: `Estado inválido para pago: ${suppReq.status}` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check expiry for approved supplements
    if (suppReq.status === "approved" && suppReq.expires_at && new Date(suppReq.expires_at) < new Date()) {
      await supabase.from("booking_supplements").update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancelled_by: "expiry",
        updated_at: new Date().toISOString(),
      }).eq("id", booking_supplement_id);
      return new Response(JSON.stringify({ error: "El tiempo para pagar expiró. Solicita el suplemento de nuevo." }), {
        status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Platform settings
    const { data: platformSettings } = await supabase
      .from("platform_settings")
      .select("service_charge_percentage, supplement_commission_percentage, mercadopago_access_token, paypal_client_id, paypal_client_secret, paypal_sandbox_mode")
      .maybeSingle();

    const serviceChargePct = platformSettings?.service_charge_percentage ?? 5;
    const supplementCommissionPct = platformSettings?.supplement_commission_percentage ?? 10;
    const subtotal = Number(suppReq.unit_price) * suppReq.quantity;
    const grossServiceCharge = parseFloat((subtotal * serviceChargePct / 100).toFixed(2));

    // Membership exemption
    const { data: exemptionResult } = await supabase
      .rpc("get_available_service_fee_exemption", { p_user_id: user.id });
    const exemptionAvailable = parseFloat(exemptionResult ?? "0");
    const exemptionApplied = Math.min(exemptionAvailable, grossServiceCharge);
    const netServiceCharge = parseFloat((grossServiceCharge - exemptionApplied).toFixed(2));
    const supplementCommission = parseFloat((subtotal * supplementCommissionPct / 100).toFixed(2));
    const totalToPay = parseFloat((subtotal + netServiceCharge).toFixed(2));

    const supplementName = (suppReq.tour_supplements as any)?.name ?? "Suplemento";

    // Finalize payment: update membership, award points, mark as paid, trigger CFDI
    const finalizePayment = async (method: string, intentId: string | null) => {
      if (exemptionApplied > 0) {
        const { data: membership } = await supabase
          .from("memberships")
          .select("id, service_fee_exemption_used")
          .eq("user_id", user.id)
          .eq("status", "active")
          .maybeSingle();
        if (membership) {
          await supabase.from("memberships").update({
            service_fee_exemption_used: (Number(membership.service_fee_exemption_used) || 0) + exemptionApplied,
          }).eq("id", membership.id);
        }
      }

      let pointsEarned = 0;
      const { data: activeMembership } = await supabase
        .from("memberships")
        .select("id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .gt("current_period_end", new Date().toISOString())
        .maybeSingle();

      if (activeMembership) {
        pointsEarned = Math.floor(subtotal * 100);
        if (pointsEarned > 0) {
          const { data: walletId } = await supabase.rpc("get_or_create_points_wallet", { p_user_id: user.id });
          if (walletId) {
            const { data: pWallet } = await supabase
              .from("toursred_points_wallets")
              .select("id, balance, total_earned")
              .eq("id", walletId)
              .maybeSingle();
            if (pWallet) {
              const newBalance = pWallet.balance + pointsEarned;
              await supabase.from("toursred_points_transactions").insert({
                wallet_id: walletId,
                user_id: user.id,
                amount: pointsEarned,
                balance_after: newBalance,
                type: "earned",
                description: `Puntos por suplemento: ${supplementName}`,
                reference_id: booking_supplement_id,
                reference_type: "supplement",
                expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
              });
              await supabase.from("toursred_points_wallets").update({
                balance: newBalance,
                total_earned: pWallet.total_earned + pointsEarned,
              }).eq("id", walletId);
            }
          }
        }
      }

      await supabase.from("booking_supplements").update({
        status: "paid",
        payment_method: method,
        payment_intent_id: intentId,
        service_charge: netServiceCharge,
        membership_exemption_used: exemptionApplied,
        supplement_commission: supplementCommission,
        total_paid: totalToPay,
        paid_at: new Date().toISOString(),
        points_earned: pointsEarned,
        updated_at: new Date().toISOString(),
      }).eq("id", booking_supplement_id);

      // Trigger CFDI async
      const { data: cfdiSettings } = await supabase
        .from("platform_settings")
        .select("pac_provider, pac_api_key_encrypted")
        .maybeSingle();
      if (cfdiSettings?.pac_provider && cfdiSettings.pac_provider !== "none" && cfdiSettings.pac_api_key_encrypted) {
        EdgeRuntime.waitUntil(
          fetch(`${supabaseUrl}/functions/v1/generate-supplement-cfdi`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${supabaseServiceKey}` },
            body: JSON.stringify({ booking_supplement_id }),
          }).catch(() => {})
        );
      }

      return pointsEarned;
    };

    // ===================== PAYMENT ROUTING =====================

    // 1. ToursRed Cash
    if (payment_method === "toursred_cash") {
      const { data: wallet } = await supabase
        .from("toursred_cash_wallets")
        .select("id, balance")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .maybeSingle();

      const walletBalance = Number(wallet?.balance ?? 0);
      if (walletBalance < totalToPay) {
        return new Response(JSON.stringify({
          error: `Saldo insuficiente. Tienes $${walletBalance.toFixed(2)} y necesitas $${totalToPay.toFixed(2)}`,
        }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const { error: walletError } = await supabase.rpc("update_wallet_balance", {
        p_user_id: user.id,
        p_amount: -totalToPay,
        p_type: "debit",
        p_description: `Suplemento: ${supplementName} (${suppReq.quantity}x $${Number(suppReq.unit_price).toFixed(2)})`,
        p_reference_id: booking_supplement_id,
        p_reference_type: "supplement_payment",
      });

      if (walletError) {
        return new Response(JSON.stringify({ error: "Error al procesar el pago con ToursRed Cash" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const pointsEarned = await finalizePayment("toursred_cash", null);
      return new Response(JSON.stringify({
        success: true,
        total_charged: totalToPay,
        points_earned: pointsEarned,
        message: `Pago completado. Se descontaron $${totalToPay.toFixed(2)} de tu ToursRed Cash.${pointsEarned > 0 ? ` Ganaste ${pointsEarned} puntos.` : ""}`,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 2. ToursRed Points (1 punto = $0.01 MXN → 100 puntos = $1 MXN)
    if (payment_method === "points") {
      const pointsNeeded = Math.ceil(totalToPay * 100);
      const { data: pWallet } = await supabase
        .from("toursred_points_wallets")
        .select("id, balance")
        .eq("user_id", user.id)
        .maybeSingle();

      const pointsBalance = Number(pWallet?.balance ?? 0);
      if (pointsBalance < pointsNeeded) {
        return new Response(JSON.stringify({
          error: `Puntos insuficientes. Tienes ${pointsBalance} puntos y necesitas ${pointsNeeded}`,
        }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const { error: deductError } = await supabase.rpc("deduct_points", {
        p_user_id: user.id,
        p_amount: pointsNeeded,
        p_description: `Pago de suplemento: ${supplementName}`,
        p_reference_id: booking_supplement_id,
        p_reference_type: "supplement_payment",
      });

      if (deductError) {
        return new Response(JSON.stringify({ error: "Error al procesar el pago con puntos" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await finalizePayment("points", null);
      return new Response(JSON.stringify({
        success: true,
        points_used: pointsNeeded,
        message: `Pago completado con ${pointsNeeded} puntos ToursRed.`,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 3. Stripe — create PaymentIntent or confirm existing
    if (payment_method === "stripe") {
      const stripeKey = Deno.env.get("STRIPE_SECRET_KEY") || "";
      if (!stripeKey) {
        return new Response(JSON.stringify({ error: "Stripe no configurado" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });

      // Confirm existing intent after frontend confirmation
      if (stripe_payment_intent_id) {
        const intent = await stripe.paymentIntents.retrieve(stripe_payment_intent_id);
        if (intent.status !== "succeeded") {
          return new Response(JSON.stringify({ error: `Pago no completado. Estado Stripe: ${intent.status}` }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const pointsEarned = await finalizePayment("stripe", stripe_payment_intent_id);
        return new Response(JSON.stringify({
          success: true, total_charged: totalToPay, points_earned: pointsEarned,
          message: "Pago con tarjeta completado.",
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Create new PaymentIntent
      const intent = await stripe.paymentIntents.create({
        amount: Math.round(totalToPay * 100),
        currency: "mxn",
        metadata: {
          booking_supplement_id,
          payment_for: "supplement",
          user_id: user.id,
        },
      });

      await supabase.from("booking_supplements").update({
        payment_intent_id: intent.id,
        updated_at: new Date().toISOString(),
      }).eq("id", booking_supplement_id);

      return new Response(JSON.stringify({
        success: true,
        requires_action: true,
        client_secret: intent.client_secret,
        payment_intent_id: intent.id,
        total_to_pay: totalToPay,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 4. MercadoPago (Brick)
    if (payment_method === "mercadopago") {
      if (!mp_form_data) {
        return new Response(JSON.stringify({ error: "mp_form_data es requerido para MercadoPago" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const mpAccessToken = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN") || platformSettings?.mercadopago_access_token;
      if (!mpAccessToken) {
        return new Response(JSON.stringify({ error: "MercadoPago no configurado" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const mpPayload = {
        ...mp_form_data,
        transaction_amount: totalToPay,
        metadata: { ...(mp_form_data.metadata || {}), booking_supplement_id, payment_for: "supplement" },
      };

      const mpResponse = await fetch("https://api.mercadopago.com/v1/payments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${mpAccessToken}`,
          "X-Idempotency-Key": `supp-${booking_supplement_id}-${Date.now()}`,
        },
        body: JSON.stringify(mpPayload),
      });

      const mpPayment = await mpResponse.json();
      if (!mpResponse.ok || mpPayment.status !== "approved") {
        return new Response(JSON.stringify({
          error: mpPayment.message || "Error en el pago con MercadoPago",
          status_detail: mpPayment.status_detail,
        }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const pointsEarned = await finalizePayment("mercadopago", String(mpPayment.id));
      return new Response(JSON.stringify({
        success: true, total_charged: totalToPay, points_earned: pointsEarned,
        message: "Pago con MercadoPago completado.",
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 5. PayPal — capture existing order
    if (payment_method === "paypal") {
      if (!paypal_order_id) {
        return new Response(JSON.stringify({ error: "paypal_order_id es requerido para PayPal" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const paypalClientId = platformSettings?.paypal_client_id;
      const paypalClientSecret = platformSettings?.paypal_client_secret;
      const isSandbox = platformSettings?.paypal_sandbox_mode ?? true;
      if (!paypalClientId || !paypalClientSecret) {
        return new Response(JSON.stringify({ error: "PayPal no configurado" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const base = isSandbox ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com";
      const tokenRes = await fetch(`${base}/v1/oauth2/token`, {
        method: "POST",
        headers: { Authorization: `Basic ${btoa(`${paypalClientId}:${paypalClientSecret}`)}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: "grant_type=client_credentials",
      });
      const { access_token } = await tokenRes.json();

      const captureRes = await fetch(`${base}/v2/checkout/orders/${paypal_order_id}/capture`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${access_token}` },
      });
      const captureData = await captureRes.json();

      if (!captureRes.ok || captureData.status !== "COMPLETED") {
        return new Response(JSON.stringify({ error: "Error al capturar el pago PayPal" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const transactionId = captureData.purchase_units?.[0]?.payments?.captures?.[0]?.id ?? paypal_order_id;
      const pointsEarned = await finalizePayment("paypal", transactionId);
      return new Response(JSON.stringify({
        success: true, total_charged: totalToPay, points_earned: pointsEarned,
        message: "Pago con PayPal completado.",
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: `Método de pago no soportado: ${payment_method}` }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
