import React, { useState, useEffect } from 'react';
import { Calendar, MapPin, Users, DollarSign, Clock, Eye, AlertCircle, Star, X, Edit, UserCheck, XCircle, CalendarX, Check, Wallet, Lock } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getUserBookings, parseDateFromDB, supabase, calculateCancellationPolicy, processCancellation } from '../../lib/supabase';
import { Booking, PendingReschedule } from '../../types';
import { format } from 'date-fns';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import ReviewForm from '../../components/ReviewForm';
import { useFormPersistence } from '../../hooks/useFormPersistence';
import { usePreventUnload } from '../../hooks/usePreventUnload';
import { validateAllTravelers } from '../../utils/birthDateValidation';

const TravelerBookings: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
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
  const [paymentModal, setPaymentModal] = useState<{
    open: boolean;
    booking: Booking | null;
    walletBalance: number;
    toursRedCashToUse: number;
    isProcessing: boolean;
  }>({
    open: false,
    booking: null,
    walletBalance: 0,
    toursRedCashToUse: 0,
    isProcessing: false,
  });
  const [rescheduleModal, setRescheduleModal] = useState<{
    open: boolean;
    booking: Booking | null;
    rescheduleInfo: PendingReschedule | null;
    isLoading: boolean;
    isProcessing: boolean;
    error: string;
    success: boolean;
    action: 'accept' | 'reject' | null;
  }>({
    open: false,
    booking: null,
    rescheduleInfo: null,
    isLoading: false,
    isProcessing: false,
    error: '',
    success: false,
    action: null,
  });
  const [pendingReschedules, setPendingReschedules] = useState<{ [bookingId: string]: PendingReschedule }>({});
  const [paymentValidationError, setPaymentValidationError] = useState<{
    open: boolean;
    bookingId: string;
    message: string;
  }>({ open: false, bookingId: '', message: '' });

  const cancellationFormPersistence = useFormPersistence(
    { cancellationReason: cancellationModal.cancellationReason },
    { key: `cancellation_${cancellationModal.booking?.id || 'temp'}`, expirationHours: 24 }
  );

  usePreventUnload(cancellationModal.open && cancellationModal.cancellationReason.length > 0);

  useEffect(() => {
    if (user?.id) {
      fetchBookings();
    }
  }, [user]);

  useEffect(() => {
    const action = searchParams.get('action');
    const bookingId = searchParams.get('booking');

    if (action && bookingId && !isLoading && bookings.length > 0) {
      const booking = bookings.find(b => b.id === bookingId);

      if (booking && booking.has_pending_reschedule && pendingReschedules[bookingId]) {
        if (action === 'accept' || action === 'reject') {
          handleOpenRescheduleModal(booking, action);
          setSearchParams({});
        }
      }
    }
  }, [searchParams, bookings, isLoading, pendingReschedules]);

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

      // Load pending reschedules for bookings that have them
      if (data && data.length > 0) {
        await loadPendingReschedules(data);
      }

    } catch (err: any) {
      console.error('❌ Error cargando reservas:', err);
      setError(err.message || 'Error al cargar las reservas');
    } finally {
      setIsLoading(false);
    }
  };

  const loadPendingReschedules = async (bookingsList: Booking[]) => {
    const reschedules: { [bookingId: string]: PendingReschedule } = {};

    for (const booking of bookingsList) {
      if (booking.has_pending_reschedule) {
        try {
          const { data, error } = await supabase.rpc('get_pending_reschedule_for_booking', {
            p_booking_id: booking.id
          });

          if (!error && data) {
            reschedules[booking.id] = data;
          }
        } catch (err) {
          console.error(`Error loading reschedule for booking ${booking.id}:`, err);
        }
      }
    }

    setPendingReschedules(reschedules);
  };

  const handleOpenRescheduleModal = (booking: Booking, action: 'accept' | 'reject') => {
    const rescheduleInfo = pendingReschedules[booking.id];

    if (!rescheduleInfo) {
      alert('No se encontró información del reagendamiento');
      return;
    }

    setRescheduleModal({
      open: true,
      booking,
      rescheduleInfo,
      isLoading: false,
      isProcessing: false,
      error: '',
      success: false,
      action,
    });
  };

  const handleCloseRescheduleModal = () => {
    setRescheduleModal({
      open: false,
      booking: null,
      rescheduleInfo: null,
      isLoading: false,
      isProcessing: false,
      error: '',
      success: false,
      action: null,
    });
  };

  const handleRespondToReschedule = async () => {
    if (!rescheduleModal.booking || !rescheduleModal.action) return;

    setRescheduleModal(prev => ({
      ...prev,
      isProcessing: true,
      error: '',
    }));

    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      const { data, error } = await supabase.functions.invoke('respond-to-reschedule', {
        body: {
          booking_id: rescheduleModal.booking.id,
          response: rescheduleModal.action === 'accept' ? 'accepted' : 'rejected'
        },
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (error) throw error;

      if (data?.success) {
        setRescheduleModal(prev => ({
          ...prev,
          isProcessing: false,
          success: true,
        }));

        await fetchBookings();

        setTimeout(() => {
          handleCloseRescheduleModal();
        }, 3000);
      } else {
        throw new Error(data?.error || 'Error al procesar la respuesta');
      }
    } catch (err: any) {
      console.error('Error responding to reschedule:', err);
      setRescheduleModal(prev => ({
        ...prev,
        isProcessing: false,
        error: err.message || 'Error al procesar la respuesta',
      }));
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

    const savedData = cancellationFormPersistence.loadFromStorage();

    setCancellationModal({
      open: true,
      booking,
      policy: null,
      isCalculating: true,
      isCancelling: false,
      cancellationReason: savedData?.cancellationReason || '',
      acceptPolicy: false,
      error: '',
      success: false,
    });

    cancellationFormPersistence.setIsRestoring(true);
    setTimeout(() => cancellationFormPersistence.setIsRestoring(false), 100);

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
    cancellationFormPersistence.clearStorage();
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

      cancellationFormPersistence.clearStorage();

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
      const { data: travelerData, error: travelerError } = await supabase
        .from('booking_travelers')
        .select('categoria_viajero, fecha_nacimiento, nombre')
        .eq('booking_id', booking.id);

      if (!travelerError && travelerData && travelerData.length > 0) {
        const tourStartDate = (booking as any).tours?.start_date || (booking as any).booking_date;
        const { isValid, errors } = validateAllTravelers(travelerData, tourStartDate);
        if (!isValid) {
          const firstErrorIdx = errors.findIndex(e => e !== '');
          const travelerName = travelerData[firstErrorIdx]?.nombre || `Viajero ${firstErrorIdx + 1}`;
          setPaymentValidationError({
            open: true,
            bookingId: booking.id,
            message: `La fecha de nacimiento de "${travelerName}" no corresponde con su categoría de viajero. Debes corregir los datos antes de pagar.`,
          });
          return;
        }
      }

      const { data: walletData } = await supabase
        .from('toursred_cash_wallets')
        .select('balance')
        .eq('user_id', user?.id)
        .maybeSingle();

      const walletBalance = walletData?.balance || 0;

      setPaymentModal({
        open: true,
        booking: booking,
        walletBalance: walletBalance,
        toursRedCashToUse: 0,
        isProcessing: false,
      });
    } catch (err: any) {
      console.error('Error al abrir modal de pago:', err);
      alert(`Error: ${err.message}`);
    }
  };

  const handleProceedWithPayment = async () => {
    const { booking, toursRedCashToUse } = paymentModal;

    if (!booking) return;

    try {
      setPaymentModal(prev => ({ ...prev, isProcessing: true }));

      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        throw new Error('No hay sesión activa');
      }

      // Actualizar la reserva con el ToursRed Cash aplicado
      if (toursRedCashToUse > 0) {
        const { error: updateError } = await supabase
          .from('bookings')
          .update({
            toursred_cash_used: toursRedCashToUse,
          })
          .eq('id', booking.id);

        if (updateError) {
          throw new Error(`Error al actualizar la reserva: ${updateError.message}`);
        }
      }

      // Calcular el monto a cobrar después de aplicar puntos ya usados y ToursRed Cash
      const originalAmount = booking.user_payment || booking.deposit_amount || 0;
      const pointsAlreadyUsed = ((booking.points_used || 0) / 100);
      const amountToCharge = originalAmount - pointsAlreadyUsed - toursRedCashToUse;

      // Si el monto es 0 o menor, confirmar directamente
      if (amountToCharge <= 0) {
        const { error: confirmError } = await supabase
          .from('bookings')
          .update({
            payment_status: 'succeeded',
            status: 'confirmed',
            payment_method: 'toursred_cash',
            updated_at: new Date().toISOString(),
          })
          .eq('id', booking.id);

        if (confirmError) {
          throw new Error(`Error al confirmar la reserva: ${confirmError.message}`);
        }

        // Descontar ToursRed Cash del monedero
        if (toursRedCashToUse > 0) {
          const { error: walletError } = await supabase.rpc(
            'update_wallet_balance',
            {
              p_user_id: user?.id,
              p_amount: -toursRedCashToUse,
              p_type: 'debit',
              p_description: `Pago de reserva para ${booking.tours?.name}`,
              p_reference_id: booking.id,
              p_reference_type: 'booking'
            }
          );

          if (walletError) {
            throw new Error(`Error al procesar el pago con ToursRed Cash: ${walletError.message}`);
          }
        }

        // Enviar notificación por email a la agencia
        try {
          await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-booking-request-notification`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`,
              },
              body: JSON.stringify({ booking_id: booking.id }),
            }
          );
        } catch (emailError) {
          console.error('Error enviando notificación a la agencia:', emailError);
        }

        // Cerrar modal y recargar reservas
        setPaymentModal({
          open: false,
          booking: null,
          walletBalance: 0,
          toursRedCashToUse: 0,
          isProcessing: false,
        });

        fetchBookings();
        alert('¡Pago completado exitosamente con ToursRed Cash!');
        return;
      }

      // Si hay monto pendiente, ir a Stripe
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
            toursRedCashUsed: toursRedCashToUse,
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
      setPaymentModal(prev => ({ ...prev, isProcessing: false }));
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
      // Extract date part if it's a timestamp (contains 'T')
      let datePart = dateString.includes('T')
        ? dateString.split('T')[0]
        : dateString;

      // Parse directly without timezone conversions
      const [year, month, day] = datePart.split('-').map(Number);
      return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
    } catch (error) {
      console.error('Error formatting date:', dateString, error);
      return dateString;
    }
  };

  const formatFullDate = (dateString: string) => {
    try {
      // Extract date part if it's a timestamp (contains 'T')
      const datePart = dateString.includes('T')
        ? dateString.split('T')[0]
        : dateString;
      const date = parseDateFromDB(datePart);
      return format(date, 'EEEE, d \'de\' MMMM \'de\' yyyy');
    } catch (error) {
      console.error('Error formatting full date:', dateString, error);
      return format(new Date(dateString), 'dd/MM/yyyy');
    }
  };

  const getPaymentMethodLabel = (method: string | null | undefined): string => {
    if (!method) return 'N/A';

    const labels: Record<string, string> = {
      'card': 'Tarjeta',
      'oxxo': 'OXXO',
      'customer_balance': 'Transferencia Bancaria',
      'toursred_cash': 'ToursRed Cash',
    };

    return labels[method] || method;
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
                        <span>Fecha del Tour: {formatDate(booking.booking_date)}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-gray-500">Código de Reserva</div>
                      <div className="text-lg font-bold text-blue-600 tracking-wide">
                        {booking.booking_code}
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
                        <div className="font-medium">{getPaymentMethodLabel((booking as any).payment_method)}</div>
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
                        <div className="font-medium">{getPaymentMethodLabel((booking as any).payment_method)}</div>
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

                  {/* Reschedule Banner */}
                  {booking.has_pending_reschedule && pendingReschedules[booking.id] && (
                    <div className="mt-4 p-4 bg-gradient-to-r from-orange-50 to-amber-50 border-2 border-orange-400 rounded-lg">
                      <div className="flex items-start gap-3">
                        <CalendarX className="h-6 w-6 text-orange-600 flex-shrink-0 mt-1" />
                        <div className="flex-1">
                          <h4 className="font-bold text-orange-900 text-lg mb-2">⚠️ Tour Reagendado - Respuesta Requerida</h4>
                          <p className="text-sm text-orange-800 mb-3">
                            <strong>Motivo:</strong> {pendingReschedules[booking.id].reschedule.reason}
                          </p>

                          <div className="grid grid-cols-2 gap-4 mb-4 bg-white/50 p-3 rounded-md">
                            <div>
                              <div className="text-xs text-gray-600 mb-1">Fecha Original:</div>
                              <div className="font-semibold text-gray-900 line-through">
                                {formatDate(pendingReschedules[booking.id].reschedule.original_start_date)}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs text-gray-600 mb-1">Nueva Fecha:</div>
                              <div className="font-semibold text-green-700">
                                {formatDate(pendingReschedules[booking.id].reschedule.new_start_date)}
                              </div>
                            </div>
                          </div>

                          <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3 mb-4">
                            <p className="text-xs text-yellow-900">
                              <strong>Fecha límite para responder:</strong>{' '}
                              {formatFullDate(pendingReschedules[booking.id].reschedule.response_deadline)}
                            </p>
                            <p className="text-xs text-yellow-800 mt-1">
                              Si no respondes antes de esta fecha, se aceptará automáticamente la nueva fecha.
                            </p>
                          </div>

                          <div className="flex gap-3">
                            <button
                              onClick={() => handleOpenRescheduleModal(booking, 'accept')}
                              className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold flex items-center justify-center gap-2 transition-colors"
                            >
                              <Check className="h-4 w-4" />
                              Acepto Nueva Fecha
                            </button>
                            <button
                              onClick={() => handleOpenRescheduleModal(booking, 'reject')}
                              className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold flex items-center justify-center gap-2 transition-colors"
                            >
                              <X className="h-4 w-4" />
                              No Puedo Asistir
                            </button>
                          </div>

                          <p className="text-xs text-gray-600 mt-3 italic">
                            💰 Si no puedes asistir, recibirás un reembolso del 100% sin penalización en tu monedero ToursRed Cash.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Reschedule Response Status */}
                  {booking.reschedule_response && (
                    <div className={`mt-4 p-3 rounded-md border ${
                      booking.reschedule_response === 'accepted' ? 'bg-green-50 border-green-200' :
                      booking.reschedule_response === 'rejected' ? 'bg-red-50 border-red-200' :
                      'bg-blue-50 border-blue-200'
                    }`}>
                      <p className={`text-sm ${
                        booking.reschedule_response === 'accepted' ? 'text-green-800' :
                        booking.reschedule_response === 'rejected' ? 'text-red-800' :
                        'text-blue-800'
                      }`}>
                        <strong>
                          {booking.reschedule_response === 'accepted' && '✓ Has aceptado la nueva fecha'}
                          {booking.reschedule_response === 'rejected' && '✗ Rechazaste el reagendamiento y recibiste reembolso'}
                          {booking.reschedule_response === 'auto_accepted' && '↻ La nueva fecha fue aceptada automáticamente'}
                        </strong>
                        {booking.reschedule_responded_at && (
                          <span className="block mt-1 text-xs">
                            Fecha de respuesta: {formatDate(booking.reschedule_responded_at)}
                          </span>
                        )}
                      </p>
                    </div>
                  )}

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
                  <p className="text-sm text-gray-500 font-mono">
                    Código de Reserva: {travelersModal.booking.booking_code}
                  </p>
                </div>
                <button
                  onClick={handleCloseTravelersModal}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              {!!(travelersModal.booking as any).tours?.name_changes_not_allowed &&
                (travelersModal.booking.payment_status === 'succeeded' ||
                  travelersModal.booking.status === 'confirmed' ||
                  travelersModal.booking.status === 'completed') && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                  <div className="flex items-center">
                    <Lock className="h-4 w-4 text-red-600 mr-2 flex-shrink-0" />
                    <p className="text-sm text-red-700">
                      Este tour no permite cambios de nombre después del pago. Si necesitas hacer un cambio, contacta directamente a la agencia.
                    </p>
                  </div>
                </div>
              )}

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
                {travelersModal.booking && (() => {
                  const isPaid = travelersModal.booking.payment_status === 'succeeded' ||
                    travelersModal.booking.status === 'confirmed' ||
                    travelersModal.booking.status === 'completed';
                  const nameChangesBlocked = !!(travelersModal.booking as any).tours?.name_changes_not_allowed && isPaid;
                  return nameChangesBlocked ? (
                    <div className="flex flex-col items-end gap-1">
                      <button
                        disabled
                        className="btn bg-gray-300 text-gray-500 cursor-not-allowed flex items-center"
                      >
                        <Lock className="h-4 w-4 mr-2" />
                        Editar Acompañantes
                      </button>
                      <span className="text-xs text-red-600">Este tour no permite cambios de nombre</span>
                    </div>
                  ) : (
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
                  );
                })()}
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

      {/* Payment Modal with ToursRed Cash */}
      {paymentModal.open && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-start mb-6">
                <h2 className="text-2xl font-bold text-gray-900">Completar Pago</h2>
                <button
                  onClick={() => setPaymentModal({ open: false, booking: null, walletBalance: 0, toursRedCashToUse: 0, isProcessing: false })}
                  className="text-gray-400 hover:text-gray-500"
                  disabled={paymentModal.isProcessing}
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              <div className="space-y-6">
                {/* Booking Details */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="font-semibold text-gray-900 mb-2">{paymentModal.booking?.tours?.name}</h3>
                  <div className="text-sm text-gray-600 space-y-1">
                    <p>Fecha del Tour: {paymentModal.booking?.booking_date && formatDate(paymentModal.booking.booking_date)}</p>
                    <p>Viajeros: {paymentModal.booking?.travelers_count}</p>
                  </div>
                </div>

                {/* Payment Summary */}
                <div className="space-y-3">
                  {(() => {
                    const discountAmount = paymentModal.booking?.discount_amount || 0;
                    const userPayment = paymentModal.booking?.user_payment || paymentModal.booking?.deposit_amount || 0;
                    const preDiscountAmount = userPayment + discountAmount;
                    const discountCode = (paymentModal.booking as any)?.discount_codes;

                    return (
                      <>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">{discountAmount > 0 ? 'Subtotal:' : 'Monto Original:'}</span>
                          <span className="font-semibold">${preDiscountAmount.toLocaleString()}</span>
                        </div>

                        {discountAmount > 0 && (
                          <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                            <div className="flex justify-between text-sm">
                              <span className="text-blue-800">
                                Descuento Aplicado{discountCode?.code ? ` (${discountCode.code})` : ''}:
                              </span>
                              <span className="font-semibold text-blue-800">-${discountAmount.toLocaleString()}</span>
                            </div>
                          </div>
                        )}

                        {discountAmount > 0 && (
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Monto con Descuento:</span>
                            <span className="font-semibold">${userPayment.toLocaleString()}</span>
                          </div>
                        )}
                      </>
                    );
                  })()}

                  {(paymentModal.booking?.points_used || 0) > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-md p-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-amber-800">ToursRed Points Aplicados:</span>
                        <span className="font-semibold text-amber-800">-${((paymentModal.booking?.points_used || 0) / 100).toFixed(2)}</span>
                      </div>
                      <p className="text-xs text-amber-700 mt-1">
                        {(paymentModal.booking?.points_used || 0).toLocaleString()} puntos ya descontados
                      </p>
                    </div>
                  )}

                  {/* ToursRed Cash Section */}
                  {paymentModal.walletBalance > 0 && (() => {
                    const originalAmount = paymentModal.booking?.user_payment || paymentModal.booking?.deposit_amount || 0;
                    const pointsAlreadyUsed = ((paymentModal.booking?.points_used || 0) / 100);
                    const remainingAmount = originalAmount - pointsAlreadyUsed;

                    return (
                      <>
                        <div className="border-t pt-3">
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-sm font-medium text-gray-700">Tu Saldo ToursRed Cash:</span>
                            <span className="text-lg font-bold text-green-600">${paymentModal.walletBalance.toLocaleString()}</span>
                          </div>

                          <div className="mt-4">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Usar ToursRed Cash
                            </label>
                            <div className="flex gap-2">
                              <input
                                type="number"
                                min="0"
                                max={Math.min(paymentModal.walletBalance, remainingAmount)}
                                value={paymentModal.toursRedCashToUse}
                                onChange={(e) => {
                                  const value = parseFloat(e.target.value) || 0;
                                  const maxAmount = Math.min(paymentModal.walletBalance, remainingAmount);
                                  setPaymentModal(prev => ({
                                    ...prev,
                                    toursRedCashToUse: Math.min(Math.max(0, value), maxAmount)
                                  }));
                                }}
                                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
                                disabled={paymentModal.isProcessing}
                              />
                              <button
                                onClick={() => {
                                  const maxAmount = Math.min(paymentModal.walletBalance, remainingAmount);
                                  setPaymentModal(prev => ({
                                    ...prev,
                                    toursRedCashToUse: maxAmount
                                  }));
                                }}
                                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
                                disabled={paymentModal.isProcessing}
                              >
                                Usar Todo
                              </button>
                            </div>
                            <p className="mt-1 text-xs text-gray-500">
                              Máximo: ${Math.min(paymentModal.walletBalance, remainingAmount).toLocaleString()}
                            </p>
                          </div>
                        </div>

                        {paymentModal.toursRedCashToUse > 0 && (
                          <div className="bg-green-50 border border-green-200 rounded-md p-3">
                            <div className="flex justify-between text-sm">
                              <span className="text-green-800">ToursRed Cash Aplicado:</span>
                              <span className="font-semibold text-green-800">-${paymentModal.toursRedCashToUse.toLocaleString()}</span>
                            </div>
                          </div>
                        )}
                      </>
                    );
                  })()}

                  <div className="border-t pt-3">
                    <div className="flex justify-between text-lg font-bold">
                      <span>Total a Pagar{paymentModal.toursRedCashToUse > 0 ? ' con Stripe' : ''}:</span>
                      <span className="text-primary-600">
                        ${(() => {
                          const originalAmount = paymentModal.booking?.user_payment || paymentModal.booking?.deposit_amount || 0;
                          const pointsAlreadyUsed = ((paymentModal.booking?.points_used || 0) / 100);
                          const remainingAmount = originalAmount - pointsAlreadyUsed;
                          return Math.max(0, remainingAmount - paymentModal.toursRedCashToUse).toLocaleString();
                        })()}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3 pt-4">
                  <button
                    onClick={() => setPaymentModal({ open: false, booking: null, walletBalance: 0, toursRedCashToUse: 0, isProcessing: false })}
                    className="flex-1 px-4 py-3 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    disabled={paymentModal.isProcessing}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleProceedWithPayment}
                    className="flex-1 px-4 py-3 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={paymentModal.isProcessing}
                  >
                    {paymentModal.isProcessing ? (
                      <>
                        <div className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></div>
                        Procesando...
                      </>
                    ) : (
                      <>
                        {(() => {
                          const originalAmount = paymentModal.booking?.user_payment || paymentModal.booking?.deposit_amount || 0;
                          const pointsAlreadyUsed = ((paymentModal.booking?.points_used || 0) / 100);
                          const remainingAmount = originalAmount - pointsAlreadyUsed;
                          const finalAmount = remainingAmount - paymentModal.toursRedCashToUse;
                          return finalAmount <= 0 ? 'Confirmar Pago' : 'Proceder a Stripe';
                        })()}
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {paymentValidationError.open && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <div className="flex items-start mb-4">
              <AlertCircle className="h-6 w-6 text-red-600 mr-3 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">Error de Validacion</h3>
                <p className="text-sm text-gray-700">{paymentValidationError.message}</p>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setPaymentValidationError({ open: false, bookingId: '', message: '' })}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              >
                Cerrar
              </button>
              <button
                onClick={() => {
                  setPaymentValidationError({ open: false, bookingId: '', message: '' });
                  navigate(`/booking-travelers/${paymentValidationError.bookingId}`);
                }}
                className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 flex items-center justify-center"
              >
                <Edit className="h-4 w-4 mr-2" />
                Editar Viajeros
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reschedule Modal */}
      {rescheduleModal.open && rescheduleModal.booking && rescheduleModal.rescheduleInfo && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              {!rescheduleModal.success ? (
                <>
                  <div className="flex items-start justify-between mb-6">
                    <div className="flex items-start gap-4">
                      <div className={`p-3 rounded-full ${
                        rescheduleModal.action === 'accept' ? 'bg-green-100' : 'bg-red-100'
                      }`}>
                        {rescheduleModal.action === 'accept' ? (
                          <Check className={`h-8 w-8 text-green-600`} />
                        ) : (
                          <X className={`h-8 w-8 text-red-600`} />
                        )}
                      </div>
                      <div>
                        <h2 className={`text-2xl font-bold mb-2 ${
                          rescheduleModal.action === 'accept' ? 'text-green-900' : 'text-red-900'
                        }`}>
                          {rescheduleModal.action === 'accept' ? 'Aceptar Nueva Fecha' : 'Rechazar Reagendamiento'}
                        </h2>
                        <p className="text-gray-600">{rescheduleModal.booking.tours?.name}</p>
                        <p className="text-sm text-gray-500 font-mono">
                          Código: {rescheduleModal.booking.booking_code}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={handleCloseRescheduleModal}
                      className="text-gray-400 hover:text-gray-600"
                      disabled={rescheduleModal.isProcessing}
                    >
                      <X className="h-6 w-6" />
                    </button>
                  </div>

                  {/* Date Comparison */}
                  <div className="bg-gray-50 rounded-lg p-4 mb-6">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-sm text-gray-600 mb-2">Fecha Original</div>
                        <div className="font-semibold text-gray-900 line-through">
                          {formatFullDate(rescheduleModal.rescheduleInfo.reschedule.original_start_date)}
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-gray-600 mb-2">Nueva Fecha</div>
                        <div className="font-semibold text-green-700">
                          {formatFullDate(rescheduleModal.rescheduleInfo.reschedule.new_start_date)}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Reason */}
                  <div className="bg-blue-50 border-l-4 border-blue-400 p-4 mb-6">
                    <h3 className="font-semibold text-blue-900 mb-2">Motivo del cambio:</h3>
                    <p className="text-sm text-blue-800">
                      {rescheduleModal.rescheduleInfo.reschedule.reason}
                    </p>
                  </div>

                  {/* Action-specific information */}
                  {rescheduleModal.action === 'accept' ? (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
                      <h3 className="font-semibold text-green-900 mb-3">✓ Al aceptar la nueva fecha:</h3>
                      <ul className="space-y-2 text-sm text-green-800">
                        <li className="flex items-start gap-2">
                          <Check className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
                          <span>Tu reserva se actualizará automáticamente con la nueva fecha</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <Check className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
                          <span>No hay cargos adicionales, tu pago sigue siendo válido</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <Check className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
                          <span>Recibirás un email de confirmación con los nuevos detalles</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <Check className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
                          <span>No necesitas realizar ninguna acción adicional</span>
                        </li>
                      </ul>
                    </div>
                  ) : (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                      <h3 className="font-semibold text-red-900 mb-3">💰 Al rechazar el reagendamiento:</h3>
                      <ul className="space-y-2 text-sm text-red-800">
                        <li className="flex items-start gap-2">
                          <DollarSign className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
                          <span>
                            Recibirás un <strong>reembolso del 100%</strong> de tu depósito (
                            ${rescheduleModal.booking.deposit_amount?.toLocaleString()} MXN)
                          </span>
                        </li>
                        {Number(rescheduleModal.booking.toursred_cash_used || 0) > 0 && (
                          <li className="flex items-start gap-2">
                            <DollarSign className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
                            <span>
                              También se reembolsará el ToursRed Cash utilizado (
                              ${Number(rescheduleModal.booking.toursred_cash_used).toLocaleString()} MXN)
                            </span>
                          </li>
                        )}
                        <li className="flex items-start gap-2">
                          <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
                          <span>
                            <strong>No hay penalización</strong> por rechazar debido al reagendamiento de la agencia
                          </span>
                        </li>
                        <li className="flex items-start gap-2">
                          <Wallet className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
                          <span>
                            El reembolso se depositará en tu monedero ToursRed Cash y podrás usarlo en futuras reservas
                          </span>
                        </li>
                        <li className="flex items-start gap-2">
                          <XCircle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
                          <span>Tu reserva será cancelada automáticamente</span>
                        </li>
                      </ul>
                    </div>
                  )}

                  {rescheduleModal.error && (
                    <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-4">
                      <div className="flex items-start gap-3">
                        <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                        <p className="text-sm text-red-800">{rescheduleModal.error}</p>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row gap-3 pt-4">
                    <button
                      onClick={handleCloseRescheduleModal}
                      className="flex-1 px-6 py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-semibold disabled:opacity-50"
                      disabled={rescheduleModal.isProcessing}
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleRespondToReschedule}
                      className={`flex-1 px-6 py-3 rounded-lg text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${
                        rescheduleModal.action === 'accept'
                          ? 'bg-green-600 hover:bg-green-700'
                          : 'bg-red-600 hover:bg-red-700'
                      }`}
                      disabled={rescheduleModal.isProcessing}
                    >
                      {rescheduleModal.isProcessing ? (
                        <>
                          <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                          <span>Procesando...</span>
                        </>
                      ) : rescheduleModal.action === 'accept' ? (
                        <>
                          <Check className="h-5 w-5" />
                          <span>Confirmar: Acepto Nueva Fecha</span>
                        </>
                      ) : (
                        <>
                          <X className="h-5 w-5" />
                          <span>Confirmar: Solicitar Reembolso</span>
                        </>
                      )}
                    </button>
                  </div>
                </>
              ) : (
                <div className="text-center py-12">
                  <div className={`inline-flex items-center justify-center w-20 h-20 rounded-full mb-6 ${
                    rescheduleModal.action === 'accept' ? 'bg-green-100' : 'bg-blue-100'
                  }`}>
                    {rescheduleModal.action === 'accept' ? (
                      <Check className="h-10 w-10 text-green-600" />
                    ) : (
                      <DollarSign className="h-10 w-10 text-blue-600" />
                    )}
                  </div>

                  <h3 className={`text-2xl font-bold mb-3 ${
                    rescheduleModal.action === 'accept' ? 'text-green-600' : 'text-blue-600'
                  }`}>
                    {rescheduleModal.action === 'accept' ? '¡Nueva Fecha Aceptada!' : '¡Reembolso Procesado!'}
                  </h3>

                  <p className="text-gray-600 mb-6 max-w-md mx-auto">
                    {rescheduleModal.action === 'accept'
                      ? 'Tu reserva ha sido actualizada exitosamente con la nueva fecha. Recibirás un email de confirmación.'
                      : 'Tu reembolso ha sido procesado y depositado en tu monedero ToursRed Cash. Recibirás un email con los detalles.'}
                  </p>

                  <div className="bg-gray-50 rounded-lg p-4 max-w-md mx-auto">
                    <p className="text-sm text-gray-600">
                      {rescheduleModal.action === 'accept'
                        ? `Nueva fecha del tour: ${formatFullDate(rescheduleModal.rescheduleInfo.reschedule.new_start_date)}`
                        : 'Puedes ver tu nuevo saldo en la sección de ToursRed Cash'}
                    </p>
                  </div>
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