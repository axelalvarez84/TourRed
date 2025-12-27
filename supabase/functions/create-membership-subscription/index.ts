import { createClient } from 'npm:@supabase/supabase-js@2.39.6';
import Stripe from 'npm:stripe@14.10.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');

    if (!stripeSecretKey) {
      throw new Error('Stripe is not configured');
    }

    const authHeader = req.headers.get('Authorization')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    const { planType } = await req.json();

    if (!planType || !['monthly', 'annual'].includes(planType)) {
      throw new Error('Invalid plan type');
    }

    const { data: userData, error: userDataError } = await supabase
      .from('users')
      .select('first_name, last_name')
      .eq('id', user.id)
      .single();

    if (userDataError) {
      throw new Error('Failed to fetch user data');
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2023-10-16',
    });

    const { data: settings, error: settingsError } = await supabase
      .from('platform_settings')
      .select('stripe_monthly_price_id, stripe_annual_price_id')
      .maybeSingle();

    if (settingsError || !settings) {
      throw new Error('Failed to load platform settings');
    }

    const priceId = planType === 'monthly'
      ? settings.stripe_monthly_price_id
      : settings.stripe_annual_price_id;

    if (!priceId) {
      throw new Error(`Price ID not configured for ${planType} plan`);
    }

    let customer;
    const { data: existingMembership } = await supabase
      .from('memberships')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (existingMembership?.stripe_customer_id) {
      customer = await stripe.customers.retrieve(existingMembership.stripe_customer_id);
    } else {
      customer = await stripe.customers.create({
        email: user.email,
        name: `${userData.first_name || ''} ${userData.last_name || ''}`.trim() || user.email,
        metadata: {
          supabase_user_id: user.id,
        },
      });
    }

    const session = await stripe.checkout.sessions.create({
      customer: customer.id,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${req.headers.get('origin')}/traveler/membership?success=true`,
      cancel_url: `${req.headers.get('origin')}/traveler/membership?cancelled=true`,
      subscription_data: {
        metadata: {
          user_id: user.id,
          plan_type: planType,
        },
      },
    });

    return new Response(
      JSON.stringify({ url: session.url }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    console.error('Error creating membership subscription:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Failed to create subscription' }),
      {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }
});