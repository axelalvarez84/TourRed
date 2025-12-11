import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, CreditCard, Users, AlertCircle, DollarSign, Settings } from 'lucide-react';
import { Tour } from '../types';
import { useAuth } from '../context/AuthContext';
import { createBooking, formatDateForDB, supabase } from '../lib/supabase';

interface BookingFormProps {
  tour: Tour;
}

const BookingForm: React.FC<BookingFormProps> = ({ tour }) => {
  const { user, isTraveler } = useAuth();
  const navigate = useNavigate();
  const [travelersCount, setTravelersCount] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [serviceChargePercentage, setServiceChargePercentage] = useState(5);
  const [agencyCommissionPercentage, setAgencyCommissionPercentage] = useState(15);
  const [availableSpots, setAvailableSpots] = useState<number | null>(null);
  const [isLoadingAvailability, setIsLoadingAvailability] = useState(true);

  React.useEffect(() => {
    const fetchPlatformSettings = async () => {
      try {
        const { data, error } = await supabase
          .from('platform_settings')
          .select('service_charge_percentage, agency_commission_percentage')
          .maybeSingle();

        if (error) {
          console.error('Error fetching platform settings:', error);
          return;
        }

        if (data) {
          setServiceChargePercentage(data.service_charge_percentage);
          setAgencyCommissionPercentage(data.agency_commission_percentage);
        }
      } catch (err) {
        console.error('Error loading platform settings:', err);
      }
    };

    fetchPlatformSettings();
  }, []);

  React.useEffect(() => {
    const fetchAvailability = async () => {
      try {
        setIsLoadingAvailability(true);

        const { data: bookings, error } = await supabase
          .from('bookings')
          .select('travelers_count, status')
          .eq('tour_id', tour.id)
          .in('status', ['confirmed', 'pending']);

        if (error) {
          console.error('Error fetching bookings:', error);
          setAvailableSpots(tour.max_travelers || 10);
          return;
        }

        const totalBooked = bookings?.reduce((sum, booking) => sum + booking.travelers_count, 0) || 0;

        // Si la agencia configuró lugares disponibles personalizados, usar ese valor
        // De lo contrario, usar max_travelers
        const maxCapacity = tour.available_spots !== null && tour.available_spots !== undefined
          ? tour.available_spots
          : (tour.max_travelers || 10);

        const available = Math.max(0, maxCapacity - totalBooked);

        console.log(`📊 Disponibilidad del tour: ${available} de ${maxCapacity} lugares disponibles (${totalBooked} reservados)${tour.available_spots ? ' [Personalizado por agencia]' : ''}`);
        setAvailableSpots(available);

      } catch (err) {
        console.error('Error loading availability:', err);
        setAvailableSpots(tour.max_travelers || 10);
      } finally {
        setIsLoadingAvailability(false);
      }
    };

    fetchAvailability();
  }, [tour.id, tour.max_travelers]);

  const formatDate = (dateString: string) => {
    try {
      const [year, month, day] = dateString.split('-').map(Number);
      const date = new Date(Date.UTC(year, month - 1, day));
      const monthName = date.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
      const dayNum = date.toLocaleString('en-US', { day: 'numeric', timeZone: 'UTC' });
      const yearNum = date.toLocaleString('en-US', { year: 'numeric', timeZone: 'UTC' });
      return `${monthName} ${dayNum}, ${yearNum}`;
    } catch (error) {
      console.error('Error formatting date:', dateString, error);
      return dateString;
    }
  };

  const isBookingDeadlinePassed = () => {
    if (!tour.booking_deadline) return false;

    try {
      const deadline = new Date(tour.booking_deadline);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      return deadline < today;
    } catch (error) {
      console.error('Error checking booking deadline:', error);
      return false;
    }
  };

  const bookingDeadlinePassed = isBookingDeadlinePassed();

  // Cálculos de precios y comisiones
  const totalPrice = tour.price * travelersCount;
  const depositAmount = totalPrice * (tour.deposit_percentage / 100);

  // Comisiones según el esquema solicitado con valores configurables
  const agencyCommission = totalPrice * (agencyCommissionPercentage / 100);
  const serviceCharge = totalPrice * (serviceChargePercentage / 100);
  const platformRevenue = agencyCommission + serviceCharge;

  // Lo que paga el usuario: depósito + cargo por servicio
  const userPayment = depositAmount + serviceCharge;

  // Lo que recibe la agencia: depósito - comisión de agencia
  const agencyReceives = depositAmount - agencyCommission;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      navigate('/login');
      return;
    }

    if (!isTraveler) {
      setError('Solo los viajeros pueden reservar tours.');
      return;
    }

    if (availableSpots !== null && travelersCount > availableSpots) {
      setError(`Solo hay ${availableSpots} lugar${availableSpots !== 1 ? 'es' : ''} disponible${availableSpots !== 1 ? 's' : ''} para este tour.`);
      return;
    }

    try {
      setIsSubmitting(true);
      setError('');

      // Determinar el estado inicial basado en el tipo de aprobación del tour
      const initialStatus = tour.booking_approval_type === 'manual' ? 'pending' : 'pending';
      const initialApprovalStatus = tour.booking_approval_type === 'manual' ? 'pending' : 'approved';
      const initialPaymentStatus = tour.booking_approval_type === 'manual' ? 'pending' : 'pending';

      // Crear la reserva
      const bookingData = {
        user_id: user.id,
        tour_id: tour.id,
        agency_id: tour.agency_id,
        deposit_amount: depositAmount,
        commission_amount: agencyCommission,
        total_price: totalPrice,
        status: initialStatus,
        booking_date: tour.start_date,
        travelers_count: travelersCount,
        service_charge: serviceCharge,
        user_payment: userPayment,
        platform_revenue: platformRevenue,
        payment_status: initialPaymentStatus,
        approval_status: initialApprovalStatus,
      };

      // Crear la reserva en la base de datos
      const { data: booking, error: bookingError } = await createBooking(bookingData);

      if (bookingError) {
        throw new Error(bookingError.message);
      }

      // Si el tour requiere aprobación manual, no proceder con el pago
      if (tour.booking_approval_type === 'manual') {
        // Redirigir a página de confirmación sin pago
        navigate(`/booking-pending?booking_id=${booking.id}`);
      } else {
        // Proceder con el pago normal para reservas automáticas
        const checkoutResult = await createStripeCheckoutSession({
          amount: userPayment,
          currency: 'mxn',
          description: `Depósito para ${tour.name} - ${travelersCount} viajero(s)`,
          bookingId: booking.id,
          metadata: {
            booking_id: booking.id,
            tour_id: tour.id,
            agency_id: tour.agency_id,
            travelers_count: travelersCount.toString(),
            total_price: totalPrice.toString(),
            deposit_amount: depositAmount.toString(),
            service_charge: serviceCharge.toString(),
            agency_commission: agencyCommission.toString(),
          }
        });

        if (!checkoutResult.success) {
          throw new Error(checkoutResult.error || 'Error creando sesión de pago');
        }

        // Redirigir a Stripe Checkout
        if (checkoutResult.url) {
          window.location.href = checkoutResult.url;
        } else {
          throw new Error('No se recibió URL de pago');
        }
      }
    } catch (err: any) {
      setError(err.message || 'Ocurrió un error al procesar la reserva.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Función para crear sesión de Stripe Checkout
  const createStripeCheckoutSession = async (paymentData: any) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error('No hay sesión válida. Por favor inicia sesión nuevamente.');
      }

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-checkout-session`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...paymentData,
          success_url: `${window.location.origin}/booking-success?booking_id=${paymentData.bookingId}`,
          cancel_url: `${window.location.origin}/booking-cancel?booking_id=${paymentData.bookingId}`,
        }),
      });

      const result = await response.json();
      
      if (!response.ok) {
        // Manejar específicamente el error de configuración de Stripe
        if (result && result.details === 'stripe_key_missing') {
          throw new Error(
            'La configuración de pagos no está completa. ' +
            'Por favor, contacta al administrador del sistema para configurar Stripe.'
          );
        }
        throw new Error(result?.error || 'Error en el procesamiento del pago');
      }

      return result;
    } catch (error: any) {
      console.error('Error creando sesión de checkout:', error);
      return { success: false, error: error.message };
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-xl font-semibold mb-4">Reservar Este Tour</h3>
      
      <div className="mb-4">
        <div className="text-sm text-gray-500 mb-1">Precio por persona</div>
        <div className="text-2xl font-bold text-primary-600">${tour.price.toLocaleString()}</div>
        <div className="text-sm text-gray-500 mt-1">
          Depósito: ${depositAmount.toLocaleString()} ({tour.deposit_percentage}%)
        </div>
      </div>
      
      <div className="mb-4 bg-gray-50 p-3 rounded-md">
        <div className="text-sm font-medium mb-2">Fechas del Tour</div>
        <div className="flex items-center text-gray-700">
          <Calendar className="w-4 h-4 mr-2 text-primary-600" />
          <span>
            {formatDate(tour.start_date)} - {formatDate(tour.end_date)}
          </span>
        </div>
      </div>
      
      <form onSubmit={handleSubmit}>
        <div className="mb-4">
          <label htmlFor="travelersCount" className="block text-sm font-medium text-gray-700 mb-1">
            Número de Viajeros
          </label>
          {isLoadingAvailability ? (
            <div className="flex items-center justify-center py-2 text-gray-500">
              <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-primary-600 mr-2"></div>
              <span className="text-sm">Verificando disponibilidad...</span>
            </div>
          ) : availableSpots === 0 ? (
            <div className="bg-red-50 border border-red-200 rounded-md p-3 text-red-800 text-sm">
              No hay lugares disponibles para este tour en este momento.
            </div>
          ) : (
            <>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Users className="h-5 w-5 text-gray-400" />
                </div>
                <select
                  id="travelersCount"
                  value={travelersCount}
                  onChange={(e) => setTravelersCount(Number(e.target.value))}
                  className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                  disabled={availableSpots === null || availableSpots === 0}
                >
                  {[...Array(availableSpots || 0)].map((_, i) => (
                    <option key={i + 1} value={i + 1}>
                      {i + 1} {i === 0 ? 'Viajero' : 'Viajeros'}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mt-1 text-xs text-gray-500">
                {availableSpots} {availableSpots === 1 ? 'lugar disponible' : 'lugares disponibles'}
              </div>
            </>
          )}
        </div>
        
        {/* Desglose de Costos */}
        <div className="border-t border-gray-200 pt-4 mb-4">
          <h4 className="font-medium text-gray-900 mb-3">Desglose de Costos</h4>
          
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Precio Total del Tour:</span>
              <span className="font-medium">${totalPrice.toLocaleString()}</span>
            </div>
            
            <div className="flex justify-between">
              <span className="text-gray-600">Depósito ({tour.deposit_percentage}%):</span>
              <span className="font-medium">${depositAmount.toLocaleString()}</span>
            </div>
            
            <div className="flex justify-between">
              <span className="text-gray-600">Cargo por Servicio ({serviceChargePercentage}%):</span>
              <span className="font-medium text-orange-600">+${serviceCharge.toLocaleString()}</span>
            </div>
            
            <div className="border-t border-gray-200 pt-2 mt-2">
              <div className="flex justify-between text-lg font-bold">
                <span className="text-gray-900">Total a Pagar Ahora:</span>
                <span className="text-primary-600">${userPayment.toLocaleString()}</span>
              </div>
            </div>
            
            <div className="flex justify-between text-sm text-gray-500">
              <span>Saldo Restante:</span>
              <span>${(totalPrice - depositAmount).toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Información Importante */}
        <div className="bg-blue-50 border border-blue-200 rounded-md p-3 mb-4">
          <div className="flex items-start">
            <AlertCircle className="h-5 w-5 text-blue-500 mt-0.5 mr-2 flex-shrink-0" />
            <div className="text-sm text-blue-800">
              <span className="font-medium">
                {tour.booking_approval_type === 'manual' ? 'Reserva sujeta a aprobación' : 'Reserva automática'}
              </span>
              {tour.booking_approval_type === 'manual' ? (
                <ul className="space-y-1 text-xs mt-2">
                  <li>• Tu solicitud de reserva será enviada a la agencia para aprobación</li>
                  <li>• No se realizará ningún cargo hasta que la agencia apruebe tu reserva</li>
                  <li>• Recibirás una notificación cuando la agencia responda</li>
                  <li>• Una vez aprobada, podrás proceder con el pago</li>
                </ul>
              ) : (
                <ul className="space-y-1 text-xs mt-2">
                  <li>• Serás redirigido a una página segura de Stripe para ingresar tus datos de pago</li>
                  <li>• Pagarás ${userPayment.toLocaleString()} ahora (depósito + cargo por servicio)</li>
                  <li>• El saldo restante (${(totalPrice - depositAmount).toLocaleString()}) se paga directamente a la agencia</li>
                  <li>• Recibirás confirmación por email una vez completado el pago</li>
                </ul>
              )}
            </div>
          </div>
        </div>
        
        {bookingDeadlinePassed && (
          <div className="mb-4 bg-red-50 text-red-700 p-4 rounded-md text-sm border border-red-200">
            <div className="flex items-start">
              <AlertCircle className="h-5 w-5 mr-2 mt-0.5 flex-shrink-0" />
              <div>
                <span className="font-semibold">YA NO ES POSIBLE RESERVAR</span>
                <p className="mt-1 text-xs">La fecha límite de reserva para este tour fue el {formatDate(tour.booking_deadline)}. Las reservas ya no están disponibles.</p>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="mb-4 bg-error-50 text-error-700 p-3 rounded-md text-sm">
            <div className="flex items-start">
              <AlertCircle className="h-5 w-5 mr-2 mt-0.5 flex-shrink-0" />
              <div>
                <span>{error}</span>
                {error.includes('configuración de pagos') && (
                  <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">
                    <div className="flex items-center mb-1">
                      <Settings className="h-3 w-3 mr-1" />
                      <span className="font-medium">Configuración requerida:</span>
                    </div>
                    <p>El administrador debe configurar la clave secreta de Stripe en Supabase Edge Functions.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {bookingDeadlinePassed ? (
          <div className="w-full py-3 px-4 bg-gray-100 text-gray-500 rounded-md text-center font-medium cursor-not-allowed">
            Reservas Cerradas
          </div>
        ) : availableSpots === 0 ? (
          <div className="w-full py-3 px-4 bg-gray-100 text-gray-500 rounded-md text-center font-medium cursor-not-allowed">
            Sin Lugares Disponibles
          </div>
        ) : (
          <button
            type="submit"
            className="w-full btn btn-primary py-3 flex items-center justify-center"
            disabled={isSubmitting || !user || isLoadingAvailability || availableSpots === 0}
          >
            {user ? (
              tour.booking_approval_type === 'manual'
                ? 'Solicitar Reserva (Sin Cargo)'
                : `Proceder al Pago - $${userPayment.toLocaleString()} MXN`
            ) : 'Inicia Sesión para Reservar'}
            {isSubmitting ? (
              <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white ml-2"></div>
            ) : (
              <CreditCard className="h-5 w-5 ml-2" />
            )}
          </button>
        )}
        
        <p className="text-xs text-gray-500 text-center mt-3">
          <DollarSign className="h-3 w-3 inline mr-1" />
          Pago seguro procesado por Stripe. Tus datos están protegidos con encriptación SSL.
        </p>
      </form>
    </div>
  );
};

export default BookingForm;