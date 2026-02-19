import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { CheckCircle, XCircle, Clock, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

type ReturnStatus = 'loading' | 'success' | 'pending' | 'cancel' | 'error';

export default function PaymentReturnPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<ReturnStatus>('loading');
  const [message, setMessage] = useState('');

  const provider = searchParams.get('provider');
  const bookingId = searchParams.get('booking_id');
  const giftCardId = searchParams.get('gift_card_id');
  const returnStatus = searchParams.get('status');
  const paypalOrderId = searchParams.get('token');

  useEffect(() => {
    handleReturn();
  }, []);

  const handleReturn = async () => {
    if (returnStatus === 'cancel') {
      setStatus('cancel');
      setMessage('Cancelaste el proceso de pago. Tu reserva fue guardada pero no ha sido pagada.');
      return;
    }

    if (returnStatus === 'pending') {
      setStatus('pending');
      setMessage('Tu pago esta siendo procesado. Te notificaremos cuando sea confirmado.');
      return;
    }

    if (provider === 'paypal' && paypalOrderId && returnStatus === 'success') {
      try {
        const { data: { session } } = await supabase.auth.getSession();

        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/capture-paypal-order`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({
              orderId: paypalOrderId,
              bookingId: bookingId || undefined,
              giftCardId: giftCardId || undefined,
              context: giftCardId ? 'gift_card' : 'booking',
            }),
          }
        );

        const result = await response.json();

        if (result.success) {
          setStatus('success');
          if (giftCardId) {
            setMessage('Pago exitoso. Tu tarjeta de regalo fue procesada.');
            setTimeout(() => navigate(`/gift-card/success?gift_card_id=${giftCardId}&provider=paypal`), 2000);
          } else if (bookingId) {
            setMessage('Pago exitoso. Tu reserva ha sido confirmada.');
            setTimeout(() => navigate(`/booking-success?booking_id=${bookingId}`), 2000);
          }
        } else {
          setStatus('error');
          setMessage('Hubo un problema al confirmar tu pago de PayPal. Contacta soporte si el cargo fue aplicado.');
        }
      } catch (err) {
        console.error('Error capturing PayPal order:', err);
        setStatus('error');
        setMessage('Error al procesar el pago. Por favor contacta soporte.');
      }
      return;
    }

    if (provider === 'mercadopago' && returnStatus === 'success') {
      setStatus('success');
      if (giftCardId) {
        setMessage('Pago exitoso. Tu tarjeta de regalo fue procesada.');
        setTimeout(() => navigate(`/gift-card/success?gift_card_id=${giftCardId}&provider=mercadopago`), 2000);
      } else if (bookingId) {
        setMessage('Pago exitoso. Tu reserva ha sido confirmada.');
        setTimeout(() => navigate(`/booking-success?booking_id=${bookingId}`), 2000);
      }
      return;
    }

    setStatus('error');
    setMessage('Parametros de retorno invalidos.');
  };

  const handleGoToBookings = () => navigate('/traveler/bookings');
  const handleGoHome = () => navigate('/');

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
        {status === 'loading' && (
          <>
            <div className="flex justify-center mb-6">
              <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center">
                <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Procesando pago</h2>
            <p className="text-gray-500">Por favor espera mientras confirmamos tu pago...</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="flex justify-center mb-6">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircle className="w-10 h-10 text-green-600" />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Pago exitoso</h2>
            <p className="text-gray-500 mb-6">{message}</p>
            <p className="text-sm text-gray-400">Redirigiendo automaticamente...</p>
          </>
        )}

        {status === 'pending' && (
          <>
            <div className="flex justify-center mb-6">
              <div className="w-20 h-20 bg-yellow-100 rounded-full flex items-center justify-center">
                <Clock className="w-10 h-10 text-yellow-600" />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Pago en proceso</h2>
            <p className="text-gray-500 mb-6">{message}</p>
            <button
              onClick={handleGoToBookings}
              className="w-full py-3 bg-primary-600 text-white rounded-xl font-semibold hover:bg-primary-700 transition-colors"
            >
              Ver mis reservas
            </button>
          </>
        )}

        {status === 'cancel' && (
          <>
            <div className="flex justify-center mb-6">
              <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center">
                <XCircle className="w-10 h-10 text-gray-500" />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Pago cancelado</h2>
            <p className="text-gray-500 mb-6">{message}</p>
            <div className="space-y-3">
              {bookingId && (
                <button
                  onClick={handleGoToBookings}
                  className="w-full py-3 bg-primary-600 text-white rounded-xl font-semibold hover:bg-primary-700 transition-colors"
                >
                  Ver mis reservas
                </button>
              )}
              <button
                onClick={handleGoHome}
                className="w-full py-3 border border-gray-300 text-gray-700 rounded-xl font-semibold hover:bg-gray-50 transition-colors"
              >
                Volver al inicio
              </button>
            </div>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="flex justify-center mb-6">
              <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center">
                <XCircle className="w-10 h-10 text-red-600" />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Error en el pago</h2>
            <p className="text-gray-500 mb-6">{message}</p>
            <div className="space-y-3">
              {bookingId && (
                <button
                  onClick={handleGoToBookings}
                  className="w-full py-3 bg-primary-600 text-white rounded-xl font-semibold hover:bg-primary-700 transition-colors"
                >
                  Ver mis reservas
                </button>
              )}
              <button
                onClick={handleGoHome}
                className="w-full py-3 border border-gray-300 text-gray-700 rounded-xl font-semibold hover:bg-gray-50 transition-colors"
              >
                Volver al inicio
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
