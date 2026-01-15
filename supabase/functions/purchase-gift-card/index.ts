import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "npm:stripe@14.14.0";
import { createClient } from "npm:@supabase/supabase-js@2.39.6";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface PurchaseGiftCardRequest {
  amount: number;
  purchaserEmail: string;
  purchaserName: string;
  recipientEmail?: string;
  recipientName?: string;
  personalMessage?: string;
  scheduledSendDate?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");

    if (!stripeSecretKey) {
      throw new Error("Stripe secret key not configured");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: "2023-10-16",
    });

    const requestData: PurchaseGiftCardRequest = await req.json();
    const { amount, purchaserEmail, purchaserName, recipientEmail, recipientName, personalMessage, scheduledSendDate } = requestData;

    if (!amount || ![100, 200, 500, 1000].includes(amount)) {
      return new Response(
        JSON.stringify({ error: "Invalid amount. Must be 100, 200, 500, or 1000" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!purchaserEmail || !purchaserName) {
      return new Response(
        JSON.stringify({ error: "Purchaser email and name are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const code = await generateGiftCardCode(supabase);
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);

    const { data: giftCard, error: insertError } = await supabase
      .from("gift_cards")
      .insert({
        code,
        amount,
        currency: "MXN",
        status: "active",
        purchaser_email: purchaserEmail,
        purchaser_name: purchaserName,
        recipient_email: recipientEmail || null,
        recipient_name: recipientName || null,
        personal_message: personalMessage || null,
        scheduled_send_date: scheduledSendDate || null,
        expires_at: expiresAt.toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error creating gift card:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to create gift card" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const stripeAmount = Math.round(amount * 100);

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card", "oxxo", "customer_balance"],
      line_items: [
        {
          price_data: {
            currency: "mxn",
            product_data: {
              name: `Tarjeta de Regalo ToursRed - $${amount} MXN`,
              description: recipientEmail
                ? `Regalo para: ${recipientEmail}`
                : "Tarjeta de regalo digital",
            },
            unit_amount: stripeAmount,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${req.headers.get("origin")}/gift-card/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.get("origin")}/gift-cards`,
      customer_email: purchaserEmail,
      metadata: {
        gift_card_id: giftCard.id,
        gift_card_code: code,
        type: "gift_card",
      },
      payment_intent_data: {
        metadata: {
          gift_card_id: giftCard.id,
          gift_card_code: code,
          type: "gift_card",
        },
      },
    });

    await supabase
      .from("gift_cards")
      .update({
        stripe_checkout_session_id: session.id,
      })
      .eq("id", giftCard.id);

    return new Response(
      JSON.stringify({
        sessionId: session.id,
        url: session.url,
        giftCardId: giftCard.id,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in purchase-gift-card function:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

async function generateGiftCardCode(supabase: any): Promise<string> {
  const { data, error } = await supabase.rpc("generate_gift_card_code");

  if (error) {
    console.error("Error generating gift card code:", error);
    throw new Error("Failed to generate unique gift card code");
  }

  return data;
}
