import React, { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { CheckCircle, Calendar, MapPin, Users, DollarSign, ArrowRight } from 'lucide-react';
import { supabase, parseDateFromDB } from '../lib/supabase';
import { Booking, Tour } from '../types';
import { format } from 'date-fns';

const BookingSuccessPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [tour, setTour] = useState<Tour | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const bookingId = searchParams.get('booking_id');
    if (bookingId) {
      fetchBookingDetails(bookingId);
    } else {
      setError('ID de reserva no encontrado');
      setIsLoading(false);
    }
  }, [searchParams]);

  const fetchBookingDetails = async (bookingId: string) => {
    try {
      setIsLoading(true);
      
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
          )
        `)
        .eq('id', bookingId)
        .single();

      if (bookingError) {
        throw new Error(bookingError.message);
      }

      setBooking(bookingData);
      setTour(bookingData.tours);

      // Update booking status to confirmed if payment was successful
      if (bookingData.payment_status === 'processing') {
        const { error: updateError } = await supabase
          .from('bookings')
          .update({ 
            status: 'confirmed',
            payment_status: 'succeeded',
            paid_at: new Date().toISOString()
          })
          .eq('id', bookingId);

        if (updateError) {
          console.error('Error updating booking status:', updateError);
        }
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
      // Parse the date from database format (YYYY-MM-DD)
      const date = parseDateFromDB(dateString);
      return format(date, 'EEEE, d \'de\' MMMM \'de\' yyyy', { locale: require('date-fns/locale/es') });
    } catch (error) {
      console.error('Error formatting date:', dateString, error);
      // Fallback to simple format
      return format(new Date(dateString), 'dd/MM/yyyy');
    }
  };

  const formatShortDate = (dateString: string) => {
    try {
      const date = parseDateFromDB(dateString);
      return format(date, 'd \'de\' MMMM', { locale: require('date-fns/locale/es') });
    } catch (error) {
      console.error('Error formatting short date:', dateString, error);
      return format(new Date(dateString), 'dd/MM');
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
                      <div className="text-sm text-gray-500">ID de Reserva</div>
                      <div className="font-medium font-mono text-xs break-all">{booking.id}</div>
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
                  
                  <div className="flex justify-between">
                    <span className="text-gray-600">Cargo por Servicio:</span>
                    <span className="font-medium">${booking.service_charge?.toLocaleString()}</span>
                  </div>
                  
                  <div className="border-t border-gray-200 pt-2 mt-2">
                    <div className="flex justify-between text-lg font-bold">
                      <span className="text-green-600">Total Pagado:</span>
                      <span className="text-green-600">${booking.user_payment?.toLocaleString()}</span>
                    </div>
                  </div>
                  
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
              <div>
                <div className="font-medium">Pago del Saldo</div>
                <div className="text-sm text-gray-600">Coordina el pago del saldo restante directamente con la agencia</div>
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