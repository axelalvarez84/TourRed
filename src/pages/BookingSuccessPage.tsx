import React, { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { CheckCircle, Calendar, MapPin, Users, DollarSign, ArrowRight, CreditCard, Mail, Wallet, Award, Ticket } from 'lucide-react';
import { supabase, parseDateFromDB } from '../lib/supabase';
import { Booking, Tour } from '../types';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useAuth } from '../context/AuthContext';

const BookingSuccessPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [tour, setTour] = useState<Tour | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const { user, isLoading: authLoading } = useAuth();

  useEffect(() => {
    // Esperar a que la autenticación termine antes de cargar la reserva
    if (authLoading) {
      console.log('⏳ Esperando a que termine la autenticación...');
      return;
    }

    const bookingId = searchParams.get('booking_id');
    if (bookingId) {
      fetchBookingDetails(bookingId);
    } else {
      setError('ID de reserva no encontrado');
      setIsLoading(false);
    }
  }, [searchParams, authLoading]);

  const fetchBookingDetails = async (bookingId: string) => {
    try {
      setIsLoading(true);
      console.log('📋 Cargando detalles de la reserva:', bookingId);

      // Check if user is authenticated
      const { data: { session } } = await supabase.auth.getSession();
      console.log('🔍 Estado de sesión:', session ? 'activa' : 'no activa');

      if (!session) {
        throw new Error('No hay sesión activa. Por favor inicia sesión nuevamente.');
      }

      // Fetch booking with tour details
      const { data: bookingData, error: bookingError } = await supabase
        .from('bookings')
        .select(`
          *,
          tours(
            id,
            name,
            destination,
            image_url,
            start_date,
            end_date,
            agencies(name)
          ),
          users!bookings_user_id_fkey(email)
        `)
        .eq('id', bookingId)
        .maybeSingle();

      if (bookingError) {
        console.error('❌ Error al cargar la reserva:', bookingError);
        throw new Error(bookingError.message);
      }

      if (!bookingData) {
        throw new Error('Reserva no encontrada');
      }

      setBooking(bookingData);
      setTour(bookingData.tours);

      // Get payment method from payment_transactions
      const { data: paymentTransaction } = await supabase
        .from('payment_transactions')
        .select('payment_method_type')
        .eq('booking_id', bookingId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (paymentTransaction?.payment_method_type) {
        const methodMap: Record<string, string> = {
          'card': 'Tarjeta de Crédito/Débito',
          'toursred_cash': 'ToursRed Cash',
          'toursred_points_cash': 'Puntos ToursRed + ToursRed Cash',
          'stripe': 'Stripe'
        };
        setPaymentMethod(methodMap[paymentTransaction.payment_method_type] || paymentTransaction.payment_method_type);
      }

      // Update booking status to confirmed if payment was pending
      console.log('Current booking status:', bookingData.payment_status, 'Status:', bookingData.status);
      console.log('Booking user_id:', bookingData.user_id);

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      console.log('Current auth user id:', user?.id);

      if (bookingData.payment_status === 'pending' || bookingData.payment_status === 'processing') {
        console.log('Attempting to update booking status...');

        // Verify user owns this booking
        if (user?.id !== bookingData.user_id) {
          console.error('User ID mismatch! Auth user:', user?.id, 'Booking user:', bookingData.user_id);
        }

        const { error: updateError } = await supabase
          .from('bookings')
          .update({
            payment_status: 'succeeded',
            status: 'confirmed',
            paid_at: new Date().toISOString()
          })
          .eq('id', bookingId);

        if (updateError) {
          console.error('Error updating booking status:', {
            message: updateError.message,
            details: updateError.details,
            hint: updateError.hint,
            code: updateError.code
          });
        } else {
          console.log('Booking updated successfully!');
        }
      } else {
        console.log('Booking already paid, emails already sent');
      }

    } catch (err: any) {
      setError(err.message || 'Error al cargar los detalles de la reserva');
    } finally {
      setIsLoading(false);
    }
  };

  // Helper function to format dates consistently
  const formatDate = (dateString: string) => {
    try {
      const date = parseDateFromDB(dateString);
      return format(date, 'EEEE, d \'de\' MMMM \'de\' yyyy', { locale: es });
    } catch (error) {
      console.error('Error formatting date:', dateString, error);
      const date = parseDateFromDB(dateString);
      return format(date, 'dd/MM/yyyy');
    }
  };

  const formatShortDate = (dateString: string) => {
    try {
      const date = parseDateFromDB(dateString);
      return format(date, 'd \'de\' MMMM', { locale: es });
    } catch (error) {
      console.error('Error formatting short date:', dateString, error);
      const date = parseDateFromDB(dateString);
      return format(date, 'dd/MM');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (error || !booking || !tour) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4">
        <div className="max-w-md w-full text-center">
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold text-red-600 mb-2">Error</h2>
            <p className="text-gray-600 mb-4">{error || 'No se pudieron cargar los detalles de la reserva'}</p>
            <Link to="/traveler/bookings" className="btn btn-primary">
              Ver Mis Reservas
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        {/* Success Header */}
        <div className="text-center mb-8">
          <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-100 mb-4">
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            ¡Pago Exitoso!
          </h1>
          <p className="text-lg text-gray-600">
            Tu reserva ha sido confirmada. Recibirás un email de confirmación en breve.
          </p>
        </div>

        {/* Booking Details */}
        <div className="bg-white rounded-lg shadow-md overflow-hidden mb-6">
          <div className="relative h-48">
            <img
              src={tour.image_url}
              alt={tour.name}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-black bg-opacity-40 flex items-end">
              <div className="p-6 text-white">
                <h2 className="text-2xl font-bold mb-2">{tour.name}</h2>
                <div className="flex items-center">
                  <MapPin className="h-4 w-4 mr-1" />
                  <span>{tour.destination}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="text-lg font-semibold mb-4">Detalles de la Reserva</h3>
                <div className="space-y-3">
                  <div className="flex items-start">
                    <Calendar className="h-5 w-5 text-gray-400 mr-3 mt-1" />
                    <div>
                      <div className="text-sm text-gray-500">Fecha Seleccionada</div>
                      <div className="font-medium">{formatDate(booking.booking_date)}</div>
                    </div>
                  </div>

                  <div className="flex items-start">
                    <Calendar className="h-5 w-5 text-gray-400 mr-3 mt-1" />
                    <div>
                      <div className="text-sm text-gray-500">Duración del Tour</div>
                      <div className="font-medium">
                        {formatShortDate(tour.start_date)} - {formatShortDate(tour.end_date)}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center">
                    <Users className="h-5 w-5 text-gray-400 mr-3" />
                    <div>
                      <div className="text-sm text-gray-500">Viajeros</div>
                      <div className="font-medium">{booking.travelers_count} {booking.travelers_count === 1 ? 'persona' : 'personas'}</div>
                    </div>
                  </div>

                  <div className="flex items-start">
                    <DollarSign className="h-5 w-5 text-gray-400 mr-3 mt-1" />
                    <div>
                      <div className="text-sm text-gray-500">Código de Reserva</div>
                      <div className="font-bold text-blue-600 text-lg tracking-wide">{booking.booking_code}</div>
                    </div>
                  </div>

                  <div className="flex items-start">
                    <CreditCard className="h-5 w-5 text-gray-400 mr-3 mt-1" />
                    <div>
                      <div className="text-sm text-gray-500">Método de Pago</div>
                      <div className="font-medium">{paymentMethod || booking.payment_method || 'Tarjeta'}</div>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-4">Resumen de Pago</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Precio Total del Tour:</span>
                    <span className="font-medium">${booking.total_price?.toLocaleString()}</span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-gray-600">Depósito Pagado:</span>
                    <span className="font-medium">${booking.deposit_amount?.toLocaleString()}</span>
                  </div>

                  {booking.service_charge !== undefined && booking.service_charge !== null && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Cargo por Servicio:</span>
                      <span className="font-medium">
                        {booking.service_charge === 0 ? (
                          <span className="text-green-600">$0 (ToursRed Plus)</span>
                        ) : (
                          `$${booking.service_charge.toLocaleString()}`
                        )}
                      </span>
                    </div>
                  )}

                  {Number(booking.service_charge_discount) > 0 && (
                    <div className="flex justify-between bg-green-50 border border-green-200 rounded px-2 py-1.5 -mx-1">
                      <span className="text-green-700 font-medium flex items-center">
                        <Ticket className="h-4 w-4 mr-1" />
                        Desc. Cargo por Servicio:
                      </span>
                      <span className="font-bold text-green-600">-${Number(booking.service_charge_discount).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                  )}

                  {booking.discount_amount != null && booking.discount_amount > 0 && (
                    <div className="flex justify-between bg-green-50 border border-green-200 rounded px-2 py-1.5 -mx-1">
                      <span className="text-green-700 font-medium flex items-center">
                        <Ticket className="h-4 w-4 mr-1" />
                        Código de Descuento:
                      </span>
                      <span className="font-bold text-green-600">-${Number(booking.discount_amount).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                  )}

                  {Number(booking.points_used) > 0 && (
                    <div className="flex justify-between bg-amber-50 border border-amber-200 rounded px-2 py-1.5 -mx-1">
                      <span className="text-amber-700 font-medium flex items-center">
                        <Award className="h-4 w-4 mr-1" />
                        Puntos ToursRed Usados:
                      </span>
                      <span className="font-bold text-amber-600">-{booking.points_used.toLocaleString()} puntos (${(booking.points_used / 100).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})</span>
                    </div>
                  )}

                  {Number(booking.toursred_cash_used) > 0 && (
                    <div className="flex justify-between bg-amber-50 border border-amber-200 rounded px-2 py-1.5 -mx-1 mt-1">
                      <span className="text-amber-700 font-medium flex items-center">
                        <Wallet className="h-4 w-4 mr-1" />
                        ToursRed Cash Aplicado:
                      </span>
                      <span className="font-bold text-amber-600">-${Number(booking.toursred_cash_used).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                  )}

                  <div className="border-t border-gray-200 pt-2 mt-2">
                    <div className="flex justify-between text-lg font-bold">
                      <span className="text-green-600">Total Pagado:</span>
                      <span className="text-green-600">${booking.user_payment?.toLocaleString()}</span>
                    </div>
                    {((Number(booking.points_used) > 0) || (Number(booking.toursred_cash_used) > 0)) && (
                      <div className="text-xs text-gray-500 mt-1 text-right">
                        {Number(booking.points_used) > 0 && Number(booking.toursred_cash_used) > 0 ? (
                          <>
                            ({booking.points_used.toLocaleString()} puntos + ${Number(booking.toursred_cash_used).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ToursRed Cash + ${Math.max(0, (booking.user_payment || 0) - ((booking.points_used || 0) / 100) - Number(booking.toursred_cash_used || 0)).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Stripe)
                          </>
                        ) : Number(booking.points_used) > 0 ? (
                          <>
                            ({booking.points_used.toLocaleString()} puntos + ${Math.max(0, (booking.user_payment || 0) - (booking.points_used / 100)).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Stripe)
                          </>
                        ) : (
                          <>
                            (${Number(booking.toursred_cash_used || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ToursRed Cash + ${Math.max(0, (booking.user_payment || 0) - Number(booking.toursred_cash_used || 0)).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Stripe)
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  {Number(booking.points_earned) > 0 && (
                    <div className="flex justify-between bg-green-50 border border-green-200 rounded px-2 py-1.5 -mx-1 mt-2">
                      <span className="text-green-700 font-medium flex items-center">
                        <Award className="h-4 w-4 mr-1" />
                        Puntos ToursRed Ganados:
                      </span>
                      <span className="font-bold text-green-600">+{booking.points_earned.toLocaleString()} puntos</span>
                    </div>
                  )}

                  <div className="flex justify-between text-sm text-gray-500 mt-2">
                    <span>Saldo Restante:</span>
                    <span>${((booking.total_price || 0) - (booking.deposit_amount || 0)).toLocaleString()}</span>
                  </div>
                </div>

                <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                  <p className="text-sm text-yellow-800">
                    <strong>Importante:</strong> El saldo restante se paga directamente a {tour.agencies?.name} según sus políticas.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Next Steps */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h3 className="text-lg font-semibold mb-4">Próximos Pasos</h3>
          <div className="space-y-3">
            <div className="flex items-start">
              <div className="flex-shrink-0 w-6 h-6 bg-primary-100 rounded-full flex items-center justify-center mr-3 mt-0.5">
                <span className="text-primary-600 text-sm font-bold">1</span>
              </div>
              <div>
                <div className="font-medium">Confirmación por Email</div>
                <div className="text-sm text-gray-600">Recibirás un email con todos los detalles de tu reserva</div>
                <div className="mt-1 text-xs text-gray-500 flex items-center">
                  <Mail className="h-3 w-3 mr-1" />
                  {booking.users?.email}
                </div>
              </div>
            </div>
            
            <div className="flex items-start">
              <div className="flex-shrink-0 w-6 h-6 bg-primary-100 rounded-full flex items-center justify-center mr-3 mt-0.5">
                <span className="text-primary-600 text-sm font-bold">2</span>
              </div>
              <div>
                <div className="font-medium">Contacto de la Agencia</div>
                <div className="text-sm text-gray-600">{tour.agencies?.name} se pondrá en contacto contigo para coordinar detalles</div>
              </div>
            </div>
            
            <div className="flex items-start">
              <div className="flex-shrink-0 w-6 h-6 bg-primary-100 rounded-full flex items-center justify-center mr-3 mt-0.5">
                <span className="text-primary-600 text-sm font-bold">3</span>
              </div>
              <div className="flex-1">
                <div className="font-medium flex items-center">
                  Pago del Saldo
                  <span className="ml-2 text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full">
                    ${((booking.total_price || 0) - (booking.deposit_amount || 0)).toLocaleString()}
                  </span>
                </div>
                <div className="text-sm text-gray-600">
                  Coordina el pago del saldo restante directamente con {tour.agencies?.name}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            to="/traveler/bookings"
            className="btn btn-primary flex items-center justify-center"
          >
            Ver Mis Reservas
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
          
          <Link
            to="/tours"
            className="btn btn-outline flex items-center justify-center"
          >
            Explorar Más Tours
          </Link>
        </div>
      </div>
    </div>
  );
};

export default BookingSuccessPage;