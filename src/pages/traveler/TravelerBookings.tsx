import React, { useState, useEffect } from 'react';
import { Calendar, MapPin, Users, DollarSign, Clock, Eye, AlertCircle, Star, X, Edit, UserCheck, XCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getUserBookings, parseDateFromDB, supabase, calculateCancellationPolicy, processCancellation } from '../../lib/supabase';
import { Booking } from '../../types';
import { format } from 'date-fns';
import { Link, useNavigate } from 'react-router-dom';
import ReviewForm from '../../components/ReviewForm';

const TravelerBookings: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [reviewModal, setReviewModal] = useState<{
    open: boolean;
    booking: Booking | null;
    existingReview: any;
  }>({ open: false, booking: null, existingReview: null });
  const [travelersModal, setTravelersModal] = useState<{
    open: boolean;
    booking: Booking | null;
    travelers: any[];
  }>({ open: false, booking: null, travelers: [] });
  const [cancellationModal, setCancellationModal] = useState<{
    open: boolean;
    booking: Booking | null;
    policy: any;
    isCalculating: boolean;
    isCancelling: boolean;
    cancellationReason: string;
    acceptPolicy: boolean;
    error: string;
    success: boolean;
  }>({
    open: false,
    booking: null,
    policy: null,
    isCalculating: false,
    isCancelling: false,
    cancellationReason: '',
    acceptPolicy: false,
    error: '',
    success: false,
  });

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

  const handleOpenReviewModal = async (booking: Booking) => {
    try {
      const { data: existingReview } = await supabase
        .from('agency_reviews')
        .select('*')
        .eq('booking_id', booking.id)
        .maybeSingle();

      setReviewModal({
        open: true,
        booking,
        existingReview
      });
    } catch (err) {
      console.error('Error checking for existing review:', err);
      setReviewModal({
        open: true,
        booking,
        existingReview: null
      });
    }
  };

  const handleCloseReviewModal = () => {
    setReviewModal({ open: false, booking: null, existingReview: null });
  };

  const handleReviewSuccess = () => {
    handleCloseReviewModal();
    fetchBookings();
  };

  const handleOpenTravelersModal = async (booking: Booking) => {
    try {
      const { data: travelers, error } = await supabase
        .from('booking_travelers')
        .select('*')
        .eq('booking_id', booking.id)
        .order('created_at', { ascending: true });

      if (error) throw error;

      setTravelersModal({
        open: true,
        booking,
        travelers: travelers || []
      });
    } catch (err) {
      console.error('Error loading travelers:', err);
      setTravelersModal({
        open: true,
        booking,
        travelers: []
      });
    }
  };

  const handleCloseTravelersModal = () => {
    setTravelersModal({ open: false, booking: null, travelers: [] });
  };

  const handleOpenCancellationModal = async (booking: Booking) => {
    if ((booking as any).is_no_show) {
      alert('Esta reserva ya está marcada como No Show y no puede ser cancelada.');
      return;
    }

    if ((booking as any).approval_status === 'rejected') {
      alert('Esta reserva fue rechazada por la agencia y no puede ser cancelada.');
      return;
    }

    setCancellationModal({
      open: true,
      booking,
      policy: null,
      isCalculating: true,
      isCancelling: false,
      cancellationReason: '',
      acceptPolicy: false,
      error: '',
      success: false,
    });

    try {
      const { data: fullBooking, error } = await supabase
        .from('bookings')
        .select(`
          *,
          tours:tour_id(id, name, start_date, cancellation_not_allowed)
        `)
        .eq('id', booking.id)
        .single();

      if (error || !fullBooking) {
        throw new Error('No se pudo cargar la información de la reserva');
      }

      const policy = await calculateCancellationPolicy(fullBooking);

      setCancellationModal(prev => ({
        ...prev,
        policy,
        isCalculating: false,
      }));
    } catch (err: any) {
      setCancellationModal(prev => ({
        ...prev,
        error: err.message || 'Error al calcular la política de cancelación',
        isCalculating: false,
      }));
    }
  };

  const handleCloseCancellationModal = () => {
    setCancellationModal({
      open: false,
      booking: null,
      policy: null,
      isCalculating: false,
      isCancelling: false,
      cancellationReason: '',
      acceptPolicy: false,
      error: '',
      success: false,
    });
  };

  const handleCancelBooking = async () => {
    if (!cancellationModal.booking || !cancellationModal.policy || !user?.id) return;

    if (!cancellationModal.acceptPolicy) {
      setCancellationModal(prev => ({
        ...prev,
        error: 'Debes aceptar la política de cancelación para continuar',
      }));
      return;
    }

    setCancellationModal(prev => ({
      ...prev,
      isCancelling: true,
      error: '',
    }));

    try {
      const result = await processCancellation(
        cancellationModal.booking.id,
        user.id,
        cancellationModal.cancellationReason || undefined
      );

      if (result.error) {
        throw new Error(result.error);
      }

      setCancellationModal(prev => ({
        ...prev,
        isCancelling: false,
        success: true,
      }));

      await fetchBookings();

      setTimeout(() => {
        handleCloseCancellationModal();
      }, 3000);
    } catch (err: any) {
      setCancellationModal(prev => ({
        ...prev,
        isCancelling: false,
        error: err.message || 'Error al procesar la cancelación',
      }));
    }
  };

  const canCancelBooking = (booking: Booking) => {
    if (!booking.tours) return false;

    if (booking.status === 'cancelled') return false;
    if ((booking as any).is_no_show) return false;
    if ((booking as any).approval_status === 'rejected') return false;
    if (!['pending', 'confirmed'].includes(booking.status)) return false;

    const tourStartDate = parseDateFromDB((booking.tours as any).start_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (tourStartDate < today) return false;

    return true;
  };

  const handleEditTravelers = (bookingId: string) => {
    navigate(`/booking-travelers/${bookingId}`);
  };

  const handleCompletePayment = async (booking: Booking) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        throw new Error('No hay sesión activa');
      }

      // Calcular el monto a cobrar después de aplicar ToursRed Cash
      const toursRedCashUsed = booking.toursred_cash_used || 0;
      const amountToCharge = (booking.user_payment || booking.deposit_amount) - toursRedCashUsed;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-checkout-session`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            bookingId: booking.id,
            amount: amountToCharge,
            currency: 'mxn',
            description: `Pago de reserva - ${booking.tours?.name || 'Tour'}`,
            success_url: `${window.location.origin}/booking-success?booking_id=${booking.id}`,
            cancel_url: `${window.location.origin}/traveler/bookings`,
            toursRedCashUsed: toursRedCashUsed,
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Error response:', errorText);
        throw new Error(`Error al crear la sesión de pago: ${errorText}`);
      }

      const data = await response.json();

      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error('No se recibió URL de checkout');
      }
    } catch (err: any) {
      console.error('Error al proceder al pago:', err);
      alert(`Error al proceder al pago: ${err.message}`);
    }
  };

  const getCategoryLabel = (categoria: string): string => {
    const labels: Record<string, string> = {
      adulto: 'Adulto',
      nino: 'Niño',
      infante: 'Infante',
      adulto_mayor: 'Adulto Mayor',
      mascota: 'Mascota',
    };
    return labels[categoria] || categoria;
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

  const getStatusBadge = (status: string, paymentStatus?: string, approvalStatus?: string, isNoShow?: boolean) => {
    let statusText = '';
    let statusClass = '';

    if (isNoShow) {
      statusText = 'No Show';
      statusClass = 'bg-gray-900 text-white';
    } else if (approvalStatus === 'rejected') {
      statusText = 'Rechazada';
      statusClass = 'bg-red-100 text-red-800';
    } else if (approvalStatus === 'pending') {
      statusText = 'Pendiente de Aprobación';
      statusClass = 'bg-yellow-100 text-yellow-800';
    } else {
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
                      {getStatusBadge(booking.status, booking.payment_status, (booking as any).approval_status, (booking as any).is_no_show)}
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

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
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

                    <div className="flex items-center">
                      <DollarSign className="h-4 w-4 text-gray-400 mr-2" />
                      <div>
                        <div className="text-sm text-gray-500">Método de Pago</div>
                        <div className="font-medium">{(booking as any).payment_method || 'N/A'}</div>
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
                        <div className="text-gray-500">Método de Pago:</div>
                        <div className="font-medium">{(booking as any).payment_method || 'N/A'}</div>
                      </div>
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

                    <button
                      onClick={() => handleOpenTravelersModal(booking)}
                      className="btn btn-outline flex items-center justify-center"
                    >
                      <UserCheck className="h-4 w-4 mr-2" />
                      Ver Acompañantes
                    </button>

                    {booking.status === 'pending' &&
                     booking.payment_status !== 'succeeded' &&
                     (booking as any).approval_status === 'approved' && (
                      <button
                        onClick={() => handleCompletePayment(booking)}
                        className="btn btn-primary flex items-center justify-center"
                      >
                        <DollarSign className="h-4 w-4 mr-2" />
                        Completar Pago
                      </button>
                    )}

                    {booking.status === 'confirmed' && (
                      <button
                        onClick={() => handleOpenReviewModal(booking)}
                        className="btn btn-primary flex items-center justify-center"
                      >
                        <Star className="h-4 w-4 mr-2" />
                        Dejar Reseña
                      </button>
                    )}

                    {canCancelBooking(booking) && (
                      <button
                        onClick={() => handleOpenCancellationModal(booking)}
                        className="btn btn-outline border-red-300 text-red-700 hover:bg-red-50 flex items-center justify-center"
                      >
                        <XCircle className="h-4 w-4 mr-2" />
                        Cancelar Reserva
                      </button>
                    )}

                    {booking.agencies?.name && (
                      <div className="text-sm text-gray-600 flex items-center">
                        <span>Operado por: <strong>{booking.agencies.name}</strong></span>
                      </div>
                    )}
                  </div>

                  {/* Important Notes */}
                  {(booking as any).is_no_show && (
                    <div className="mt-4 p-3 bg-gray-900 border border-gray-800 rounded-md">
                      <p className="text-sm text-white">
                        <strong>⚠️ Marcada como No Show.</strong> Esta reserva fue marcada como No Show porque no te presentaste al tour. Esta acción ha sido registrada en tu historial y puede afectar futuras reservas.
                        {(booking as any).no_show_marked_at && (
                          <span className="block mt-2 text-gray-300">
                            <strong>Fecha:</strong> {formatDate((booking as any).no_show_marked_at)}
                          </span>
                        )}
                      </p>
                    </div>
                  )}

                  {(booking as any).approval_status === 'pending' && (
                    <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                      <p className="text-sm text-yellow-800">
                        <strong>Pendiente de aprobación.</strong> La agencia está revisando tu solicitud. Te notificaremos cuando tomen una decisión.
                      </p>
                    </div>
                  )}

                  {(booking as any).approval_status === 'rejected' && (
                    <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
                      <p className="text-sm text-red-800">
                        <strong>Reserva rechazada.</strong> La agencia no pudo aprobar tu solicitud.
                        {(booking as any).approval_notes && (
                          <span className="block mt-2">
                            <strong>Motivo:</strong> {(booking as any).approval_notes}
                          </span>
                        )}
                      </p>
                    </div>
                  )}

                  {(booking as any).approval_status === 'approved' && booking.status === 'pending' && booking.payment_status !== 'succeeded' && (
                    <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-md">
                      <p className="text-sm text-green-800">
                        <strong>¡Solicitud aprobada!</strong> Tu reserva ha sido aprobada por la agencia. Ahora puedes completar el pago.
                      </p>
                    </div>
                  )}

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

      {/* Travelers Modal */}
      {travelersModal.open && travelersModal.booking && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="text-2xl font-bold mb-2">Información de Acompañantes</h2>
                  <p className="text-gray-600">
                    {travelersModal.booking.tours?.name}
                  </p>
                  <p className="text-sm text-gray-500">
                    Reserva ID: {travelersModal.booking.id.substring(0, 8)}...
                  </p>
                </div>
                <button
                  onClick={handleCloseTravelersModal}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              {travelersModal.travelers.length === 0 ? (
                <div className="text-center py-8">
                  <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">No hay información de acompañantes disponible</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {travelersModal.travelers.map((traveler, index) => (
                    <div key={traveler.id} className="border border-gray-200 rounded-lg p-4 hover:border-primary-300 transition-colors">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-semibold text-lg">
                          {getCategoryLabel(traveler.categoria_viajero)} {index + 1}
                        </h3>
                        <span className="text-sm text-gray-500 font-medium">
                          ${traveler.precio_aplicado.toLocaleString()}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                        <div>
                          <div className="text-gray-500 mb-1">Nombre Completo</div>
                          <div className="font-medium">{traveler.nombre}</div>
                        </div>
                        {traveler.categoria_viajero !== 'mascota' && (
                          <>
                            <div>
                              <div className="text-gray-500 mb-1">Fecha de Nacimiento</div>
                              <div className="font-medium">
                                {traveler.fecha_nacimiento ? formatDate(traveler.fecha_nacimiento) : 'N/A'}
                              </div>
                            </div>
                            <div>
                              <div className="text-gray-500 mb-1">Email</div>
                              <div className="font-medium">
                                <a href={`mailto:${traveler.email}`} className="text-primary-600 hover:text-primary-700">
                                  {traveler.email}
                                </a>
                              </div>
                            </div>
                            <div>
                              <div className="text-gray-500 mb-1">Teléfono</div>
                              <div className="font-medium">{traveler.telefono || 'N/A'}</div>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={handleCloseTravelersModal}
                  className="btn btn-outline"
                >
                  Cerrar
                </button>
                {travelersModal.booking && (
                  <button
                    onClick={() => {
                      handleEditTravelers(travelersModal.booking!.id);
                      handleCloseTravelersModal();
                    }}
                    className="btn btn-primary flex items-center"
                  >
                    <Edit className="h-4 w-4 mr-2" />
                    Editar Acompañantes
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Review Modal */}
      {reviewModal.open && reviewModal.booking && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="text-2xl font-bold mb-2">
                    {reviewModal.existingReview ? 'Editar Reseña' : 'Dejar Reseña'}
                  </h2>
                  <p className="text-gray-600">
                    {reviewModal.booking.tours?.name} - {reviewModal.booking.agencies?.name}
                  </p>
                </div>
                <button
                  onClick={handleCloseReviewModal}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>
              <ReviewForm
                bookingId={reviewModal.booking.id}
                revieweeId={reviewModal.booking.agency_id!}
                reviewType="agency"
                onSuccess={handleReviewSuccess}
                onCancel={handleCloseReviewModal}
                existingReview={reviewModal.existingReview}
              />
            </div>
          </div>
        </div>
      )}

      {/* Cancellation Modal */}
      {cancellationModal.open && cancellationModal.booking && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              {!cancellationModal.success ? (
                <>
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h2 className="text-2xl font-bold mb-2 text-red-600">
                        {cancellationModal.policy?.policyType === '100_percent' && 'Cancelación con Reembolso del 100%'}
                        {cancellationModal.policy?.policyType === '50_percent' && 'Cancelación con Reembolso del 50%'}
                        {cancellationModal.policy?.policyType === 'no_refund' && 'Cancelación sin Reembolso'}
                        {cancellationModal.policy?.policyType === 'no_show' && 'Advertencia: Se Marcará como No Show'}
                        {cancellationModal.policy?.policyType === 'pending_approval' && 'Cancelar Reserva Pendiente'}
                        {!cancellationModal.policy && 'Cancelar Reserva'}
                      </h2>
                      <p className="text-gray-600">
                        {cancellationModal.booking.tours?.name}
                      </p>
                    </div>
                    <button
                      onClick={handleCloseCancellationModal}
                      className="text-gray-400 hover:text-gray-600"
                      disabled={cancellationModal.isCancelling}
                    >
                      <X className="h-6 w-6" />
                    </button>
                  </div>

                  {cancellationModal.isCalculating ? (
                    <div className="flex justify-center py-8">
                      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-600"></div>
                    </div>
                  ) : cancellationModal.policy ? (
                    <>
                      <div className="mb-6">
                        <div className="bg-gray-50 p-4 rounded-lg mb-4">
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-gray-600">Días antes del tour:</span>
                            <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                              cancellationModal.policy.daysBeforeTour >= 15 ? 'bg-green-100 text-green-800' :
                              cancellationModal.policy.daysBeforeTour >= 7 ? 'bg-yellow-100 text-yellow-800' :
                              cancellationModal.policy.daysBeforeTour >= 1 ? 'bg-orange-100 text-orange-800' :
                              'bg-red-100 text-red-800'
                            }`}>
                              {cancellationModal.policy.daysBeforeTour} día(s)
                            </span>
                          </div>
                          <div className="text-sm text-gray-600">
                            Fecha del tour: {formatFullDate((cancellationModal.booking.tours as any).start_date)}
                          </div>
                        </div>

                        {cancellationModal.policy.warningMessage && (
                          <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-4">
                            <div className="flex items-start">
                              <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 mr-2 flex-shrink-0" />
                              <p className="text-sm text-red-800 font-medium">
                                {cancellationModal.policy.warningMessage}
                              </p>
                            </div>
                          </div>
                        )}

                        <div className={`p-4 rounded-lg mb-4 ${
                          cancellationModal.policy.policyType === '100_percent' ? 'bg-green-50 border-2 border-green-200' :
                          cancellationModal.policy.policyType === '50_percent' ? 'bg-yellow-50 border-2 border-yellow-200' :
                          cancellationModal.policy.policyType === 'pending_approval' ? 'bg-gray-50 border-2 border-gray-200' :
                          'bg-red-50 border-2 border-red-200'
                        }`}>
                          <h3 className={`font-semibold mb-2 ${
                            cancellationModal.policy.policyType === '100_percent' ? 'text-green-800' :
                            cancellationModal.policy.policyType === '50_percent' ? 'text-yellow-800' :
                            cancellationModal.policy.policyType === 'pending_approval' ? 'text-gray-800' :
                            'text-red-800'
                          }`}>
                            Política de Reembolso
                          </h3>
                          <p className={`text-sm ${
                            cancellationModal.policy.policyType === '100_percent' ? 'text-green-700' :
                            cancellationModal.policy.policyType === '50_percent' ? 'text-yellow-700' :
                            cancellationModal.policy.policyType === 'pending_approval' ? 'text-gray-700' :
                            'text-red-700'
                          }`}>
                            {cancellationModal.policy.refundMessage}
                          </p>
                        </div>

                        {cancellationModal.policy.originalServiceCharge > 0 && (
                          <div className="bg-orange-50 border-l-4 border-orange-400 p-4 mb-4">
                            <p className="text-sm text-orange-800">
                              <strong>Nota importante:</strong> El cargo por servicio de ${cancellationModal.policy.originalServiceCharge.toFixed(2)} no es reembolsable. Si utilizaste beneficios de ToursRed+, estos tampoco son recuperables ya que fueron cobrados por Stripe.
                            </p>
                          </div>
                        )}

                        <div className="mb-4">
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Motivo de cancelación (opcional)
                          </label>
                          <textarea
                            value={cancellationModal.cancellationReason}
                            onChange={(e) => setCancellationModal(prev => ({
                              ...prev,
                              cancellationReason: e.target.value
                            }))}
                            rows={3}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                            placeholder="¿Por qué deseas cancelar esta reserva?"
                            disabled={cancellationModal.isCancelling}
                          />
                        </div>

                        <div className="mb-4">
                          <label className="flex items-start">
                            <input
                              type="checkbox"
                              checked={cancellationModal.acceptPolicy}
                              onChange={(e) => setCancellationModal(prev => ({
                                ...prev,
                                acceptPolicy: e.target.checked,
                                error: ''
                              }))}
                              className="mt-1 h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                              disabled={cancellationModal.isCancelling}
                            />
                            <span className="ml-2 text-sm text-gray-700">
                              He leído y acepto la política de cancelación aplicable. Entiendo que esta acción no se puede deshacer.
                            </span>
                          </label>
                        </div>

                        {cancellationModal.error && (
                          <div className="mb-4 bg-red-50 border border-red-200 rounded-md p-3">
                            <div className="flex items-start">
                              <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 mr-2 flex-shrink-0" />
                              <p className="text-sm text-red-800">{cancellationModal.error}</p>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col sm:flex-row gap-3">
                        <button
                          onClick={handleCloseCancellationModal}
                          className="btn btn-outline flex-1"
                          disabled={cancellationModal.isCancelling}
                        >
                          Mantener Mi Reserva
                        </button>
                        <button
                          onClick={handleCancelBooking}
                          className="btn bg-red-600 hover:bg-red-700 text-white flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
                          disabled={!cancellationModal.acceptPolicy || cancellationModal.isCancelling}
                        >
                          {cancellationModal.isCancelling ? (
                            <>
                              <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></div>
                              Procesando...
                            </>
                          ) : (
                            <>
                              <XCircle className="h-4 w-4 mr-2" />
                              Cancelar Reserva
                            </>
                          )}
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-8">
                      <p className="text-red-600">{cancellationModal.error || 'Error al cargar la información'}</p>
                      <button
                        onClick={handleCloseCancellationModal}
                        className="btn btn-outline mt-4"
                      >
                        Cerrar
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-8">
                  <div className="mb-4 inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100">
                    <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                    </svg>
                  </div>
                  <h3 className="text-xl font-bold text-green-600 mb-2">Cancelación Exitosa</h3>
                  <p className="text-gray-600 mb-4">
                    Tu reserva ha sido cancelada exitosamente. Recibirás un correo electrónico con los detalles.
                  </p>
                  {cancellationModal.policy?.refundAmountToTraveler > 0 && (
                    <p className="text-sm text-gray-600">
                      El reembolso de ${cancellationModal.policy.refundAmountToTraveler.toFixed(2)} ha sido depositado en tu ToursRed Cash.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TravelerBookings;