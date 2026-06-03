import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { CheckCircle, XCircle, Clock, AlertTriangle, Users, MapPin, Calendar, DollarSign, QrCode, ChevronRight, Bus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { formatCurrencyMXN } from '../utils/formatCurrency';

interface Traveler {
  id: string;
  nombre: string;
  email: string;
  categoria_viajero: string;
  precio_aplicado: number;
  is_no_show: boolean;
}

interface CheckinDetails {
  token_info: {
    expires_at: string;
    redeemed_at: string | null;
    is_expired: boolean;
    is_redeemed: boolean;
  };
  booking: {
    id: string;
    booking_code: string;
    status: string;
    total_price: number;
    deposit_amount: number;
    remaining_amount: number;
    travelers_count: number;
    count_adultos: number;
    count_ninos: number;
    count_infantes: number;
    count_adultos_mayores: number;
    count_mascotas: number;
    checkin_status: string | null;
    checkin_at: string | null;
    selected_seats: number[];
    tour: { id: string; name: string; destination: string; start_date: string; end_date: string };
    traveler: { id: string; first_name: string; last_name: string; email: string; phone_number?: string };
    agency: { id: string; name: string; contact_email: string; contact_phone?: string };
  };
  travelers: Traveler[];
  viewer_role: 'agency' | 'admin' | 'traveler';
  can_checkin: boolean;
}

const categoriaLabel: Record<string, string> = {
  adulto: 'Adulto',
  nino: 'Niño',
  infante: 'Infante',
  adulto_mayor: 'Adulto Mayor',
  mascota: 'Mascota',
};

const formatDate = (dateString: string) =>
  new Date(dateString).toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });

const formatDateTime = (dateString: string) =>
  new Date(dateString).toLocaleString('es-MX', {
    year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });

const formatCurrency = (amount: number) => formatCurrencyMXN(amount);

export default function BookingCheckinPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, isLoading: authLoading, isAgency, isAdmin, isAgencyStaff, staffInfo } = useAuth();
  const token = searchParams.get('token');

  const [details, setDetails] = useState<CheckinDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showPartialModal, setShowPartialModal] = useState(false);
  const [selectedNoShow, setSelectedNoShow] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [confirmResult, setConfirmResult] = useState<{ type: string; no_show_travelers: string[] } | null>(null);

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  const fetchDetails = async () => {
    if (!token || !user) return;
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('No autenticado');
        return;
      }
      const res = await fetch(
        `${supabaseUrl}/functions/v1/get-booking-checkin-details?token=${encodeURIComponent(token)}`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
            Apikey: supabaseAnonKey,
          },
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Error al cargar los detalles del check-in');
      } else {
        setDetails(data);
      }
    } catch {
      setError('Error de conexión. Por favor intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading && user) {
      fetchDetails();
    }
  }, [authLoading, user, token]);

  const handleConfirmFull = async () => {
    await performCheckin('full', []);
  };

  const handleConfirmPartial = async () => {
    if (selectedNoShow.size === 0) return;
    await performCheckin('partial', Array.from(selectedNoShow));
    setShowPartialModal(false);
  };

  const performCheckin = async (type: 'full' | 'partial', noShowIds: string[]) => {
    setConfirming(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch(`${supabaseUrl}/functions/v1/confirm-booking-checkin`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          Apikey: supabaseAnonKey,
        },
        body: JSON.stringify({
          token,
          checkin_type: type,
          no_show_traveler_ids: noShowIds,
          ...(isAgencyStaff && staffInfo ? { scanned_by_staff_id: staffInfo.staffId } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Error al confirmar el check-in');
      } else {
        setConfirmed(true);
        setConfirmResult({ type, no_show_travelers: data.no_show_travelers || [] });
        fetchDetails();
      }
    } catch {
      setError('Error de conexión al confirmar el check-in.');
    } finally {
      setConfirming(false);
    }
  };

  if (!token) {
    return (
      <div className="flex items-center justify-center px-4 py-20">
        <div className="text-center max-w-md">
          <QrCode className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Código QR inválido</h1>
          <p className="text-gray-500 mb-6">El enlace de check-in no contiene un token válido.</p>
          <Link to="/" className="btn-primary">Ir al inicio</Link>
        </div>
      </div>
    );
  }

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center px-4 py-16">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <QrCode className="w-8 h-8 text-blue-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Check-in de Reserva</h1>
          <p className="text-gray-500 mb-6">
            Escaneo exitoso. Inicia sesión para ver los detalles de tu reserva y confirmar el check-in.
          </p>
          <button
            onClick={() => navigate(`/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`)}
            className="w-full bg-blue-600 text-white py-3 px-6 rounded-xl font-semibold hover:bg-blue-700 transition-colors"
          >
            Iniciar Sesión
          </button>
          <p className="text-sm text-gray-400 mt-4">
            ¿No tienes cuenta?{' '}
            <Link to="/signup" className="text-blue-600 hover:underline">Regístrate aquí</Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="py-10 px-4">
        <div className="max-w-2xl mx-auto">

          {loading && (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
            </div>
          )}

          {!loading && error && (
            <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
              <XCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
              <h2 className="text-xl font-bold text-gray-900 mb-2">Error</h2>
              <p className="text-gray-500 mb-6">{error}</p>
              <Link to="/" className="bg-blue-600 text-white py-2 px-6 rounded-xl font-semibold hover:bg-blue-700 transition-colors">
                Ir al inicio
              </Link>
            </div>
          )}

          {!loading && !error && details && (
            <>
              <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-900">Check-in de Reserva</h1>
                <p className="text-gray-500 mt-1">Código: <span className="font-semibold text-gray-700">{details.booking.booking_code}</span></p>
              </div>

              {details.token_info.is_expired && !details.token_info.is_redeemed && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3 mb-6">
                  <Clock className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-amber-800">Código expirado</p>
                    <p className="text-amber-700 text-sm">Este código QR ya no es válido. Venció 24 horas después del inicio del tour ({formatDate(details.booking.tour.start_date)}).</p>
                  </div>
                </div>
              )}

              {details.token_info.is_redeemed && !confirmed && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex gap-3 mb-6">
                  <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-green-800">Check-in ya registrado</p>
                    <p className="text-green-700 text-sm">
                      El check-in fue confirmado el {formatDateTime(details.token_info.redeemed_at!)}.
                      {details.booking.checkin_status === 'partial' && ' (Check-in parcial)'}
                    </p>
                  </div>
                </div>
              )}

              {confirmed && confirmResult && (
                <div className={`rounded-xl p-5 mb-6 border ${confirmResult.type === 'full' ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
                  <div className="flex gap-3 items-start">
                    <CheckCircle className={`w-6 h-6 flex-shrink-0 mt-0.5 ${confirmResult.type === 'full' ? 'text-green-500' : 'text-amber-500'}`} />
                    <div>
                      <p className={`font-semibold text-lg ${confirmResult.type === 'full' ? 'text-green-800' : 'text-amber-800'}`}>
                        {confirmResult.type === 'full' ? 'Check-in Completo Confirmado' : 'Check-in Parcial Confirmado'}
                      </p>
                      <p className={`text-sm mt-1 ${confirmResult.type === 'full' ? 'text-green-700' : 'text-amber-700'}`}>
                        Se ha enviado un correo de confirmación al viajero.
                      </p>
                      {confirmResult.no_show_travelers.length > 0 && (
                        <div className="mt-2">
                          <p className="text-amber-700 text-sm font-medium">Marcados como No Show:</p>
                          <ul className="mt-1 text-sm text-amber-700 list-disc list-inside">
                            {confirmResult.no_show_travelers.map((name, i) => <li key={i}>{name}</li>)}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-5">
                <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4">
                  <h2 className="text-white font-semibold text-lg">{details.booking.tour.name}</h2>
                  <div className="flex items-center gap-1 text-blue-100 text-sm mt-1">
                    <MapPin className="w-3.5 h-3.5" />
                    <span>{details.booking.tour.destination}</span>
                  </div>
                </div>
                <div className="p-5 grid grid-cols-2 gap-4 text-sm">
                  <div className="flex items-start gap-2">
                    <Calendar className="w-4 h-4 text-gray-400 mt-0.5" />
                    <div>
                      <p className="text-gray-500">Inicio</p>
                      <p className="font-semibold text-gray-800">{formatDate(details.booking.tour.start_date)}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Calendar className="w-4 h-4 text-gray-400 mt-0.5" />
                    <div>
                      <p className="text-gray-500">Fin</p>
                      <p className="font-semibold text-gray-800">{formatDate(details.booking.tour.end_date)}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Users className="w-4 h-4 text-gray-400 mt-0.5" />
                    <div>
                      <p className="text-gray-500">Viajeros</p>
                      <p className="font-semibold text-gray-800">{details.booking.travelers_count}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <DollarSign className="w-4 h-4 text-gray-400 mt-0.5" />
                    <div>
                      <p className="text-gray-500">Saldo pendiente</p>
                      <p className="font-semibold text-red-600">{formatCurrency(details.booking.remaining_amount)}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-5">
                <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                  <Users className="w-4 h-4 text-blue-600" />
                  Viajero Principal
                </h3>
                <p className="text-gray-800 font-medium">{details.booking.traveler.first_name} {details.booking.traveler.last_name}</p>
                <p className="text-gray-500 text-sm">{details.booking.traveler.email}</p>
                {details.booking.traveler.phone_number && (
                  <p className="text-gray-500 text-sm">{details.booking.traveler.phone_number}</p>
                )}
              </div>

              {details.travelers.length > 0 && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-5">
                  <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                    <Users className="w-4 h-4 text-blue-600" />
                    Lista de Viajeros ({details.travelers.length})
                  </h3>
                  <div className="space-y-2">
                    {details.travelers.map((t) => (
                      <div key={t.id} className={`flex items-center justify-between p-3 rounded-lg ${t.is_no_show ? 'bg-red-50 border border-red-100' : 'bg-gray-50'}`}>
                        <div>
                          <p className={`font-medium text-sm ${t.is_no_show ? 'text-red-600 line-through' : 'text-gray-800'}`}>{t.nombre}</p>
                          <p className="text-gray-400 text-xs">{categoriaLabel[t.categoria_viajero] || t.categoria_viajero}</p>
                        </div>
                        {t.is_no_show && (
                          <span className="text-xs bg-red-100 text-red-600 font-semibold px-2 py-0.5 rounded-full">No Show</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {details.booking.selected_seats && details.booking.selected_seats.length > 0 && (
                <div className="bg-white rounded-2xl shadow-sm border border-blue-100 p-5 mb-5">
                  <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                    <Bus className="w-4 h-4 text-blue-600" />
                    Asientos Asignados
                  </h3>
                  <p className="text-xs text-gray-500 mb-3">Verifica que los viajeros ocupen los siguientes lugares en el vehículo.</p>
                  <div className="flex flex-wrap gap-2">
                    {[...details.booking.selected_seats].sort((a, b) => a - b).map((seat) => (
                      <div
                        key={seat}
                        className="w-11 h-11 bg-blue-600 text-white font-bold text-base rounded-xl flex items-center justify-center shadow-sm"
                      >
                        {seat}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {details.can_checkin && !confirmed && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-5">
                  <h3 className="font-semibold text-gray-800 mb-1">Confirmar Asistencia</h3>
                  <p className="text-gray-500 text-sm mb-4">Selecciona el tipo de check-in para esta reserva.</p>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <button
                      onClick={handleConfirmFull}
                      disabled={confirming}
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <CheckCircle className="w-5 h-5" />
                      {confirming ? 'Confirmando...' : 'Confirmar Check-in Completo'}
                    </button>
                    {details.travelers.length > 1 && (
                      <button
                        onClick={() => setShowPartialModal(true)}
                        disabled={confirming}
                        className="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-semibold py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <AlertTriangle className="w-5 h-5" />
                        Check-in Parcial
                      </button>
                    )}
                  </div>
                </div>
              )}

              {details.viewer_role === 'traveler' && !details.token_info.is_redeemed && (
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-center text-sm text-blue-700">
                  Presenta el código QR de tu correo de confirmación a la agencia el día del tour.
                </div>
              )}
            </>
          )}
        </div>

      {showPartialModal && details && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-100">
              <h3 className="text-lg font-bold text-gray-900">Check-in Parcial</h3>
              <p className="text-gray-500 text-sm mt-1">Selecciona los viajeros que <strong>NO</strong> se presentaron.</p>
            </div>
            <div className="p-6 space-y-2">
              {details.travelers.map((t) => (
                <label key={t.id} className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer border transition-colors ${selectedNoShow.has(t.id) ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-transparent hover:border-gray-200'}`}>
                  <input
                    type="checkbox"
                    checked={selectedNoShow.has(t.id)}
                    onChange={() => {
                      setSelectedNoShow(prev => {
                        const next = new Set(prev);
                        if (next.has(t.id)) next.delete(t.id);
                        else next.add(t.id);
                        return next;
                      });
                    }}
                    className="w-4 h-4 text-red-500 rounded"
                  />
                  <div>
                    <p className="font-medium text-sm text-gray-800">{t.nombre}</p>
                    <p className="text-xs text-gray-400">{categoriaLabel[t.categoria_viajero] || t.categoria_viajero}</p>
                  </div>
                </label>
              ))}
            </div>
            <div className="p-6 border-t border-gray-100 flex gap-3">
              <button
                onClick={() => { setShowPartialModal(false); setSelectedNoShow(new Set()); }}
                className="flex-1 border border-gray-200 text-gray-700 font-semibold py-2.5 rounded-xl hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmPartial}
                disabled={selectedNoShow.size === 0 || confirming}
                className="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-semibold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-4 h-4" />
                {confirming ? 'Confirmando...' : `Confirmar (${selectedNoShow.size} No Show)`}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
