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
      booking_id,
      type, // 'optional_service' | 'insurance'
      tour_optional_service_id,
      quantity,
      payment_method,
      stripe_payment_intent_id,
      mp_form_data,
      paypal_order_id,
    } = await req.json();

    if (!booking_id || !type || !payment_method) {
      return new Response(JSON.stringify({ error: "booking_id, type y payment_method son requeridos" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (type === "optional_service" && (!tour_optional_service_id || !quantity || quantity < 1)) {
      return new Response(JSON.stringify({ error: "tour_optional_service_id y quantity son requeridos para servicios opcionales" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load booking and verify ownership
    const { data: booking } = await supabase
      .from("bookings")
      .select(`
        id, user_id, tour_id, agency_id, status, travelers_count,
        count_adultos, count_ninos, count_infantes, count_adultos_mayores,
        travel_insurance_included, travel_insurance_cost,
        selected_date,
        tours:tour_id(id, start_date, end_date)
      `)
      .eq("id", booking_id)
      .maybeSingle();

    if (!booking) {
      return new Response(JSON.stringify({ error: "Reserva no encontrada" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (booking.user_id !== user.id) {
      return new Response(JSON.stringify({ error: "No autorizado" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (["cancelled", "draft"].includes(booking.status)) {
      return new Response(JSON.stringify({ error: "No se pueden agregar extras a esta reserva" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Platform settings
    const { data: platformSettings } = await supabase
      .from("platform_settings")
      .select(`
        service_charge_percentage, agency_commission_percentage,
        travel_insurance_price_per_day_per_traveler,
        mercadopago_access_token, paypal_client_id, paypal_client_secret, paypal_sandbox,
        pac_provider, pac_api_key_encrypted
      `)
      .maybeSingle();

    const serviceChargePct = platformSettings?.service_charge_percentage ?? 5;
    const agencyCommissionPct = platformSettings?.agency_commission_percentage ?? 10;

    // ── OPTIONAL SERVICE ─────────────────────────────────────────────────────
    let bookingOptionalServiceId: string | null = null;
    let itemName = "";
    let subtotal = 0;
    let grossServiceCharge = 0;
    let netServiceCharge = 0;
    let exemptionApplied = 0;
    let totalToPay = 0;
    let agencyCommission = 0;

    if (type === "optional_service") {
      const { data: service } = await supabase
        .from("tour_optional_services")
        .select("id, name, price_per_person, max_capacity, is_active, tour_id")
        .eq("id", tour_optional_service_id)
        .maybeSingle();

      if (!service || !service.is_active) {
        return new Response(JSON.stringify({ error: "Servicio opcional no encontrado o inactivo" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (service.tour_id !== booking.tour_id) {
        return new Response(JSON.stringify({ error: "El servicio no pertenece al tour de esta reserva" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Check capacity
      if (service.max_capacity != null) {
        const { data: usedData } = await supabase
          .from("booking_optional_services")
          .select("quantity")
          .eq("tour_optional_service_id", tour_optional_service_id)
          .eq("is_cancelled", false);
        const used = (usedData || []).reduce((s: number, r: any) => s + Number(r.quantity), 0);
        const available = service.max_capacity - used;
        if (quantity > available) {
          return new Response(JSON.stringify({
            error: `Solo hay ${available} lugar(es) disponibles para este servicio`,
            available_spots: available,
          }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }

      itemName = service.name;
      subtotal = parseFloat((Number(service.price_per_person) * quantity).toFixed(2));
      grossServiceCharge = parseFloat((subtotal * serviceChargePct / 100).toFixed(2));

      const { data: exemptionResult } = await supabase.rpc("get_available_service_fee_exemption", { p_user_id: user.id });
      exemptionApplied = Math.min(parseFloat(exemptionResult ?? "0"), grossServiceCharge);
      netServiceCharge = parseFloat((grossServiceCharge - exemptionApplied).toFixed(2));
      agencyCommission = parseFloat((subtotal * agencyCommissionPct / 100).toFixed(2));
      totalToPay = parseFloat((subtotal + netServiceCharge).toFixed(2));

      // Insert booking_optional_services record
      const { data: bosRecord, error: bosError } = await supabase
        .from("booking_optional_services")
        .insert({
          booking_id,
          tour_optional_service_id,
          quantity,
          unit_price: service.price_per_person,
          subtotal,
        })
        .select("id")
        .single();

      if (bosError || !bosRecord) {
        return new Response(JSON.stringify({ error: "Error al registrar el servicio", detail: bosError?.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      bookingOptionalServiceId = bosRecord.id;

    } else if (type === "insurance") {
      if (booking.travel_insurance_included) {
        return new Response(JSON.stringify({ error: "El seguro ya fue contratado para esta reserva" }), {
          status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const pricePerDayPerTraveler = parseFloat(platformSettings?.travel_insurance_price_per_day_per_traveler ?? "79");
      const tourData = booking.tours as any;

      // Calculate tour days
      const refDate = booking.selected_date || tourData?.start_date;
      const endDate = tourData?.end_date;
      let tourDays = 1;
      if (refDate && endDate) {
        const start = new Date(refDate);
        const end = new Date(endDate);
        const diffMs = end.getTime() - start.getTime();
        tourDays = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1);
      }

      const totalTravelers = Math.max(
        1,
        (booking.travelers_count || 0) ||
        ((booking.count_adultos || 0) + (booking.count_ninos || 0) +
         (booking.count_infantes || 0) + (booking.count_adultos_mayores || 0))
      );

      const insuranceCost = parseFloat((pricePerDayPerTraveler * tourDays * totalTravelers).toFixed(2));
      itemName = "Seguro de asistencia de viaje";
      subtotal = insuranceCost;
      grossServiceCharge = parseFloat((insuranceCost * serviceChargePct / 100).toFixed(2));

      const { data: exemptionResult } = await supabase.rpc("get_available_service_fee_exemption", { p_user_id: user.id });
      exemptionApplied = Math.min(parseFloat(exemptionResult ?? "0"), grossServiceCharge);
      netServiceCharge = parseFloat((grossServiceCharge - exemptionApplied).toFixed(2));
      totalToPay = parseFloat((insuranceCost + netServiceCharge).toFixed(2));
      // insurance commission is 0 (ToursRed keeps full amount)
      agencyCommission = 0;

    } else {
      return new Response(JSON.stringify({ error: "Tipo de extra no válido. Use 'optional_service' o 'insurance'" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── FINALIZE PAYMENT ─────────────────────────────────────────────────────
    const finalizePayment = async (method: string, intentId: string | null) => {
      // Apply membership exemption
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

      // Award points
      let pointsEarned = 0;
      const { data: activeMembership } = await supabase
        .from("memberships")
        .select("id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .gt("current_period_end", new Date().toISOString())
        .maybeSingle();

      if (activeMembership) {
        pointsEarned = Math.floor(subtotal);
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
                description: `Puntos por extra: ${itemName}`,
                reference_id: bookingOptionalServiceId || booking_id,
                reference_type: type === "optional_service" ? "optional_service_payment" : "insurance_payment",
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

      // If optional_service: mark payment on booking_optional_services (no status field, just it's inserted)
      // If insurance: update booking
      if (type === "insurance") {
        await supabase.from("bookings").update({
          travel_insurance_included: true,
          travel_insurance_cost: subtotal,
          updated_at: new Date().toISOString(),
        }).eq("id", booking_id);

        // Notify insurance team
        const tourData = booking.tours as any;
        const refDate = booking.selected_date || tourData?.start_date;
        const endDate = tourData?.end_date;
        let tourDays = 1;
        if (refDate && endDate) {
          const start = new Date(refDate);
          const end = new Date(endDate);
          const diffMs = end.getTime() - start.getTime();
          tourDays = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1);
        }
        const totalTravelers = Math.max(
          1,
          (booking.travelers_count || 0) ||
          ((booking.count_adultos || 0) + (booking.count_ninos || 0) +
           (booking.count_infantes || 0) + (booking.count_adultos_mayores || 0))
        );

        supabase.functions.invoke("send-travel-insurance-notification", {
          body: {
            booking_id,
            total_travelers: totalTravelers,
            tour_days: tourDays,
            insurance_cost: subtotal,
            insurance_discount_amount: 0,
            insurance_effective_cost: subtotal,
          },
        }).catch(() => {});
      }

      // Trigger CFDI generation
      const cfdiFunction = type === "optional_service"
        ? "generate-optional-service-cfdi"
        : "generate-post-booking-insurance-cfdi";

      const cfdiBody = type === "optional_service"
        ? { booking_optional_service_id: bookingOptionalServiceId, service_charge: netServiceCharge, total_paid: totalToPay, payment_method: method }
        : { booking_id, service_charge: netServiceCharge, total_paid: totalToPay, payment_method: method };

      if (platformSettings?.pac_provider && platformSettings.pac_provider !== "none" && platformSettings.pac_api_key_encrypted) {
        fetch(`${supabaseUrl}/functions/v1/${cfdiFunction}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${supabaseServiceKey}` },
          body: JSON.stringify(cfdiBody),
        }).catch(() => {});
      }

      return pointsEarned;
    };

    // ── PAYMENT ROUTING ───────────────────────────────────────────────────────

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
        // Rollback BOS insert if optional_service
        if (bookingOptionalServiceId) {
          await supabase.from("booking_optional_services").delete().eq("id", bookingOptionalServiceId);
        }
        return new Response(JSON.stringify({
          error: `Saldo insuficiente. Tienes $${walletBalance.toFixed(2)} y necesitas $${totalToPay.toFixed(2)}`,
        }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const { error: walletError } = await supabase.rpc("update_wallet_balance", {
        p_user_id: user.id,
        p_amount: -totalToPay,
        p_type: "debit",
        p_description: `${type === "insurance" ? "Seguro de viaje" : `Servicio extra: ${itemName}`} - Reserva ${booking_id.slice(0, 8).toUpperCase()}`,
        p_reference_id: bookingOptionalServiceId || booking_id,
        p_reference_type: type === "optional_service" ? "optional_service_payment" : "insurance_payment",
      });

      if (walletError) {
        if (bookingOptionalServiceId) {
          await supabase.from("booking_optional_services").delete().eq("id", bookingOptionalServiceId);
        }
        return new Response(JSON.stringify({ error: "Error al procesar el pago con ToursRed Cash" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const pointsEarned = await finalizePayment("toursred_cash", null);
      return new Response(JSON.stringify({
        success: true, total_charged: totalToPay, points_earned: pointsEarned,
        booking_optional_service_id: bookingOptionalServiceId,
        message: `Pago completado. Se descontaron $${totalToPay.toFixed(2)} de tu ToursRed Cash.`,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 2. Points
    if (payment_method === "points") {
      const pointsNeeded = Math.ceil(totalToPay * 100);
      const { data: pWallet } = await supabase
        .from("toursred_points_wallets")
        .select("id, balance")
        .eq("user_id", user.id)
        .maybeSingle();

      const pointsBalance = Number(pWallet?.balance ?? 0);
      if (pointsBalance < pointsNeeded) {
        if (bookingOptionalServiceId) {
          await supabase.from("booking_optional_services").delete().eq("id", bookingOptionalServiceId);
        }
        return new Response(JSON.stringify({
          error: `Puntos insuficientes. Tienes ${pointsBalance} puntos y necesitas ${pointsNeeded}`,
        }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const { error: deductError } = await supabase.rpc("deduct_points", {
        p_user_id: user.id,
        p_amount: pointsNeeded,
        p_description: `Pago de extra: ${itemName}`,
        p_reference_id: bookingOptionalServiceId || booking_id,
        p_reference_type: type === "optional_service" ? "optional_service_payment" : "insurance_payment",
      });

      if (deductError) {
        if (bookingOptionalServiceId) {
          await supabase.from("booking_optional_services").delete().eq("id", bookingOptionalServiceId);
        }
        return new Response(JSON.stringify({ error: "Error al procesar el pago con puntos" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await finalizePayment("points", null);
      return new Response(JSON.stringify({
        success: true, points_used: pointsNeeded,
        booking_optional_service_id: bookingOptionalServiceId,
        message: `Pago completado con ${pointsNeeded} puntos ToursRed.`,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 3. Stripe
    if (payment_method === "stripe") {
      const stripeKey = Deno.env.get("STRIPE_SECRET_KEY") || "";
      if (!stripeKey) {
        if (bookingOptionalServiceId) await supabase.from("booking_optional_services").delete().eq("id", bookingOptionalServiceId);
        return new Response(JSON.stringify({ error: "Stripe no configurado" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });
      const origin = req.headers.get("origin") || req.headers.get("referer")?.split("/").slice(0, 3).join("/") || "https://toursred.com";

      const successUrl = type === "insurance"
        ? `${origin}/traveler/bookings?extra_paid=insurance&booking_id=${booking_id}`
        : `${origin}/traveler/bookings?extra_paid=optional_service&bos_id=${bookingOptionalServiceId}`;

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        mode: "payment",
        line_items: [{
          price_data: {
            currency: "mxn",
            product_data: { name: itemName },
            unit_amount: Math.round(totalToPay * 100),
          },
          quantity: 1,
        }],
        metadata: {
          booking_id,
          booking_optional_service_id: bookingOptionalServiceId || "",
          extra_type: type,
          payment_for: "post_booking_extra",
          user_id: user.id,
        },
        success_url: successUrl,
        cancel_url: `${origin}/traveler/bookings`,
      });

      return new Response(JSON.stringify({
        success: true, url: session.url,
        booking_optional_service_id: bookingOptionalServiceId,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 4. MercadoPago
    if (payment_method === "mercadopago") {
      if (!mp_form_data) {
        const pointsEarned = await finalizePayment("mercadopago", null);
        return new Response(JSON.stringify({
          success: true, total_charged: totalToPay, points_earned: pointsEarned,
          booking_optional_service_id: bookingOptionalServiceId,
          message: "Pago con MercadoPago confirmado.",
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const mpAccessToken = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN") || platformSettings?.mercadopago_access_token;
      if (!mpAccessToken) {
        if (bookingOptionalServiceId) await supabase.from("booking_optional_services").delete().eq("id", bookingOptionalServiceId);
        return new Response(JSON.stringify({ error: "MercadoPago no configurado" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const mpPayload = {
        ...mp_form_data,
        transaction_amount: totalToPay,
        metadata: {
          ...(mp_form_data.metadata || {}),
          booking_id,
          booking_optional_service_id: bookingOptionalServiceId || "",
          extra_type: type,
          payment_for: "post_booking_extra",
        },
      };

      const mpResponse = await fetch("https://api.mercadopago.com/v1/payments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${mpAccessToken}`,
          "X-Idempotency-Key": `extra-${bookingOptionalServiceId || booking_id}-${Date.now()}`,
        },
        body: JSON.stringify(mpPayload),
      });

      const mpPayment = await mpResponse.json();
      if (!mpResponse.ok || mpPayment.status !== "approved") {
        if (bookingOptionalServiceId) await supabase.from("booking_optional_services").delete().eq("id", bookingOptionalServiceId);
        return new Response(JSON.stringify({
          error: mpPayment.message || "Error en el pago con MercadoPago",
          status_detail: mpPayment.status_detail,
        }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const pointsEarned = await finalizePayment("mercadopago", String(mpPayment.id));
      return new Response(JSON.stringify({
        success: true, total_charged: totalToPay, points_earned: pointsEarned,
        booking_optional_service_id: bookingOptionalServiceId,
        message: "Pago con MercadoPago completado.",
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 5. PayPal
    if (payment_method === "paypal") {
      if (!paypal_order_id) {
        if (bookingOptionalServiceId) await supabase.from("booking_optional_services").delete().eq("id", bookingOptionalServiceId);
        return new Response(JSON.stringify({ error: "paypal_order_id es requerido para PayPal" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const paypalClientId = platformSettings?.paypal_client_id;
      const paypalClientSecret = platformSettings?.paypal_client_secret;
      const isSandbox = platformSettings?.paypal_sandbox ?? true;
      if (!paypalClientId || !paypalClientSecret) {
        if (bookingOptionalServiceId) await supabase.from("booking_optional_services").delete().eq("id", bookingOptionalServiceId);
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
        if (bookingOptionalServiceId) await supabase.from("booking_optional_services").delete().eq("id", bookingOptionalServiceId);
        return new Response(JSON.stringify({ error: "Error al capturar el pago PayPal" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const transactionId = captureData.purchase_units?.[0]?.payments?.captures?.[0]?.id ?? paypal_order_id;
      const pointsEarned = await finalizePayment("paypal", transactionId);
      return new Response(JSON.stringify({
        success: true, total_charged: totalToPay, points_earned: pointsEarned,
        booking_optional_service_id: bookingOptionalServiceId,
        message: "Pago con PayPal completado.",
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (bookingOptionalServiceId) await supabase.from("booking_optional_services").delete().eq("id", bookingOptionalServiceId);
    return new Response(JSON.stringify({ error: `Método de pago no soportado: ${payment_method}` }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
