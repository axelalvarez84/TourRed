import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Crown, Check, X, Zap, Shield, Sparkles, AlertCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

interface Membership {
  id: string;
  plan_type: 'monthly' | 'annual';
  status: string;
  start_date: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  cancelled_at: string | null;
  service_fee_exemption_used: number;
}

export default function TravelerMembership() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [membership, setMembership] = useState<Membership | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.get('success') === 'true') {
      setSuccessMessage('¡Suscripción exitosa! Tu membresía ToursRed+ está siendo activada.');
    }
    fetchMembership();
  }, [searchParams]);

  const fetchMembership = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('memberships')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .maybeSingle();

      if (error) throw error;
      setMembership(data);
    } catch (err) {
      console.error('Error fetching membership:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubscribe = async (planType: 'monthly' | 'annual') => {
    setActionLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-membership-subscription`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
          },
          body: JSON.stringify({ planType }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Error al crear la suscripción');
      }

      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err: any) {
      setError(err.message || 'Error al procesar la suscripción');
    } finally {
      setActionLoading(false);
    }
  };

  const handleManageSubscription = async (action: 'cancel' | 'reactivate') => {
    setActionLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-membership-subscription`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
          },
          body: JSON.stringify({ action }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Error al gestionar la suscripción');
      }

      setSuccessMessage(data.message);
      await fetchMembership();
    } catch (err: any) {
      setError(err.message || 'Error al procesar la solicitud');
    } finally {
      setActionLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-MX', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const remainingExemption = membership
    ? Math.max(0, 500 - (membership.service_fee_exemption_used || 0))
    : 0;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center mb-4">
            <Crown className="h-16 w-16 text-yellow-500" />
          </div>
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            ToursRed<span className="text-yellow-500">+</span>
          </h1>
          <p className="text-xl text-gray-600">
            Viaja más, ahorra más con beneficios exclusivos
          </p>
        </div>

        {successMessage && (
          <div className="max-w-2xl mx-auto mb-8 bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
            <Check className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
            <p className="text-green-800">{successMessage}</p>
          </div>
        )}

        {error && (
          <div className="max-w-2xl mx-auto mb-8 bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-red-800">{error}</p>
          </div>
        )}

        {membership && membership.status === 'active' ? (
          <div className="max-w-3xl mx-auto">
            <div className="bg-gradient-to-br from-yellow-400 via-yellow-500 to-yellow-600 rounded-2xl shadow-2xl p-8 text-white mb-8">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <Crown className="h-10 w-10" />
                  <div>
                    <h2 className="text-2xl font-bold">Membresía Activa</h2>
                    <p className="text-yellow-100">
                      Plan {membership.plan_type === 'monthly' ? 'Mensual' : 'Anual'}
                    </p>
                  </div>
                </div>
                <Sparkles className="h-12 w-12 opacity-50" />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
                  <p className="text-yellow-100 text-sm mb-1">Inicio de membresía</p>
                  <p className="text-xl font-semibold">{formatDate(membership.start_date)}</p>
                </div>
                <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
                  <p className="text-yellow-100 text-sm mb-1">
                    {membership.cancel_at_period_end ? 'Expira el' : 'Próxima renovación'}
                  </p>
                  <p className="text-xl font-semibold">{formatDate(membership.current_period_end)}</p>
                </div>
              </div>

              <div className="mt-6 bg-white/10 backdrop-blur-sm rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-yellow-100 text-sm">Exención de cargo por servicio disponible este mes</p>
                  <p className="text-2xl font-bold">${remainingExemption.toFixed(2)} MXN</p>
                </div>
                <div className="w-full bg-white/20 rounded-full h-2">
                  <div
                    className="bg-white rounded-full h-2 transition-all duration-300"
                    style={{ width: `${(remainingExemption / 500) * 100}%` }}
                  ></div>
                </div>
                <p className="text-yellow-100 text-xs mt-1">
                  De $500 MXN totales ({((remainingExemption / 500) * 100).toFixed(0)}% disponible)
                </p>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-md p-6 mb-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Tus Beneficios Activos</h3>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <Check className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-gray-900">Sin cargo por servicio hasta $500 MXN/mes</p>
                    <p className="text-sm text-gray-600">Ahorra el 5% en tus reservas de tours</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Zap className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-gray-900">Soporte prioritario</p>
                    <p className="text-sm text-gray-600">Atención preferente en todas tus consultas</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Sparkles className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-gray-900">Ofertas exclusivas</p>
                    <p className="text-sm text-gray-600">Acceso a tours y descuentos especiales para miembros</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-md p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Gestionar Suscripción</h3>
              {membership.cancel_at_period_end ? (
                <div>
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                    <p className="text-yellow-800 text-sm">
                      Tu suscripción se cancelará al final del período actual ({formatDate(membership.current_period_end)}).
                      Podrás seguir disfrutando de los beneficios hasta esa fecha.
                    </p>
                  </div>
                  <button
                    onClick={() => handleManageSubscription('reactivate')}
                    disabled={actionLoading}
                    className="w-full bg-green-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {actionLoading ? 'Procesando...' : 'Reactivar Renovación Automática'}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => handleManageSubscription('cancel')}
                  disabled={actionLoading}
                  className="w-full bg-red-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {actionLoading ? 'Procesando...' : 'Cancelar Renovación Automática'}
                </button>
              )}
              <p className="text-xs text-gray-500 text-center mt-2">
                Al cancelar, mantendrás tu membresía hasta el final del período de facturación actual
              </p>
            </div>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            <div className="bg-white rounded-2xl shadow-xl p-8 border-2 border-gray-200 hover:border-blue-500 transition-all duration-300">
              <div className="text-center mb-6">
                <h3 className="text-2xl font-bold text-gray-900 mb-2">Plan Mensual</h3>
                <div className="flex items-baseline justify-center gap-2">
                  <span className="text-5xl font-bold text-blue-600">$49</span>
                  <span className="text-gray-600">MXN/mes</span>
                </div>
              </div>

              <ul className="space-y-4 mb-8">
                <li className="flex items-start gap-3">
                  <Check className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-700">Sin cargo por servicio hasta $500 MXN/mes</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-700">Soporte prioritario</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-700">Ofertas exclusivas</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-700">Cancela cuando quieras</span>
                </li>
              </ul>

              <button
                onClick={() => handleSubscribe('monthly')}
                disabled={actionLoading}
                className="w-full bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {actionLoading ? 'Procesando...' : 'Suscribirme Mensualmente'}
              </button>
            </div>

            <div className="bg-gradient-to-br from-yellow-400 via-yellow-500 to-yellow-600 rounded-2xl shadow-2xl p-8 text-white relative overflow-hidden transform hover:scale-105 transition-transform duration-300">
              <div className="absolute top-4 right-4 bg-red-500 text-white px-4 py-1 rounded-full text-sm font-semibold">
                Ahorra $98
              </div>

              <div className="text-center mb-6">
                <h3 className="text-2xl font-bold mb-2">Plan Anual</h3>
                <div className="flex items-baseline justify-center gap-2">
                  <span className="text-5xl font-bold">$490</span>
                  <span className="text-yellow-100">MXN/año</span>
                </div>
                <p className="text-yellow-100 text-sm mt-2">Solo $40.83 MXN/mes</p>
              </div>

              <ul className="space-y-4 mb-8">
                <li className="flex items-start gap-3">
                  <Check className="h-5 w-5 text-white flex-shrink-0 mt-0.5" />
                  <span>Sin cargo por servicio hasta $500 MXN/mes</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="h-5 w-5 text-white flex-shrink-0 mt-0.5" />
                  <span>Soporte prioritario</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="h-5 w-5 text-white flex-shrink-0 mt-0.5" />
                  <span>Ofertas exclusivas</span>
                </li>
                <li className="flex items-start gap-3">
                  <Crown className="h-5 w-5 text-white flex-shrink-0 mt-0.5" />
                  <span className="font-semibold">2 meses GRATIS ($98 de ahorro)</span>
                </li>
              </ul>

              <button
                onClick={() => handleSubscribe('annual')}
                disabled={actionLoading}
                className="w-full bg-white text-yellow-600 px-6 py-3 rounded-lg font-semibold hover:bg-yellow-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {actionLoading ? 'Procesando...' : 'Suscribirme Anualmente'}
              </button>
            </div>
          </div>
        )}

        <div className="max-w-4xl mx-auto mt-12 bg-blue-50 border border-blue-200 rounded-xl p-8">
          <div className="flex items-start gap-4">
            <Shield className="h-8 w-8 text-blue-600 flex-shrink-0" />
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">¿Cómo funciona la exención de cargo por servicio?</h3>
              <p className="text-gray-700 mb-4">
                Como miembro de ToursRed+, no pagas el cargo por servicio del 5% en tus reservas hasta un monto acumulado de $500 MXN por mes.
                El contador se resetea automáticamente cada mes en la fecha de renovación de tu membresía.
              </p>
              <p className="text-gray-700 text-sm">
                <strong>Ejemplo:</strong> Si reservas un tour de $1,000 MXN, normalmente pagarías $50 MXN de cargo por servicio.
                Con ToursRed+, ¡ese cargo es $0! Y aún te quedarían $450 MXN de exención disponible para el mes.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
