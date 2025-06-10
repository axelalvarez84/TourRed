import React, { useState, useEffect } from 'react';
import { Calendar, MapPin, Users, DollarSign, Clock, Eye, AlertCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getUserBookings, parseDateFromDB } from '../../lib/supabase';
import { Booking } from '../../types';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';

const TravelerBookings: React.FC = () => {
  const { user } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (user?.id) {
      fetchBookings();
    }
  }, [user]);

  const fetchBookings = async () => {
    if (!user?.id) return;

    try {
      setIsLoading(true);
      setError('');
      
      console.log('🔍 Cargando reservas para usuario:', user.id);
      
      const { data, error } = await getUserBookings(user.id);
      
      if (error) {
        throw new Error(error.message);
      }
      
      console.log('✅ Reservas cargadas:', data);
      setBookings(data || []);
      
    } catch (err: any) {
      console.error('❌ Error cargando reservas:', err);
      setError(err.message || 'Error al cargar las reservas');
    } finally {
      setIsLoading(false);
    }
  };

  // Helper function to format dates consistently
  const formatDate = (dateString: string) => {
    try {
      // Check if it's a full ISO 8601 timestamp (contains 'T')
      const date = dateString.includes('T') 
        ? new Date(dateString) 
        : parseDateFromDB(dateString);
      return format(date, 'dd/MM/yyyy');
    } catch (error) {
      console.error('Error formatting date:', dateString, error);
      return format(new Date(dateString), 'dd/MM/yyyy');
    }
  };

  const formatFullDate = (dateString: string) => {
    try {
      // Check if it's a full ISO 8601 timestamp (contains 'T')
      const date = dateString.includes('T') 
        ? new Date(dateString) 
        : parseDateFromDB(dateString);
      return format(date, 'EEEE, d \'de\' MMMM \'de\' yyyy');
    } catch (error) {
      console.error('Error formatting full date:', dateString, error);
      return format(new Date(dateString), 'dd/MM/yyyy');
    }
  };

  const getStatusBadge = (status: string, paymentStatus?: string) => {
    let statusText = '';
    let statusClass = '';

    switch (status) {
      case 'pending':
        statusText = paymentStatus === 'succeeded' ? 'Confirmando' : 'Pendiente de Pago';
        statusClass = 'bg-yellow-100 text-yellow-800';
        break;
      case 'confirmed':
        statusText = 'Confirmada';
        statusClass = 'bg-green-100 text-green-800';
        break;
      case 'completed':
        statusText = 'Completada';
        statusClass = 'bg-blue-100 text-blue-800';
        break;
      case 'cancelled':
        statusText = 'Cancelada';
        statusClass = 'bg-red-100 text-red-800';
        break;
      default:
        statusText = status;
        statusClass = 'bg-gray-100 text-gray-800';
    }

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusClass}`}>
        {statusText}
      </span>
    );
  };

  const getPaymentStatusBadge = (paymentStatus?: string) => {
    if (!paymentStatus) return null;

    let statusText = '';
    let statusClass = '';

    switch (paymentStatus) {
      case 'succeeded':
        statusText = 'Pagado';
        statusClass = 'bg-green-100 text-green-800';
        break;
      case 'pending':
        statusText = 'Pendiente';
        statusClass = 'bg-yellow-100 text-yellow-800';
        break;
      case 'processing':
        statusText = 'Procesando';
        statusClass = 'bg-blue-100 text-blue-800';
        break;
      case 'failed':
        statusText = 'Falló';
        statusClass = 'bg-red-100 text-red-800';
        break;
      case 'canceled':
        statusText = 'Cancelado';
        statusClass = 'bg-gray-100 text-gray-800';
        break;
      default:
        return null;
    }

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusClass} ml-2`}>
        {statusText}
      </span>
    );
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-600"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Mis Reservas</h1>
          <p className="text-gray-600 mt-1">
            {bookings.length === 0 
              ? 'No tienes reservas aún' 
              : `${bookings.length} ${bookings.length === 1 ? 'reserva' : 'reservas'}`
            }
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-6 bg-error-50 text-error-600 p-4 rounded-md flex items-start">
          <AlertCircle className="h-5 w-5 mr-2 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium">Error al cargar reservas</p>
            <p className="text-sm">{error}</p>
            <button 
              onClick={fetchBookings}
              className="text-sm underline mt-1 hover:no-underline"
            >
              Intentar de nuevo
            </button>
          </div>
        </div>
      )}

      {bookings.length === 0 && !error ? (
        <div className="bg-white rounded-lg shadow-md p-8 text-center">
          <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold mb-2">No tienes reservas aún</h3>
          <p className="text-gray-600 mb-6">
            Cuando reserves un tour, aparecerá aquí con todos los detalles.
          </p>
          <Link to="/tours" className="btn btn-primary">
            Explorar Tours
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {bookings.map((booking) => (
            <div key={booking.id} className="bg-white rounded-lg shadow-md overflow-hidden">
              <div className="flex flex-col lg:flex-row">
                {/* Tour Image */}
                <div className="lg:w-1/3">
                  <div className="relative h-48 lg:h-full">
                    <img
                      src={booking.tours?.image_url || 'https://images.pexels.com/photos/1271619/pexels-photo-1271619.jpeg'}
                      alt={booking.tours?.name || 'Tour'}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute top-4 left-4">
                      {getStatusBadge(booking.status, booking.payment_status)}
                      {getPaymentStatusBadge(booking.payment_status)}
                    </div>
                  </div>
                </div>

                {/* Booking Details */}
                <div className="lg:w-2/3 p-6">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-xl font-semibold mb-2">
                        {booking.tours?.name || 'Tour sin nombre'}
                      </h3>
                      <div className="flex items-center text-gray-600 mb-2">
                        <MapPin className="h-4 w-4 mr-1" />
                        <span>{booking.tours?.destination || 'Destino no especificado'}</span>
                      </div>
                      <div className="flex items-center text-gray-600">
                        <Calendar className="h-4 w-4 mr-1" />
                        <span>Reservado para: {formatDate(booking.booking_date)}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-gray-500">ID de Reserva</div>
                      <div className="text-xs font-mono text-gray-600 break-all max-w-32">
                        {booking.id}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <div className="flex items-center">
                      <Users className="h-4 w-4 text-gray-400 mr-2" />
                      <div>
                        <div className="text-sm text-gray-500">Viajeros</div>
                        <div className="font-medium">{booking.travelers_count}</div>
                      </div>
                    </div>

                    <div className="flex items-center">
                      <DollarSign className="h-4 w-4 text-gray-400 mr-2" />
                      <div>
                        <div className="text-sm text-gray-500">Total Pagado</div>
                        <div className="font-medium">${booking.user_payment?.toLocaleString() || booking.deposit_amount?.toLocaleString()}</div>
                      </div>
                    </div>

                    <div className="flex items-center">
                      <Clock className="h-4 w-4 text-gray-400 mr-2" />
                      <div>
                        <div className="text-sm text-gray-500">Fecha de Reserva</div>
                        <div className="font-medium">{formatDate(booking.created_at)}</div>
                      </div>
                    </div>
                  </div>

                  {/* Payment Summary */}
                  <div className="bg-gray-50 rounded-lg p-4 mb-4">
                    <h4 className="font-medium mb-2">Resumen de Pago</h4>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <div className="text-gray-500">Precio Total del Tour:</div>
                        <div className="font-medium">${booking.total_price?.toLocaleString()}</div>
                      </div>
                      <div>
                        <div className="text-gray-500">Depósito Pagado:</div>
                        <div className="font-medium">${booking.deposit_amount?.toLocaleString()}</div>
                      </div>
                      {booking.service_charge && (
                        <div>
                          <div className="text-gray-500">Cargo por Servicio:</div>
                          <div className="font-medium">${booking.service_charge.toLocaleString()}</div>
                        </div>
                      )}
                      <div>
                        <div className="text-gray-500">Saldo Restante:</div>
                        <div className="font-medium">
                          ${((booking.total_price || 0) - (booking.deposit_amount || 0)).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col sm:flex-row gap-3">
                    <Link
                      to={`/tours/${booking.tour_id}`}
                      className="btn btn-outline flex items-center justify-center"
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      Ver Tour
                    </Link>

                    {booking.status === 'pending' && booking.payment_status !== 'succeeded' && (
                      <Link
                        to={`/tours/${booking.tour_id}`}
                        className="btn btn-primary flex items-center justify-center"
                      >
                        <DollarSign className="h-4 w-4 mr-2" />
                        Completar Pago
                      </Link>
                    )}

                    {booking.agencies?.name && (
                      <div className="text-sm text-gray-600 flex items-center">
                        <span>Operado por: <strong>{booking.agencies.name}</strong></span>
                      </div>
                    )}
                  </div>

                  {/* Important Notes */}
                  {booking.status === 'confirmed' && (
                    <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-md">
                      <p className="text-sm text-green-800">
                        <strong>¡Reserva confirmada!</strong> La agencia se pondrá en contacto contigo para coordinar los detalles del viaje.
                      </p>
                    </div>
                  )}

                  {booking.status === 'pending' && booking.payment_status === 'succeeded' && (
                    <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
                      <p className="text-sm text-blue-800">
                        <strong>Pago recibido.</strong> Tu reserva está siendo procesada y será confirmada pronto.
                      </p>
                    </div>
                  )}

                  {booking.status === 'cancelled' && (
                    <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
                      <p className="text-sm text-red-800">
                        <strong>Reserva cancelada.</strong> Si tienes preguntas, contacta a nuestro equipo de soporte.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TravelerBookings;