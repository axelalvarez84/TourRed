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

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: "2023-10-16",
    });

    const body = await req.text();
    const signature = req.headers.get("stripe-signature");

    let event;

    if (!endpointSecret) {
      console.warn("⚠️ No STRIPE_WEBHOOK_SECRET configured - skipping signature verification");
      event = JSON.parse(body);
    } else if (!signature) {
      console.error("❌ No stripe-signature header found");
      return new Response(
        JSON.stringify({ success: false, error: "No signature header" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );
    } else {
      try {
        console.log("🔍 Verifying webhook signature...");
        event = await stripe.webhooks.constructEventAsync(body, signature, endpointSecret);
        console.log("✅ Webhook signature verified successfully");
      } catch (err) {
        console.error(`❌ Webhook signature verification failed: ${err.message}`);
        console.log("💡 Tip: Make sure STRIPE_WEBHOOK_SECRET matches the secret from your Stripe dashboard");
        return new Response(
          JSON.stringify({
            success: false,
            error: `Webhook Error: ${err.message}`,
            hint: "Check that STRIPE_WEBHOOK_SECRET is correctly configured"
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          }
        );
      }
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    await supabase.from('webhook_logs').insert({
      event_type: event.type,
      event_id: event.id,
      booking_id: event.data.object?.metadata?.booking_id || null,
      payload: event
    });

    const getPaymentMethodType = async (session: any): Promise<string> => {
      try {
        if (session.payment_intent) {
          const paymentIntent = await stripe.paymentIntents.retrieve(session.payment_intent as string);

          if (paymentIntent.payment_method) {
            const paymentMethod = await stripe.paymentMethods.retrieve(paymentIntent.payment_method as string);
            const actualType = paymentMethod.type;

            console.log(`Actual payment method used: ${actualType}`);

            if (actualType === 'oxxo') return 'OXXO';
            if (actualType === 'customer_balance') return 'Transferencia Bancaria';
            if (actualType === 'card') return 'Tarjeta';

            return actualType;
          }
        }

        const paymentMethodType = session.payment_method_types?.[0] || 'unknown';
        console.log(`Fallback to session payment method types: ${paymentMethodType}`);

        if (paymentMethodType === 'oxxo') return 'OXXO';
        if (paymentMethodType === 'customer_balance') return 'Transferencia Bancaria';
        if (paymentMethodType === 'card') return 'Tarjeta';

        return paymentMethodType;
      } catch (error) {
        console.error(`Error retrieving payment method: ${error.message}`);
        return 'unknown';
      }
    };

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;

        const bookingId = session.metadata?.booking_id;
        if (!bookingId) {
          console.error("No booking ID in session metadata");
          break;
        }

        const paymentStatus = session.payment_status;
        const paymentMethod = await getPaymentMethodType(session);
        console.log(`Checkout session completed for booking ${bookingId}, payment status: ${paymentStatus}, method: ${paymentMethod}`);

        if (paymentStatus === 'paid') {
          const { error: bookingError } = await supabase
            .from('bookings')
            .update({
              payment_status: 'succeeded',
              payment_intent_id: session.payment_intent,
              paid_at: new Date().toISOString(),
              status: 'confirmed',
              payment_method: paymentMethod
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
        } else if (paymentStatus === 'unpaid') {
          const { error: bookingError } = await supabase
            .from('bookings')
            .update({
              payment_status: 'processing',
              payment_intent_id: session.payment_intent,
              status: 'pending',
              payment_method: paymentMethod
            })
            .eq('id', bookingId);

          if (bookingError) {
            console.error(`Error updating booking: ${bookingError.message}`);
          } else {
            console.log(`Booking ${bookingId} marked as processing (awaiting OXXO payment)`);
          }
        }

        const { error: transactionError } = await supabase
          .from('payment_transactions')
          .insert({
            booking_id: bookingId,
            stripe_payment_intent_id: session.payment_intent,
            amount: session.amount_total / 100,
            currency: session.currency,
            status: 'succeeded',
            payment_method_type: paymentMethod,
            net_amount: session.amount_total / 100,
            metadata: session
          });

        if (transactionError) {
          console.error(`Error creating transaction record: ${transactionError.message}`);
        }

        const { error: orderError } = await supabase
          .from('stripe_orders')
          .insert({
            checkout_session_id: session.id,
            payment_intent_id: session.payment_intent,
            customer_id: session.customer,
            amount_subtotal: session.amount_subtotal / 100,
            amount_total: session.amount_total / 100,
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
        const bookingId = paymentIntent.metadata?.booking_id;

        console.log(`Payment intent succeeded: ${paymentIntent.id}`);

        let paymentMethodType = 'unknown';
        try {
          if (paymentIntent.payment_method) {
            const paymentMethod = await stripe.paymentMethods.retrieve(paymentIntent.payment_method as string);
            const actualType = paymentMethod.type;

            console.log(`Actual payment method used in payment_intent: ${actualType}`);

            if (actualType === 'oxxo') paymentMethodType = 'OXXO';
            else if (actualType === 'customer_balance') paymentMethodType = 'Transferencia Bancaria';
            else if (actualType === 'card') paymentMethodType = 'Tarjeta';
            else paymentMethodType = actualType;
          } else if (paymentIntent.payment_method_types && paymentIntent.payment_method_types.length > 0) {
            const rawType = paymentIntent.payment_method_types[0];
            if (rawType === 'oxxo') paymentMethodType = 'OXXO';
            else if (rawType === 'customer_balance') paymentMethodType = 'Transferencia Bancaria';
            else if (rawType === 'card') paymentMethodType = 'Tarjeta';
            else paymentMethodType = rawType;
          }
        } catch (error) {
          console.error(`Error retrieving payment method: ${error.message}`);
        }

        if (bookingId) {
          const { error: bookingError } = await supabase
            .from('bookings')
            .update({
              payment_status: 'succeeded',
              payment_intent_id: paymentIntent.id,
              paid_at: new Date().toISOString(),
              status: 'confirmed',
              payment_method: paymentMethodType
            })
            .eq('id', bookingId);

          if (bookingError) {
            console.error(`Error updating booking: ${bookingError.message}`);
          } else {
            console.log(`Successfully confirmed booking ${bookingId} after payment`);

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

          const { data: existingTransaction } = await supabase
            .from('payment_transactions')
            .select('id')
            .eq('stripe_payment_intent_id', paymentIntent.id)
            .maybeSingle();

          if (!existingTransaction) {
            const { error: transactionError } = await supabase
              .from('payment_transactions')
              .insert({
                booking_id: bookingId,
                stripe_payment_intent_id: paymentIntent.id,
                amount: paymentIntent.amount / 100,
                currency: paymentIntent.currency,
                status: 'succeeded',
                payment_method_type: paymentMethodType,
                net_amount: paymentIntent.amount / 100,
                metadata: paymentIntent
              });

            if (transactionError) {
              console.error(`Error creating transaction record: ${transactionError.message}`);
            }
          }
        }

        break;
      }
      
      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object;
        const bookingId = paymentIntent.metadata?.booking_id;
        
        if (bookingId) {
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
      
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        console.log(`Subscription ${event.type}: ${subscription.id}`);

        const userId = subscription.metadata?.user_id;
        const planType = subscription.metadata?.plan_type;

        if (!userId || !planType) {
          console.error('Missing user_id or plan_type in subscription metadata');
          break;
        }

        const currentPeriodEnd = new Date(subscription.current_period_end * 1000);
        const nextResetDate = new Date(currentPeriodEnd);
        nextResetDate.setMonth(nextResetDate.getMonth() + 1);

        const { data: existingMembership } = await supabase
          .from('memberships')
          .select('id')
          .eq('stripe_subscription_id', subscription.id)
          .maybeSingle();

        if (existingMembership) {
          const { error: updateError } = await supabase
            .from('memberships')
            .update({
              status: subscription.status,
              current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
              current_period_end: currentPeriodEnd.toISOString(),
              cancel_at_period_end: subscription.cancel_at_period_end || false,
              cancelled_at: subscription.canceled_at ? new Date(subscription.canceled_at * 1000).toISOString() : null,
            })
            .eq('id', existingMembership.id);

          if (updateError) {
            console.error(`Error updating membership: ${updateError.message}`);
          } else {
            console.log(`Membership updated for user ${userId}`);
          }
        } else {
          const { error: insertError } = await supabase
            .from('memberships')
            .insert({
              user_id: userId,
              stripe_customer_id: subscription.customer,
              stripe_subscription_id: subscription.id,
              plan_type: planType,
              status: subscription.status,
              start_date: new Date(subscription.start_date * 1000).toISOString(),
              current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
              current_period_end: currentPeriodEnd.toISOString(),
              cancel_at_period_end: subscription.cancel_at_period_end || false,
              service_fee_exemption_used: 0,
              service_fee_exemption_reset_date: nextResetDate.toISOString(),
            });

          if (insertError) {
            console.error(`Error creating membership: ${insertError.message}`);
          } else {
            console.log(`Membership created for user ${userId}`);
          }
        }

        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        console.log(`Subscription deleted: ${subscription.id}`);

        const { error: deleteError } = await supabase
          .from('memberships')
          .update({
            status: 'expired',
            cancelled_at: new Date().toISOString(),
          })
          .eq('stripe_subscription_id', subscription.id);

        if (deleteError) {
          console.error(`Error marking membership as expired: ${deleteError.message}`);
        } else {
          console.log(`Membership marked as expired`);
        }

        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;

        if (invoice.subscription) {
          console.log(`Invoice payment succeeded for subscription: ${invoice.subscription}`);

          const { error: updateError } = await supabase
            .from('memberships')
            .update({
              status: 'active',
            })
            .eq('stripe_subscription_id', invoice.subscription);

          if (updateError) {
            console.error(`Error updating membership status: ${updateError.message}`);
          }
        }

        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;

        if (invoice.subscription) {
          console.log(`Invoice payment failed for subscription: ${invoice.subscription}`);

          const { error: updateError } = await supabase
            .from('memberships')
            .update({
              status: 'past_due',
            })
            .eq('stripe_subscription_id', invoice.subscription);

          if (updateError) {
            console.error(`Error updating membership status: ${updateError.message}`);
          }
        }

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