import React, { useState, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Eye, EyeOff, ShieldAlert } from 'lucide-react';
import { signIn, supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

function computeDeviceFingerprint(): string {
  try {
    const raw = [
      navigator.userAgent,
      navigator.language,
      Intl.DateTimeFormat().resolvedOptions().timeZone,
      screen.width + 'x' + screen.height,
      navigator.platform,
    ].join('|');
    let hash = 5381;
    for (let i = 0; i < raw.length; i++) {
      hash = ((hash << 5) + hash) ^ raw.charCodeAt(i);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  } catch {
    return 'unknown';
  }
}

async function checkLoginRisk(email: string, deviceFingerprint: string) {
  try {
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/check-login-risk`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, device_fingerprint: deviceFingerprint }),
        signal: AbortSignal.timeout(4000),
      }
    );
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null; // never block on risk-check failure
  }
}

const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isAzureLoading, setIsAzureLoading] = useState(false);
  const [ipBlocked, setIpBlocked] = useState(false);
  const deviceFingerprintRef = useRef<string>(computeDeviceFingerprint());
  const navigate = useNavigate();
  const location = useLocation();
  const { signInWithGoogle, signInWithAzure } = useAuth();

  const searchParams = new URLSearchParams(location.search);
  const redirectUrl = searchParams.get('redirect');
  const isBlocked = searchParams.get('blocked') === 'true';
  const from = location.state?.from?.pathname || '/';

  const [error, setError] = useState(
    isBlocked
      ? 'Su cuenta ha sido bloqueada. Para mayor información contáctenos.'
      : ''
  );

  const recordFailedLogin = (failureReason: string) => {
    try {
      fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/record-session-event`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event_type: 'failed_login',
            email,
            device_fingerprint: deviceFingerprintRef.current,
            user_agent: navigator.userAgent,
            failure_reason: failureReason,
          }),
        }
      );
    } catch {
      // best-effort
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      setIsLoading(true);
      setError('');
      setIpBlocked(false);

      // Pre-login risk check
      const risk = await checkLoginRisk(email, deviceFingerprintRef.current);

      if (risk?.ip_blocked) {
        setIpBlocked(true);
        setError('Demasiados intentos fallidos desde tu red. Por favor intenta más tarde.');
        return;
      }

      // Progressive delay if risk engine requests it
      if (risk?.delay_ms && risk.delay_ms > 0) {
        await new Promise(resolve => setTimeout(resolve, Math.min(risk.delay_ms, 30000)));
      }

      const { data, error } = await signIn(email, password);

      if (error) {
        throw error;
      }

      if (data.user) {
        const role = data.user.user_metadata?.role;

        if (redirectUrl) {
          navigate(redirectUrl, { replace: true });
        } else if (role === 'admin') {
          navigate('/admin/dashboard');
        } else if (role === 'agency') {
          navigate('/agency/dashboard');
        } else if (role === 'traveler') {
          navigate('/traveler/dashboard');
        } else {
          navigate(from, { replace: true });
        }
      }
    } catch (err: any) {
      if (err.message === 'USUARIO_BLOQUEADO') {
        setError('Su cuenta ha sido bloqueada. Para mayor información contáctenos.');
      } else {
        // Generic message — anti-enumeration
        setError('Credenciales incorrectas. Por favor verifica tu correo y contraseña.');
        recordFailedLogin(err.message ?? 'unknown');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    try {
      await signInWithGoogle();
    } catch {
      setError('No se pudo iniciar sesión con Google. Por favor intenta de nuevo.');
      setIsGoogleLoading(false);
    }
  };

  const handleAzureSignIn = async () => {
    setIsAzureLoading(true);
    try {
      await signInWithAzure();
    } catch {
      setError('No se pudo iniciar sesión con Microsoft. Por favor intenta de nuevo.');
      setIsAzureLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 className="mt-6 text-center text-3xl font-bold text-gray-900">
          Inicia sesión en tu cuenta
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          ¿No tienes una cuenta?{' '}
          <Link
            to={redirectUrl ? `/signup?redirect=${encodeURIComponent(redirectUrl)}` : "/signup"}
            className="font-medium text-primary-600 hover:text-primary-500"
          >
            Regístrate aquí
          </Link>
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          <form className="space-y-6" onSubmit={handleSubmit}>
            {error && (
              <div className={`flex items-start gap-2 px-4 py-3 rounded border ${ipBlocked ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-error-50 border-error-200 text-error-700'}`}>
                {ipBlocked && <ShieldAlert className="h-4 w-4 mt-0.5 flex-shrink-0" />}
                <span>{error}</span>
              </div>
            )}
            
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Correo electrónico
              </label>
              <div className="mt-1">
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Contraseña
              </label>
              <div className="mt-1 relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="appearance-none block w-full px-3 py-2 pr-10 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <input
                  id="remember-me"
                  name="remember-me"
                  type="checkbox"
                  className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                />
                <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-900">
                  Recordarme
                </label>
              </div>

              <div className="text-sm">
                <Link to="/forgot-password" className="font-medium text-primary-600 hover:text-primary-500">
                  ¿Olvidaste tu contraseña?
                </Link>
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50"
              >
                {isLoading ? (
                  <div className="w-5 h-5 border-t-2 border-b-2 border-white rounded-full animate-spin"></div>
                ) : (
                  'Iniciar sesión'
                )}
              </button>
            </div>
          </form>

          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">O continúa con</span>
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-3">
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={isGoogleLoading || isAzureLoading}
                className="w-full inline-flex justify-center items-center gap-3 py-2.5 px-4 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 transition-colors"
              >
                {isGoogleLoading ? (
                  <div className="w-5 h-5 border-t-2 border-b-2 border-gray-400 rounded-full animate-spin" />
                ) : (
                  <svg viewBox="0 0 24 24" className="w-5 h-5 flex-shrink-0" aria-hidden="true">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                )}
                Continuar con Google
              </button>

              <button
                type="button"
                onClick={handleAzureSignIn}
                disabled={isAzureLoading || isGoogleLoading}
                className="w-full inline-flex justify-center items-center gap-3 py-2.5 px-4 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 transition-colors"
              >
                {isAzureLoading ? (
                  <div className="w-5 h-5 border-t-2 border-b-2 border-gray-400 rounded-full animate-spin" />
                ) : (
                  <svg viewBox="0 0 23 23" className="w-5 h-5 flex-shrink-0" aria-hidden="true">
                    <path fill="#f3f3f3" d="M0 0h23v23H0z"/>
                    <path fill="#f35325" d="M1 1h10v10H1z"/>
                    <path fill="#81bc06" d="M12 1h10v10H12z"/>
                    <path fill="#05a6f0" d="M1 12h10v10H1z"/>
                    <path fill="#ffba08" d="M12 12h10v10H12z"/>
                  </svg>
                )}
                Continuar con Microsoft
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <Link
                to={redirectUrl ? `/agency-signup?redirect=${encodeURIComponent(redirectUrl)}` : "/agency-signup"}
                className="w-full inline-flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                ¿Eres una agencia?
              </Link>
              <Link
                to={redirectUrl ? `/signup?redirect=${encodeURIComponent(redirectUrl)}` : "/signup"}
                className="w-full inline-flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Registrarse como viajero
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;