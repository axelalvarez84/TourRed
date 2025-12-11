import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.6";
import Stripe from "npm:stripe@12.18.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }
  try {
    // Get the Stripe secret key and webhook secret from environment variables
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    const endpointSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    
    if (!stripeSecretKey) {
      console.error("Stripe secret key is not set");
      return new Response(
        JSON.stringify({ success: false, error: "Stripe configuration is incomplete" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );
    }

    // Initialize Stripe
    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: "2023-10-16",
    });

    // Get the signature from the headers
    const signature = req.headers.get("stripe-signature");
    if (!signature) {
      return new Response(
        JSON.stringify({ success: false, error: "No signature header" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );
    }

    // Get the raw body
    const body = await req.text();
    
    // Verify the webhook signature
    let event;
    try {
      if (endpointSecret) {
        event = stripe.webhooks.constructEvent(body, signature, endpointSecret);
      } else {
        // If no webhook secret is set, just parse the event (less secure, but works for testing)
        event = JSON.parse(body);
        console.warn("No webhook secret set - webhook signature not verified");
      }
    } catch (err) {
      console.error(`Webhook signature verification failed: ${err.message}`);
      return new Response(
        JSON.stringify({ success: false, error: `Webhook Error: ${err.message}` }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Handle the event
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        
        // Get the booking ID from the metadata
        const bookingId = session.metadata?.booking_id;
        if (!bookingId) {
          console.error("No booking ID in session metadata");
          break;
        }

        // Update the booking status
        const { error: bookingError } = await supabase
          .from('bookings')
          .update({
            payment_status: 'succeeded',
            payment_intent_id: session.payment_intent,
            paid_at: new Date().toISOString(),
            status: 'confirmed'
          })
          .eq('id', bookingId);

        if (bookingError) {
          console.error(`Error updating booking: ${bookingError.message}`);
        } else {
          console.log(`Successfully updated booking ${bookingId} to paid status`);

          try {
            const emailResponse = await fetch(`${supabaseUrl}/functions/v1/send-booking-confirmation`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseServiceKey}`,
              },
              body: JSON.stringify({ booking_id: bookingId }),
            });

            const emailResult = await emailResponse.json();

            if (emailResult.success) {
              console.log('Booking confirmation emails sent successfully');
            } else {
              console.error('Error sending booking confirmation emails:', emailResult);
            }
          } catch (emailError) {
            console.error('Error calling booking confirmation function:', emailError);
          }
        }

        // Create a payment transaction record
        const { error: transactionError } = await supabase
          .from('payment_transactions')
          .insert({
            booking_id: bookingId,
            stripe_payment_intent_id: session.payment_intent,
            amount: session.amount_total / 100, // Convert from cents
            currency: session.currency,
            status: 'succeeded',
            payment_method_type: session.payment_method_types?.[0] || 'card',
            net_amount: session.amount_total / 100, // Simplified, should calculate fees
            metadata: session
          });

        if (transactionError) {
          console.error(`Error creating transaction record: ${transactionError.message}`);
        }

        // Create or update Stripe order record
        const { error: orderError } = await supabase
          .from('stripe_orders')
          .insert({
            checkout_session_id: session.id,
            payment_intent_id: session.payment_intent,
            customer_id: session.customer,
            amount_subtotal: session.amount_subtotal / 100, // Convert from cents
            amount_total: session.amount_total / 100, // Convert from cents
            currency: session.currency,
            payment_status: 'succeeded',
            status: 'completed'
          })
          .on_conflict(['checkout_session_id'])
          .merge();

        if (orderError) {
          console.error(`Error creating order record: ${orderError.message}`);
        }

        break;
      }
      
      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object;
        console.log(`Payment intent succeeded: ${paymentIntent.id}`);
        break;
      }
      
      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object;
        const bookingId = paymentIntent.metadata?.booking_id;
        
        if (bookingId) {
          // Update the booking status
          const { error } = await supabase
            .from('bookings')
            .update({
              payment_status: 'failed',
              payment_intent_id: paymentIntent.id
            })
            .eq('id', bookingId);

          if (error) {
            console.error(`Error updating booking: ${error.message}`);
          }
        }
        
        console.log(`Payment failed: ${paymentIntent.id}, ${paymentIntent.last_payment_error?.message || 'Unknown error'}`);
        break;
      }
      
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return new Response(
      JSON.stringify({ received: true }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  } catch (error) {
    console.error(`Webhook error: ${error.message}`);
    return new Response(
      JSON.stringify({ success: false, error: error.message || "An unexpected error occurred" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  }
});