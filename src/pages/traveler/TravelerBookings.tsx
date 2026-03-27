import React, { useState, useEffect } from 'react';
import { Calendar, MapPin, Users, DollarSign, Clock, Eye, AlertCircle, Star, X, CreditCard as Edit, UserCheck, XCircle, CalendarX, Check, Wallet, Lock, UserMinus, Car, Globe } from 'lucide-react';
import SeatReselectionModal from '../../components/SeatReselectionModal';
import { useAuth } from '../../context/AuthContext';
import TravelerCfdiList from '../../components/TravelerCfdiList';
import { getUserBookings, parseDateFromDB, supabase, calculateCancellationPolicy, processCancellation, calculatePartialCancellationPolicy, processPartialCancellation, PartialCancellationTraveler } from '../../lib/supabase';
import { Booking, PendingReschedule } from '../../types';
import { format } from 'date-fns';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import ReviewForm from '../../components/ReviewForm';
import { useFormPersistence } from '../../hooks/useFormPersistence';
import { usePreventUnload } from '../../hooks/usePreventUnload';
import { formatCurrency, formatCurrencyMXN } from '../../utils/formatCurrency';
import { validateAllTravelers } from '../../utils/birthDateValidation';
import PaymentProviderSelector from '../../components/PaymentProviderSelector';
import MercadoPagoBrick from '../../components/MercadoPagoBrick';

const TravelerBookings: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [highlightedBookingId, setHighlightedBookingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [bookingOptionalServices, setBookingOptionalServices] = useState<Record<string, any[]>>({});
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
  const [partialCancellationModal, setPartialCancellationModal] = useState<{
    open: boolean;
    booking: Booking | null;
    travelers: PartialCancellationTraveler[];
    selectedIds: Set<string>;
    policy: any;
    isCalculating: boolean;
    isCancelling: boolean;
    cancellationReason: string;
    acceptPolicy: boolean;
    error: string;
    success: boolean;
    refundAmount: number;
  }>({
    open: false,
    booking: null,
    travelers: [],
    selectedIds: new Set(),
    policy: null,
    isCalculating: false,
    isCancelling: false,
    cancellationReason: '',
    acceptPolicy: false,
    error: '',
    success: false,
    refundAmount: 0,
  });

  const [paymentModal, setPaymentModal] = useState<{
    open: boolean;
    booking: Booking | null;
    walletBalance: number;
    toursRedCashToUse: number;
    isProcessing: boolean;
    selectedProvider: 'stripe' | 'mercadopago' | 'paypal';
  }>({
    open: false,
    booking: null,
    walletBalance: 0,
    toursRedCashToUse: 0,
    isProcessing: false,
    selectedProvider: 'stripe',
  });
  const [mpBrickModal, setMpBrickModal] = useState<{
    open: boolean;
    preferenceId: string;
    publicKey: string;
    bookingId: string;
    amount: number;
  } | null>(null);
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
  const [pendingSlotReschedules, setPendingSlotReschedules] = useState<{ [bookingId: string]: any }>({});
  const [slotRescheduleModal, setSlotRescheduleModal] = useState<{
    open: boolean;
    booking: Booking | null;
    slotRescheduleInfo: any | null;
    action: 'accept' | 'reject' | null;
    isProcessing: boolean;
    error: string;
    success: boolean;
  }>({
    open: false,
    booking: null,
    slotRescheduleInfo: null,
    action: null,
    isProcessing: false,
    error: '',
    success: false,
  });
  const [paymentValidationError, setPaymentValidationError] = useState<{
    open: boolean;
    bookingId: string;
    message: string;
  }>({ open: false, bookingId: '', message: '' });
  const [seatReselectionModal, setSeatReselectionModal] = useState<{
    open: boolean;
    bookingId: string;
    tourId: string;
    slotId: string;
    travelersCount: number;
    previousSeats: number[];
    tourName: string;
    newDate: string;
    newTime: string;
  } | null>(null);

  const cancellationFormPersistence = useFormPersistence(
    { cancellationReason: cancellationModal.cancellationReason },
    { key: `cancellation_${cancellationModal.booking?.id || 'temp'}`, expirationHours: 24 }
  );

  usePreventUnload(cancellationModal.open && cancellationModal.cancellationReason.length > 0);

  useEffect(() => {
    if (user?.id) {
      fetchBookings();
    }
  }, [user?.id]);

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

  useEffect(() => {
    const bookingId = searchParams.get('booking');
    const action = searchParams.get('action');
    if (bookingId && !action && !isLoading && bookings.length > 0) {
      setHighlightedBookingId(bookingId);
      setTimeout(() => {
        const el = document.getElementById(`booking-${bookingId}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
      setTimeout(() => setHighlightedBookingId(null), 3000);
    }
  }, [searchParams, bookings, isLoading]);

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

      // Load optional services for all bookings
      if (data && data.length > 0) {
        const ids = data.map((b: any) => b.id);
        const { data: optSvcs } = await supabase
          .from('booking_optional_services')
          .select(`
            *,
            tour_optional_services(name, is_refundable)
          `)
          .in('booking_id', ids);

        if (optSvcs) {
          const grouped: Record<string, any[]> = {};
          for (const bos of optSvcs) {
            if (!grouped[bos.booking_id]) grouped[bos.booking_id] = [];
            grouped[bos.booking_id].push(bos);
          }
          setBookingOptionalServices(grouped);
        }
      }

      // Load pending reschedules for bookings that have them
      if (data && data.length > 0) {
        await loadPendingReschedules(data);
        await loadPendingSlotReschedules(data);
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

  const loadPendingSlotReschedules = async (bookingsList: Booking[]) => {
    const slotReschedules: { [bookingId: string]: any } = {};

    for (const booking of bookingsList) {
      if ((booking as any).has_pending_slot_reschedule) {
        try {
          const { data, error } = await supabase
            .from('slot_reschedule_responses')
            .select(`
              *,
              slot_reschedule_requests!inner(
                id, resolution_type, reason, response_deadline, status,
                target_slot_id,
                tour_slots!slot_reschedule_requests_target_slot_id_fkey(slot_date, departure_time)
              )
            `)
            .eq('booking_id', booking.id)
            .eq('response', 'pending')
            .maybeSingle();

          if (!error && data) {
            slotReschedules[booking.id] = data;
          }
        } catch (err) {
          console.error(`Error loading slot reschedule for booking ${booking.id}:`, err);
        }
      }
    }

    setPendingSlotReschedules(slotReschedules);
  };

  const handleOpenSlotRescheduleModal = (booking: Booking, action: 'accept' | 'reject') => {
    const slotRescheduleInfo = pendingSlotReschedules[booking.id];
    if (!slotRescheduleInfo) {
      alert('No se encontro informacion del reagendamiento');
      return;
    }
    setSlotRescheduleModal({
      open: true,
      booking,
      slotRescheduleInfo,
      action,
      isProcessing: false,
      error: '',
      success: false,
    });
  };

  const handleRespondToSlotReschedule = async () => {
    if (!slotRescheduleModal.booking || !slotRescheduleModal.action) return;

    setSlotRescheduleModal(prev => ({ ...prev, isProcessing: true, error: '' }));

    try {
      const { data, error } = await supabase.functions.invoke('respond-to-slot-reschedule', {
        body: {
          booking_id: slotRescheduleModal.booking!.id,
          response: slotRescheduleModal.action === 'accept' ? 'accepted' : 'rejected',
        },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Error al procesar la respuesta');

      setSlotRescheduleModal(prev => ({ ...prev, isProcessing: false, success: true }));
      await fetchBookings();

      if (slotRescheduleModal.action === 'accept' && data?.needs_seat_reselection) {
        const booking = slotRescheduleModal.booking as any;
        const targetSlot = slotRescheduleModal.slotRescheduleInfo?.slot_reschedule_requests?.tour_slots;
        setTimeout(() => {
          setSlotRescheduleModal(prev => ({ ...prev, open: false }));
          setSeatReselectionModal({
            open: true,
            bookingId: booking.id,
            tourId: booking.tour_id,
            slotId: slotRescheduleModal.slotRescheduleInfo?.slot_reschedule_requests?.target_slot_id || '',
            travelersCount: booking.travelers_count || 1,
            previousSeats: booking.selected_seats || [],
            tourName: booking.tours?.name || booking.tour_name || '',
            newDate: targetSlot?.slot_date || data.new_date || '',
            newTime: targetSlot?.departure_time || data.new_time || '',
          });
        }, 1500);
      } else {
        setTimeout(() => {
          setSlotRescheduleModal(prev => ({ ...prev, open: false }));
        }, 3000);
      }
    } catch (err: any) {
      setSlotRescheduleModal(prev => ({
        ...prev,
        isProcessing: false,
        error: err.message || 'Error al procesar la respuesta',
      }));
    }
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
        .select('*, is_cancelled, cancelled_at')
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
          tours:tour_id(id, name, start_date, cancellation_not_allowed, tour_type, flexible_hours, flexible_refund_percentage, moderate_hours, moderate_refund_percentage)
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

  const canPartialCancelBooking = (booking: Booking) => {
    if (!booking.tours) return false;
    if (booking.status === 'cancelled') return false;
    if ((booking as any).is_no_show) return false;
    if ((booking as any).approval_status === 'rejected') return false;
    if (!['confirmed'].includes(booking.status)) return false;
    if (booking.payment_status !== 'succeeded') return false;

    const activeTravelersCount = (booking as any).active_travelers_count ?? booking.travelers_count;
    if (!activeTravelersCount || activeTravelersCount < 2) return false;

    const tourStartDate = parseDateFromDB((booking.tours as any).start_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (tourStartDate < today) return false;

    return true;
  };

  const handleOpenPartialCancellationModal = async (booking: Booking) => {
    setPartialCancellationModal({
      open: true,
      booking,
      travelers: [],
      selectedIds: new Set(),
      policy: null,
      isCalculating: true,
      isCancelling: false,
      cancellationReason: '',
      acceptPolicy: false,
      error: '',
      success: false,
      refundAmount: 0,
    });

    try {
      const { data: travelersData, error } = await supabase
        .from('booking_travelers')
        .select('id, nombre, categoria_viajero, precio_aplicado, promo_discount_per_traveler')
        .eq('booking_id', booking.id)
        .eq('is_cancelled', false)
        .order('created_at', { ascending: true });

      if (error) throw error;

      setPartialCancellationModal(prev => ({
        ...prev,
        travelers: (travelersData || []).map((t: any) => ({
          id: t.id,
          nombre: t.nombre,
          categoria_viajero: t.categoria_viajero,
          precio_aplicado: Number(t.precio_aplicado),
          promo_discount_per_traveler: Number(t.promo_discount_per_traveler) || 0,
        })),
        isCalculating: false,
      }));
    } catch (err: any) {
      setPartialCancellationModal(prev => ({
        ...prev,
        error: err.message || 'Error al cargar los viajeros',
        isCalculating: false,
      }));
    }
  };

  const handleClosePartialCancellationModal = () => {
    setPartialCancellationModal({
      open: false,
      booking: null,
      travelers: [],
      selectedIds: new Set(),
      policy: null,
      isCalculating: false,
      isCancelling: false,
      cancellationReason: '',
      acceptPolicy: false,
      error: '',
      success: false,
      refundAmount: 0,
    });
  };

  const handleTogglePartialTraveler = async (travelerId: string) => {
    const newSelected = new Set(partialCancellationModal.selectedIds);
    if (newSelected.has(travelerId)) {
      newSelected.delete(travelerId);
    } else {
      newSelected.add(travelerId);
    }

    const selectedTravelers = partialCancellationModal.travelers.filter(t => newSelected.has(t.id));

    if (selectedTravelers.length === 0) {
      setPartialCancellationModal(prev => ({
        ...prev,
        selectedIds: newSelected,
        policy: null,
        refundAmount: 0,
      }));
      return;
    }

    setPartialCancellationModal(prev => ({ ...prev, selectedIds: newSelected, isCalculating: true }));

    try {
      const { data: fullBooking } = await supabase
        .from('bookings')
        .select('*, tours:tour_id(id, name, start_date, cancellation_not_allowed)')
        .eq('id', partialCancellationModal.booking!.id)
        .single();

      if (!fullBooking) throw new Error('No se pudo cargar la reserva');

      const policy = await calculatePartialCancellationPolicy(fullBooking, selectedTravelers);

      setPartialCancellationModal(prev => ({
        ...prev,
        policy,
        refundAmount: policy.refundAmountToTraveler,
        isCalculating: false,
      }));
    } catch (err: any) {
      setPartialCancellationModal(prev => ({
        ...prev,
        policy: null,
        refundAmount: 0,
        isCalculating: false,
        error: err.message || 'Error al calcular la política',
      }));
    }
  };

  const handleProcessPartialCancellation = async () => {
    if (!partialCancellationModal.booking || !user?.id) return;
    if (!partialCancellationModal.acceptPolicy) {
      setPartialCancellationModal(prev => ({
        ...prev,
        error: 'Debes aceptar la política de cancelación para continuar',
      }));
      return;
    }

    const selectedTravelers = partialCancellationModal.travelers.filter(
      t => partialCancellationModal.selectedIds.has(t.id)
    );

    if (selectedTravelers.length === 0) {
      setPartialCancellationModal(prev => ({ ...prev, error: 'Selecciona al menos un viajero para cancelar' }));
      return;
    }

    if (selectedTravelers.length >= partialCancellationModal.travelers.length) {
      setPartialCancellationModal(prev => ({
        ...prev,
        error: 'No puedes cancelar todos los viajeros. Usa la cancelación total de la reserva.',
      }));
      return;
    }

    setPartialCancellationModal(prev => ({ ...prev, isCancelling: true, error: '' }));

    try {
      const result = await processPartialCancellation(
        partialCancellationModal.booking.id,
        user.id,
        selectedTravelers,
        partialCancellationModal.cancellationReason || undefined
      );

      if (result.error) throw new Error(result.error);

      setPartialCancellationModal(prev => ({ ...prev, isCancelling: false, success: true }));
      await fetchBookings();

      setTimeout(() => {
        handleClosePartialCancellationModal();
      }, 3000);
    } catch (err: any) {
      setPartialCancellationModal(prev => ({
        ...prev,
        isCancelling: false,
        error: err.message || 'Error al procesar la cancelación parcial',
      }));
    }
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
        selectedProvider: 'stripe',
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
          selectedProvider: 'stripe',
        });

        fetchBookings();
        alert('¡Pago completado exitosamente con ToursRed Cash!');
        return;
      }

      const { selectedProvider } = paymentModal;

      if (selectedProvider === 'mercadopago') {
        const mpResponse = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-mercadopago-preference`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              bookingId: booking.id,
              customerEmail: user?.email,
              amount: amountToCharge,
              description: `Depósito para ${booking.tours?.name || 'Tour'}`,
              context: 'booking',
            }),
          }
        );

        if (!mpResponse.ok) {
          const errorData = await mpResponse.json();
          throw new Error(errorData.error || 'Error al crear preferencia de MercadoPago');
        }

        const mpResult = await mpResponse.json();
        if (!mpResult.success) throw new Error(mpResult.error || 'Error al crear preferencia de MercadoPago');
        if (mpResult.preference_id && mpResult.public_key) {
          setPaymentModal({ open: false, booking: null, walletBalance: 0, toursRedCashToUse: 0, isProcessing: false, selectedProvider: 'stripe' });
          setMpBrickModal({ open: true, preferenceId: mpResult.preference_id, publicKey: mpResult.public_key, bookingId: booking.id, amount: amountToCharge });
        } else if (mpResult.url) {
          window.location.href = mpResult.url;
        } else {
          throw new Error('No se recibió la información de MercadoPago');
        }
      } else if (selectedProvider === 'paypal') {
        const ppResponse = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-paypal-order`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              bookingId: booking.id,
              amount: amountToCharge,
              description: `Depósito para ${booking.tours?.name || 'Tour'}`,
              context: 'booking',
            }),
          }
        );

        if (!ppResponse.ok) {
          const errorData = await ppResponse.json();
          throw new Error(errorData.error || 'Error al crear orden de PayPal');
        }

        const ppResult = await ppResponse.json();
        if (!ppResult.success) throw new Error(ppResult.error || 'Error al crear orden de PayPal');
        if (ppResult.url) {
          window.location.href = ppResult.url;
        } else {
          throw new Error('No se recibió la URL de PayPal');
        }
      } else {
        // Stripe
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
            <div
              key={booking.id}
              id={`booking-${booking.id}`}
              className={`bg-white rounded-lg shadow-md overflow-hidden transition-all duration-700 ${highlightedBookingId === booking.id ? 'ring-4 ring-blue-400 ring-offset-2' : ''}`}
            >
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
                        <span>
                          Fecha del Tour: {(booking as any).selected_date ? formatDate((booking as any).selected_date) : formatDate(booking.booking_date)}
                          {(booking as any).selected_time && (
                            <span className="ml-1 font-medium text-gray-800">
                              a las {(booking as any).selected_time.slice(0, 5)}
                            </span>
                          )}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-gray-500">Código de Reserva</div>
                      <div className="text-lg font-bold text-blue-600 tracking-wide">
                        {booking.booking_code}
                      </div>
                    </div>
                  </div>

                  {(booking as any).has_partial_cancellations && (
                    <div className="mb-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-100 text-orange-800 text-xs font-medium">
                      <UserMinus className="h-3 w-3" />
                      Cancelación parcial aplicada &mdash; {(booking as any).active_travelers_count ?? booking.travelers_count} de {booking.travelers_count} viajeros activos
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                    <div className="flex items-center">
                      <Users className="h-4 w-4 text-gray-400 mr-2" />
                      <div>
                        <div className="text-sm text-gray-500">Viajeros</div>
                        <div className="font-medium">
                          {(booking as any).has_partial_cancellations
                            ? `${(booking as any).active_travelers_count ?? booking.travelers_count} activos`
                            : booking.travelers_count}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center">
                      <DollarSign className="h-4 w-4 text-gray-400 mr-2" />
                      <div>
                        <div className="text-sm text-gray-500">Total Pagado</div>
                        <div className="font-medium">{formatCurrencyMXN(booking.user_payment ?? booking.deposit_amount ?? 0)}</div>
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

                  {/* Pickup & Language Info - Receptivo tours */}
                  {((booking as any).pickup_type || (booking as any).selected_language) && (
                    <div className="bg-teal-50 border border-teal-200 rounded-lg p-4 mb-4">
                      <h4 className="font-medium mb-3 flex items-center gap-2 text-teal-800">
                        <Car className="h-4 w-4" />
                        Traslado e Idioma
                      </h4>
                      <div className="space-y-2">
                        {(booking as any).pickup_type && (
                          <div className="flex items-start gap-2">
                            <MapPin className="h-4 w-4 text-teal-600 mt-0.5 flex-shrink-0" />
                            <div>
                              <span className="text-xs text-teal-700 font-medium">Tipo de traslado: </span>
                              <span className="text-sm text-gray-800">
                                {(booking as any).pickup_type === 'meeting_point'
                                  ? 'Me presento en el punto de encuentro'
                                  : 'Recogida en hotel solicitada'}
                              </span>
                            </div>
                          </div>
                        )}
                        {(booking as any).pickup_type === 'pickup' && (booking as any).pickup_zone_name && (
                          <div className="flex items-start gap-2">
                            <Car className="h-4 w-4 text-teal-600 mt-0.5 flex-shrink-0" />
                            <div>
                              <span className="text-xs text-teal-700 font-medium">Zona / Hotel: </span>
                              <span className="text-sm text-gray-800">{(booking as any).pickup_zone_name}</span>
                              {(booking as any).pickup_zone_extra_cost > 0 && (
                                <span className="ml-2 text-xs bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded">
                                  +${(booking as any).pickup_zone_extra_cost} {(booking as any).pickup_cost_type === 'por_persona' ? '/persona' : '/reserva'}
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                        {(booking as any).selected_language && (
                          <div className="flex items-start gap-2">
                            <Globe className="h-4 w-4 text-teal-600 mt-0.5 flex-shrink-0" />
                            <div>
                              <span className="text-xs text-teal-700 font-medium">Idioma del tour: </span>
                              <span className="text-sm text-gray-800 capitalize">{(booking as any).selected_language}</span>
                              {(booking as any).language_extra_cost > 0 && (
                                <span className="ml-2 text-xs bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded">
                                  +${(booking as any).language_extra_cost} {(booking as any).language_cost_type === 'fijo' ? 'fijo' : '/persona'}
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Optional Services */}
                  {bookingOptionalServices[booking.id] && bookingOptionalServices[booking.id].length > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
                      <h4 className="font-medium mb-2 flex items-center gap-2 text-amber-800">
                        <span>Servicios Adicionales Contratados</span>
                      </h4>
                      <div className="space-y-2">
                        {bookingOptionalServices[booking.id].map((bos: any) => (
                          <div key={bos.id} className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                              <span className={bos.is_cancelled ? 'line-through text-gray-400' : 'text-gray-800'}>
                                {bos.tour_optional_services?.name} × {bos.quantity}
                              </span>
                              {!bos.tour_optional_services?.is_refundable && !bos.is_cancelled && (
                                <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded">No reembolsable</span>
                              )}
                              {bos.is_cancelled && (
                                <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                                  {bos.cancelled_by_agency ? 'Cancelado por agencia' : 'Cancelado'}
                                </span>
                              )}
                            </div>
                            <div className="text-right">
                              <span className={`font-medium ${bos.is_cancelled ? 'text-gray-400' : 'text-amber-700'}`}>
                                {formatCurrencyMXN(Number(bos.subtotal))}
                              </span>
                              {bos.is_cancelled && bos.refund_amount > 0 && (
                                <span className="block text-xs text-green-600">
                                  Reembolso: {formatCurrencyMXN(Number(bos.refund_amount))}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Payment Summary */}
                  <div className="bg-gray-50 rounded-lg p-4 mb-4">
                    <h4 className="font-medium mb-2">Resumen de Pago</h4>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <div className="text-gray-500">Precio Total del Tour:</div>
                        <div className="font-medium">{formatCurrencyMXN(booking.total_price ?? 0)}</div>
                      </div>
                      <div>
                        <div className="text-gray-500">Depósito Pagado:</div>
                        <div className="font-medium">{formatCurrencyMXN(booking.deposit_amount ?? 0)}</div>
                      </div>
                      {booking.service_charge && (
                        <div>
                          <div className="text-gray-500">Cargo por Servicio:</div>
                          <div className="font-medium">{formatCurrencyMXN(booking.service_charge)}</div>
                        </div>
                      )}
                      <div>
                        <div className="text-gray-500">Método de Pago:</div>
                        <div className="font-medium">{getPaymentMethodLabel((booking as any).payment_method)}</div>
                      </div>
                      <div>
                        <div className="text-gray-500">Saldo Restante:</div>
                        <div className="font-medium">
                          {formatCurrencyMXN((booking.total_price || 0) - (booking.deposit_amount || 0))}
                        </div>
                      </div>
                      {(booking as any).paypal_transaction_id && (
                        <div className="col-span-2">
                          <div className="text-gray-500">ID de Transacción PayPal:</div>
                          <div className="font-medium font-mono text-xs tracking-wide">{(booking as any).paypal_transaction_id}</div>
                        </div>
                      )}
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

                    {canPartialCancelBooking(booking) && (
                      <button
                        onClick={() => handleOpenPartialCancellationModal(booking)}
                        className="btn btn-outline border-orange-300 text-orange-700 hover:bg-orange-50 flex items-center justify-center"
                      >
                        <UserMinus className="h-4 w-4 mr-2" />
                        Cancelar Viajeros
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

                  {/* Slot Reschedule Pending Alert */}
                  {(booking as any).has_pending_slot_reschedule && (() => {
                    const slotInfo = pendingSlotReschedules[booking.id];
                    const newSlot = slotInfo?.slot_reschedule_requests?.tour_slots;
                    const reason = slotInfo?.slot_reschedule_requests?.reason;
                    const deadline = slotInfo?.slot_reschedule_requests?.response_deadline;
                    const newDate = newSlot?.slot_date;
                    const newTime = newSlot?.departure_time;
                    return (
                      <div className="mt-4 p-4 bg-gradient-to-r from-blue-50 to-sky-50 border-2 border-blue-400 rounded-lg">
                        <div className="flex items-start gap-3">
                          <Clock className="h-6 w-6 text-blue-600 flex-shrink-0 mt-1" />
                          <div className="flex-1">
                            <h4 className="font-bold text-blue-900 text-base mb-1">Cambio de horario pendiente - Respuesta requerida</h4>
                            {reason && (
                              <p className="text-sm text-blue-800 mb-3">
                                <strong>Motivo:</strong> {reason}
                              </p>
                            )}

                            <div className="grid grid-cols-2 gap-4 mb-3 bg-white/60 p-3 rounded-md">
                              <div>
                                <div className="text-xs text-gray-600 mb-1">Horario anterior:</div>
                                <div className="font-semibold text-gray-900 line-through text-sm">
                                  {(booking as any).selected_date || booking.booking_date}
                                  {(booking as any).selected_time && ` ${(booking as any).selected_time.slice(0, 5)}`}
                                </div>
                              </div>
                              <div>
                                <div className="text-xs text-gray-600 mb-1">Nuevo horario:</div>
                                {newDate ? (
                                  <div className="font-semibold text-green-700 text-sm">
                                    {newDate}{newTime && ` ${newTime.slice(0, 5)}`}
                                  </div>
                                ) : (
                                  <div className="text-sm text-gray-500 italic">Cargando...</div>
                                )}
                              </div>
                            </div>

                            {deadline && (
                              <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3 mb-4">
                                <p className="text-xs text-yellow-900">
                                  <strong>Plazo para responder:</strong>{' '}
                                  {new Date(deadline).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}
                                </p>
                                <p className="text-xs text-yellow-800 mt-1">
                                  Si no respondes antes de ese plazo, el nuevo horario se aceptara automaticamente.
                                </p>
                              </div>
                            )}

                            <div className="flex gap-3">
                              <button
                                onClick={() => handleOpenSlotRescheduleModal(booking as any, 'accept')}
                                disabled={!slotInfo}
                                className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-semibold flex items-center justify-center gap-2 transition-colors text-sm"
                              >
                                <Check className="h-4 w-4" />
                                Acepto el nuevo horario
                              </button>
                              <button
                                onClick={() => handleOpenSlotRescheduleModal(booking as any, 'reject')}
                                disabled={!slotInfo}
                                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-semibold flex items-center justify-center gap-2 transition-colors text-sm"
                              >
                                <X className="h-4 w-4" />
                                No puedo asistir
                              </button>
                            </div>

                            <p className="text-xs text-gray-600 mt-3 italic">
                              Si rechazas, recibiras un reembolso del 100% en tu ToursRed Cash de forma inmediata.
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Seat Reselection Required */}
                  {(booking as any).needs_seat_reselection && booking.status !== 'cancelled' && (
                    <div className="mt-4 p-4 bg-amber-50 border-2 border-amber-400 rounded-xl">
                      <div className="flex items-start gap-3">
                        <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <p className="font-semibold text-amber-900 text-sm">Debes seleccionar nuevos asientos</p>
                          <p className="text-xs text-amber-800 mt-1 mb-3">
                            Tus asientos anteriores ({((booking as any).previous_selected_seats || []).sort((a: number, b: number) => a - b).join(', ')}) ya no estan disponibles en el nuevo horario. Por favor elige nuevos asientos.
                          </p>
                          <button
                            onClick={() => {
                              const b = booking as any;
                              setSeatReselectionModal({
                                open: true,
                                bookingId: b.id,
                                tourId: b.tour_id,
                                slotId: b.slot_id || '',
                                travelersCount: b.travelers_count || 1,
                                previousSeats: b.previous_selected_seats || [],
                                tourName: b.tours?.name || b.tour_name || '',
                                newDate: b.selected_date || '',
                                newTime: b.selected_time || '',
                              });
                            }}
                            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-semibold transition-colors flex items-center gap-2"
                          >
                            <MapPin className="h-4 w-4" />
                            Seleccionar asientos
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Slot Reschedule Response Status */}
                  {!(booking as any).has_pending_slot_reschedule && (booking as any).slot_reschedule_response && !(booking as any).needs_seat_reselection && (
                    <div className={`mt-4 p-3 rounded-md border ${
                      (booking as any).slot_reschedule_response === 'accepted' ? 'bg-green-50 border-green-200' :
                      (booking as any).slot_reschedule_response === 'rejected' ? 'bg-red-50 border-red-200' :
                      'bg-blue-50 border-blue-200'
                    }`}>
                      <p className={`text-sm ${
                        (booking as any).slot_reschedule_response === 'accepted' ? 'text-green-800' :
                        (booking as any).slot_reschedule_response === 'rejected' ? 'text-red-800' :
                        'text-blue-800'
                      }`}>
                        <strong>
                          {(booking as any).slot_reschedule_response === 'accepted' && '✓ Aceptaste el cambio de horario'}
                          {(booking as any).slot_reschedule_response === 'rejected' && '✗ Rechazaste el cambio de horario y recibiste reembolso'}
                          {(booking as any).slot_reschedule_response === 'auto_accepted' && '✓ El cambio de horario fue aceptado automaticamente'}
                        </strong>
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
                    <div key={traveler.id} className={`border rounded-lg p-4 transition-colors ${(traveler as any).is_cancelled ? 'border-red-200 bg-red-50 opacity-75' : 'border-gray-200 hover:border-primary-300'}`}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <h3 className={`font-semibold text-lg ${(traveler as any).is_cancelled ? 'line-through text-gray-400' : ''}`}>
                            {getCategoryLabel(traveler.categoria_viajero)} {index + 1}
                          </h3>
                          {(traveler as any).is_cancelled && (
                            <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">Cancelado</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {Number((traveler as any).promo_discount_per_traveler) > 0 ? (
                            <span className="flex items-center gap-1.5">
                              <span className="text-sm text-gray-400 line-through">
                                {formatCurrencyMXN(Number(traveler.precio_aplicado) + Number((traveler as any).promo_discount_per_traveler))}
                              </span>
                              <span className={`text-sm font-bold ${(traveler as any).is_cancelled ? 'text-gray-400 line-through' : 'text-emerald-600'}`}>
                                {formatCurrencyMXN(Number(traveler.precio_aplicado))}
                              </span>
                            </span>
                          ) : (
                            <span className={`text-sm font-medium ${(traveler as any).is_cancelled ? 'text-gray-400 line-through' : 'text-gray-500'}`}>
                              {formatCurrencyMXN(Number(traveler.precio_aplicado))}
                            </span>
                          )}
                        </div>
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
                              <strong>Nota importante:</strong> El cargo por servicio de ${formatCurrencyMXN(cancellationModal.policy.originalServiceCharge)} no es reembolsable. Si utilizaste beneficios de ToursRed+, estos tampoco son recuperables ya que fueron cobrados por Stripe.
                            </p>
                          </div>
                        )}

                        {(cancellationModal.policy as any).optionalServicesNonRefundable > 0 && (
                          <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-4">
                            <p className="text-sm text-red-800 font-semibold mb-1">Servicios opcionales NO reembolsables:</p>
                            <p className="text-sm text-red-700">
                              Tienes ${formatCurrencyMXN((cancellationModal.policy as any).optionalServicesNonRefundable as number)} en servicios adicionales marcados como no reembolsables. Al cancelar, este monto <strong>no se devolverá</strong>, ya que fue contratado con esa condición.
                            </p>
                            {(cancellationModal.policy as any).optionalServicesRefundable > 0 && (
                              <p className="text-sm text-red-600 mt-1">
                                Los servicios reembolsables (${formatCurrencyMXN((cancellationModal.policy as any).optionalServicesRefundable as number)}) sí se devuelven.
                              </p>
                            )}
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
                      El reembolso de ${formatCurrencyMXN(cancellationModal.policy.refundAmountToTraveler)} ha sido depositado en tu ToursRed Cash.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Partial Cancellation Modal */}
      {partialCancellationModal.open && partialCancellationModal.booking && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              {!partialCancellationModal.success ? (
                <>
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h2 className="text-xl font-bold text-orange-700 flex items-center gap-2">
                        <UserMinus className="h-5 w-5" />
                        Cancelar Viajeros
                      </h2>
                      <p className="text-gray-600 text-sm mt-1">{partialCancellationModal.booking.tours?.name}</p>
                    </div>
                    <button
                      onClick={handleClosePartialCancellationModal}
                      className="text-gray-400 hover:text-gray-600"
                      disabled={partialCancellationModal.isCancelling}
                    >
                      <X className="h-6 w-6" />
                    </button>
                  </div>

                  <p className="text-sm text-gray-600 mb-4">
                    Selecciona los viajeros que deseas cancelar. La reserva continuará activa para los viajeros restantes.
                  </p>

                  {partialCancellationModal.isCalculating && partialCancellationModal.travelers.length === 0 ? (
                    <div className="flex justify-center py-8">
                      <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-orange-500"></div>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-2 mb-5">
                        {partialCancellationModal.travelers.map((traveler) => {
                          const isSelected = partialCancellationModal.selectedIds.has(traveler.id);
                          const categoryLabels: Record<string, string> = {
                            adulto: 'Adulto', nino: 'Niño', infante: 'Infante', adulto_mayor: 'Adulto Mayor'
                          };
                          return (
                            <button
                              key={traveler.id}
                              onClick={() => handleTogglePartialTraveler(traveler.id)}
                              disabled={partialCancellationModal.isCancelling || partialCancellationModal.isCalculating}
                              className={`w-full flex items-center justify-between p-3 rounded-lg border-2 transition-all text-left ${
                                isSelected
                                  ? 'border-orange-400 bg-orange-50'
                                  : 'border-gray-200 bg-white hover:border-gray-300'
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                                  isSelected ? 'bg-orange-500 border-orange-500' : 'border-gray-300'
                                }`}>
                                  {isSelected && (
                                    <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                                      <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                    </svg>
                                  )}
                                </div>
                                <div>
                                  <div className="font-medium text-gray-900 text-sm">{traveler.nombre}</div>
                                  <div className="text-xs text-gray-500">{categoryLabels[traveler.categoria_viajero] || traveler.categoria_viajero}</div>
                                </div>
                              </div>
                              <div className="text-right">
                                {Number((traveler as any).promo_discount_per_traveler) > 0 ? (
                                  <>
                                    <div className="flex items-center gap-1.5 justify-end">
                                      <span className="text-xs text-gray-400 line-through">${formatCurrencyMXN(Number(traveler.precio_aplicado) + Number((traveler as any).promo_discount_per_traveler))}</span>
                                      <span className="font-semibold text-sm text-emerald-600">${formatCurrencyMXN(Number(traveler.precio_aplicado))}</span>
                                    </div>
                                    <div className="text-xs text-gray-500">precio pagado</div>
                                  </>
                                ) : (
                                  <>
                                    <div className="font-semibold text-sm text-gray-800">${formatCurrencyMXN(Number(traveler.precio_aplicado))}</div>
                                    <div className="text-xs text-gray-500">precio pagado</div>
                                  </>
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>

                      {partialCancellationModal.selectedIds.size === partialCancellationModal.travelers.length && partialCancellationModal.travelers.length > 0 && (
                        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
                          <p className="text-sm text-red-800 font-medium">
                            Has seleccionado todos los viajeros. Para cancelar toda la reserva, usa el botón "Cancelar Reserva".
                          </p>
                        </div>
                      )}

                      {partialCancellationModal.isCalculating && partialCancellationModal.selectedIds.size > 0 && (
                        <div className="mb-4 flex items-center gap-2 text-sm text-gray-500">
                          <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-orange-500"></div>
                          Calculando política...
                        </div>
                      )}

                      {partialCancellationModal.policy && partialCancellationModal.selectedIds.size > 0 && !partialCancellationModal.isCalculating && (
                        <div className={`p-4 rounded-lg mb-4 border-2 ${
                          partialCancellationModal.policy.policyType === '100_percent'
                            ? 'bg-green-50 border-green-200'
                            : partialCancellationModal.policy.policyType === '50_percent'
                            ? 'bg-yellow-50 border-yellow-200'
                            : 'bg-red-50 border-red-200'
                        }`}>
                          <div className="flex justify-between items-start mb-2">
                            <h3 className={`font-semibold text-sm ${
                              partialCancellationModal.policy.policyType === '100_percent' ? 'text-green-800' :
                              partialCancellationModal.policy.policyType === '50_percent' ? 'text-yellow-800' : 'text-red-800'
                            }`}>
                              {partialCancellationModal.policy.policyType === '100_percent' && 'Reembolso del 100%'}
                              {partialCancellationModal.policy.policyType === '50_percent' && 'Reembolso del 50%'}
                              {partialCancellationModal.policy.policyType === 'no_refund' && 'Sin Reembolso'}
                            </h3>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              partialCancellationModal.policy.daysBeforeTour >= 15 ? 'bg-green-100 text-green-800' :
                              partialCancellationModal.policy.daysBeforeTour >= 7 ? 'bg-yellow-100 text-yellow-800' :
                              'bg-red-100 text-red-800'
                            }`}>
                              {partialCancellationModal.policy.daysBeforeTour} día(s) antes
                            </span>
                          </div>
                          <div className="space-y-1 text-sm mb-2">
                            <div className="flex justify-between">
                              <span className="text-gray-600">Anticipo de viajeros cancelados:</span>
                              <span className="font-medium">${formatCurrencyMXN(Number(partialCancellationModal.policy.originalPartialAmount))}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600">Reembolso a ToursRed Cash:</span>
                              <span className={`font-bold ${partialCancellationModal.policy.refundAmountToTraveler > 0 ? 'text-green-700' : 'text-red-600'}`}>
                                ${formatCurrencyMXN(Number(partialCancellationModal.policy.refundAmountToTraveler))}
                              </span>
                            </div>
                          </div>
                          <p className={`text-xs mt-1 ${
                            partialCancellationModal.policy.policyType === '100_percent' ? 'text-green-700' :
                            partialCancellationModal.policy.policyType === '50_percent' ? 'text-yellow-700' : 'text-red-700'
                          }`}>
                            {partialCancellationModal.policy.refundMessage}
                          </p>
                        </div>
                      )}

                      {partialCancellationModal.selectedIds.size > 0 && (
                        <>
                          <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Motivo de cancelación (opcional)
                            </label>
                            <textarea
                              value={partialCancellationModal.cancellationReason}
                              onChange={(e) => setPartialCancellationModal(prev => ({ ...prev, cancellationReason: e.target.value }))}
                              rows={2}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-orange-400 focus:border-orange-400"
                              placeholder="¿Por qué cancelas estos viajeros?"
                              disabled={partialCancellationModal.isCancelling}
                            />
                          </div>

                          <div className="mb-4">
                            <label className="flex items-start gap-2">
                              <input
                                type="checkbox"
                                checked={partialCancellationModal.acceptPolicy}
                                onChange={(e) => setPartialCancellationModal(prev => ({ ...prev, acceptPolicy: e.target.checked, error: '' }))}
                                className="mt-1 h-4 w-4 text-orange-500 focus:ring-orange-400 border-gray-300 rounded"
                                disabled={partialCancellationModal.isCancelling}
                              />
                              <span className="text-sm text-gray-700">
                                He leído y acepto la política de cancelación. Entiendo que los viajeros seleccionados serán removidos permanentemente de la reserva y el reembolso se acreditará en mi ToursRed Cash.
                              </span>
                            </label>
                          </div>
                        </>
                      )}

                      {partialCancellationModal.error && (
                        <div className="mb-4 bg-red-50 border border-red-200 rounded-md p-3 flex items-start gap-2">
                          <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                          <p className="text-sm text-red-800">{partialCancellationModal.error}</p>
                        </div>
                      )}

                      <div className="flex flex-col sm:flex-row gap-3">
                        <button
                          onClick={handleClosePartialCancellationModal}
                          className="btn btn-outline flex-1"
                          disabled={partialCancellationModal.isCancelling}
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={handleProcessPartialCancellation}
                          disabled={
                            partialCancellationModal.selectedIds.size === 0 ||
                            partialCancellationModal.selectedIds.size === partialCancellationModal.travelers.length ||
                            !partialCancellationModal.acceptPolicy ||
                            partialCancellationModal.isCancelling ||
                            partialCancellationModal.isCalculating ||
                            !partialCancellationModal.policy
                          }
                          className="btn bg-orange-600 hover:bg-orange-700 text-white flex-1 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                        >
                          {partialCancellationModal.isCancelling ? (
                            <>
                              <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></div>
                              Procesando...
                            </>
                          ) : (
                            <>
                              <UserMinus className="h-4 w-4 mr-2" />
                              Cancelar {partialCancellationModal.selectedIds.size > 0 ? `${partialCancellationModal.selectedIds.size} viajero(s)` : 'Viajeros'}
                            </>
                          )}
                        </button>
                      </div>
                    </>
                  )}
                </>
              ) : (
                <div className="text-center py-8">
                  <div className="mb-4 inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100">
                    <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                    </svg>
                  </div>
                  <h3 className="text-xl font-bold text-green-600 mb-2">Cancelación Parcial Exitosa</h3>
                  <p className="text-gray-600 mb-2">Los viajeros han sido removidos de tu reserva.</p>
                  {partialCancellationModal.policy?.refundAmountToTraveler > 0 && (
                    <p className="text-sm text-gray-600">
                      El reembolso de ${formatCurrencyMXN(Number(partialCancellationModal.policy.refundAmountToTraveler))} ha sido acreditado en tu ToursRed Cash.
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
                  onClick={() => setPaymentModal({ open: false, booking: null, walletBalance: 0, toursRedCashToUse: 0, isProcessing: false, selectedProvider: 'stripe' })}
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

                {/* Payment Provider Selector */}
                {(() => {
                  const originalAmount = paymentModal.booking?.user_payment || paymentModal.booking?.deposit_amount || 0;
                  const pointsAlreadyUsed = ((paymentModal.booking?.points_used || 0) / 100);
                  const finalAmount = originalAmount - pointsAlreadyUsed - paymentModal.toursRedCashToUse;
                  if (finalAmount > 0) {
                    return (
                      <PaymentProviderSelector
                        context="booking"
                        value={paymentModal.selectedProvider}
                        onChange={(provider) => setPaymentModal(prev => ({ ...prev, selectedProvider: provider }))}
                        disabled={paymentModal.isProcessing}
                      />
                    );
                  }
                  return null;
                })()}

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
                          <span className="font-semibold">{formatCurrencyMXN(preDiscountAmount)}</span>
                        </div>

                        {discountAmount > 0 && (
                          <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                            <div className="flex justify-between text-sm">
                              <span className="text-blue-800">
                                Descuento Aplicado{discountCode?.code ? ` (${discountCode.code})` : ''}:
                              </span>
                              <span className="font-semibold text-blue-800">-{formatCurrencyMXN(discountAmount)}</span>
                            </div>
                          </div>
                        )}

                        {discountAmount > 0 && (
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Monto con Descuento:</span>
                            <span className="font-semibold">{formatCurrencyMXN(userPayment)}</span>
                          </div>
                        )}
                      </>
                    );
                  })()}

                  {(paymentModal.booking?.points_used || 0) > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-md p-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-amber-800">ToursRed Points Aplicados:</span>
                        <span className="font-semibold text-amber-800">-${formatCurrencyMXN((paymentModal.booking?.points_used || 0) / 100)}</span>
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
                            <span className="text-lg font-bold text-green-600">{formatCurrencyMXN(paymentModal.walletBalance)}</span>
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
                              Máximo: {formatCurrencyMXN(Math.min(paymentModal.walletBalance, remainingAmount))}
                            </p>
                          </div>
                        </div>

                        {paymentModal.toursRedCashToUse > 0 && (
                          <div className="bg-green-50 border border-green-200 rounded-md p-3">
                            <div className="flex justify-between text-sm">
                              <span className="text-green-800">ToursRed Cash Aplicado:</span>
                              <span className="font-semibold text-green-800">-{formatCurrencyMXN(paymentModal.toursRedCashToUse)}</span>
                            </div>
                          </div>
                        )}
                      </>
                    );
                  })()}

                  <div className="border-t pt-3">
                    <div className="flex justify-between text-lg font-bold">
                      <span>Total a Pagar{paymentModal.toursRedCashToUse > 0 ? ` con ${paymentModal.selectedProvider === 'mercadopago' ? 'MercadoPago' : paymentModal.selectedProvider === 'paypal' ? 'PayPal' : 'Stripe'}` : ''}:</span>
                      <span className="text-primary-600">
                        {formatCurrencyMXN((() => {
                          const originalAmount = paymentModal.booking?.user_payment || paymentModal.booking?.deposit_amount || 0;
                          const pointsAlreadyUsed = ((paymentModal.booking?.points_used || 0) / 100);
                          const remainingAmount = originalAmount - pointsAlreadyUsed;
                          return Math.max(0, remainingAmount - paymentModal.toursRedCashToUse);
                        })())}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3 pt-4">
                  <button
                    onClick={() => setPaymentModal({ open: false, booking: null, walletBalance: 0, toursRedCashToUse: 0, isProcessing: false, selectedProvider: 'stripe' })}
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
                          if (finalAmount <= 0) return 'Confirmar Pago';
                          if (paymentModal.selectedProvider === 'mercadopago') return 'Pagar con MercadoPago';
                          if (paymentModal.selectedProvider === 'paypal') return 'Proceder a PayPal';
                          return 'Proceder a Stripe';
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

      {mpBrickModal?.open && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Completa tu pago</h2>
                  <p className="text-sm text-gray-500 mt-1">Pago seguro con MercadoPago</p>
                </div>
                <button
                  onClick={() => setMpBrickModal(null)}
                  className="text-gray-400 hover:text-gray-500"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>
              <MercadoPagoBrick
                preferenceId={mpBrickModal.preferenceId}
                publicKey={mpBrickModal.publicKey}
                amount={mpBrickModal.amount}
                onSuccess={() => {
                  setMpBrickModal(null);
                  fetchBookings();
                  navigate(`/booking-success?booking_id=${mpBrickModal.bookingId}`);
                }}
                onPending={() => {
                  setMpBrickModal(null);
                  fetchBookings();
                  navigate(`/payment-return?provider=mercadopago&booking_id=${mpBrickModal.bookingId}&tr_status=pending`);
                }}
                onError={(err) => {
                  setMpBrickModal(null);
                  alert(`Error en el pago: ${err}`);
                }}
              />
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
                            {formatCurrencyMXN(rescheduleModal.booking.deposit_amount ?? 0)} MXN)
                          </span>
                        </li>
                        {Number(rescheduleModal.booking.toursred_cash_used || 0) > 0 && (
                          <li className="flex items-start gap-2">
                            <DollarSign className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
                            <span>
                              También se reembolsará el ToursRed Cash utilizado (
                              {formatCurrencyMXN(Number(rescheduleModal.booking.toursred_cash_used))} MXN)
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

      {/* Modal de Cambio de Horario (Slot Reschedule) */}
      {slotRescheduleModal.open && slotRescheduleModal.booking && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            {slotRescheduleModal.success ? (
              <div className="text-center py-8">
                <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full mb-4 ${slotRescheduleModal.action === 'accept' ? 'bg-green-100' : 'bg-blue-100'}`}>
                  {slotRescheduleModal.action === 'accept'
                    ? <Check className="h-8 w-8 text-green-600" />
                    : <DollarSign className="h-8 w-8 text-blue-600" />
                  }
                </div>
                <h3 className={`text-xl font-bold mb-2 ${slotRescheduleModal.action === 'accept' ? 'text-green-700' : 'text-blue-700'}`}>
                  {slotRescheduleModal.action === 'accept' ? 'Nuevo horario aceptado' : 'Reembolso procesado'}
                </h3>
                <p className="text-sm text-gray-600">
                  {slotRescheduleModal.action === 'accept'
                    ? 'Tu reserva ha sido actualizada con el nuevo horario.'
                    : 'El reembolso del 100% fue depositado en tu ToursRed Cash.'}
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-start gap-3 mb-5">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${slotRescheduleModal.action === 'accept' ? 'bg-green-100' : 'bg-red-100'}`}>
                    {slotRescheduleModal.action === 'accept'
                      ? <Check className="h-5 w-5 text-green-600" />
                      : <X className="h-5 w-5 text-red-600" />
                    }
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">
                      {slotRescheduleModal.action === 'accept' ? 'Confirmar aceptacion del nuevo horario' : 'Confirmar rechazo y solicitar reembolso'}
                    </h2>
                    <p className="text-sm text-gray-500 mt-0.5">
                      {slotRescheduleModal.action === 'accept'
                        ? 'Tu reserva sera movida al nuevo horario indicado.'
                        : 'Tu reserva sera cancelada y recibiras un reembolso del 100% en ToursRed Cash.'}
                    </p>
                  </div>
                </div>

                {slotRescheduleModal.slotRescheduleInfo && (
                  <div className="bg-gray-50 rounded-lg p-4 mb-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Horario anterior:</span>
                      <span className="font-medium text-gray-700 line-through">
                        {slotRescheduleModal.booking.selected_date} {slotRescheduleModal.booking.selected_time?.slice(0, 5)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Nuevo horario:</span>
                      <span className="font-medium text-green-700">
                        {slotRescheduleModal.slotRescheduleInfo.slot_reschedule_requests?.tour_slots?.slot_date}{' '}
                        {slotRescheduleModal.slotRescheduleInfo.slot_reschedule_requests?.tour_slots?.departure_time?.slice(0, 5)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Motivo:</span>
                      <span className="text-gray-700 text-right max-w-[200px]">
                        {slotRescheduleModal.slotRescheduleInfo.slot_reschedule_requests?.reason}
                      </span>
                    </div>
                  </div>
                )}

                {slotRescheduleModal.error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800 flex items-center gap-2 mb-4">
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />{slotRescheduleModal.error}
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setSlotRescheduleModal(prev => ({ ...prev, open: false }))}
                    disabled={slotRescheduleModal.isProcessing}
                    className="flex-1 btn btn-outline"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleRespondToSlotReschedule}
                    disabled={slotRescheduleModal.isProcessing}
                    className={`flex-1 btn text-white disabled:opacity-50 ${slotRescheduleModal.action === 'accept' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}
                  >
                    {slotRescheduleModal.isProcessing ? (
                      <><div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></div>Procesando...</>
                    ) : slotRescheduleModal.action === 'accept' ? (
                      <><Check className="h-4 w-4 mr-2" />Aceptar nuevo horario</>
                    ) : (
                      <><X className="h-4 w-4 mr-2" />Rechazar y obtener reembolso</>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* CFDI Section */}
      {user && (
        <div className="container mx-auto px-4 pb-8">
          <TravelerCfdiList userId={user.id} />
        </div>
      )}

      {seatReselectionModal?.open && (
        <SeatReselectionModal
          bookingId={seatReselectionModal.bookingId}
          tourId={seatReselectionModal.tourId}
          slotId={seatReselectionModal.slotId}
          travelersCount={seatReselectionModal.travelersCount}
          previousSeats={seatReselectionModal.previousSeats}
          tourName={seatReselectionModal.tourName}
          newDate={seatReselectionModal.newDate}
          newTime={seatReselectionModal.newTime}
          onSuccess={() => {
            setSeatReselectionModal(null);
            fetchBookings();
          }}
          onClose={() => setSeatReselectionModal(null)}
        />
      )}
    </div>
  );
};

export default TravelerBookings;