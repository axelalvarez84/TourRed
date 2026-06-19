import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';

const GoogleCallbackPage: React.FC = () => {
  const navigate = useNavigate();
  const [error, setError] = useState('');

  useEffect(() => {
    // Supabase JS v2 automatically parses the hash fragment (#access_token=...)
    // and fires onAuthStateChange. We just need to wait for it.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session) {
        const user = session.user;
        const isGoogleProvider =
          user.app_metadata?.provider === 'google' ||
          (user.identities ?? []).some((i: any) => i.provider === 'google');

        if (isGoogleProvider) {
          const onboardingCompleted = user.user_metadata?.onboarding_completed;
          if (!onboardingCompleted) {
            // Check if a profile already exists (returning Google user)
            const { data: existingProfile } = await supabase
              .from('users')
              .select('id, role')
              .eq('id', user.id)
              .maybeSingle();

            if (existingProfile) {
              // Existing user — go to their dashboard
              const role = existingProfile.role;
              if (role === 'admin') navigate('/admin/dashboard', { replace: true });
              else if (role === 'agency') navigate('/agency/dashboard', { replace: true });
              else navigate('/traveler/dashboard', { replace: true });
            } else {
              // New Google user — start onboarding
              navigate('/auth/google-onboarding', { replace: true });
            }
          } else {
            // Onboarding already complete — go to dashboard
            const role = user.user_metadata?.role;
            if (role === 'admin') navigate('/admin/dashboard', { replace: true });
            else if (role === 'agency') navigate('/agency/dashboard', { replace: true });
            else navigate('/traveler/dashboard', { replace: true });
          }
        } else {
          navigate('/', { replace: true });
        }
      } else if (event === 'SIGNED_OUT') {
        navigate('/login', { replace: true });
      }
    });

    // Fallback: if no auth event fires in 8s, show error
    const timeout = setTimeout(() => {
      setError('No se pudo completar el inicio de sesión. Por favor intenta de nuevo.');
    }, 8000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, [navigate]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="text-center max-w-sm">
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={() => navigate('/login')}
            className="text-primary-600 underline text-sm"
          >
            Volver al inicio de sesión
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-600 mx-auto mb-4"></div>
        <p className="text-sm text-gray-500">Completando inicio de sesión con Google...</p>
      </div>
    </div>
  );
};

export default GoogleCallbackPage;
