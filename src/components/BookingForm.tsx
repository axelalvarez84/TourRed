import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, CreditCard, Users, AlertCircle, DollarSign, Settings, Minus, Plus } from 'lucide-react';
import { Tour } from '../types';
import { useAuth } from '../context/AuthContext';
import { createBooking, formatDateForDB, supabase } from '../lib/supabase';

interface BookingFormProps {
  tour: Tour;
}

interface TravelerCounts {
  adultos: number;
  ninos: number;
  infantes: number;
  adultos_mayores: number;
  mascotas: number;
}

const BookingForm: React.FC<BookingFormProps> = ({ tour }) => {
  const { user, isTraveler } = useAuth();
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [serviceChargePercentage, setServiceChargePercentage] = useState(5);
  const [agencyCommissionPercentage, setAgencyCommissionPercentage] = useState(15);
  const [availableSpots, setAvailableSpots] = useState<number | null>(null);
  const [isLoadingAvailability, setIsLoadingAvailability] = useState(true);
  const [showTravelerSelector, setShowTravelerSelector] = useState(false);

  const [travelerCounts, setTravelerCounts] = useState<TravelerCounts>({
    adultos: 1,
    ninos: 0,
    infantes: 0,
    adultos_mayores: 0,
    mascotas: 0,
  });

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

  // Calcular total de viajeros (sin contar mascotas)
  const totalTravelers = travelerCounts.adultos + travelerCounts.ninos + travelerCounts.infantes + travelerCounts.adultos_mayores;

  // Función para obtener precio por categoría o usar precio general
  const getPrecioPorCategoria = (categoria: 'adulto' | 'nino' | 'infante' | 'adulto_mayor' | 'mascota'): number => {
    switch (categoria) {
      case 'adulto':
        return tour.precio_adulto || tour.price;
      case 'nino':
        return tour.precio_nino || tour.price;
      case 'infante':
        return tour.precio_infante || tour.price;
      case 'adulto_mayor':
        return tour.precio_adulto_mayor || tour.price;
      case 'mascota':
        return tour.precio_mascota || 0;
      default:
        return tour.price;
    }
  };

  // Cálculos de precios por categoría
  const precioAdultos = getPrecioPorCategoria('adulto') * travelerCounts.adultos;
  const precioNinos = getPrecioPorCategoria('nino') * travelerCounts.ninos;
  const precioInfantes = getPrecioPorCategoria('infante') * travelerCounts.infantes;
  const precioAdultosMayores = getPrecioPorCategoria('adulto_mayor') * travelerCounts.adultos_mayores;
  const precioMascotas = getPrecioPorCategoria('mascota') * travelerCounts.mascotas;

  // Precio total del tour
  const totalPrice = precioAdultos + precioNinos + precioInfantes + precioAdultosMayores + precioMascotas;
  const depositAmount = totalPrice * (tour.deposit_percentage / 100);

  // Comisiones
  const agencyCommission = totalPrice * (agencyCommissionPercentage / 100);
  const serviceCharge = totalPrice * (serviceChargePercentage / 100);
  const platformRevenue = agencyCommission + serviceCharge;

  // Lo que paga el usuario: depósito + cargo por servicio
  const userPayment = depositAmount + serviceCharge;

  // Lo que recibe la agencia: depósito - comisión de agencia
  const agencyReceives = depositAmount - agencyCommission;

  const handleCountChange = (categoria: keyof TravelerCounts, delta: number) => {
    setTravelerCounts(prev => {
      const newValue = Math.max(0, prev[categoria] + delta);

      // Validar disponibilidad (sin contar mascotas)
      if (categoria !== 'mascotas') {
        const newTotal = Object.entries({ ...prev, [categoria]: newValue })
          .filter(([key]) => key !== 'mascotas')
          .reduce((sum, [, value]) => sum + value, 0);

        if (availableSpots !== null && newTotal > availableSpots) {
          return prev;
        }
      }

      return { ...prev, [categoria]: newValue };
    });
  };

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

    if (totalTravelers === 0) {
      setError('Debes seleccionar al menos un viajero.');
      return;
    }

    if (availableSpots !== null && totalTravelers > availableSpots) {
      setError(`Solo hay ${availableSpots} lugar${availableSpots !== 1 ? 'es' : ''} disponible${availableSpots !== 1 ? 's' : ''} para este tour.`);
      return;
    }

    try {
      setIsSubmitting(true);
      setError('');

      const initialStatus = tour.booking_approval_type === 'manual' ? 'pending' : 'pending';
      const initialApprovalStatus = tour.booking_approval_type === 'manual' ? 'pending' : 'approved';
      const initialPaymentStatus = tour.booking_approval_type === 'manual' ? 'pending' : 'pending';

      const bookingData = {
        user_id: user.id,
        tour_id: tour.id,
        agency_id: tour.agency_id,
        travelers_count: totalTravelers,
        total_price: totalPrice,
        deposit_amount: depositAmount,
        commission_amount: agencyCommission,
        service_charge: serviceCharge,
        user_payment: userPayment,
        platform_revenue: platformRevenue,
        booking_date: formatDateForDB(new Date().toISOString()),
        status: initialStatus,
        payment_status: initialPaymentStatus,
        approval_status: initialApprovalStatus,
      };

      console.log('📝 Creando reserva con datos:', bookingData);

      const { data, error: bookingError } = await createBooking(bookingData);

      if (bookingError) {
        console.error('❌ Error al crear la reserva:', bookingError);
        throw new Error(bookingError.message || 'Error al crear la reserva');
      }

      if (!data || !data.id) {
        throw new Error('No se recibió el ID de la reserva');
      }

      console.log('✅ Reserva creada exitosamente:', data);

      if (tour.booking_approval_type === 'manual') {
        navigate(`/booking-pending/${data.id}`);
      } else {
        const checkoutResult = await createStripeCheckout(data.id, user.email, userPayment);

        if (!checkoutResult.success) {
          throw new Error(checkoutResult.error || 'Error al crear la sesión de pago');
        }

        if (checkoutResult.url) {
          window.location.href = checkoutResult.url;
        } else {
          throw new Error('No se recibió la URL de pago');
        }
      }

    } catch (error: any) {
      console.error('❌ Error en el proceso de reserva:', error);
      setError(error.message || 'Hubo un error al procesar tu reserva. Por favor, intenta de nuevo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const createStripeCheckout = async (bookingId: string, customerEmail: string, amount: number) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        throw new Error('No hay sesión activa');
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-checkout-session`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            bookingId,
            customerEmail,
            amount,
            tourName: tour.name,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error al crear la sesión de checkout');
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Error al crear la sesión de checkout');
      }

      return result;
    } catch (error: any) {
      console.error('Error creando sesión de checkout:', error);
      return { success: false, error: error.message };
    }
  };

  // Determinar el label del selector
  const getSelectorLabel = () => {
    if (totalTravelers === 0 && travelerCounts.mascotas === 0) {
      return 'Seleccionar viajeros';
    }

    const parts = [];
    if (travelerCounts.adultos > 0) parts.push(`${travelerCounts.adultos} Adulto${travelerCounts.adultos > 1 ? 's' : ''}`);
    if (travelerCounts.ninos > 0) parts.push(`${travelerCounts.ninos} Niño${travelerCounts.ninos > 1 ? 's' : ''}`);
    if (travelerCounts.infantes > 0) parts.push(`${travelerCounts.infantes} Infante${travelerCounts.infantes > 1 ? 's' : ''}`);
    if (travelerCounts.adultos_mayores > 0) parts.push(`${travelerCounts.adultos_mayores} Adulto${travelerCounts.adultos_mayores > 1 ? 's' : ''} Mayor${travelerCounts.adultos_mayores > 1 ? 'es' : ''}`);
    if (travelerCounts.mascotas > 0) parts.push(`${travelerCounts.mascotas} Mascota${travelerCounts.mascotas > 1 ? 's' : ''}`);

    return parts.join(', ');
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
          <label className="block text-sm font-medium text-gray-700 mb-1">
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
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowTravelerSelector(!showTravelerSelector)}
                className="w-full flex items-center justify-between px-4 py-3 border border-gray-300 rounded-md bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              >
                <div className="flex items-center">
                  <Users className="h-5 w-5 text-gray-400 mr-2" />
                  <span className="text-sm text-gray-700">{getSelectorLabel()}</span>
                </div>
                <svg className={`h-5 w-5 text-gray-400 transition-transform ${showTravelerSelector ? 'transform rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {showTravelerSelector && (
                <div className="absolute z-10 mt-2 w-full bg-white border border-gray-300 rounded-md shadow-lg p-4 space-y-4">
                  {tour.admite_adultos !== false && (
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-gray-900">Adultos</div>
                        <div className="text-xs text-gray-500">13-59 años</div>
                      </div>
                      <div className="flex items-center space-x-3">
                        <button
                          type="button"
                          onClick={() => handleCountChange('adultos', -1)}
                          disabled={travelerCounts.adultos === 0}
                          className="w-8 h-8 rounded-full border-2 border-gray-300 flex items-center justify-center hover:border-primary-600 disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <span className="w-8 text-center font-medium">{travelerCounts.adultos}</span>
                        <button
                          type="button"
                          onClick={() => handleCountChange('adultos', 1)}
                          className="w-8 h-8 rounded-full border-2 border-primary-600 bg-primary-600 text-white flex items-center justify-center hover:bg-primary-700"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}

                  {tour.admite_ninos !== false && (
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-gray-900">Niños</div>
                        <div className="text-xs text-gray-500">3-12 años</div>
                      </div>
                      <div className="flex items-center space-x-3">
                        <button
                          type="button"
                          onClick={() => handleCountChange('ninos', -1)}
                          disabled={travelerCounts.ninos === 0}
                          className="w-8 h-8 rounded-full border-2 border-gray-300 flex items-center justify-center hover:border-primary-600 disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <span className="w-8 text-center font-medium">{travelerCounts.ninos}</span>
                        <button
                          type="button"
                          onClick={() => handleCountChange('ninos', 1)}
                          className="w-8 h-8 rounded-full border-2 border-primary-600 bg-primary-600 text-white flex items-center justify-center hover:bg-primary-700"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}

                  {tour.admite_infantes !== false && (
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-gray-900">Infantes</div>
                        <div className="text-xs text-gray-500">0-2 años</div>
                      </div>
                      <div className="flex items-center space-x-3">
                        <button
                          type="button"
                          onClick={() => handleCountChange('infantes', -1)}
                          disabled={travelerCounts.infantes === 0}
                          className="w-8 h-8 rounded-full border-2 border-gray-300 flex items-center justify-center hover:border-primary-600 disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <span className="w-8 text-center font-medium">{travelerCounts.infantes}</span>
                        <button
                          type="button"
                          onClick={() => handleCountChange('infantes', 1)}
                          className="w-8 h-8 rounded-full border-2 border-primary-600 bg-primary-600 text-white flex items-center justify-center hover:bg-primary-700"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}

                  {tour.admite_adultos_mayores !== false && (
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-gray-900">Adultos Mayores</div>
                        <div className="text-xs text-gray-500">60+ con INAPAM</div>
                      </div>
                      <div className="flex items-center space-x-3">
                        <button
                          type="button"
                          onClick={() => handleCountChange('adultos_mayores', -1)}
                          disabled={travelerCounts.adultos_mayores === 0}
                          className="w-8 h-8 rounded-full border-2 border-gray-300 flex items-center justify-center hover:border-primary-600 disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <span className="w-8 text-center font-medium">{travelerCounts.adultos_mayores}</span>
                        <button
                          type="button"
                          onClick={() => handleCountChange('adultos_mayores', 1)}
                          className="w-8 h-8 rounded-full border-2 border-primary-600 bg-primary-600 text-white flex items-center justify-center hover:bg-primary-700"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}

                  {tour.pet_friendly && (
                    <div className="flex items-center justify-between border-t pt-3">
                      <div>
                        <div className="text-sm font-medium text-gray-900">Mascotas</div>
                        <div className="text-xs text-gray-500">Perro o gato</div>
                      </div>
                      <div className="flex items-center space-x-3">
                        <button
                          type="button"
                          onClick={() => handleCountChange('mascotas', -1)}
                          disabled={travelerCounts.mascotas === 0}
                          className="w-8 h-8 rounded-full border-2 border-gray-300 flex items-center justify-center hover:border-primary-600 disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <span className="w-8 text-center font-medium">{travelerCounts.mascotas}</span>
                        <button
                          type="button"
                          onClick={() => handleCountChange('mascotas', 1)}
                          className="w-8 h-8 rounded-full border-2 border-primary-600 bg-primary-600 text-white flex items-center justify-center hover:bg-primary-700"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="border-t pt-3">
                    <button
                      type="button"
                      onClick={() => setShowTravelerSelector(false)}
                      className="w-full py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 font-medium"
                    >
                      Listo
                    </button>
                  </div>
                </div>
              )}

              {availableSpots !== null && (
                <p className="text-xs text-gray-500 mt-1">
                  {availableSpots} {availableSpots === 1 ? 'lugar disponible' : 'lugares disponibles'}
                </p>
              )}
            </div>
          )}
        </div>

        {totalTravelers > 0 && (
          <div className="mb-4 bg-gray-50 p-4 rounded-md space-y-2">
            <h4 className="text-sm font-semibold text-gray-900">Desglose de Costos</h4>

            {travelerCounts.adultos > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">{travelerCounts.adultos} Adulto{travelerCounts.adultos > 1 ? 's' : ''} × ${getPrecioPorCategoria('adulto').toLocaleString()}:</span>
                <span className="font-medium">${precioAdultos.toLocaleString()}</span>
              </div>
            )}

            {travelerCounts.ninos > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">{travelerCounts.ninos} Niño{travelerCounts.ninos > 1 ? 's' : ''} × ${getPrecioPorCategoria('nino').toLocaleString()}:</span>
                <span className="font-medium">${precioNinos.toLocaleString()}</span>
              </div>
            )}

            {travelerCounts.infantes > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">{travelerCounts.infantes} Infante{travelerCounts.infantes > 1 ? 's' : ''} × ${getPrecioPorCategoria('infante').toLocaleString()}:</span>
                <span className="font-medium">${precioInfantes.toLocaleString()}</span>
              </div>
            )}

            {travelerCounts.adultos_mayores > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">{travelerCounts.adultos_mayores} Adulto{travelerCounts.adultos_mayores > 1 ? 's' : ''} Mayor{travelerCounts.adultos_mayores > 1 ? 'es' : ''} × ${getPrecioPorCategoria('adulto_mayor').toLocaleString()}:</span>
                <span className="font-medium">${precioAdultosMayores.toLocaleString()}</span>
              </div>
            )}

            {travelerCounts.mascotas > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">{travelerCounts.mascotas} Mascota{travelerCounts.mascotas > 1 ? 's' : ''} × ${getPrecioPorCategoria('mascota').toLocaleString()}:</span>
                <span className="font-medium">${precioMascotas.toLocaleString()}</span>
              </div>
            )}

            <div className="border-t pt-2 mt-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Precio Total del Tour:</span>
                <span className="font-semibold">${totalPrice.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm mt-1">
                <span className="text-gray-600">Depósito ({tour.deposit_percentage}%):</span>
                <span className="font-medium">${depositAmount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm text-orange-600 mt-1">
                <span>Cargo por Servicio ({serviceChargePercentage}%):</span>
                <span className="font-medium">+${serviceCharge.toLocaleString()}</span>
              </div>
            </div>

            <div className="border-t pt-2 flex justify-between">
              <span className="font-bold text-gray-900">Total a Pagar Ahora:</span>
              <span className="font-bold text-primary-600 text-lg">${userPayment.toLocaleString()}</span>
            </div>

            <div className="text-xs text-gray-500 mt-2">
              <div>Saldo Restante: ${(totalPrice - depositAmount).toLocaleString()}</div>
            </div>
          </div>
        )}

        {bookingDeadlinePassed && (
          <div className="mb-4 bg-yellow-50 border border-yellow-200 rounded-md p-3 flex items-start">
            <AlertCircle className="h-5 w-5 text-yellow-600 mr-2 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-yellow-800">
              <p className="font-medium">Fecha límite de reserva vencida</p>
              <p className="mt-1">Este tour ya no acepta nuevas reservas.</p>
            </div>
          </div>
        )}

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-md p-3 flex items-start">
            <AlertCircle className="h-5 w-5 text-red-600 mr-2 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {tour.booking_approval_type === 'manual' && (
          <div className="mb-4 bg-blue-50 border border-blue-200 rounded-md p-3 flex items-start">
            <AlertCircle className="h-5 w-5 text-blue-600 mr-2 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-800">
              <p className="font-medium">Reserva con aprobación manual</p>
              <p className="mt-1">
                Esta reserva requiere aprobación de la agencia. Se te solicitará el pago una vez que tu reserva sea aprobada.
              </p>
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting || !isTraveler || bookingDeadlinePassed || availableSpots === 0 || totalTravelers === 0}
          className={`w-full py-3 px-4 rounded-md font-semibold flex items-center justify-center transition-colors ${
            isSubmitting || !isTraveler || bookingDeadlinePassed || availableSpots === 0 || totalTravelers === 0
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-primary-600 text-white hover:bg-primary-700'
          }`}
        >
          {isSubmitting ? (
            <>
              <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white mr-2"></div>
              Procesando...
            </>
          ) : tour.booking_approval_type === 'manual' ? (
            <>
              <Settings className="w-5 h-5 mr-2" />
              Enviar Solicitud de Reserva
            </>
          ) : (
            <>
              <CreditCard className="w-5 h-5 mr-2" />
              Reservar Ahora
            </>
          )}
        </button>

        {!isTraveler && user && (
          <p className="mt-3 text-sm text-red-600 text-center">
            Solo los viajeros pueden realizar reservas
          </p>
        )}
      </form>
    </div>
  );
};

export default BookingForm;
