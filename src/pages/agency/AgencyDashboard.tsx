import React, { useState, useEffect } from 'react';
import { Plus, MapPin, Calendar, Users, Search, X, DollarSign, TrendingUp, Activity, AlertCircle, CreditCard } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { createTour, searchDestinations, supabase } from '../../lib/supabase';

interface DashboardStats {
  totalTours: number;
  activeTours: number;
  totalBookings: number;
  recentBookings: number;
  totalTravelers: number;
  totalRevenue: number;
  pendingPayouts: number;
  recentActivity: any[];
}

const AgencyDashboard: React.FC = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    totalTours: 0,
    activeTours: 0,
    totalBookings: 0,
    recentBookings: 0,
    totalTravelers: 0,
    totalRevenue: 0,
    pendingPayouts: 0,
    recentActivity: []
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedDestinations, setSelectedDestinations] = useState<string[]>([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [agencyId, setAgencyId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    category: 'adventure',
    description: '',
    itinerary: '',
    price: '',
    deposit_percentage: '',
    image_url: '',
    start_date: '',
    end_date: '',
    max_travelers: '',
  });

  useEffect(() => {
    if (user?.id) {
      fetchAgencyData();
    }
  }, [user]);

  useEffect(() => {
    const searchDestinationsDebounced = setTimeout(async () => {
      if (searchQuery.length >= 2) {
        const { data, error } = await searchDestinations(searchQuery);
        if (!error && data) {
          setSearchResults(data);
          setShowSearchResults(true);
        }
      } else {
        setSearchResults([]);
        setShowSearchResults(false);
      }
    }, 300);

    return () => clearTimeout(searchDestinationsDebounced);
  }, [searchQuery]);

  const fetchAgencyData = async () => {
    if (!user?.id) return;

    try {
      setIsLoading(true);
      setError('');
      
      console.log('🏢 Cargando datos de agencia para usuario:', user.id);
      
      // Primero obtener el ID de la agencia
      const { data: agencyData, error: agencyError } = await supabase
        .from('agencies')
        .select('id')
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

      // Obtener estadísticas en paralelo
      const [
        toursResult,
        bookingsResult,
        recentBookingsResult,
        commissionRecordsResult
      ] = await Promise.all([
        // Tours de la agencia
        supabase
          .from('tours')
          .select('*')
          .eq('agency_id', agencyData.id),
        
        // Reservas de la agencia
        supabase
          .from('bookings')
          .select(`
            *,
            tours(name, destination),
            users(first_name, last_name, email)
          `)
          .eq('agency_id', agencyData.id),
        
        // Reservas recientes (últimos 30 días)
        supabase
          .from('bookings')
          .select('*')
          .eq('agency_id', agencyData.id)
          .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),

        // Registros de comisiones para calcular ingresos reales
        supabase
          .from('commission_records')
          .select('*')
          .eq('agency_id', agencyData.id)
      ]);

      if (toursResult.error) {
        console.error('Error cargando tours:', toursResult.error);
      }

      if (bookingsResult.error) {
        console.error('Error cargando reservas:', bookingsResult.error);
      }

      if (recentBookingsResult.error) {
        console.error('Error cargando reservas recientes:', recentBookingsResult.error);
      }

      if (commissionRecordsResult.error) {
        console.error('Error cargando registros de comisiones:', commissionRecordsResult.error);
      }

      const tours = toursResult.data || [];
      const bookings = bookingsResult.data || [];
      const recentBookings = recentBookingsResult.data || [];
      const commissionRecords = commissionRecordsResult.data || [];

      // Calcular tours activos (que no han terminado)
      const today = new Date();
      const activeTours = tours.filter(tour => new Date(tour.end_date) >= today);

      // Calcular total de viajeros
      const totalTravelers = bookings
        .filter(booking => booking.status !== 'cancelled')
        .reduce((sum, booking) => sum + (booking.travelers_count || 0), 0);

      // Calcular ingresos reales basados en commission_records
      // Esto representa lo que la agencia realmente recibe después de comisiones
      const totalRevenue = commissionRecords
        .filter(record => record.status === 'processed')
        .reduce((sum, record) => sum + (record.agency_net_amount || 0), 0);

      // Calcular pagos pendientes (comisiones procesadas pero no pagadas)
      const pendingPayouts = commissionRecords
        .filter(record => record.status === 'processed')
        .reduce((sum, record) => sum + (record.agency_net_amount || 0), 0);

      // Actividad reciente (últimas 5 reservas)
      const recentActivity = bookings
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 5);

      const dashboardStats: DashboardStats = {
        totalTours: tours.length,
        activeTours: activeTours.length,
        totalBookings: bookings.length,
        recentBookings: recentBookings.length,
        totalTravelers,
        totalRevenue,
        pendingPayouts,
        recentActivity
      };

      console.log('✅ Estadísticas calculadas:', dashboardStats);
      console.log('📊 Detalles de ingresos:', {
        commissionRecordsCount: commissionRecords.length,
        processedRecords: commissionRecords.filter(r => r.status === 'processed').length,
        totalRevenue,
        pendingPayouts
      });
      
      setStats(dashboardStats);
      
    } catch (err: any) {
      console.error('❌ Error cargando datos de agencia:', err);
      setError(err.message || 'Error al cargar los datos de la agencia');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      if (!user?.id) {
        throw new Error('User not authenticated');
      }

      if (selectedDestinations.length === 0) {
        throw new Error('Debe seleccionar al menos un destino para el tour');
      }

      const tourData = {
        ...formData,
        destination: selectedDestinations[0], // Use the first selected destination as the primary destination
        price: parseFloat(formData.price),
        deposit_percentage: parseInt(formData.deposit_percentage),
        max_travelers: parseInt(formData.max_travelers),
      };

      const { error } = await createTour(tourData, selectedDestinations, user.id);

      if (error) throw error;

      setIsCreating(false);
      setFormData({
        name: '',
        category: 'adventure',
        description: '',
        itinerary: '',
        price: '',
        deposit_percentage: '',
        image_url: '',
        start_date: '',
        end_date: '',
        max_travelers: '',
      });
      setSelectedDestinations([]);
      
      // Recargar estadísticas después de crear un tour
      await fetchAgencyData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const addDestination = (destination: string) => {
    if (!selectedDestinations.includes(destination)) {
      setSelectedDestinations([...selectedDestinations, destination]);
    }
    setSearchQuery('');
    setSearchResults([]);
    setShowSearchResults(false);
  };

  const addDestinationFromInput = () => {
    if (searchQuery.trim() && !selectedDestinations.includes(searchQuery.trim())) {
      setSelectedDestinations([...selectedDestinations, searchQuery.trim()]);
      setSearchQuery('');
      setSearchResults([]);
      setShowSearchResults(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addDestinationFromInput();
    }
  };

  const removeDestination = (destination: string) => {
    setSelectedDestinations(selectedDestinations.filter(d => d !== destination));
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'confirmed': return 'text-success-600 bg-success-100';
      case 'pending': return 'text-warning-600 bg-warning-100';
      case 'cancelled': return 'text-error-600 bg-error-100';
      case 'completed': return 'text-primary-600 bg-primary-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'confirmed': return 'Confirmada';
      case 'pending': return 'Pendiente';
      case 'cancelled': return 'Cancelada';
      case 'completed': return 'Completada';
      default: return status;
    }
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

  if (error && !agencyId) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow-md p-8 text-center">
          <h3 className="text-xl font-semibold mb-2">Error al cargar datos</h3>
          <p className="text-gray-600 mb-6">{error}</p>
          <button 
            onClick={fetchAgencyData}
            className="btn btn-primary"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Panel de la Agencia</h1>
        <button
          onClick={() => setIsCreating(!isCreating)}
          className="btn btn-primary"
        >
          <Plus className="h-5 w-5 mr-2" />
          {isCreating ? 'Cancelar' : 'Crear Nuevo Tour'}
        </button>
      </div>

      {error && (
        <div className="mb-6 bg-error-50 text-error-600 p-4 rounded-md">
          {error}
        </div>
      )}

      {/* Información sobre el sistema de pagos */}
      {stats.totalRevenue === 0 && stats.totalBookings > 0 && (
        <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start">
            <AlertCircle className="h-5 w-5 text-blue-500 mt-0.5 mr-3 flex-shrink-0" />
            <div>
              <h3 className="font-medium text-blue-900 mb-2">Sistema de Pagos y Comisiones</h3>
              <div className="text-sm text-blue-800 space-y-2">
                <p><strong>Cómo funciona:</strong></p>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Los viajeros pagan un depósito + 3% de cargo por servicio</li>
                  <li>La plataforma retiene 10% del precio total como comisión</li>
                  <li>Tú recibes el depósito menos la comisión de la plataforma</li>
                  <li>El saldo restante lo cobras directamente al cliente</li>
                </ul>
                <p className="mt-3">
                  <strong>Configuración de Stripe:</strong> Para recibir pagos automáticamente, 
                  el administrador debe configurar Stripe Connect para transferir tu parte.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {isCreating && (
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Crear Nuevo Tour</h2>
          
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nombre del Tour
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="input"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Categoría
                </label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({...formData, category: e.target.value})}
                  className="input"
                  required
                >
                  <option value="adventure">Aventura</option>
                  <option value="nature">Naturaleza</option>
                  <option value="cultural">Cultural</option>
                  <option value="beach">Playa</option>
                  <option value="urban">Urbano</option>
                  <option value="wellness">Bienestar</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Descripción
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  className="input"
                  rows={3}
                  required
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Itinerario Detallado
                </label>
                <textarea
                  value={formData.itinerary}
                  onChange={(e) => setFormData({...formData, itinerary: e.target.value})}
                  className="input"
                  rows={5}
                  required
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Destinos * <span className="text-sm text-gray-500">(Presiona Enter para agregar)</span>
                </label>
                <div className="mb-2 flex flex-wrap gap-2">
                  {selectedDestinations.map((destination) => (
                    <span
                      key={destination}
                      className="inline-flex items-center bg-primary-100 text-primary-800 px-3 py-1 rounded-full text-sm"
                    >
                      {destination}
                      <button
                        type="button"
                        onClick={() => removeDestination(destination)}
                        className="ml-2 text-primary-600 hover:text-primary-800"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="relative">
                  <div className="flex">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyPress={handleKeyPress}
                      className="input flex-1"
                      placeholder="Escribe un destino y presiona Enter..."
                    />
                    <button
                      type="button"
                      onClick={addDestinationFromInput}
                      className="ml-2 px-3 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 flex items-center"
                      disabled={!searchQuery.trim()}
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                  
                  {showSearchResults && searchResults.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white rounded-md shadow-lg border">
                      <div className="py-1">
                        <div className="px-3 py-2 text-xs text-gray-500 border-b">
                          Destinos existentes:
                        </div>
                        {searchResults.map((result) => (
                          <button
                            key={result.id}
                            type="button"
                            className="w-full text-left px-3 py-2 hover:bg-gray-100 text-sm"
                            onClick={() => addDestination(result.name)}
                          >
                            {result.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                {selectedDestinations.length === 0 && (
                  <p className="text-sm text-red-500 mt-1">⚠️ Debe seleccionar al menos un destino</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Precio Total (MXN)
                </label>
                <input
                  type="number"
                  value={formData.price}
                  onChange={(e) => setFormData({...formData, price: e.target.value})}
                  className="input"
                  min="0"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Porcentaje de Depósito
                </label>
                <input
                  type="number"
                  value={formData.deposit_percentage}
                  onChange={(e) => setFormData({...formData, deposit_percentage: e.target.value})}
                  className="input"
                  min="0"
                  max="100"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  URL de la Imagen Principal
                </label>
                <input
                  type="url"
                  value={formData.image_url}
                  onChange={(e) => setFormData({...formData, image_url: e.target.value})}
                  className="input"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Máximo de Viajeros
                </label>
                <input
                  type="number"
                  value={formData.max_travelers}
                  onChange={(e) => setFormData({...formData, max_travelers: e.target.value})}
                  className="input"
                  min="1"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Fecha de Inicio
                </label>
                <input
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => setFormData({...formData, start_date: e.target.value})}
                  className="input"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Fecha de Fin
                </label>
                <input
                  type="date"
                  value={formData.end_date}
                  onChange={(e) => setFormData({...formData, end_date: e.target.value})}
                  className="input"
                  required
                />
              </div>
            </div>

            <div className="flex justify-end space-x-4">
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="btn btn-outline"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSubmitting || selectedDestinations.length === 0}
                className={`btn btn-primary ${
                  selectedDestinations.length === 0 
                    ? 'opacity-50 cursor-not-allowed' 
                    : ''
                }`}
              >
                {isSubmitting ? 'Creando...' : 'Crear Tour'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Estadísticas principales */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Tours Activos</h2>
          <div className="flex items-center text-3xl font-bold text-primary-600">
            <MapPin className="h-8 w-8 mr-2" />
            <span>{stats.activeTours}</span>
          </div>
          <p className="text-gray-600 mt-2">
            {stats.totalTours} tours en total
          </p>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Reservas Recientes</h2>
          <div className="flex items-center text-3xl font-bold text-success-600">
            <Calendar className="h-8 w-8 mr-2" />
            <span>{stats.recentBookings}</span>
          </div>
          <p className="text-gray-600 mt-2">
            {stats.totalBookings} reservas en total
          </p>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Total de Viajeros</h2>
          <div className="flex items-center text-3xl font-bold text-accent-600">
            <Users className="h-8 w-8 mr-2" />
            <span>{stats.totalTravelers}</span>
          </div>
          <p className="text-gray-600 mt-2">Viajeros registrados en tus tours</p>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Ingresos Netos</h2>
          <div className="flex items-center text-3xl font-bold text-secondary-600">
            <DollarSign className="h-8 w-8 mr-2" />
            <span>${stats.totalRevenue.toLocaleString()}</span>
          </div>
          <p className="text-gray-600 mt-2">
            {stats.pendingPayouts > 0 
              ? `$${stats.pendingPayouts.toLocaleString()} pendientes`
              : 'Después de comisiones'
            }
          </p>
        </div>
      </div>

      {/* Información sobre configuración de pagos */}
      {stats.totalRevenue === 0 && stats.totalBookings > 0 && (
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center">
            <CreditCard className="h-5 w-5 mr-2" />
            Configuración de Pagos Automáticos
          </h2>
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <h3 className="font-medium text-yellow-900 mb-2">Próximos Pasos para Recibir Pagos</h3>
            <div className="text-sm text-yellow-800 space-y-2">
              <p>Para recibir pagos automáticamente, necesitas:</p>
              <ol className="list-decimal list-inside space-y-1 ml-4">
                <li>Crear una cuenta de Stripe Connect</li>
                <li>Vincular tu cuenta bancaria</li>
                <li>Configurar las transferencias automáticas</li>
              </ol>
              <p className="mt-3">
                <strong>Mientras tanto:</strong> Los clientes pagan el depósito a la plataforma, 
                y tú cobras el saldo restante directamente.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Actividad Reciente */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4 flex items-center">
          <Activity className="h-5 w-5 mr-2" />
          Actividad Reciente
        </h2>
        
        {stats.recentActivity.length > 0 ? (
          <div className="space-y-4">
            {stats.recentActivity.map((activity) => (
              <div key={activity.id} className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg">
                <div className="flex-shrink-0">
                  <Calendar className="h-5 w-5 text-gray-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-gray-900">
                    <span className="font-medium">
                      {activity.users?.first_name} {activity.users?.last_name}
                    </span>
                    {' '}reservó{' '}
                    <span className="font-medium">{activity.tours?.name}</span>
                    {' '}para {activity.travelers_count} {activity.travelers_count === 1 ? 'viajero' : 'viajeros'}
                  </div>
                  <div className="flex items-center mt-1 space-x-2">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(activity.status)}`}>
                      {getStatusText(activity.status)}
                    </span>
                    <span className="text-xs text-gray-500">
                      {new Date(activity.created_at).toLocaleDateString('es-ES')}
                    </span>
                    <span className="text-xs text-gray-500">
                      ${activity.deposit_amount?.toLocaleString()} depósito
                    </span>
                    {activity.payment_status === 'succeeded' && (
                      <span className="text-xs text-green-600 font-medium">
                        ✓ Pagado
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <Activity className="h-8 w-8 text-gray-400 mx-auto mb-2" />
            <p className="text-gray-500">No hay actividad reciente para mostrar.</p>
            <p className="text-sm text-gray-400 mt-1">
              Las reservas de tus tours aparecerán aquí.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AgencyDashboard;