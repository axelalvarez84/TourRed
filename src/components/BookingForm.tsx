import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, CreditCard, Users, AlertCircle, DollarSign, Settings } from 'lucide-react';
import { Tour } from '../types';
import { useAuth } from '../context/AuthContext';
import { createBooking, parseDateFromDB, formatDateForDB, supabase } from '../lib/supabase';
import { format } from 'date-fns';

interface BookingFormProps {
  tour: Tour;
}

const BookingForm: React.FC<BookingFormProps> = ({ tour }) => {
  const { user, isTraveler } = useAuth();
  const navigate = useNavigate();
  const [travelersCount, setTravelersCount] = useState(1);
  const [bookingDate, setBookingDate] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const formatDate = (dateString: string) => {
    try {
      const date = parseDateFromDB(dateString);
      return format(date, 'MMM d, yyyy');
    } catch (error) {
      console.error('Error formatting date:', dateString, error);
      return format(new Date(dateString), 'MMM d, yyyy');
    }
  };

  // Cálculos de precios y comisiones
  const totalPrice = tour.price * travelersCount;
  const depositAmount = totalPrice * (tour.deposit_percentage / 100);
  
  // Comisiones según el esquema solicitado
  const agencyCommission = totalPrice * 0.10; // 10% del costo total para la agencia
  const serviceCharge = totalPrice * 0.03; // 3% del costo total como cargo por servicio
  const platformRevenue = agencyCommission + serviceCharge; // Total que va a la plataforma (13%)
  
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

    if (!user) {
      navigate('/login');
      return;
    }

    if (!isTraveler) {
      setError('Solo los viajeros pueden reservar tours.');
      return;
    }

    if (!bookingDate) {
      setError('Por favor selecciona una fecha de reserva.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError('');

      // Crear la reserva temporal (pendiente de pago)
      const bookingData = {
        user_id: user.id,
        tour_id: tour.id,
        agency_id: tour.agency_id,
        deposit_amount: depositAmount,
        commission_amount: agencyCommission,
        total_price: totalPrice,
        status: 'pending',
        booking_date: bookingDate,
        travelers_count: travelersCount,
        service_charge: serviceCharge,
        user_payment: userPayment,
        platform_revenue: platformRevenue,
        payment_status: 'pending',
      };

      // Crear la reserva en la base de datos
      const { data: booking, error: bookingError } = await createBooking(bookingData);

      if (bookingError) {
        throw new Error(bookingError.message);
      }

      // Crear sesión de Stripe Checkout
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
          <label htmlFor="bookingDate" className="block text-sm font-medium text-gray-700 mb-1">
            Seleccionar Fecha
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Calendar className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="date"
              id="bookingDate"
              min={tour.start_date}
              max={tour.end_date}
              value={bookingDate}
              onChange={(e) => setBookingDate(e.target.value)}
              className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
              required
            />
          </div>
        </div>
        
        <div className="mb-4">
          <label htmlFor="travelersCount" className="block text-sm font-medium text-gray-700 mb-1">
            Número de Viajeros
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Users className="h-5 w-5 text-gray-400" />
            </div>
            <select
              id="travelersCount"
              value={travelersCount}
              onChange={(e) => setTravelersCount(Number(e.target.value))}
              className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
            >
              {[...Array(tour.max_travelers || 10)].map((_, i) => (
                <option key={i + 1} value={i + 1}>
                  {i + 1} {i === 0 ? 'Viajero' : 'Viajeros'}
                </option>
              ))}
            </select>
          </div>
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
              <span className="text-gray-600">Cargo por Servicio (3%):</span>
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
              <span className="font-medium">{error}</span>
              <ul className="space-y-1 text-xs">
                <li>• Serás redirigido a una página segura de Stripe para ingresar tus datos de pago</li>
                <li>• Pagarás ${userPayment.toLocaleString()} ahora (depósito + cargo por servicio)</li>
                <li>• El saldo restante (${(totalPrice - depositAmount).toLocaleString()}) se paga directamente a la agencia</li>
                <li>• Recibirás confirmación por email una vez completado el pago</li>
              </ul>
            </div>
          </div>
        </div>
        
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
        
        <button
          type="submit"
          className="w-full btn btn-primary py-3 flex items-center justify-center"
          disabled={isSubmitting || !user}
        >
          {isSubmitting ? (
            <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white mr-2"></div>
          ) : (
            <CreditCard className="h-5 w-5 mr-2" />
          )}
          {user ? `Proceder al Pago - ${userPayment.toLocaleString()} MXN` : 'Inicia Sesión para Reservar'}
        </button>
        
        <p className="text-xs text-gray-500 text-center mt-3">
          <DollarSign className="h-3 w-3 inline mr-1" />
          Pago seguro procesado por Stripe. Tus datos están protegidos con encriptación SSL.
        </p>
      </form>
    </div>
  );
};

export default BookingForm;