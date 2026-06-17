import React, { useState, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Eye, EyeOff, ShieldAlert } from 'lucide-react';
import { signIn, supabase } from '../../lib/supabase';

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
  const [ipBlocked, setIpBlocked] = useState(false);
  const deviceFingerprintRef = useRef<string>(computeDeviceFingerprint());
  const navigate = useNavigate();
  const location = useLocation();

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

            <div className="mt-6 grid grid-cols-2 gap-3">
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