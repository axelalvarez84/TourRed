import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

interface CheckoutOptions {
  priceId: string;
  mode: 'payment' | 'subscription';
  successUrl?: string;
  cancelUrl?: string;
}

interface CheckoutResult {
  sessionId?: string;
  url?: string;
  error?: string;
}

export function useStripe() {
  const [isLoading, setIsLoading] = useState(false);
  const { user } = useAuth();

  const createCheckoutSession = async (options: CheckoutOptions): Promise<CheckoutResult> => {
    if (!user) {
      return { error: 'User must be authenticated' };
    }

    try {
    setIsLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        return { error: 'No valid session found' };
      }

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-checkout`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          price_id: options.priceId,
          mode: options.mode,
          success_url: options.successUrl || `${window.location.origin}/success`,
          cancel_url: options.cancelUrl || `${window.location.origin}/cancel`,
        }),
      });

      const result = await response.json();
      
      if (!response.ok) {
        return { error: result.error || 'Failed to create checkout session' };
      }

      return result;
    } catch (error: any) {
      return { error: error.message || 'An unexpected error occurred' };
    } finally {
      setTimeout(() => setIsLoading(false), 500);
    }
  };

  const redirectToCheckout = async (options: CheckoutOptions): Promise<void> => {
    const result = await createCheckoutSession(options);
    
    if (result.error) {
      throw new Error(result.error);
    }

    if (result.url) {
      window.location.href = result.url;
    } else {
      throw new Error('No checkout URL received');
    }
  };

  return {
    createCheckoutSession,
    redirectToCheckout,
    isLoading,
  };
}