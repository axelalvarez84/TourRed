import React, { useState, useEffect, useCallback } from 'react';
import { Link2, Link2Off, CheckCircle, AlertCircle, Loader } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Identity {
  id: string;
  provider: string;
  identity_data?: Record<string, any>;
  created_at?: string;
}

interface ProviderConfig {
  key: string;
  label: string;
  icon: React.ReactNode;
  description: string;
}

const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5 flex-shrink-0" aria-hidden="true">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
);

const MicrosoftIcon = () => (
  <svg viewBox="0 0 23 23" className="w-5 h-5 flex-shrink-0" aria-hidden="true">
    <path fill="#f3f3f3" d="M0 0h23v23H0z"/>
    <path fill="#f35325" d="M1 1h10v10H1z"/>
    <path fill="#81bc06" d="M12 1h10v10H12z"/>
    <path fill="#05a6f0" d="M1 12h10v10H1z"/>
    <path fill="#ffba08" d="M12 12h10v10H12z"/>
  </svg>
);

const EmailIcon = () => (
  <div className="w-5 h-5 flex-shrink-0 bg-gray-600 rounded-sm flex items-center justify-center">
    <svg viewBox="0 0 20 20" fill="white" className="w-3.5 h-3.5">
      <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
      <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
    </svg>
  </div>
);

const PROVIDERS: ProviderConfig[] = [
  {
    key: 'email',
    label: 'Correo y contraseña',
    icon: <EmailIcon />,
    description: 'Inicia sesión con tu correo y contraseña',
  },
  {
    key: 'google',
    label: 'Google',
    icon: <GoogleIcon />,
    description: 'Inicia sesión con tu cuenta de Google',
  },
  {
    key: 'azure',
    label: 'Microsoft',
    icon: <MicrosoftIcon />,
    description: 'Inicia sesión con tu cuenta de Microsoft',
  },
];

const LinkedAccountsSection: React.FC = () => {
  const [identities, setIdentities] = useState<Identity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadIdentities = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setIdentities(user.identities ?? []);
      }
    } catch {
      setError('Error al cargar las cuentas vinculadas');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadIdentities();
  }, [loadIdentities]);

  const handleLink = async (provider: 'google' | 'azure') => {
    setError('');
    setSuccess('');
    setActionLoading(provider);
    try {
      const redirectTo = `${window.location.origin}/auth/${provider}-callback`;
      const { error: linkError } = await supabase.auth.linkIdentity({
        provider,
        options: {
          redirectTo,
          ...(provider === 'azure' ? { scopes: 'email profile openid' } : {}),
        },
      });
      if (linkError) throw linkError;
    } catch (err: any) {
      setError(err.message || `Error al vincular cuenta de ${provider === 'google' ? 'Google' : 'Microsoft'}`);
      setActionLoading(null);
    }
  };

  const handleUnlink = async (identity: Identity) => {
    if (identities.length <= 1) {
      setError('No puedes desvincular tu único método de inicio de sesión.');
      return;
    }
    setError('');
    setSuccess('');
    setActionLoading(identity.provider);
    try {
      const { error: unlinkError } = await supabase.auth.unlinkIdentity(identity);
      if (unlinkError) throw unlinkError;
      setSuccess(`Cuenta de ${getProviderLabel(identity.provider)} desvinculada correctamente`);
      await loadIdentities();
    } catch (err: any) {
      setError(err.message || 'Error al desvincular la cuenta');
    } finally {
      setActionLoading(null);
    }
  };

  const getProviderLabel = (key: string) => {
    return PROVIDERS.find(p => p.key === key)?.label ?? key;
  };

  const isLinked = (providerKey: string) => {
    if (providerKey === 'email') {
      return identities.some(i => i.provider === 'email');
    }
    return identities.some(i => i.provider === providerKey);
  };

  const getIdentityEmail = (providerKey: string): string | null => {
    const identity = identities.find(i => i.provider === providerKey);
    return identity?.identity_data?.email || null;
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-center py-8">
          <Loader className="h-6 w-6 text-gray-400 animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center mb-6">
        <Link2 className="h-6 w-6 text-gray-700 mr-3" />
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Cuentas vinculadas</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Vincula múltiples métodos de inicio de sesión a tu cuenta
          </p>
        </div>
      </div>

      {success && (
        <div className="mb-4 bg-green-50 border border-green-200 rounded-lg p-3 flex items-start">
          <CheckCircle className="h-5 w-5 text-green-600 mr-2 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-green-800">{success}</p>
        </div>
      )}

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 flex items-start">
          <AlertCircle className="h-5 w-5 text-red-600 mr-2 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      <div className="space-y-3">
        {PROVIDERS.map((provider) => {
          const linked = isLinked(provider.key);
          const linkedEmail = getIdentityEmail(provider.key);
          const isActing = actionLoading === provider.key;
          const identity = identities.find(i => i.provider === provider.key);

          return (
            <div
              key={provider.key}
              className={`flex items-center justify-between p-4 rounded-lg border transition-colors ${
                linked
                  ? 'border-green-200 bg-green-50'
                  : 'border-gray-200 bg-gray-50'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                {provider.icon}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">{provider.label}</p>
                  {linked && linkedEmail ? (
                    <p className="text-xs text-gray-500 truncate">{linkedEmail}</p>
                  ) : (
                    <p className="text-xs text-gray-400">{provider.description}</p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                {linked ? (
                  <>
                    <span className="hidden sm:inline-flex items-center gap-1 text-xs text-green-700 font-medium">
                      <CheckCircle className="h-3.5 w-3.5" />
                      Vinculada
                    </span>
                    {provider.key !== 'email' && (
                      <button
                        onClick={() => identity && handleUnlink(identity)}
                        disabled={isActing || identities.length <= 1}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-md hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        title={identities.length <= 1 ? 'No puedes desvincular tu único método de acceso' : undefined}
                      >
                        {isActing ? (
                          <Loader className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Link2Off className="h-3.5 w-3.5" />
                        )}
                        Desvincular
                      </button>
                    )}
                  </>
                ) : (
                  provider.key !== 'email' && (
                    <button
                      onClick={() => handleLink(provider.key as 'google' | 'azure')}
                      disabled={isActing || actionLoading !== null}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary-600 border border-primary-200 rounded-md hover:bg-primary-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      {isActing ? (
                        <Loader className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Link2 className="h-3.5 w-3.5" />
                      )}
                      Vincular
                    </button>
                  )
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-4 text-xs text-gray-400">
        Al vincular una cuenta adicional podrás iniciar sesión con cualquiera de los métodos vinculados y siempre accederás al mismo perfil.
      </p>
    </div>
  );
};

export default LinkedAccountsSection;
