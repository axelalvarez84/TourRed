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
        const giftCardId = session.metadata?.gift_card_id;
        const transactionType = session.metadata?.type;

        if (transactionType === 'gift_card' && giftCardId) {
          console.log(`Processing gift card purchase: ${giftCardId}`);

          const paymentStatus = session.payment_status;

          if (paymentStatus === 'paid') {
            const { error: giftCardError } = await supabase
              .from('gift_cards')
              .update({
                stripe_payment_intent_id: session.payment_intent,
                purchased_at: new Date().toISOString(),
              })
              .eq('id', giftCardId);

            if (giftCardError) {
              console.error(`Error updating gift card: ${giftCardError.message}`);
            } else {
              console.log(`Successfully updated gift card ${giftCardId}`);

              try {
                const emailResponse = await fetch(`${supabaseUrl}/functions/v1/send-gift-card-email`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${supabaseServiceKey}`,
                  },
                  body: JSON.stringify({ giftCardId: giftCardId }),
                });

                const emailResult = await emailResponse.json();

                if (emailResult.success) {
                  console.log('Gift card emails sent successfully');
                } else {
                  console.error('Error sending gift card emails:', emailResult);
                }
              } catch (emailError) {
                console.error('Error calling gift card email function:', emailError);
              }
            }
          }

          break;
        }

        if (!bookingId) {
          console.error("No booking ID or gift card ID in session metadata");
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

            // Deduct ToursRed Cash from wallet if used
            const toursRedCashUsed = parseFloat(session.metadata?.toursred_cash_used || '0');
            if (toursRedCashUsed > 0) {
              try {
                const { data: booking } = await supabase
                  .from('bookings')
                  .select('user_id')
                  .eq('id', bookingId)
                  .single();

                if (booking) {
                  // Check if this transaction already exists to prevent duplicate deductions
                  const { data: existingWalletTransaction } = await supabase
                    .from('wallet_transactions')
                    .select('id')
                    .eq('user_id', booking.user_id)
                    .eq('reference_id', bookingId)
                    .eq('reference_type', 'booking')
                    .eq('type', 'debit')
                    .maybeSingle();

                  if (existingWalletTransaction) {
                    console.log(`⚠️ ToursRed Cash already deducted for booking ${bookingId}, skipping...`);
                  } else {
                    const { error: walletError } = await supabase.rpc('update_wallet_balance', {
                      p_user_id: booking.user_id,
                      p_amount: -toursRedCashUsed,
                      p_type: 'debit',
                      p_description: `Aplicado a reserva #${bookingId}`,
                      p_reference_id: bookingId,
                      p_reference_type: 'booking',
                    });

                    if (walletError) {
                      console.error(`Error deducting ToursRed Cash: ${walletError.message}`);
                    } else {
                      console.log(`Successfully deducted ${toursRedCashUsed} MXN from user wallet`);
                    }
                  }
                }
              } catch (walletErr) {
                console.error('Error processing ToursRed Cash deduction:', walletErr);
              }
            }

            try {
              const { data: booking } = await supabase
                .from('bookings')
                .select('user_id, total_price, service_charge')
                .eq('id', bookingId)
                .single();

              if (booking) {
                const { data: membership } = await supabase
                  .from('memberships')
                  .select('id, service_fee_exemption_used')
                  .eq('user_id', booking.user_id)
                  .eq('status', 'active')
                  .maybeSingle();

                if (membership && booking.service_charge === 0) {
                  const { data: settings } = await supabase
                    .from('platform_settings')
                    .select('service_charge_percentage')
                    .maybeSingle();

                  const serviceChargeRate = settings?.service_charge_percentage || 5;
                  const wouldBeServiceCharge = (booking.total_price * serviceChargeRate) / 100;

                  const { error: membershipError } = await supabase
                    .from('memberships')
                    .update({
                      service_fee_exemption_used: parseFloat(membership.service_fee_exemption_used) + wouldBeServiceCharge
                    })
                    .eq('id', membership.id);

                  if (membershipError) {
                    console.error(`Error updating membership exemption: ${membershipError.message}`);
                  } else {
                    console.log(`Updated membership exemption: +${wouldBeServiceCharge} MXN`);
                  }
                }
              }
            } catch (membershipError) {
              console.error('Error processing membership exemption:', membershipError);
            }

            try {
              // Check if confirmation email was already sent to prevent duplicates
              const { data: bookingCheck } = await supabase
                .from('bookings')
                .select('confirmation_email_sent_at')
                .eq('id', bookingId)
                .single();

              if (bookingCheck?.confirmation_email_sent_at) {
                console.log(`⚠️ Confirmation email already sent for booking ${bookingId}, skipping...`);
              } else {
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
        const giftCardId = paymentIntent.metadata?.gift_card_id;
        const transactionType = paymentIntent.metadata?.type;

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

        if (transactionType === 'gift_card' && giftCardId) {
          console.log(`Processing delayed gift card payment completion: ${giftCardId}`);

          const { error: giftCardError } = await supabase
            .from('gift_cards')
            .update({
              stripe_payment_intent_id: paymentIntent.id,
              purchased_at: new Date().toISOString(),
            })
            .eq('id', giftCardId);

          if (giftCardError) {
            console.error(`Error updating gift card: ${giftCardError.message}`);
          } else {
            console.log(`Successfully updated gift card ${giftCardId} after delayed payment`);

            try {
              const emailResponse = await fetch(`${supabaseUrl}/functions/v1/send-gift-card-email`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${supabaseServiceKey}`,
                },
                body: JSON.stringify({ giftCardId: giftCardId }),
              });

              const emailResult = await emailResponse.json();

              if (emailResult.success) {
                console.log('Gift card emails sent successfully after delayed payment');
              } else {
                console.error('Error sending gift card emails:', emailResult);
              }
            } catch (emailError) {
              console.error('Error calling gift card email function:', emailError);
            }
          }

          break;
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
              const { data: booking } = await supabase
                .from('bookings')
                .select('user_id, total_price, service_charge')
                .eq('id', bookingId)
                .single();

              if (booking) {
                const { data: membership } = await supabase
                  .from('memberships')
                  .select('id, service_fee_exemption_used')
                  .eq('user_id', booking.user_id)
                  .eq('status', 'active')
                  .maybeSingle();

                if (membership && booking.service_charge === 0) {
                  const { data: settings } = await supabase
                    .from('platform_settings')
                    .select('service_charge_percentage')
                    .maybeSingle();

                  const serviceChargeRate = settings?.service_charge_percentage || 5;
                  const wouldBeServiceCharge = (booking.total_price * serviceChargeRate) / 100;

                  const { error: membershipError } = await supabase
                    .from('memberships')
                    .update({
                      service_fee_exemption_used: parseFloat(membership.service_fee_exemption_used) + wouldBeServiceCharge
                    })
                    .eq('id', membership.id);

                  if (membershipError) {
                    console.error(`Error updating membership exemption: ${membershipError.message}`);
                  } else {
                    console.log(`Updated membership exemption: +${wouldBeServiceCharge} MXN`);
                  }
                }
              }
            } catch (membershipError) {
              console.error('Error processing membership exemption:', membershipError);
            }

            try {
              // Check if confirmation email was already sent to prevent duplicates
              const { data: bookingCheck } = await supabase
                .from('bookings')
                .select('confirmation_email_sent_at')
                .eq('id', bookingId)
                .single();

              if (bookingCheck?.confirmation_email_sent_at) {
                console.log(`⚠️ Confirmation email already sent for booking ${bookingId}, skipping...`);
              } else {
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

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object;

        console.log(`Subscription ${event.type}: ${subscription.id}, status: ${subscription.status}`);

        const userId = subscription.metadata?.user_id;
        if (!userId) {
          console.error('No user_id in subscription metadata');
          break;
        }

        const statusMap = {
          'incomplete': 'trialing',
          'incomplete_expired': 'expired',
          'trialing': 'trialing',
          'active': 'active',
          'past_due': 'past_due',
          'canceled': 'cancelled',
          'unpaid': 'expired',
          'paused': 'past_due'
        };

        const mappedStatus = statusMap[subscription.status] || 'cancelled';
        const isNewSubscription = event.type === 'customer.subscription.created';

        const { data: existingMembership } = await supabase
          .from('memberships')
          .select('id, status, stripe_subscription_id')
          .eq('stripe_subscription_id', subscription.id)
          .maybeSingle();

        const wasNotActive = !existingMembership || existingMembership.status !== 'active';
        const isNowActive = mappedStatus === 'active';

        const membershipData = {
          user_id: userId,
          stripe_customer_id: subscription.customer,
          stripe_subscription_id: subscription.id,
          plan_type: subscription.metadata?.plan_type || 'monthly',
          status: mappedStatus,
          start_date: new Date(subscription.start_date * 1000).toISOString(),
          current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
          current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
          cancel_at_period_end: subscription.cancel_at_period_end || false,
          cancelled_at: subscription.canceled_at ? new Date(subscription.canceled_at * 1000).toISOString() : null,
        };

        console.log('Upserting membership:', membershipData);

        const { data: membershipResult, error: membershipError } = await supabase
          .from('memberships')
          .upsert(membershipData, {
            onConflict: 'stripe_subscription_id'
          })
          .select()
          .single();

        if (membershipError) {
          console.error(`Error updating membership: ${membershipError.message}`, membershipError);
        } else {
          console.log(`Successfully updated membership for user ${userId}:`, membershipResult);

          if (wasNotActive && isNowActive) {
            try {
              const { data: userData } = await supabase
                .from('users')
                .select('email, first_name')
                .eq('id', userId)
                .maybeSingle();

              if (userData) {
                console.log('📧 Sending membership welcome email (subscription became active)...');
                const welcomeResponse = await fetch(
                  `${supabaseUrl}/functions/v1/send-membership-welcome`,
                  {
                    method: 'POST',
                    headers: {
                      'Authorization': `Bearer ${supabaseServiceKey}`,
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                      email: userData.email,
                      firstName: userData.first_name || 'Viajero',
                      planType: subscription.metadata?.plan_type || 'monthly',
                      startDate: new Date(subscription.current_period_start * 1000).toISOString(),
                      endDate: new Date(subscription.current_period_end * 1000).toISOString(),
                    }),
                  }
                );

                if (welcomeResponse.ok) {
                  console.log('✅ Membership welcome email sent successfully');
                } else {
                  const errorText = await welcomeResponse.text();
                  console.error('Failed to send membership welcome email:', errorText);
                }
              }
            } catch (emailError) {
              console.error('Error sending membership welcome email:', emailError);
            }
          }
        }

        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        
        console.log(`Subscription deleted: ${subscription.id}`);

        const { error: membershipError } = await supabase
          .from('memberships')
          .update({
            status: 'cancelled',
            cancelled_at: new Date().toISOString(),
          })
          .eq('stripe_subscription_id', subscription.id);

        if (membershipError) {
          console.error(`Error cancelling membership: ${membershipError.message}`);
        } else {
          console.log(`Successfully cancelled membership ${subscription.id}`);
        }

        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return new Response(
      JSON.stringify({ success: true, received: true }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Webhook error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Unknown error'
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});