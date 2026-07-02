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
          console.log(`checkout.session.completed: Gift card ${giftCardId} session completed, will be processed by payment_intent.succeeded`);
          break;
        }

        // Handle supplement payment
        const paymentForSupplement = session.metadata?.payment_for === 'supplement';
        const bookingSupplementId = session.metadata?.booking_supplement_id;
        if (paymentForSupplement && bookingSupplementId) {
          const suppPaymentStatus = session.payment_status;
          console.log(`Supplement checkout session completed: ${bookingSupplementId}, status: ${suppPaymentStatus}`);

          if (suppPaymentStatus === 'paid') {
            const { data: suppReq } = await supabase
              .from('booking_supplements')
              .select(`
                id, booking_id, quantity, unit_price, service_charge, supplement_commission,
                membership_exemption_used,
                bookings!inner(user_id)
              `)
              .eq('id', bookingSupplementId)
              .maybeSingle();

            if (!suppReq) {
              console.error(`Supplement ${bookingSupplementId} not found`);
              break;
            }

            const userId = (suppReq.bookings as any).user_id;
            const subtotal = Number(suppReq.unit_price) * suppReq.quantity;
            const serviceChargePct = 5; // same default used when creating the record
            const grossServiceCharge = parseFloat((subtotal * serviceChargePct / 100).toFixed(2));

            // Resolve membership exemption
            const { data: exemptionResult } = await supabase
              .rpc('get_available_service_fee_exemption', { p_user_id: userId });
            const exemptionAvailable = parseFloat(exemptionResult ?? '0');
            const exemptionApplied = Math.min(exemptionAvailable, grossServiceCharge);
            const netServiceCharge = parseFloat((grossServiceCharge - exemptionApplied).toFixed(2));
            const supplementCommissionPct = 10;
            const supplementCommission = parseFloat((subtotal * supplementCommissionPct / 100).toFixed(2));
            const totalToPay = parseFloat((subtotal + netServiceCharge).toFixed(2));

            if (exemptionApplied > 0) {
              const { data: membership } = await supabase
                .from('memberships')
                .select('id, service_fee_exemption_used')
                .eq('user_id', userId)
                .eq('status', 'active')
                .maybeSingle();
              if (membership) {
                await supabase.from('memberships').update({
                  service_fee_exemption_used: (Number(membership.service_fee_exemption_used) || 0) + exemptionApplied,
                }).eq('id', membership.id);
              }
            }

            // Award points if member
            let pointsEarned = 0;
            const { data: activeMembership } = await supabase
              .from('memberships')
              .select('id')
              .eq('user_id', userId)
              .eq('status', 'active')
              .gt('current_period_end', new Date().toISOString())
              .maybeSingle();

            if (activeMembership) {
              pointsEarned = Math.floor(subtotal);
              if (pointsEarned > 0) {
                const { data: walletId } = await supabase.rpc('get_or_create_points_wallet', { p_user_id: userId });
                if (walletId) {
                  const { data: pWallet } = await supabase
                    .from('toursred_points_wallets')
                    .select('id, balance, total_earned')
                    .eq('id', walletId)
                    .maybeSingle();
                  if (pWallet) {
                    const newBalance = pWallet.balance + pointsEarned;
                    await supabase.from('toursred_points_transactions').insert({
                      wallet_id: walletId,
                      user_id: userId,
                      amount: pointsEarned,
                      balance_after: newBalance,
                      type: 'earned',
                      description: `Puntos por suplemento (Stripe)`,
                      reference_id: bookingSupplementId,
                      reference_type: 'supplement',
                      expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
                    });
                    await supabase.from('toursred_points_wallets').update({
                      balance: newBalance,
                      total_earned: pWallet.total_earned + pointsEarned,
                    }).eq('id', walletId);
                  }
                }
              }
            }

            const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : null;

            await supabase.from('booking_supplements').update({
              status: 'paid',
              payment_method: 'stripe',
              payment_intent_id: paymentIntentId,
              service_charge: netServiceCharge,
              membership_exemption_used: exemptionApplied,
              supplement_commission: supplementCommission,
              total_paid: totalToPay,
              paid_at: new Date().toISOString(),
              points_earned: pointsEarned,
              updated_at: new Date().toISOString(),
            }).eq('id', bookingSupplementId);

            console.log(`✅ Supplement ${bookingSupplementId} marked as paid via Stripe`);

            // Trigger CFDI async
            const { data: cfdiSettings } = await supabase
              .from('platform_settings')
              .select('pac_provider, pac_api_key_encrypted')
              .maybeSingle();
            if (cfdiSettings?.pac_provider && cfdiSettings.pac_provider !== 'none' && cfdiSettings.pac_api_key_encrypted) {
              EdgeRuntime.waitUntil(
                fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/generate-supplement-cfdi`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
                  body: JSON.stringify({ booking_supplement_id: bookingSupplementId }),
                }).catch(() => {})
              );
            }
          }
          break;
        }

        // Handle post-booking extra payment (insurance or optional service)
        const paymentForExtra = session.metadata?.payment_for === 'post_booking_extra';
        if (paymentForExtra) {
          const extraType = session.metadata?.extra_type; // 'insurance' | 'optional_service'
          const extraBookingId = session.metadata?.booking_id;
          const extraBosId = session.metadata?.booking_optional_service_id;
          const extraUserId = session.metadata?.user_id;
          const extraPaymentStatus = session.payment_status;

          console.log(`post_booking_extra checkout completed: type=${extraType}, booking=${extraBookingId}, bos=${extraBosId}, status=${extraPaymentStatus}`);

          if (extraPaymentStatus === 'paid' && extraUserId && extraBookingId) {
            const { data: platformSettings } = await supabase
              .from('platform_settings')
              .select(`
                service_charge_percentage, travel_insurance_price_per_day_per_traveler,
                pac_provider, pac_api_key_encrypted
              `)
              .maybeSingle();

            const serviceChargePct = platformSettings?.service_charge_percentage ?? 5;

            let subtotal = 0;

            if (extraType === 'insurance') {
              // Recalculate insurance cost
              const { data: bk } = await supabase
                .from('bookings')
                .select('travelers_count, count_adultos, count_ninos, count_infantes, count_adultos_mayores, selected_date, tours:tour_id(start_date, end_date)')
                .eq('id', extraBookingId)
                .maybeSingle();

              const pricePerDay = parseFloat(platformSettings?.travel_insurance_price_per_day_per_traveler ?? '79');
              const tourData = (bk?.tours as any);
              const refDate = bk?.selected_date || tourData?.start_date;
              const endDate = tourData?.end_date;
              let tourDays = 1;
              if (refDate && endDate) {
                const start = new Date(refDate);
                const end = new Date(endDate);
                tourDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
              }
              const totalTravelers = Math.max(
                1,
                (bk?.travelers_count || 0) ||
                ((bk?.count_adultos || 0) + (bk?.count_ninos || 0) + (bk?.count_infantes || 0) + (bk?.count_adultos_mayores || 0))
              );
              subtotal = parseFloat((pricePerDay * tourDays * totalTravelers).toFixed(2));

              // Update booking with insurance
              await supabase.from('bookings').update({
                travel_insurance_included: true,
                travel_insurance_cost: subtotal,
                updated_at: new Date().toISOString(),
              }).eq('id', extraBookingId);
              console.log(`✅ Insurance activated for booking ${extraBookingId}, cost=${subtotal}`);

              // Notify traveler + insurance team with complete data
              EdgeRuntime.waitUntil(
                fetch(`${supabaseUrl}/functions/v1/send-extras-purchase-notification`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${supabaseServiceKey}` },
                  body: JSON.stringify({ booking_id: extraBookingId, extra_type: 'insurance' }),
                }).catch(() => {})
              );

            } else if (extraType === 'optional_service' && extraBosId) {
              // Get BOS subtotal
              const { data: bosRec } = await supabase
                .from('booking_optional_services')
                .select('subtotal, unit_price, quantity')
                .eq('id', extraBosId)
                .maybeSingle();
              subtotal = parseFloat((bosRec?.subtotal || Number(bosRec?.unit_price) * (bosRec?.quantity ?? 1)).toString());
              console.log(`✅ Optional service BOS ${extraBosId} confirmed via Stripe, subtotal=${subtotal}`);

              // Notify traveler + agency
              EdgeRuntime.waitUntil(
                fetch(`${supabaseUrl}/functions/v1/send-extras-purchase-notification`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${supabaseServiceKey}` },
                  body: JSON.stringify({ booking_id: extraBookingId, extra_type: 'optional_service', bos_id: extraBosId }),
                }).catch(() => {})
              );
            }

            // Apply membership exemption
            const grossServiceCharge = parseFloat((subtotal * serviceChargePct / 100).toFixed(2));
            const { data: exemptionResult } = await supabase.rpc('get_available_service_fee_exemption', { p_user_id: extraUserId });
            const exemptionAvailable = parseFloat(exemptionResult ?? '0');
            const exemptionApplied = Math.min(exemptionAvailable, grossServiceCharge);

            if (exemptionApplied > 0) {
              const { data: membership } = await supabase
                .from('memberships')
                .select('id, service_fee_exemption_used')
                .eq('user_id', extraUserId)
                .eq('status', 'active')
                .maybeSingle();
              if (membership) {
                await supabase.from('memberships').update({
                  service_fee_exemption_used: (Number(membership.service_fee_exemption_used) || 0) + exemptionApplied,
                }).eq('id', membership.id);
              }
            }

            // Award points if member
            const { data: activeMembership } = await supabase
              .from('memberships')
              .select('id')
              .eq('user_id', extraUserId)
              .eq('status', 'active')
              .gt('current_period_end', new Date().toISOString())
              .maybeSingle();

            if (activeMembership && subtotal > 0) {
              const pointsEarned = Math.floor(subtotal);
              const { data: walletId } = await supabase.rpc('get_or_create_points_wallet', { p_user_id: extraUserId });
              if (walletId) {
                const { data: pWallet } = await supabase
                  .from('toursred_points_wallets')
                  .select('id, balance, total_earned')
                  .eq('id', walletId)
                  .maybeSingle();
                if (pWallet) {
                  const newBalance = pWallet.balance + pointsEarned;
                  await supabase.from('toursred_points_transactions').insert({
                    wallet_id: walletId,
                    user_id: extraUserId,
                    amount: pointsEarned,
                    balance_after: newBalance,
                    type: 'earned',
                    description: `Puntos por extra (Stripe): ${extraType === 'insurance' ? 'Seguro de viaje' : 'Servicio opcional'}`,
                    reference_id: extraBosId || extraBookingId,
                    reference_type: extraType === 'insurance' ? 'insurance_payment' : 'optional_service_payment',
                    expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
                  });
                  await supabase.from('toursred_points_wallets').update({
                    balance: newBalance,
                    total_earned: pWallet.total_earned + pointsEarned,
                  }).eq('id', walletId);
                }
              }
            }

            // Trigger CFDI async
            if (platformSettings?.pac_provider && platformSettings.pac_provider !== 'none') {
              const cfdiFunction = extraType === 'optional_service'
                ? 'generate-optional-service-cfdi'
                : 'generate-post-booking-insurance-cfdi';
              const cfdiBody = extraType === 'optional_service'
                ? { booking_optional_service_id: extraBosId, service_charge: parseFloat((grossServiceCharge - exemptionApplied).toFixed(2)), total_paid: session.amount_total / 100, payment_method: 'stripe' }
                : { booking_id: extraBookingId, service_charge: parseFloat((grossServiceCharge - exemptionApplied).toFixed(2)), total_paid: session.amount_total / 100, payment_method: 'stripe' };

              EdgeRuntime.waitUntil(
                fetch(`${supabaseUrl}/functions/v1/${cfdiFunction}`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${supabaseServiceKey}` },
                  body: JSON.stringify(cfdiBody),
                }).catch(() => {})
              );
            }
          }
          break;
        }

        // Handle featured slot payment
        const featuredSlotId = session.metadata?.featured_slot_id;
        if (featuredSlotId) {
          const slotPaymentStatus = session.payment_status;
          console.log(`checkout.session.completed: featured slot ${featuredSlotId}, status: ${slotPaymentStatus}`);

          if (slotPaymentStatus === 'paid') {
            const totalPaid = (session.amount_total ?? 0) / 100;
            const { error: confirmErr } = await supabase.rpc('confirm_featured_slot_payment', {
              p_slot_id: featuredSlotId,
              p_payment_id: session.payment_intent as string ?? session.id,
              p_payment_provider: 'stripe',
              p_total: totalPaid,
            });

            if (confirmErr) {
              console.error(`Error confirming featured slot: ${confirmErr.message}`);
            } else {
              console.log(`✅ Featured slot ${featuredSlotId} confirmed`);
              EdgeRuntime.waitUntil(
                fetch(`${supabaseUrl}/functions/v1/generate-featured-slot-cfdi`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${supabaseServiceKey}` },
                  body: JSON.stringify({ slot_id: featuredSlotId }),
                }).catch(() => {})
              );
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
          const { data: booking, error: bookingFetchError } = await supabase
            .from('bookings')
            .select('tour_id, travelers_count')
            .eq('id', bookingId)
            .single();

          if (bookingFetchError || !booking) {
            console.error(`Error fetching booking ${bookingId}:`, bookingFetchError);
            break;
          }

          const { data: availability, error: availabilityError } = await supabase
            .rpc('get_tour_availability', { p_tour_id: booking.tour_id });

          if (availabilityError || !availability || availability.length === 0) {
            console.error(`Error checking tour availability:`, availabilityError);
            break;
          }

          if (availability[0].available_spots < booking.travelers_count) {
            console.error(`Insufficient availability for booking ${bookingId}. Available: ${availability[0].available_spots}, Required: ${booking.travelers_count}`);
            console.log(`Tour ${booking.tour_id} has insufficient spots. This booking will NOT be confirmed.`);
            break;
          }

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

            // Apply preventa commission discount (10% on first 10 preventa bookings)
            try {
              const { data: bookingForPreventa } = await supabase
                .from('bookings')
                .select('es_reserva_preventa, commission_amount, tour_id, agency_id')
                .eq('id', bookingId)
                .single();

              if (bookingForPreventa?.es_reserva_preventa) {
                const preventaCount = await supabase.rpc('get_preventa_bookings_count', { p_tour_id: bookingForPreventa.tour_id });
                const confirmedCount = preventaCount.data || 0;

                if (confirmedCount <= 10) {
                  const commissionBase = parseFloat(bookingForPreventa.commission_amount) || 0;
                  const preventaComisionDescuento = Math.round(commissionBase * 0.10 * 100) / 100;
                  const newCommission = Math.round((commissionBase - preventaComisionDescuento) * 100) / 100;

                  const { error: preventaUpdateError } = await supabase
                    .from('bookings')
                    .update({
                      commission_amount: newCommission,
                      preventa_comision_descuento: preventaComisionDescuento,
                    })
                    .eq('id', bookingId);

                  if (preventaUpdateError) {
                    console.error(`Error applying preventa commission discount: ${preventaUpdateError.message}`);
                  } else {
                    console.log(`✅ Preventa commission discount applied: -${preventaComisionDescuento} (new commission: ${newCommission})`);
                  }
                } else {
                  console.log(`Preventa booking count (${confirmedCount}) exceeds 10, no commission discount applied`);
                }
              }
            } catch (preventaErr) {
              console.error('Error processing preventa commission discount:', preventaErr);
            }

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

            // Deduct ToursRed Points if used
            const pointsUsed = parseInt(session.metadata?.points_used || '0');
            if (pointsUsed > 0) {
              try {
                const { data: booking } = await supabase
                  .from('bookings')
                  .select('user_id')
                  .eq('id', bookingId)
                  .single();

                if (booking) {
                  const { error: pointsError } = await supabase.rpc('deduct_points_for_booking', {
                    p_booking_id: bookingId,
                    p_user_id: booking.user_id,
                    p_points_to_deduct: pointsUsed
                  });

                  if (pointsError) {
                    console.error(`Error deducting points: ${pointsError.message}`);
                  } else {
                    console.log(`Successfully deducted ${pointsUsed} points from user points wallet`);
                  }
                }
              } catch (pointsErr) {
                console.error('Error processing points deduction:', pointsErr);
              }
            }

            try {
              const { data: booking } = await supabase
                .from('bookings')
                .select('user_id, total_price, service_charge, service_charge_discount, used_membership_benefit')
                .eq('id', bookingId)
                .single();

              if (booking && !booking.used_membership_benefit) {
                const { data: membership } = await supabase
                  .from('memberships')
                  .select('id, service_fee_exemption_used')
                  .eq('user_id', booking.user_id)
                  .eq('status', 'active')
                  .maybeSingle();

                if (membership) {
                  const { data: settings } = await supabase
                    .from('platform_settings')
                    .select('service_charge_percentage')
                    .maybeSingle();

                  const serviceChargeRate = settings?.service_charge_percentage || 5;
                  const fullServiceCharge = (booking.total_price * serviceChargeRate) / 100;
                  const actualServiceCharge = parseFloat(booking.service_charge || 0);
                  const codeDiscount = parseFloat(booking.service_charge_discount || 0);
                  const exemptionUsed = fullServiceCharge - actualServiceCharge - codeDiscount;

                  if (exemptionUsed > 0) {
                    const { error: membershipError } = await supabase
                      .from('memberships')
                      .update({
                        service_fee_exemption_used: parseFloat(membership.service_fee_exemption_used) + exemptionUsed
                      })
                      .eq('id', membership.id);

                    if (membershipError) {
                      console.error(`Error updating membership exemption: ${membershipError.message}`);
                    } else {
                      console.log(`Updated membership exemption: +${exemptionUsed} MXN (saved from ${fullServiceCharge} MXN)`);
                    }

                    const { error: bookingUpdateError } = await supabase
                      .from('bookings')
                      .update({
                        used_membership_benefit: true,
                        membership_service_fee_saved: exemptionUsed
                      })
                      .eq('id', bookingId);

                    if (bookingUpdateError) {
                      console.error(`Error updating booking membership benefit: ${bookingUpdateError.message}`);
                    } else {
                      console.log(`Marked booking as using membership benefit, saved ${exemptionUsed} MXN`);
                    }
                  }
                }
              } else if (booking?.used_membership_benefit) {
                console.log(`⚠️ Membership benefit already applied for booking ${bookingId}, skipping...`);
              }
            } catch (membershipError) {
              console.error('Error processing membership exemption:', membershipError);
            }

            // Record discount code usage if applicable
            const discountCodeId = session.metadata?.discount_code_id;
            if (discountCodeId) {
              try {
                const { data: bookingForDiscount } = await supabase
                  .from('bookings')
                  .select('user_id')
                  .eq('id', bookingId)
                  .single();

                if (bookingForDiscount) {
                  const { data: existingUsage } = await supabase
                    .from('discount_code_usage')
                    .select('id')
                    .eq('discount_code_id', discountCodeId)
                    .eq('user_id', bookingForDiscount.user_id)
                    .maybeSingle();

                  if (!existingUsage) {
                    await supabase.from('discount_code_usage').insert({
                      discount_code_id: discountCodeId,
                      user_id: bookingForDiscount.user_id,
                      booking_id: bookingId,
                    });
                    console.log(`Discount code ${discountCodeId} usage recorded for booking ${bookingId}`);
                  } else {
                    console.log(`Discount code ${discountCodeId} already used by user, skipping`);
                  }
                }
              } catch (discountError) {
                console.error('Error recording discount code usage:', discountError);
              }
            }

            // Record insurance discount code usage if applicable
            try {
              const { data: bookingForInsurance } = await supabase
                .from('bookings')
                .select('user_id, insurance_discount_code_id')
                .eq('id', bookingId)
                .maybeSingle();

              if (bookingForInsurance?.insurance_discount_code_id) {
                const insCodeId = bookingForInsurance.insurance_discount_code_id;
                const { data: existingInsUsage } = await supabase
                  .from('discount_code_usage')
                  .select('id')
                  .eq('discount_code_id', insCodeId)
                  .eq('user_id', bookingForInsurance.user_id)
                  .maybeSingle();

                if (!existingInsUsage) {
                  await supabase.from('discount_code_usage').insert({
                    discount_code_id: insCodeId,
                    user_id: bookingForInsurance.user_id,
                    booking_id: bookingId,
                  });
                  console.log(`Insurance discount code ${insCodeId} usage recorded for booking ${bookingId}`);
                }
              }
            } catch (insDiscountError) {
              console.error('Error recording insurance discount code usage:', insDiscountError);
            }

            try {
              // Check if confirmation email was already sent to prevent duplicates
              const { data: bookingCheck } = await supabase
                .from('bookings')
                .select('confirmation_email_sent')
                .eq('id', bookingId)
                .single();

              if (bookingCheck?.confirmation_email_sent) {
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

            EdgeRuntime.waitUntil(
              (async () => {
                try {
                  const { data: cfdiSettings } = await supabase
                    .from('platform_settings')
                    .select('pac_provider')
                    .maybeSingle();
                  if (cfdiSettings?.pac_provider && cfdiSettings.pac_provider !== 'none') {
                    await fetch(`${supabaseUrl}/functions/v1/generate-booking-cfdi`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseServiceKey}` },
                      body: JSON.stringify({ booking_id: bookingId }),
                    });
                  }
                } catch (cfdiErr) {
                  console.error('Error triggering booking CFDI:', cfdiErr);
                }

                // Sync booking to accounting system (fire and forget)
                fetch(`${supabaseUrl}/functions/v1/sync-booking-to-accounting`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseServiceKey}` },
                  body: JSON.stringify({ booking_id: bookingId }),
                }).catch((err) => console.error('Error triggering booking accounting sync:', err));

                // Create payment plan if selected_payment_mode === 'plan'
                try {
                  const { data: bkForPlan } = await supabase
                    .from('bookings')
                    .select(`
                      id, selected_payment_mode, total_price, deposit_amount,
                      tours:tour_id(payment_option, payment_plan_mode, installment_definitions, start_date, full_payment_days_before_departure)
                    `)
                    .eq('id', bookingId)
                    .maybeSingle();

                  if (bkForPlan?.selected_payment_mode === 'plan') {
                    const tour = bkForPlan.tours as any;
                    const totalPrice = parseFloat(bkForPlan.total_price) || 0;
                    const depositPaid = parseFloat(bkForPlan.deposit_amount) || 0;
                    const defs: any[] = tour?.installment_definitions || [];

                    if (defs.length > 0) {
                      const { data: existingPlan } = await supabase
                        .from('booking_payment_plans')
                        .select('id')
                        .eq('booking_id', bookingId)
                        .maybeSingle();

                      if (!existingPlan) {
                        const { data: plan, error: planErr } = await supabase
                          .from('booking_payment_plans')
                          .insert({
                            booking_id: bookingId,
                            mode: 'installments',
                            total_plan_amount: totalPrice,
                            total_amount_paid: depositPaid,
                            status: 'active',
                            paid_100_pct_at_booking: false,
                          })
                          .select('id')
                          .single();

                        if (planErr || !plan) {
                          console.error('Error creating payment plan:', planErr);
                        } else {
                          const bookingDate = new Date();
                          const departureDate = tour?.start_date ? new Date(tour.start_date) : null;
                          const daysBeforeDeparture = tour?.full_payment_days_before_departure || 15;

                          const installments = defs.map((def: any, idx: number) => {
                            const amount = Math.round(totalPrice * (def.pct_of_total / 100) * 100) / 100;
                            let dueDate: Date;
                            if (def.specific_date) {
                              dueDate = new Date(def.specific_date + 'T12:00:00');
                            } else if (def.days_before_departure !== undefined && departureDate) {
                              dueDate = new Date(departureDate);
                              dueDate.setDate(dueDate.getDate() - def.days_before_departure);
                            } else {
                              dueDate = new Date(bookingDate);
                              dueDate.setDate(dueDate.getDate() + (def.days_after_booking || 0));
                            }

                            const isFirstInstallment = idx === 0;
                            const amountPaidForThisInstallment = isFirstInstallment ? Math.min(depositPaid, amount) : 0;
                            const isPaid = isFirstInstallment && amountPaidForThisInstallment >= amount;

                            return {
                              plan_id: plan.id,
                              booking_id: bookingId,
                              installment_number: idx + 1,
                              label: def.label || `Pago ${idx + 1}`,
                              amount_due: amount,
                              amount_paid: amountPaidForThisInstallment,
                              due_date: dueDate.toISOString().split('T')[0],
                              status: isPaid ? 'paid' : 'pending',
                              paid_at: isPaid ? new Date().toISOString() : null,
                            };
                          });

                          const { error: instErr } = await supabase
                            .from('booking_payment_plan_installments')
                            .insert(installments);

                          if (instErr) {
                            console.error('Error creating installments:', instErr);
                          } else {
                            await supabase
                              .from('bookings')
                              .update({
                                has_payment_plan: true,
                                payment_plan_status: 'active',
                                payment_plan_total: totalPrice,
                                payment_plan_paid: depositPaid,
                              })
                              .eq('id', bookingId);
                            console.log(`✅ Payment plan created for booking ${bookingId} with ${installments.length} installments`);
                          }
                        }
                      } else {
                        console.log(`Payment plan already exists for booking ${bookingId}, skipping`);
                      }
                    }
                  }
                } catch (planErr) {
                  console.error('Error creating payment plan for booking:', planErr);
                }
              })()
            );
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
          console.log(`payment_intent.succeeded: Processing gift card payment: ${giftCardId}`);

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
            console.log(`Successfully updated gift card ${giftCardId}`);

            // Poliza contable: venta de gift card
            await supabase.rpc('create_accounting_entry_for_gift_card_sale', { p_gift_card_id: giftCardId });

            const discountCode = paymentIntent.metadata?.discount_code;
            if (discountCode) {
              try {
                const { data: codeData } = await supabase
                  .from('discount_codes')
                  .select('id')
                  .ilike('code', discountCode)
                  .single();

                if (codeData) {
                  const { data: existingUsage } = await supabase
                    .from('discount_code_usage')
                    .select('id')
                    .eq('discount_code_id', codeData.id)
                    .eq('gift_card_id', giftCardId)
                    .maybeSingle();

                  if (existingUsage) {
                    console.log(`Discount code ${discountCode} already recorded for gift card ${giftCardId}, skipping`);
                  } else {
                    const { data: giftCardData } = await supabase
                      .from('gift_cards')
                      .select('purchaser_email')
                      .eq('id', giftCardId)
                      .single();

                    let userId = null;
                    if (giftCardData?.purchaser_email) {
                      const { data: userData } = await supabase
                        .from('users')
                        .select('id')
                        .eq('email', giftCardData.purchaser_email)
                        .maybeSingle();

                      userId = userData?.id || null;
                    }

                    const { error: usageError } = await supabase
                      .from('discount_code_usage')
                      .insert({
                        discount_code_id: codeData.id,
                        user_id: userId,
                        gift_card_id: giftCardId,
                        used_at: new Date().toISOString(),
                      });

                    if (usageError) {
                      console.error(`Error recording discount code usage: ${usageError.message}`);
                    } else {
                      console.log(`Successfully recorded discount code usage: ${discountCode}`);
                    }
                  }
                }
              } catch (discountError) {
                console.error('Error processing discount code:', discountError);
              }
            }

            const { data: checkEmail } = await supabase
              .from('gift_cards')
              .select('email_sent')
              .eq('id', giftCardId)
              .single();

            if (!checkEmail?.email_sent) {
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
                  await supabase
                    .from('gift_cards')
                    .update({ email_sent: true, email_sent_at: new Date().toISOString() })
                    .eq('id', giftCardId);
                } else {
                  console.error('Error sending gift card emails:', emailResult);
                }
              } catch (emailError) {
                console.error('Error calling gift card email function:', emailError);
              }
            } else {
              console.log(`Gift card email already sent for ${giftCardId}, skipping`);
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

            // Deduct ToursRed Points if used (from payment_intent metadata)
            const pointsUsedFromIntent = parseInt(paymentIntent.metadata?.points_used || '0');
            if (pointsUsedFromIntent > 0) {
              try {
                const { data: bookingForPoints } = await supabase
                  .from('bookings')
                  .select('user_id')
                  .eq('id', bookingId)
                  .single();

                if (bookingForPoints) {
                  const { error: pointsError } = await supabase.rpc('deduct_points_for_booking', {
                    p_booking_id: bookingId,
                    p_user_id: bookingForPoints.user_id,
                    p_points_to_deduct: pointsUsedFromIntent
                  });

                  if (pointsError) {
                    console.error(`Error deducting points: ${pointsError.message}`);
                  } else {
                    console.log(`Successfully deducted ${pointsUsedFromIntent} points from payment_intent`);
                  }
                }
              } catch (pointsErr) {
                console.error('Error processing points deduction from payment_intent:', pointsErr);
              }
            }

            try {
              const { data: booking } = await supabase
                .from('bookings')
                .select('user_id, total_price, service_charge, service_charge_discount, used_membership_benefit')
                .eq('id', bookingId)
                .single();

              if (booking && !booking.used_membership_benefit) {
                const { data: membership } = await supabase
                  .from('memberships')
                  .select('id, service_fee_exemption_used')
                  .eq('user_id', booking.user_id)
                  .eq('status', 'active')
                  .maybeSingle();

                if (membership) {
                  const { data: settings } = await supabase
                    .from('platform_settings')
                    .select('service_charge_percentage')
                    .maybeSingle();

                  const serviceChargeRate = settings?.service_charge_percentage || 5;
                  const fullServiceCharge = (booking.total_price * serviceChargeRate) / 100;
                  const actualServiceCharge = parseFloat(booking.service_charge || 0);
                  const codeDiscount = parseFloat(booking.service_charge_discount || 0);
                  const exemptionUsed = fullServiceCharge - actualServiceCharge - codeDiscount;

                  if (exemptionUsed > 0) {
                    const { error: membershipError } = await supabase
                      .from('memberships')
                      .update({
                        service_fee_exemption_used: parseFloat(membership.service_fee_exemption_used) + exemptionUsed
                      })
                      .eq('id', membership.id);

                    if (membershipError) {
                      console.error(`Error updating membership exemption: ${membershipError.message}`);
                    } else {
                      console.log(`Updated membership exemption: +${exemptionUsed} MXN (saved from ${fullServiceCharge} MXN)`);
                    }

                    const { error: bookingUpdateError } = await supabase
                      .from('bookings')
                      .update({
                        used_membership_benefit: true,
                        membership_service_fee_saved: exemptionUsed
                      })
                      .eq('id', bookingId);

                    if (bookingUpdateError) {
                      console.error(`Error updating booking membership benefit: ${bookingUpdateError.message}`);
                    } else {
                      console.log(`Marked booking as using membership benefit, saved ${exemptionUsed} MXN`);
                    }
                  }
                }
              } else if (booking?.used_membership_benefit) {
                console.log(`⚠️ Membership benefit already applied for booking ${bookingId}, skipping...`);
              }
            } catch (membershipError) {
              console.error('Error processing membership exemption:', membershipError);
            }

            // Send confirmation email - check if already sent to prevent duplicates
            try {
              const { data: bookingCheck } = await supabase
                .from('bookings')
                .select('confirmation_email_sent')
                .eq('id', bookingId)
                .single();

              if (bookingCheck?.confirmation_email_sent) {
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
                  console.log('Booking confirmation emails sent successfully from payment_intent.succeeded');
                } else {
                  console.error('Error sending booking confirmation emails:', emailResult);
                }
              }
            } catch (emailError) {
              console.error('Error calling booking confirmation function:', emailError);
            }

            EdgeRuntime.waitUntil(
              (async () => {
                try {
                  const { data: cfdiSettings } = await supabase
                    .from('platform_settings')
                    .select('pac_provider')
                    .maybeSingle();
                  if (cfdiSettings?.pac_provider && cfdiSettings.pac_provider !== 'none') {
                    await fetch(`${supabaseUrl}/functions/v1/generate-booking-cfdi`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseServiceKey}` },
                      body: JSON.stringify({ booking_id: bookingId }),
                    });
                  }
                } catch (cfdiErr) {
                  console.error('Error triggering booking CFDI (payment_intent):', cfdiErr);
                }
              })()
            );
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
          // 'canceled' en Stripe significa que Stripe ya la dio de baja, pero el periodo
          // puede seguir vigente. Se resuelve en 'customer.subscription.deleted'.
          // Aqui lo mantenemos como 'active' para no cancelar prematuramente.
          'canceled': 'active',
          'unpaid': 'expired',
          'paused': 'past_due'
        };

        const mappedStatus = statusMap[subscription.status] || 'past_due';
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

          if (isNewSubscription && subscription.metadata?.discount_code && membershipResult?.id) {
            try {
              const discountCodeValue = subscription.metadata.discount_code;
              console.log(`Recording discount code usage: ${discountCodeValue} for membership ${membershipResult.id}`);
              const { data: applyResult, error: applyError } = await supabase.rpc('apply_discount_code', {
                p_code: discountCodeValue,
                p_user_id: userId,
                p_membership_id: membershipResult.id,
              });
              if (applyError) {
                console.error(`Error applying discount code: ${applyError.message}`);
              } else {
                console.log(`Discount code applied successfully:`, applyResult);
              }
            } catch (discountErr) {
              console.error('Error recording discount code usage:', discountErr);
            }
          }

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

              // El CFDI de alta nueva se genera en invoice.payment_succeeded con billing_reason=subscription_create
              // para incluir el monto real pagado (con descuento si aplica)
            } catch (emailError) {
              console.error('Error sending membership welcome email:', emailError);
            }
          }
        }

        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        const subscriptionId = invoice.subscription;

        if (!subscriptionId) {
          console.log(`invoice.payment_succeeded: sin suscripción, omitiendo`);
          break;
        }

        const isSubscriptionCreate = invoice.billing_reason === 'subscription_create';
        console.log(`invoice.payment_succeeded: ${isSubscriptionCreate ? 'alta nueva' : 'renovación'} suscripción ${subscriptionId}, amount_paid: ${invoice.amount_paid}`);

        EdgeRuntime.waitUntil(
          (async () => {
            try {
              const { data: cfdiSettings } = await supabase
                .from('platform_settings')
                .select('pac_provider')
                .maybeSingle();

              if (!cfdiSettings?.pac_provider || cfdiSettings.pac_provider === 'none') return;

              let { data: membership } = await supabase
                .from('memberships')
                .select('id')
                .eq('stripe_subscription_id', subscriptionId)
                .maybeSingle();

              if (!membership?.id && isSubscriptionCreate) {
                console.log(`Membresía no encontrada aún para subscription ${subscriptionId}, obteniendo datos de Stripe para crear upsert...`);
                try {
                  const subscriptionData = await stripe.subscriptions.retrieve(subscriptionId);
                  const userId = subscriptionData.metadata?.user_id;
                  if (userId) {
                    const statusMap: Record<string, string> = {
                      'incomplete': 'trialing', 'incomplete_expired': 'expired', 'trialing': 'trialing',
                      'active': 'active', 'past_due': 'past_due', 'canceled': 'cancelled',
                      'unpaid': 'expired', 'paused': 'past_due'
                    };
                    const { data: upsertedMembership } = await supabase
                      .from('memberships')
                      .upsert({
                        user_id: userId,
                        stripe_customer_id: subscriptionData.customer as string,
                        stripe_subscription_id: subscriptionData.id,
                        plan_type: subscriptionData.metadata?.plan_type || 'monthly',
                        status: statusMap[subscriptionData.status] || 'active',
                        start_date: new Date((subscriptionData.start_date as number) * 1000).toISOString(),
                        current_period_start: new Date((subscriptionData as any).current_period_start * 1000).toISOString(),
                        current_period_end: new Date((subscriptionData as any).current_period_end * 1000).toISOString(),
                        cancel_at_period_end: subscriptionData.cancel_at_period_end || false,
                        cancelled_at: subscriptionData.canceled_at ? new Date(subscriptionData.canceled_at * 1000).toISOString() : null,
                      }, { onConflict: 'stripe_subscription_id' })
                      .select('id')
                      .single();
                    membership = upsertedMembership;
                    console.log(`Membresía creada desde invoice.payment_succeeded: ${membership?.id}`);
                  }
                } catch (subErr) {
                  console.error('Error obteniendo suscripción de Stripe:', subErr);
                }
              }

              if (!membership?.id) {
                console.error(`No se encontró membresía para subscription ${subscriptionId}`);
                return;
              }

              if (isSubscriptionCreate) {
                // Alta nueva: cancelar el CFDI disparado desde subscription.created (sin monto)
                // y generar uno nuevo con el monto real pagado (puede incluir descuento de cupón)
                await supabase
                  .from('cfdi_invoices')
                  .delete()
                  .eq('membership_id', membership.id)
                  .is('stripe_invoice_id', null)
                  .eq('status', 'pending');

                await fetch(`${supabaseUrl}/functions/v1/generate-membership-cfdi`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseServiceKey}` },
                  body: JSON.stringify({
                    membership_id: membership.id,
                    stripe_invoice_id: invoice.id,
                    stripe_amount_paid: invoice.amount_paid,
                  }),
                });
                console.log(`CFDI de alta nueva (con monto real) solicitado para membresía ${membership.id}, invoice ${invoice.id}, amount_paid ${invoice.amount_paid}`);
              } else {
                // Renovación: sin descuento, precio regular
                await fetch(`${supabaseUrl}/functions/v1/generate-membership-cfdi`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseServiceKey}` },
                  body: JSON.stringify({ membership_id: membership.id, stripe_invoice_id: invoice.id }),
                });
                console.log(`CFDI de renovación solicitado para membresía ${membership.id}, invoice ${invoice.id}`);
              }
            } catch (cfdiErr) {
              console.error('Error triggering membership CFDI:', cfdiErr);
            }
          })()
        );

        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;

        console.log(`Subscription deleted: ${subscription.id}`);

        // Verificar si el periodo pagado aun esta vigente.
        // Las membresias no tienen reembolsos: si el periodo no ha terminado,
        // se mantiene activa hasta current_period_end en lugar de cancelarse de inmediato.
        const { data: existingMem } = await supabase
          .from('memberships')
          .select('id, current_period_end, status')
          .eq('stripe_subscription_id', subscription.id)
          .maybeSingle();

        const periodEnd = existingMem?.current_period_end
          ? new Date(existingMem.current_period_end)
          : null;
        const periodStillActive = periodEnd && periodEnd > new Date();

        const updatePayload = periodStillActive
          ? {
              cancel_at_period_end: true,
              cancelled_at: new Date().toISOString(),
              // status se mantiene 'active' hasta que expire el periodo
            }
          : {
              status: 'cancelled',
              cancel_at_period_end: false,
              cancelled_at: new Date().toISOString(),
            };

        const { error: membershipError } = await supabase
          .from('memberships')
          .update(updatePayload)
          .eq('stripe_subscription_id', subscription.id);

        if (membershipError) {
          console.error(`Error cancelling membership: ${membershipError.message}`);
        } else {
          console.log(
            periodStillActive
              ? `Membership ${subscription.id} scheduled for end-of-period cancellation (period ends ${periodEnd?.toISOString()})`
              : `Membership ${subscription.id} cancelled immediately (period already expired)`
          );
        }

        break;
      }

      case 'checkout.session.expired': {
        const session = event.data.object;
        const bookingId = session.metadata?.booking_id;

        if (!bookingId) {
          console.log('No booking ID in expired session');
          break;
        }

        console.log(`Checkout session expired for booking ${bookingId}`);

        const { data: booking } = await supabase
          .from('bookings')
          .select('user_id, points_used, toursred_cash_used, booking_code, membership_purchased, service_charge, total_price')
          .eq('id', bookingId)
          .single();

        if (booking) {
          if (booking.points_used && booking.points_used > 0) {
            await supabase.rpc('refund_points_for_cancelled_booking', {
              p_booking_id: bookingId,
              p_user_id: booking.user_id,
              p_points_to_refund: booking.points_used
            });
            console.log(`Refunded ${booking.points_used} points for expired booking`);
          }

          const toursRedCashUsed = parseFloat(booking.toursred_cash_used || '0');
          if (toursRedCashUsed > 0) {
            await supabase.rpc('update_wallet_balance', {
              p_user_id: booking.user_id,
              p_amount: toursRedCashUsed,
              p_type: 'credit',
              p_description: `Reembolso de reserva expirada #${booking.booking_code}`,
              p_reference_id: bookingId,
              p_reference_type: 'booking_refund'
            });
            console.log(`Refunded ${toursRedCashUsed} MXN ToursRed Cash for expired booking`);
          }
        }

        const expiredUpdate: Record<string, any> = {
          status: 'cancelled',
          payment_status: 'expired',
        };
        if (booking?.membership_purchased) {
          // Revert the optimistic service_charge waiver since payment did not complete
          const { data: settings } = await supabase
            .from('platform_settings')
            .select('service_charge_percentage')
            .maybeSingle();
          const pct = settings?.service_charge_percentage ?? 5;
          expiredUpdate.service_charge = Math.round((booking.total_price || 0) * (pct / 100) * 100) / 100;
          expiredUpdate.membership_purchased = false;
          expiredUpdate.membership_plan = null;
          expiredUpdate.membership_cost = 0;
          console.log(`Reverted optimistic service_charge waiver for expired booking ${bookingId}`);
        }

        const { error: bookingError } = await supabase
          .from('bookings')
          .update(expiredUpdate)
          .eq('id', bookingId);

        if (bookingError) {
          console.error(`Error cancelling expired booking: ${bookingError.message}`);
        } else {
          console.log(`Successfully cancelled expired booking ${bookingId}`);
        }

        break;
      }

      case 'payment_intent.payment_failed':
      case 'payment_intent.canceled': {
        const paymentIntent = event.data.object;
        const bookingId = paymentIntent.metadata?.booking_id;

        if (!bookingId) {
          console.log(`No booking ID in ${event.type}`);
          break;
        }

        console.log(`${event.type} for booking ${bookingId}`);

        const { data: booking } = await supabase
          .from('bookings')
          .select('user_id, points_used, toursred_cash_used, booking_code, membership_purchased, service_charge, total_price')
          .eq('id', bookingId)
          .single();

        if (booking) {
          if (booking.points_used && booking.points_used > 0) {
            await supabase.rpc('refund_points_for_cancelled_booking', {
              p_booking_id: bookingId,
              p_user_id: booking.user_id,
              p_points_to_refund: booking.points_used
            });
            console.log(`Refunded ${booking.points_used} points for failed booking`);
          }

          const toursRedCashUsed = parseFloat(booking.toursred_cash_used || '0');
          if (toursRedCashUsed > 0) {
            await supabase.rpc('update_wallet_balance', {
              p_user_id: booking.user_id,
              p_amount: toursRedCashUsed,
              p_type: 'credit',
              p_description: `Reembolso de reserva fallida #${booking.booking_code}`,
              p_reference_id: bookingId,
              p_reference_type: 'booking_refund'
            });
            console.log(`Refunded ${toursRedCashUsed} MXN ToursRed Cash for failed booking`);
          }
        }

        const failedUpdate: Record<string, any> = {
          status: 'cancelled',
          payment_status: 'failed',
        };
        if (booking?.membership_purchased) {
          const { data: settings } = await supabase
            .from('platform_settings')
            .select('service_charge_percentage')
            .maybeSingle();
          const pct = settings?.service_charge_percentage ?? 5;
          failedUpdate.service_charge = Math.round((booking.total_price || 0) * (pct / 100) * 100) / 100;
          failedUpdate.membership_purchased = false;
          failedUpdate.membership_plan = null;
          failedUpdate.membership_cost = 0;
          console.log(`Reverted optimistic service_charge waiver for failed booking ${bookingId}`);
        }

        const { error: bookingError } = await supabase
          .from('bookings')
          .update(failedUpdate)
          .eq('id', bookingId);

        if (bookingError) {
          console.error(`Error cancelling failed booking: ${bookingError.message}`);
        } else {
          console.log(`Successfully cancelled failed booking ${bookingId}`);
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