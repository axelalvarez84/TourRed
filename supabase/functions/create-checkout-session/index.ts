import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.6";
import Stripe from "npm:stripe@12.18.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const {
      amount,
      currency = 'mxn',
      description,
      bookingId,
      metadata = {},
      success_url,
      cancel_url,
      addMembership = false,
      membershipPlan = 'monthly',
      toursRedCashUsed = 0,
      pointsUsed = 0
    } = await req.json();

    if (amount == null || !bookingId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing required parameters: amount and bookingId are required"
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        }
      );
    }

    if (amount <= 0) {
      return new Response(
        JSON.stringify({ success: false, error: "El monto a cobrar es cero; no se requiere pago con tarjeta." }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        }
      );
    }

    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeSecretKey) {
      console.error("Stripe secret key is not set");
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Payment configuration is incomplete", 
          details: "stripe_key_missing"
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        }
      );
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: "2023-10-16",
    });

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "No authorization header" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 401,
        }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid token" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 401,
        }
      );
    }

    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select(`
        id,
        tour_id,
        travelers_count,
        tours (
          id,
          max_travelers,
          available_spots
        )
      `)
      .eq("id", bookingId)
      .single();

    if (bookingError || !booking) {
      console.error("Error fetching booking:", bookingError);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Reserva no encontrada"
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 404,
        }
      );
    }

    const { data: existingBookings, error: existingError } = await supabase
      .from("bookings")
      .select("travelers_count, status, approval_status")
      .eq("tour_id", booking.tour_id)
      .in("status", ["confirmed", "pending"])
      .neq("id", bookingId);

    if (existingError) {
      console.error("Error fetching existing bookings:", existingError);
    }

    const totalBooked = existingBookings?.reduce((sum, b) => {
      if (b.status === 'confirmed') return sum + b.travelers_count;
      if (b.status === 'pending' && b.approval_status === 'approved') return sum + b.travelers_count;
      return sum;
    }, 0) || 0;

    const maxCapacity = booking.tours?.available_spots !== null && booking.tours?.available_spots !== undefined
      ? booking.tours.available_spots
      : (booking.tours?.max_travelers || 10);

    const availableSpots = maxCapacity - totalBooked;

    console.log(`🔍 Validando disponibilidad - Tour: ${booking.tour_id}, Solicitados: ${booking.travelers_count}, Disponibles: ${availableSpots}, Total permitido: ${maxCapacity}${booking.tours?.available_spots ? ' [Personalizado]' : ''}`);

    if (booking.travelers_count > availableSpots) {
      console.error(`❌ No hay suficiente disponibilidad - Solicitados: ${booking.travelers_count}, Disponibles: ${availableSpots}`);

      await supabase
        .from("bookings")
        .delete()
        .eq("id", bookingId);

      return new Response(
        JSON.stringify({
          success: false,
          error: `Lo sentimos, solo hay ${availableSpots} lugar${availableSpots !== 1 ? 'es' : ''} disponible${availableSpots !== 1 ? 's' : ''} para este tour. Por favor, intenta con menos viajeros.`,
          available_spots: availableSpots
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        }
      );
    }

    console.log(`✅ Disponibilidad confirmada para la reserva ${bookingId}`);

    let { data: customers, error: customerError } = await supabase
      .from("stripe_customers")
      .select("customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (customerError) {
      console.error("Error fetching customer:", customerError);
    }

    let customerId;
    
    if (!customers) {
      const { data: userProfile } = await supabase
        .from("users")
        .select("first_name, last_name, email")
        .eq("id", user.id)
        .single();

      const customer = await stripe.customers.create({
        email: user.email,
        name: userProfile ? `${userProfile.first_name || ''} ${userProfile.last_name || ''}`.trim() : undefined,
        metadata: {
          user_id: user.id,
        },
      });

      customerId = customer.id;

      const { error: insertError } = await supabase
        .from("stripe_customers")
        .insert({
          user_id: user.id,
          customer_id: customer.id,
        });

      if (insertError) {
        console.error("Error saving customer:", insertError);
      }
    } else {
      customerId = customers.customer_id;
    }

    let sessionConfig: any = {
      customer: customerId,
      payment_method_types: ['card', 'oxxo', 'customer_balance'],
      payment_method_options: {
        customer_balance: {
          funding_type: 'bank_transfer',
          bank_transfer: {
            type: 'mx_bank_transfer',
          },
        },
      },
      success_url: success_url || `${req.headers.get("origin")}/booking-success?booking_id=${bookingId}`,
      cancel_url: cancel_url || `${req.headers.get("origin")}/booking-cancel?booking_id=${bookingId}`,
      metadata: {
        booking_id: bookingId,
        add_membership: addMembership ? 'true' : 'false',
        membership_plan: membershipPlan,
        toursred_cash_used: toursRedCashUsed.toString(),
        points_used: pointsUsed.toString(),
        ...metadata,
      },
    };

    if (addMembership) {
      const { data: settings, error: settingsError } = await supabase
        .from('platform_settings')
        .select('stripe_monthly_price_id, stripe_annual_price_id')
        .maybeSingle();

      if (settingsError || !settings) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Failed to load platform settings"
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 500,
          }
        );
      }

      const monthlyPriceId = settings.stripe_monthly_price_id;
      const annualPriceId = settings.stripe_annual_price_id;

      if (!monthlyPriceId || !annualPriceId) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Membership configuration is incomplete"
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 500,
          }
        );
      }

      const priceId = membershipPlan === 'monthly' ? monthlyPriceId : annualPriceId;

      sessionConfig.mode = "subscription";
      sessionConfig.line_items = [
        {
          price: priceId,
          quantity: 1,
        },
      ];
      sessionConfig.subscription_data = {
        metadata: {
          user_id: user.id,
          booking_id: bookingId,
        },
      };

      const invoiceItem = await stripe.invoiceItems.create({
        customer: customerId,
        amount: Math.round(amount * 100),
        currency: currency,
        description: description || "Reserva de Tour",
      });

      sessionConfig.invoice_creation = {
        enabled: true,
        invoice_data: {
          metadata: {
            booking_id: bookingId,
          },
        },
      };
    } else {
      sessionConfig.mode = "payment";
      sessionConfig.line_items = [
        {
          price_data: {
            currency: currency,
            product_data: {
              name: description || "Reserva de Tour",
            },
            unit_amount: Math.round(amount * 100),
          },
          quantity: 1,
        },
      ];
      sessionConfig.payment_intent_data = {
        metadata: {
          booking_id: bookingId,
          toursred_cash_used: toursRedCashUsed.toString(),
          points_used: pointsUsed.toString(),
          ...metadata,
        },
      };
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);

    return new Response(
      JSON.stringify({
        success: true,
        sessionId: session.id,
        url: session.url,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error creating checkout session:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "An unexpected error occurred",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});