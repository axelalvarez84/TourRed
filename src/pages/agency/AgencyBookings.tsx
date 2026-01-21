import React, { useState, useEffect } from 'react';
import { Calendar, MapPin, Users, DollarSign, Clock, Eye, Mail, Phone, CheckCircle, XCircle, AlertCircle, Search, Filter, Star, X, User, MessageSquare, UserCheck, UserX, FileSpreadsheet, FileText, Download } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getAgencyBookings, getTourBookingReport, supabase, parseDateFromDB } from '../../lib/supabase';
import { Booking } from '../../types';
import { format } from 'date-fns';
import { Link, useNavigate } from 'react-router-dom';
import ReviewForm from '../../components/ReviewForm';
import { exportTourReportToExcel, exportTourReportToPDF } from '../../utils/reportExports';

const AgencyBookings: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'confirmed' | 'completed' | 'cancelled'>('all');
  const [agencyId, setAgencyId] = useState<string | null>(null);
  const [reviewModal, setReviewModal] = useState<{
    open: boolean;
    booking: Booking | null;
    existingReview: any;
  }>({ open: false, booking: null, existingReview: null });
  const [contactModal, setContactModal] = useState<{
    open: boolean;
    booking: Booking | null;
  }>({ open: false, booking: null });
  const [travelersModal, setTravelersModal] = useState<{
    open: boolean;
    booking: Booking | null;
    travelers: any[];
  }>({ open: false, booking: null, travelers: [] });
  const [activeTab, setActiveTab] = useState<'bookings' | 'reports'>('bookings');
  const [availableTours, setAvailableTours] = useState<any[]>([]);
  const [selectedTourForReport, setSelectedTourForReport] = useState<string>('');
  const [reportData, setReportData] = useState<any>(null);
  const [isLoadingReport, setIsLoadingReport] = useState(false);
  const [agencyName, setAgencyName] = useState<string>('');

  useEffect(() => {
    if (user?.id) {
      fetchAgencyData();
    }
  }, [user]);

  const fetchAgencyData = async () => {
    if (!user?.id) return;

    try {
      setIsLoading(true);
      setError('');
      
      console.log('🏢 Obteniendo ID de agencia para usuario:', user.id);

      // Primero obtener el ID y nombre de la agencia
      const { data: agencyData, error: agencyError } = await supabase
        .from('agencies')
        .select('id, name')
        .eq('user_id', user.id)
        .single();

      if (agencyError) {
        if (agencyError.code === 'PGRST116') {
          setError('No se encontró perfil de agencia para este usuario');
          return;
        }
        throw new Error(agencyError.message);
      }

      if (!agencyData) {
        setError('No se encontró perfil de agencia');
        return;
      }

      console.log('✅ ID de agencia encontrado:', agencyData.id);
      setAgencyId(agencyData.id);
      setAgencyName(agencyData.name);

      // Obtener reservas de la agencia
      const { data: bookingsData, error: bookingsError } = await getAgencyBookings(agencyData.id);

      if (bookingsError) {
        throw new Error(bookingsError.message);
      }

      console.log('✅ Reservas de agencia cargadas:', bookingsData);
      setBookings(bookingsData || []);

      // Obtener tours con reservas confirmadas
      const { data: toursData, error: toursError } = await supabase
        .from('tours')
        .select('id, name, destination, start_date')
        .eq('agency_id', agencyData.id)
        .order('start_date', { ascending: false });

      if (!toursError && toursData) {
        const toursWithBookings = await Promise.all(
          toursData.map(async (tour) => {
            const { count } = await supabase
              .from('bookings')
              .select('*', { count: 'exact', head: true })
              .eq('tour_id', tour.id)
              .in('status', ['confirmed', 'completed']);

            return { ...tour, bookingsCount: count || 0 };
          })
        );

        const toursFiltered = toursWithBookings.filter(t => t.bookingsCount > 0);
        setAvailableTours(toursFiltered);
      }
      
    } catch (err: any) {
      console.error('❌ Error cargando reservas de agencia:', err);
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
    let icon = null;

    switch (status) {
      case 'pending':
        statusText = paymentStatus === 'succeeded' ? 'Confirmando' : 'Pendiente';
        statusClass = 'bg-yellow-100 text-yellow-800';
        icon = <AlertCircle className="h-3 w-3 mr-1" />;
        break;
      case 'confirmed':
        statusText = 'Confirmada';
        statusClass = 'bg-green-100 text-green-800';
        icon = <CheckCircle className="h-3 w-3 mr-1" />;
        break;
      case 'completed':
        statusText = 'Completada';
        statusClass = 'bg-blue-100 text-blue-800';
        icon = <CheckCircle className="h-3 w-3 mr-1" />;
        break;
      case 'cancelled':
        statusText = 'Cancelada';
        statusClass = 'bg-red-100 text-red-800';
        icon = <XCircle className="h-3 w-3 mr-1" />;
        break;
      default:
        statusText = status;
        statusClass = 'bg-gray-100 text-gray-800';
    }

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusClass}`}>
        {icon}
        {statusText}
      </span>
    );
  };

  const getApprovalStatusBadge = (approvalStatus?: string) => {
    if (!approvalStatus) return null;

    let statusText = '';
    let statusClass = '';
    let icon = null;

    switch (approvalStatus) {
      case 'pending':
        statusText = 'Pendiente Aprobación';
        statusClass = 'bg-yellow-100 text-yellow-800';
        icon = <Clock className="h-3 w-3 mr-1" />;
        break;
      case 'approved':
        statusText = 'Aprobada';
        statusClass = 'bg-green-100 text-green-800';
        icon = <CheckCircle className="h-3 w-3 mr-1" />;
        break;
      case 'rejected':
        statusText = 'Rechazada';
        statusClass = 'bg-red-100 text-red-800';
        icon = <XCircle className="h-3 w-3 mr-1" />;
        break;
      default:
        return null;
    }

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusClass} ml-2`}>
        {icon}
        {statusText}
      </span>
    );
  };

  const handleApprovalAction = async (bookingId: string, action: 'approve' | 'reject', notes?: string) => {
    try {
      const approvalStatus = action === 'approve' ? 'approved' : 'rejected';
      
      const { error } = await supabase
        .from('bookings')
        .update({ 
          approval_status: approvalStatus,
          approval_notes: notes || null,
          approved_at: action === 'approve' ? new Date().toISOString() : null,
          approved_by: user?.id,
          updated_at: new Date().toISOString()
        })
        .eq('id', bookingId);

      if (error) {
        throw new Error(error.message);
      }

      // Actualizar el estado local
      setBookings(bookings.map(booking => 
        booking.id === bookingId 
          ? { 
              ...booking, 
              approval_status: approvalStatus as any,
              approval_notes: notes || null,
              approved_at: action === 'approve' ? new Date().toISOString() : null,
              approved_by: user?.id
            }
          : booking
      ));

      console.log(`✅ Reserva ${bookingId} ${action === 'approve' ? 'aprobada' : 'rechazada'}`);
    } catch (err: any) {
      console.error(`❌ Error ${action === 'approve' ? 'aprobando' : 'rechazando'} reserva:`, err);
      setError(err.message || `Error al ${action === 'approve' ? 'aprobar' : 'rechazar'} la reserva`);
    }
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

  const handleStatusUpdate = async (bookingId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from('bookings')
        .update({
          status: newStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', bookingId);

      if (error) {
        throw new Error(error.message);
      }

      // Actualizar el estado local
      setBookings(bookings.map(booking =>
        booking.id === bookingId
          ? { ...booking, status: newStatus as any }
          : booking
      ));

      console.log(`✅ Estado de reserva ${bookingId} actualizado a:`, newStatus);
    } catch (err: any) {
      console.error('❌ Error actualizando estado de reserva:', err);
      setError(err.message || 'Error al actualizar el estado de la reserva');
    }
  };

  const handleMarkNoShow = async (bookingId: string) => {
    if (!confirm('¿Confirmas que el viajero NO se presentó a este tour?\n\nEsto incrementará el contador de No Show del viajero. Si acumula más de 3 No Shows, se le cobrará el 100% en futuras reservas.')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('bookings')
        .update({
          is_no_show: true,
          no_show_marked_at: new Date().toISOString(),
          no_show_marked_by: user?.id,
          updated_at: new Date().toISOString()
        })
        .eq('id', bookingId);

      if (error) {
        throw new Error(error.message);
      }

      // Actualizar el estado local
      setBookings(bookings.map(booking =>
        booking.id === bookingId
          ? {
              ...booking,
              is_no_show: true,
              no_show_marked_at: new Date().toISOString(),
              no_show_marked_by: user?.id
            }
          : booking
      ));

      console.log(`✅ Reserva ${bookingId} marcada como No Show`);

      // Enviar email de notificación al viajero
      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (session) {
          const response = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-no-show-notification`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`,
              },
              body: JSON.stringify({
                booking_id: bookingId,
              }),
            }
          );

          const result = await response.json();

          if (result.success) {
            console.log('✅ Email de notificación de No Show enviado al viajero');
          } else {
            console.warn('⚠️ No se pudo enviar el email de notificación:', result);
          }
        }
      } catch (emailError: any) {
        console.error('❌ Error enviando email de notificación:', emailError);
        // No lanzamos error aquí porque el No Show ya fue registrado
      }

      alert('El viajero ha sido marcado como No Show. Su contador ha sido actualizado y se le ha notificado por email.');
    } catch (err: any) {
      console.error('❌ Error marcando No Show:', err);
      setError(err.message || 'Error al marcar como No Show');
    }
  };

  const handleOpenReviewModal = async (booking: Booking) => {
    if (!agencyId) return;

    try {
      const { data: existingReview } = await supabase
        .from('traveler_reviews')
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
    fetchAgencyData();
  };

  const handleOpenContactModal = (booking: Booking) => {
    setContactModal({ open: true, booking });
  };

  const handleCloseContactModal = () => {
    setContactModal({ open: false, booking: null });
  };

  const handleSendMessage = async (booking: Booking) => {
    if (!booking.users?.id || !agencyId) return;

    const { data: existingConversation } = await supabase
      .from('conversations')
      .select('id')
      .or(`and(user1_id.eq.${agencyId},user2_id.eq.${booking.users.id}),and(user1_id.eq.${booking.users.id},user2_id.eq.${agencyId})`)
      .maybeSingle();

    if (existingConversation) {
      navigate(`/messages?conversation=${existingConversation.id}`);
    } else {
      navigate(`/messages?newConversation=${booking.users.id}`);
    }
    handleCloseContactModal();
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

  const handleGenerateReport = async () => {
    if (!selectedTourForReport || !agencyId) {
      alert('Por favor selecciona un tour');
      return;
    }

    try {
      setIsLoadingReport(true);
      const { data, error } = await getTourBookingReport(selectedTourForReport, agencyId);

      if (error || !data) {
        throw new Error(error?.message || 'Error al generar reporte');
      }

      setReportData(data);
    } catch (err: any) {
      console.error('Error generating report:', err);
      alert(err.message || 'Error al generar el reporte');
    } finally {
      setIsLoadingReport(false);
    }
  };

  const handleExportExcel = () => {
    if (!reportData) {
      alert('Primero genera el reporte');
      return;
    }
    exportTourReportToExcel(reportData, agencyName);
  };

  const handleExportPDF = () => {
    if (!reportData) {
      alert('Primero genera el reporte');
      return;
    }
    exportTourReportToPDF(reportData, agencyName);
  };

  // Filtrar reservas
  const filteredBookings = bookings.filter(booking => {
    const matchesSearch = 
      booking.tours?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      booking.tours?.destination.toLowerCase().includes(searchTerm.toLowerCase()) ||
      booking.users?.first_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      booking.users?.last_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      booking.users?.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      booking.id.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === 'all' || booking.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  // Estadísticas
  const stats = {
    total: bookings.length,
    confirmed: bookings.filter(b => b.status === 'confirmed').length,
    pending: bookings.filter(b => b.status === 'pending').length,
    completed: bookings.filter(b => b.status === 'completed').length,
    totalRevenue: bookings
      .filter(b => b.payment_status === 'succeeded')
      .reduce((sum, b) => sum + (b.deposit_amount || 0), 0)
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
          <h1 className="text-3xl font-bold">Gestionar Reservas</h1>
          <p className="text-gray-600 mt-1">
            {bookings.length === 0
              ? 'No tienes reservas aún'
              : `${bookings.length} ${bookings.length === 1 ? 'reserva' : 'reservas'} en total`
            }
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6 border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('bookings')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'bookings'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Users className="inline-block h-5 w-5 mr-2" />
            Reservas
          </button>
          <button
            onClick={() => setActiveTab('reports')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'reports'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <FileText className="inline-block h-5 w-5 mr-2" />
            Reportes por Tour
          </button>
        </nav>
      </div>

      {error && (
        <div className="mb-6 bg-error-50 text-error-600 p-4 rounded-md flex items-start">
          <AlertCircle className="h-5 w-5 mr-2 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium">Error al cargar reservas</p>
            <p className="text-sm">{error}</p>
            <button
              onClick={fetchAgencyData}
              className="text-sm underline mt-1 hover:no-underline"
            >
              Intentar de nuevo
            </button>
          </div>
        </div>
      )}

      {activeTab === 'bookings' && (
        <>
          {/* Estadísticas */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow-md p-4">
          <div className="text-2xl font-bold text-primary-600">{stats.total}</div>
          <div className="text-sm text-gray-500">Total Reservas</div>
        </div>
        <div className="bg-white rounded-lg shadow-md p-4">
          <div className="text-2xl font-bold text-green-600">{stats.confirmed}</div>
          <div className="text-sm text-gray-500">Confirmadas</div>
        </div>
        <div className="bg-white rounded-lg shadow-md p-4">
          <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
          <div className="text-sm text-gray-500">Pendientes</div>
        </div>
        <div className="bg-white rounded-lg shadow-md p-4">
          <div className="text-2xl font-bold text-blue-600">{stats.completed}</div>
          <div className="text-sm text-gray-500">Completadas</div>
        </div>
        <div className="bg-white rounded-lg shadow-md p-4">
          <div className="text-2xl font-bold text-accent-600">${stats.totalRevenue.toLocaleString()}</div>
          <div className="text-sm text-gray-500">Ingresos Recibidos</div>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-lg shadow-md p-4 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar por tour, destino, cliente o ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Filter className="h-4 w-4 text-gray-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="all">Todas las reservas</option>
              <option value="pending">Pendientes</option>
              <option value="confirmed">Confirmadas</option>
              <option value="completed">Completadas</option>
              <option value="cancelled">Canceladas</option>
            </select>
          </div>
        </div>
      </div>

      {/* Lista de Reservas */}
      {filteredBookings.length === 0 ? (
        <div className="bg-white rounded-lg shadow-md p-8 text-center">
          <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold mb-2">
            {bookings.length === 0 ? 'No tienes reservas aún' : 'No se encontraron reservas'}
          </h3>
          <p className="text-gray-600 mb-6">
            {bookings.length === 0 
              ? 'Las reservas de tus tours aparecerán aquí cuando los viajeros hagan reservas.'
              : 'Intenta ajustar los filtros de búsqueda.'
            }
          </p>
          {bookings.length === 0 && (
            <Link to="/agency/tours" className="btn btn-primary">
              Gestionar Tours
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredBookings.map((booking) => (
            <div key={booking.id} className="bg-white rounded-lg shadow-md overflow-hidden">
              <div className="flex flex-col lg:flex-row">
                {/* Tour Image */}
                <div className="lg:w-1/4">
                  <div className="relative h-48 lg:h-full">
                    <img
                      src={booking.tours?.image_url || 'https://images.pexels.com/photos/1271619/pexels-photo-1271619.jpeg'}
                      alt={booking.tours?.name || 'Tour'}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute top-4 left-4 flex flex-wrap gap-2">
                      {getStatusBadge(booking.status, booking.payment_status)}
                      {getPaymentStatusBadge(booking.payment_status)}
                      {getApprovalStatusBadge(booking.approval_status)}
                      {(booking as any).is_no_show && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                          <UserX className="h-3 w-3 mr-1" />
                          No Show
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Booking Details */}
                <div className="lg:w-3/4 p-6">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex-1">
                      <h3 className="text-xl font-semibold mb-2">
                        {booking.tours?.name || 'Tour sin nombre'}
                      </h3>
                      <div className="flex items-center text-gray-600 mb-2">
                        <MapPin className="h-4 w-4 mr-1" />
                        <span>{booking.tours?.destination || 'Destino no especificado'}</span>
                      </div>
                      <div className="flex items-center text-gray-600">
                        <Calendar className="h-4 w-4 mr-1" />
                        <span>Fecha seleccionada: {formatDate(booking.booking_date)}</span>
                      </div>
                    </div>
                    <div className="text-right ml-4">
                      <div className="text-sm text-gray-500">ID de Reserva</div>
                      <div className="text-xs font-mono text-gray-600 break-all max-w-32">
                        {booking.id}
                      </div>
                    </div>
                  </div>

                  {/* Customer Info */}
                  <div className="bg-gray-50 rounded-lg p-4 mb-4">
                    <h4 className="font-medium mb-3">Información del Cliente</h4>
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0">
                        <div className="h-16 w-16 rounded-full bg-gray-200 flex items-center justify-center overflow-hidden">
                          {booking.users?.profile_picture_url ? (
                            <img
                              src={booking.users.profile_picture_url}
                              alt={`${booking.users.first_name} ${booking.users.last_name}`}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <User className="h-8 w-8 text-gray-400" />
                          )}
                        </div>
                      </div>
                      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                        <div>
                          <div className="text-gray-500">Nombre:</div>
                          <div className="font-medium">
                            {booking.users?.first_name} {booking.users?.last_name}
                          </div>
                        </div>
                        <div>
                          <div className="text-gray-500">Email:</div>
                          <div className="font-medium">
                            <a
                              href={`mailto:${booking.users?.email}`}
                              className="text-primary-600 hover:text-primary-700"
                            >
                              {booking.users?.email}
                            </a>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-4">
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
                        <div className="text-sm text-gray-500">Depósito Recibido</div>
                        <div className="font-medium">${(booking.deposit_amount || 0) - (booking.commission_amount || 0)}</div>
                      </div>
                    </div>

                    <div className="flex items-center">
                      <DollarSign className="h-4 w-4 text-gray-400 mr-2" />
                      <div>
                        <div className="text-sm text-gray-500">Saldo Pendiente</div>
                        <div className="font-medium">
                          ${((booking.total_price || 0) - (booking.deposit_amount || 0)).toLocaleString()}
                        </div>
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

                  {/* Actions */}
                  <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t">
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

                    <button
                      onClick={() => handleOpenContactModal(booking)}
                      className="btn btn-outline flex items-center justify-center"
                    >
                      <Mail className="h-4 w-4 mr-2" />
                      Contactar Cliente
                    </button>

                    {booking.approval_status === 'pending' && (
                      <>
                        <button
                          onClick={() => handleApprovalAction(booking.id, 'approve')}
                          className="btn btn-primary flex items-center justify-center"
                        >
                          <CheckCircle className="h-4 w-4 mr-2" />
                          Aprobar Reserva
                        </button>
                        <button
                          onClick={() => {
                            const notes = prompt('Motivo del rechazo (opcional):');
                            if (notes !== null) { // null means user cancelled
                              handleApprovalAction(booking.id, 'reject', notes);
                            }
                          }}
                          className="btn bg-red-600 text-white hover:bg-red-700 flex items-center justify-center"
                        >
                          <XCircle className="h-4 w-4 mr-2" />
                          Rechazar
                        </button>
                      </>
                    )}

                    {booking.status === 'pending' && booking.payment_status === 'succeeded' && (
                      <button
                        onClick={() => handleStatusUpdate(booking.id, 'confirmed')}
                        className="btn btn-primary flex items-center justify-center"
                      >
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Confirmar Reserva
                      </button>
                    )}

                    {booking.status === 'confirmed' && (
                      <>
                        <button
                          onClick={() => handleStatusUpdate(booking.id, 'completed')}
                          className="btn btn-primary flex items-center justify-center"
                        >
                          <CheckCircle className="h-4 w-4 mr-2" />
                          Marcar Completada
                        </button>
                        <button
                          onClick={() => handleOpenReviewModal(booking)}
                          className="btn btn-outline flex items-center justify-center"
                        >
                          <Star className="h-4 w-4 mr-2" />
                          Calificar Viajero
                        </button>
                        {!(booking as any).is_no_show && !(booking as any).cancelled_at && (
                          <button
                            onClick={() => handleMarkNoShow(booking.id)}
                            className="btn bg-orange-600 text-white hover:bg-orange-700 flex items-center justify-center"
                          >
                            <UserX className="h-4 w-4 mr-2" />
                            No Show
                          </button>
                        )}
                      </>
                    )}

                    {booking.status === 'completed' && !(booking as any).is_no_show && !(booking as any).cancelled_at && (
                      <button
                        onClick={() => handleMarkNoShow(booking.id)}
                        className="btn bg-orange-600 text-white hover:bg-orange-700 flex items-center justify-center"
                      >
                        <UserX className="h-4 w-4 mr-2" />
                        Marcar No Show
                      </button>
                    )}
                  </div>

                  {/* Important Notes */}
                  {(booking as any).cancelled_at && (
                    <div className="mt-4 p-3 bg-red-50 border-l-4 border-red-500 rounded-md">
                      <div className="flex items-start gap-2">
                        <XCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <p className="text-sm text-red-800 font-semibold mb-2">
                            Reserva Cancelada por el Viajero
                          </p>
                          <div className="text-xs text-red-700 space-y-1">
                            <p>
                              <strong>Cancelado el:</strong> {formatDate((booking as any).cancelled_at)}
                            </p>
                            {(booking as any).cancellation_type && (
                              <p>
                                <strong>Política aplicada:</strong> {
                                  (booking as any).cancellation_type === '100_percent' ? 'Reembolso del 100%' :
                                  (booking as any).cancellation_type === '50_percent' ? 'Reembolso del 50%' :
                                  (booking as any).cancellation_type === 'no_refund' ? 'Sin reembolso' :
                                  (booking as any).cancellation_type === 'no_show' ? 'Cancelación tardía (No Show)' :
                                  (booking as any).cancellation_type === 'pending_approval' ? 'Reserva pendiente' :
                                  'N/A'
                                }
                              </p>
                            )}
                            {(booking as any).cancellation_refund_amount !== null && (booking as any).cancellation_refund_amount !== undefined && (
                              <p>
                                <strong>Reembolsado al viajero:</strong> ${Number((booking as any).cancellation_refund_amount).toFixed(2)}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {(booking as any).is_no_show && (
                    <div className="mt-4 p-3 bg-orange-50 border border-orange-200 rounded-md">
                      <div className="flex items-start gap-2">
                        <UserX className="h-5 w-5 text-orange-600 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm text-orange-800">
                            <strong>No Show:</strong> El viajero no se presentó a este tour. El contador de No Show del viajero ha sido actualizado.
                          </p>
                          {(booking as any).no_show_marked_at && (
                            <p className="text-xs text-orange-700 mt-1">
                              Marcado el {formatDate((booking as any).no_show_marked_at)}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {booking.approval_status === 'pending' && (
                    <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                      <p className="text-sm text-yellow-800">
                        <strong>Acción requerida:</strong> Esta reserva está pendiente de tu aprobación. El cliente no será cobrado hasta que apruebes la solicitud.
                      </p>
                    </div>
                  )}

                  {booking.approval_status === 'approved' && booking.payment_status !== 'succeeded' && (
                    <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-md">
                      <p className="text-sm text-green-800">
                        <strong>Reserva aprobada:</strong> El cliente ha sido notificado y puede proceder con el pago.
                      </p>
                    </div>
                  )}

                  {booking.approval_status === 'rejected' && (
                    <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
                      <p className="text-sm text-red-800">
                        <strong>Reserva rechazada:</strong> El cliente ha sido notificado del rechazo.
                        {booking.approval_notes && (
                          <span className="block mt-1">Motivo: {booking.approval_notes}</span>
                        )}
                      </p>
                    </div>
                  )}

                  {booking.status === 'pending' && booking.payment_status === 'succeeded' && (
                    <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
                      <p className="text-sm text-blue-800">
                        <strong>Acción requerida:</strong> El cliente ha pagado el depósito. Confirma la reserva para proceder.
                      </p>
                    </div>
                  )}

                  {booking.status === 'confirmed' && (
                    <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-md">
                      <p className="text-sm text-green-800">
                        <strong>Reserva confirmada:</strong> Coordina con el cliente el pago del saldo restante y los detalles del viaje.
                      </p>
                    </div>
                  )}

                  {booking.status === 'pending' && booking.payment_status !== 'succeeded' && (
                    <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                      <p className="text-sm text-yellow-800">
                        <strong>Pendiente de pago:</strong> El cliente aún no ha completado el pago del depósito.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
        </>
      )}

      {activeTab === 'reports' && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-2xl font-bold mb-4">Reportes de Asistentes por Tour</h2>
          <p className="text-gray-600 mb-6">
            Genera reportes detallados con la lista de asistentes y acompañantes para cada tour.
            Exporta en Excel o PDF para el día del tour.
          </p>

          {/* Tour Selector */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Selecciona un Tour
            </label>
            <div className="flex gap-4">
              <select
                value={selectedTourForReport}
                onChange={(e) => setSelectedTourForReport(e.target.value)}
                className="flex-1 border border-gray-300 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">-- Selecciona un tour --</option>
                {availableTours.map((tour) => (
                  <option key={tour.id} value={tour.id}>
                    {tour.name} - {formatDate(tour.start_date)} ({tour.bookingsCount} reservas confirmadas)
                  </option>
                ))}
              </select>
              <button
                onClick={handleGenerateReport}
                disabled={!selectedTourForReport || isLoadingReport}
                className="btn btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoadingReport ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white"></div>
                    Generando...
                  </>
                ) : (
                  <>
                    <Download className="h-5 w-5" />
                    Generar Reporte
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Report Preview */}
          {reportData && (
            <div>
              <div className="mb-4 flex justify-between items-center">
                <h3 className="text-xl font-bold">Vista Previa del Reporte</h3>
                <div className="flex gap-2">
                  <button
                    onClick={handleExportExcel}
                    className="btn btn-primary flex items-center gap-2"
                  >
                    <FileSpreadsheet className="h-5 w-5" />
                    Descargar Excel
                  </button>
                  <button
                    onClick={handleExportPDF}
                    className="btn btn-outline flex items-center gap-2"
                  >
                    <FileText className="h-5 w-5" />
                    Descargar PDF
                  </button>
                </div>
              </div>

              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-primary-50 rounded-lg p-4">
                  <div className="text-2xl font-bold text-primary-600">
                    {reportData.summary.totalBookings}
                  </div>
                  <div className="text-sm text-gray-600">Total Reservas</div>
                </div>
                <div className="bg-green-50 rounded-lg p-4">
                  <div className="text-2xl font-bold text-green-600">
                    {reportData.summary.totalTravelers}
                  </div>
                  <div className="text-sm text-gray-600">Total Viajeros</div>
                </div>
                <div className="bg-blue-50 rounded-lg p-4">
                  <div className="text-2xl font-bold text-blue-600">
                    ${reportData.summary.totalDeposit.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                  </div>
                  <div className="text-sm text-gray-600">Anticipo Recibido</div>
                </div>
                <div className="bg-orange-50 rounded-lg p-4">
                  <div className="text-2xl font-bold text-orange-600">
                    ${reportData.summary.totalRemaining.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                  </div>
                  <div className="text-sm text-gray-600">Saldo Pendiente</div>
                </div>
              </div>

              {/* Travelers by Category */}
              <div className="bg-gray-50 rounded-lg p-4 mb-6">
                <h4 className="font-semibold mb-3">Viajeros por Categoría</h4>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <div>
                    <div className="text-lg font-bold">{reportData.summary.totalsByCategory.adultos}</div>
                    <div className="text-sm text-gray-600">Adultos</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold">{reportData.summary.totalsByCategory.ninos}</div>
                    <div className="text-sm text-gray-600">Niños</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold">{reportData.summary.totalsByCategory.infantes}</div>
                    <div className="text-sm text-gray-600">Infantes</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold">{reportData.summary.totalsByCategory.adultos_mayores}</div>
                    <div className="text-sm text-gray-600">Adultos Mayores</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold">{reportData.summary.totalsByCategory.mascotas}</div>
                    <div className="text-sm text-gray-600">Mascotas</div>
                  </div>
                </div>
              </div>

              {/* Detailed List */}
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cliente</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Viajeros</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Anticipo</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Pendiente</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Método Pago</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {reportData.bookings.map((booking: any) => (
                      <tr key={booking.id} className="hover:bg-gray-50">
                        <td className="px-4 py-4">
                          <div className="font-medium">{booking.users.first_name} {booking.users.last_name}</div>
                          <div className="text-sm text-gray-500">{booking.users.email}</div>
                          <div className="text-sm text-gray-500">{booking.users.phone_number || 'Sin teléfono'}</div>
                        </td>
                        <td className="px-4 py-4">
                          {booking.travelers.length > 0 ? (
                            <div className="space-y-1">
                              {booking.travelers.map((traveler: any) => (
                                <div key={traveler.id} className="text-sm">
                                  <span className="font-medium">{traveler.nombre}</span>
                                  <span className="text-gray-500 ml-2">({getCategoryLabel(traveler.categoria_viajero)})</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-sm text-gray-500">Sin acompañantes</div>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          <div className="font-medium">
                            ${Number(booking.deposit_amount).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="font-medium text-orange-600">
                            ${(Number(booking.total_price) - Number(booking.deposit_amount)).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="text-sm">{booking.payment_method || 'N/A'}</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {!reportData && !isLoadingReport && (
            <div className="text-center py-12 text-gray-500">
              <FileText className="h-16 w-16 mx-auto mb-4 text-gray-300" />
              <p>Selecciona un tour y genera el reporte para ver los detalles</p>
            </div>
          )}
        </div>
      )}

      {/* Contact Modal */}
      {contactModal.open && contactModal.booking && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full">
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <h2 className="text-2xl font-bold">Contactar Cliente</h2>
                <button
                  onClick={handleCloseContactModal}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              <div className="mb-6">
                <div className="flex items-center gap-4 mb-4">
                  <div className="h-16 w-16 rounded-full bg-gray-200 flex items-center justify-center overflow-hidden flex-shrink-0">
                    {contactModal.booking.users?.profile_picture_url ? (
                      <img
                        src={contactModal.booking.users.profile_picture_url}
                        alt={`${contactModal.booking.users.first_name} ${contactModal.booking.users.last_name}`}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <User className="h-8 w-8 text-gray-400" />
                    )}
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg">
                      {contactModal.booking.users?.first_name} {contactModal.booking.users?.last_name}
                    </h3>
                    <p className="text-sm text-gray-500">
                      Reserva: {contactModal.booking.tours?.name}
                    </p>
                  </div>
                </div>

                <div className="space-y-3 bg-gray-50 rounded-lg p-4">
                  {contactModal.booking.users?.email && (
                    <div className="flex items-start gap-3">
                      <Mail className="h-5 w-5 text-gray-400 mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-gray-500 mb-1">Email</div>
                        <a
                          href={`mailto:${contactModal.booking.users.email}?subject=Reserva ${contactModal.booking.id} - ${contactModal.booking.tours?.name}`}
                          className="text-primary-600 hover:text-primary-700 break-all"
                        >
                          {contactModal.booking.users.email}
                        </a>
                      </div>
                    </div>
                  )}

                  {contactModal.booking.users?.phone_number && (
                    <div className="flex items-start gap-3">
                      <Phone className="h-5 w-5 text-gray-400 mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <div className="text-sm text-gray-500 mb-1">Teléfono</div>
                        <a
                          href={`tel:${contactModal.booking.users.phone_number}`}
                          className="text-primary-600 hover:text-primary-700"
                        >
                          {contactModal.booking.users.phone_number}
                        </a>
                      </div>
                    </div>
                  )}

                  {!contactModal.booking.users?.phone_number && !contactModal.booking.users?.email && (
                    <div className="text-center text-gray-500 py-2">
                      No hay información de contacto disponible
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => handleSendMessage(contactModal.booking!)}
                  className="btn btn-primary flex-1 flex items-center justify-center"
                >
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Enviar Mensaje
                </button>
                <button
                  onClick={handleCloseContactModal}
                  className="btn btn-outline"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
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

              <div className="mt-6 flex justify-end">
                <button
                  onClick={handleCloseTravelersModal}
                  className="btn btn-outline"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Review Modal */}
      {reviewModal.open && reviewModal.booking && agencyId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="text-2xl font-bold mb-2">
                    {reviewModal.existingReview ? 'Editar Calificación' : 'Calificar Viajero'}
                  </h2>
                  <p className="text-gray-600">
                    {reviewModal.booking.users?.first_name} {reviewModal.booking.users?.last_name}
                  </p>
                  <p className="text-sm text-gray-500">
                    {reviewModal.booking.tours?.name}
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
                revieweeId={reviewModal.booking.user_id!}
                reviewType="traveler"
                onSuccess={handleReviewSuccess}
                onCancel={handleCloseReviewModal}
                existingReview={reviewModal.existingReview}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AgencyBookings;