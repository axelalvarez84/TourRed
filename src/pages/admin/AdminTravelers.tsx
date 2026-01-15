import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { User, Mail, Phone, Calendar, MapPin, Shield, ShieldOff, Edit2, Star, ShoppingBag, X, DollarSign, CreditCard, Crown, TrendingUp, Users, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';

interface Traveler {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  profile_picture_url: string | null;
  phone_number: string | null;
  created_at: string;
  is_active: boolean;
  total_bookings: number;
  total_spent: number;
  total_service_charges: number;
  last_booking_date: string | null;
  has_active_membership: boolean;
  membership_plan_type: string | null;
  date_of_birth: string | null;
  street: string | null;
  exterior_number: string | null;
  interior_number: string | null;
  colony: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  curp: string | null;
  passport_number: string | null;
  is_foreign_traveler: boolean;
}

interface SummaryStats {
  totalTravelers: number;
  activeTravelers: number;
  inactiveTravelers: number;
  totalBookings: number;
  totalRevenue: number;
  totalServiceCharges: number;
  travelersWithMembership: number;
}

export default function AdminTravelers() {
  const [travelers, setTravelers] = useState<Traveler[]>([]);
  const [summaryStats, setSummaryStats] = useState<SummaryStats>({
    totalTravelers: 0,
    activeTravelers: 0,
    inactiveTravelers: 0,
    totalBookings: 0,
    totalRevenue: 0,
    totalServiceCharges: 0,
    travelersWithMembership: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTraveler, setSelectedTraveler] = useState<Traveler | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  useEffect(() => {
    loadTravelersAndStats();
  }, []);

  const loadTravelersAndStats = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: travelersData, error: travelersError } = await supabase
        .from('users')
        .select('*')
        .eq('role', 'traveler')
        .order('created_at', { ascending: false });

      if (travelersError) throw travelersError;

      const travelersWithDetails = await Promise.all(
        (travelersData || []).map(async (traveler) => {
          const { data: bookingsData } = await supabase
            .from('bookings')
            .select('total_price, service_charge, created_at, payment_status')
            .eq('user_id', traveler.id)
            .eq('payment_status', 'succeeded');

          const totalBookings = bookingsData?.length || 0;
          const totalSpent = bookingsData?.reduce((sum, b) => sum + Number(b.total_price || 0), 0) || 0;
          const totalServiceCharges = bookingsData?.reduce((sum, b) => sum + Number(b.service_charge || 0), 0) || 0;
          const lastBookingDate = bookingsData?.length > 0
            ? bookingsData.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0].created_at
            : null;

          const { data: membershipData } = await supabase
            .from('memberships')
            .select('status, plan_type')
            .eq('user_id', traveler.id)
            .eq('status', 'active')
            .maybeSingle();

          return {
            ...traveler,
            total_bookings: totalBookings,
            total_spent: totalSpent,
            total_service_charges: totalServiceCharges,
            last_booking_date: lastBookingDate,
            has_active_membership: !!membershipData,
            membership_plan_type: membershipData?.plan_type || null,
          };
        })
      );

      setTravelers(travelersWithDetails);

      const stats: SummaryStats = {
        totalTravelers: travelersWithDetails.length,
        activeTravelers: travelersWithDetails.filter(t => t.is_active).length,
        inactiveTravelers: travelersWithDetails.filter(t => !t.is_active).length,
        totalBookings: travelersWithDetails.reduce((sum, t) => sum + t.total_bookings, 0),
        totalRevenue: travelersWithDetails.reduce((sum, t) => sum + t.total_spent, 0),
        totalServiceCharges: travelersWithDetails.reduce((sum, t) => sum + t.total_service_charges, 0),
        travelersWithMembership: travelersWithDetails.filter(t => t.has_active_membership).length,
      };

      setSummaryStats(stats);
    } catch (err: any) {
      console.error('Error cargando viajeros:', err);
      setError('Error al cargar los viajeros');
    } finally {
      setLoading(false);
    }
  };

  const toggleActiveStatus = async (travelerId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('users')
        .update({ is_active: !currentStatus })
        .eq('id', travelerId);

      if (error) throw error;

      setTravelers(travelers.map(t =>
        t.id === travelerId ? { ...t, is_active: !currentStatus } : t
      ));

      if (selectedTraveler?.id === travelerId) {
        setSelectedTraveler({ ...selectedTraveler, is_active: !currentStatus });
      }

      setSummaryStats(prev => ({
        ...prev,
        activeTravelers: !currentStatus ? prev.activeTravelers + 1 : prev.activeTravelers - 1,
        inactiveTravelers: !currentStatus ? prev.inactiveTravelers - 1 : prev.inactiveTravelers + 1,
      }));
    } catch (err: any) {
      console.error('Error actualizando estado del viajero:', err);
      alert('Error al actualizar el estado del viajero');
    }
  };

  const handleEditTraveler = (traveler: Traveler) => {
    setSelectedTraveler(traveler);
    setShowEditModal(true);
  };

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const getSortIcon = (column: string) => {
    if (sortColumn !== column) {
      return <ArrowUpDown className="h-4 w-4" />;
    }
    return sortDirection === 'asc' ? (
      <ArrowUp className="h-4 w-4" />
    ) : (
      <ArrowDown className="h-4 w-4" />
    );
  };

  const filteredAndSortedTravelers = travelers
    .filter(traveler => {
      const searchLower = searchTerm.toLowerCase();
      return (
        traveler.email?.toLowerCase().includes(searchLower) ||
        traveler.first_name?.toLowerCase().includes(searchLower) ||
        traveler.last_name?.toLowerCase().includes(searchLower) ||
        traveler.phone_number?.includes(searchTerm)
      );
    })
    .sort((a, b) => {
      if (!sortColumn) return 0;

      let aValue: any;
      let bValue: any;

      switch (sortColumn) {
        case 'name':
          aValue = `${a.first_name} ${a.last_name}`.toLowerCase();
          bValue = `${b.first_name} ${b.last_name}`.toLowerCase();
          break;
        case 'email':
          aValue = a.email?.toLowerCase() || '';
          bValue = b.email?.toLowerCase() || '';
          break;
        case 'phone':
          aValue = a.phone_number || '';
          bValue = b.phone_number || '';
          break;
        case 'bookings':
          aValue = a.total_bookings;
          bValue = b.total_bookings;
          break;
        case 'spent':
          aValue = a.total_spent;
          bValue = b.total_spent;
          break;
        case 'service_charges':
          aValue = a.total_service_charges;
          bValue = b.total_service_charges;
          break;
        case 'last_booking':
          aValue = a.last_booking_date ? new Date(a.last_booking_date).getTime() : 0;
          bValue = b.last_booking_date ? new Date(b.last_booking_date).getTime() : 0;
          break;
        case 'membership':
          aValue = a.has_active_membership ? 1 : 0;
          bValue = b.has_active_membership ? 1 : 0;
          break;
        case 'status':
          aValue = a.is_active ? 1 : 0;
          bValue = b.is_active ? 1 : 0;
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
    }).format(amount);
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('es-MX', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando viajeros...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Gestión de Viajeros</h1>
          <p className="mt-2 text-gray-600">Administra todos los viajeros registrados en la plataforma</p>
        </div>

        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4 mb-8">
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <Users className="h-8 w-8 text-blue-600" />
              </div>
              <div className="ml-4">
                <div className="text-2xl font-bold text-gray-900">{summaryStats.totalTravelers}</div>
                <div className="text-sm text-gray-500">Total Viajeros</div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <Shield className="h-8 w-8 text-green-600" />
              </div>
              <div className="ml-4">
                <div className="text-2xl font-bold text-gray-900">{summaryStats.activeTravelers}</div>
                <div className="text-sm text-gray-500">Activos</div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <ShieldOff className="h-8 w-8 text-red-600" />
              </div>
              <div className="ml-4">
                <div className="text-2xl font-bold text-gray-900">{summaryStats.inactiveTravelers}</div>
                <div className="text-sm text-gray-500">Inactivos</div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <ShoppingBag className="h-8 w-8 text-orange-600" />
              </div>
              <div className="ml-4">
                <div className="text-2xl font-bold text-gray-900">{summaryStats.totalBookings}</div>
                <div className="text-sm text-gray-500">Reservas Totales</div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="text-2xl font-bold text-gray-900 mb-2">{formatCurrency(summaryStats.totalRevenue)}</div>
            <div className="flex items-center text-sm text-gray-500">
              <DollarSign className="h-4 w-4 mr-1 text-green-600" />
              Ingresos Totales
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="text-2xl font-bold text-gray-900 mb-2">{formatCurrency(summaryStats.totalServiceCharges)}</div>
            <div className="flex items-center text-sm text-gray-500">
              <CreditCard className="h-4 w-4 mr-1 text-purple-600" />
              Cargos por Servicio
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <Crown className="h-8 w-8 text-yellow-600" />
              </div>
              <div className="ml-4">
                <div className="text-2xl font-bold text-gray-900">{summaryStats.travelersWithMembership}</div>
                <div className="text-sm text-gray-500">Con Membresía</div>
              </div>
            </div>
          </div>
        </div>

        <div className="mb-6">
          <input
            type="text"
            placeholder="Buscar por nombre, email o teléfono..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <button
                      onClick={() => handleSort('name')}
                      className="flex items-center gap-1 hover:text-gray-700"
                    >
                      Viajero
                      {getSortIcon('name')}
                    </button>
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <button
                      onClick={() => handleSort('phone')}
                      className="flex items-center gap-1 hover:text-gray-700"
                    >
                      Contacto
                      {getSortIcon('phone')}
                    </button>
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <button
                      onClick={() => handleSort('bookings')}
                      className="flex items-center gap-1 hover:text-gray-700"
                    >
                      Reservas
                      {getSortIcon('bookings')}
                    </button>
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <button
                      onClick={() => handleSort('spent')}
                      className="flex items-center gap-1 hover:text-gray-700"
                    >
                      Total Gastado
                      {getSortIcon('spent')}
                    </button>
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <button
                      onClick={() => handleSort('service_charges')}
                      className="flex items-center gap-1 hover:text-gray-700"
                    >
                      Cargos Servicio
                      {getSortIcon('service_charges')}
                    </button>
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <button
                      onClick={() => handleSort('last_booking')}
                      className="flex items-center gap-1 hover:text-gray-700"
                    >
                      Última Reserva
                      {getSortIcon('last_booking')}
                    </button>
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <button
                      onClick={() => handleSort('membership')}
                      className="flex items-center gap-1 hover:text-gray-700"
                    >
                      Membresía
                      {getSortIcon('membership')}
                    </button>
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <button
                      onClick={() => handleSort('status')}
                      className="flex items-center gap-1 hover:text-gray-700"
                    >
                      Estado
                      {getSortIcon('status')}
                    </button>
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredAndSortedTravelers.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-12 text-center text-gray-500">
                      {searchTerm ? 'No se encontraron viajeros con ese criterio' : 'No hay viajeros registrados'}
                    </td>
                  </tr>
                ) : (
                  filteredAndSortedTravelers.map((traveler) => (
                    <tr key={traveler.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          {traveler.profile_picture_url ? (
                            <img
                              src={traveler.profile_picture_url}
                              alt={`${traveler.first_name} ${traveler.last_name}`}
                              className="h-10 w-10 rounded-full object-cover"
                            />
                          ) : (
                            <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                              <User className="h-6 w-6 text-blue-600" />
                            </div>
                          )}
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900">
                              {traveler.first_name} {traveler.last_name}
                            </div>
                            <div className="text-sm text-gray-500">{traveler.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {traveler.phone_number || 'Sin teléfono'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center text-sm text-gray-900">
                          <ShoppingBag className="h-4 w-4 mr-1 text-gray-400" />
                          {traveler.total_bookings}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {formatCurrency(traveler.total_spent)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {formatCurrency(traveler.total_service_charges)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {formatDate(traveler.last_booking_date)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {traveler.has_active_membership ? (
                          <div className="flex items-center">
                            <Crown className="h-4 w-4 text-yellow-600 mr-1" />
                            <span className="text-sm font-medium text-yellow-700">
                              {traveler.membership_plan_type === 'monthly' ? 'Mensual' : 'Anual'}
                            </span>
                          </div>
                        ) : (
                          <span className="text-sm text-gray-500">Sin membresía</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            traveler.is_active
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {traveler.is_active ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => handleEditTraveler(traveler)}
                          className="text-blue-600 hover:text-blue-900 mr-3"
                          title="Ver/Editar Perfil"
                        >
                          <Edit2 className="h-5 w-5" />
                        </button>
                        <button
                          onClick={() => toggleActiveStatus(traveler.id, traveler.is_active)}
                          className={`${
                            traveler.is_active
                              ? 'text-red-600 hover:text-red-900'
                              : 'text-green-600 hover:text-green-900'
                          }`}
                          title={traveler.is_active ? 'Desactivar Usuario' : 'Activar Usuario'}
                        >
                          {traveler.is_active ? (
                            <ShieldOff className="h-5 w-5" />
                          ) : (
                            <Shield className="h-5 w-5" />
                          )}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-4 text-sm text-gray-600">
          Mostrando {filteredAndSortedTravelers.length} de {travelers.length} viajeros
        </div>
      </div>

      {showEditModal && selectedTraveler && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
              <h2 className="text-2xl font-bold text-gray-900">Perfil del Viajero</h2>
              <button
                onClick={() => setShowEditModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="p-6">
              <div className="flex items-center mb-6">
                {selectedTraveler.profile_picture_url ? (
                  <img
                    src={selectedTraveler.profile_picture_url}
                    alt={`${selectedTraveler.first_name} ${selectedTraveler.last_name}`}
                    className="h-24 w-24 rounded-full object-cover"
                  />
                ) : (
                  <div className="h-24 w-24 rounded-full bg-blue-100 flex items-center justify-center">
                    <User className="h-12 w-12 text-blue-600" />
                  </div>
                )}
                <div className="ml-6 flex-1">
                  <h3 className="text-xl font-bold text-gray-900">
                    {selectedTraveler.first_name} {selectedTraveler.last_name}
                  </h3>
                  <p className="text-gray-600">{selectedTraveler.email}</p>
                  <div className="flex items-center gap-3 mt-2">
                    <span
                      className={`inline-block px-3 py-1 text-xs font-semibold rounded-full ${
                        selectedTraveler.is_active
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {selectedTraveler.is_active ? 'Activo' : 'Inactivo'}
                    </span>
                    {selectedTraveler.has_active_membership && (
                      <span className="inline-flex items-center px-3 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">
                        <Crown className="h-3 w-3 mr-1" />
                        ToursRed+ {selectedTraveler.membership_plan_type === 'monthly' ? 'Mensual' : 'Anual'}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="bg-blue-50 rounded-lg p-4">
                  <div className="flex items-center">
                    <ShoppingBag className="h-8 w-8 text-blue-600 mr-3" />
                    <div>
                      <p className="text-sm text-gray-600">Total Reservas</p>
                      <p className="text-2xl font-bold text-gray-900">{selectedTraveler.total_bookings}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-green-50 rounded-lg p-4">
                  <div className="flex items-center">
                    <DollarSign className="h-8 w-8 text-green-600 mr-3" />
                    <div>
                      <p className="text-sm text-gray-600">Total Gastado</p>
                      <p className="text-xl font-bold text-gray-900">{formatCurrency(selectedTraveler.total_spent)}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-purple-50 rounded-lg p-4">
                  <div className="flex items-center">
                    <CreditCard className="h-8 w-8 text-purple-600 mr-3" />
                    <div>
                      <p className="text-sm text-gray-600">Cargos por Servicio</p>
                      <p className="text-xl font-bold text-gray-900">{formatCurrency(selectedTraveler.total_service_charges)}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h4 className="font-semibold text-gray-900 text-lg border-b pb-2">
                    Información de Contacto
                  </h4>

                  <div className="flex items-start">
                    <Mail className="h-5 w-5 text-gray-400 mr-3 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-gray-500">Email</p>
                      <p className="text-gray-900">{selectedTraveler.email}</p>
                    </div>
                  </div>

                  <div className="flex items-start">
                    <Phone className="h-5 w-5 text-gray-400 mr-3 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-gray-500">Teléfono</p>
                      <p className="text-gray-900">
                        {selectedTraveler.phone_number || 'No proporcionado'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start">
                    <MapPin className="h-5 w-5 text-gray-400 mr-3 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-500">Dirección</p>
                      {selectedTraveler.street || selectedTraveler.city || selectedTraveler.state ? (
                        <div className="text-gray-900 space-y-1">
                          {selectedTraveler.street && (
                            <div>
                              <span className="font-medium">{selectedTraveler.street}</span>
                              {selectedTraveler.exterior_number && <span> #{selectedTraveler.exterior_number}</span>}
                              {selectedTraveler.interior_number && <span> Int. {selectedTraveler.interior_number}</span>}
                            </div>
                          )}
                          {selectedTraveler.colony && <div>{selectedTraveler.colony}</div>}
                          <div>
                            {selectedTraveler.city && <span>{selectedTraveler.city}</span>}
                            {selectedTraveler.city && selectedTraveler.state && <span>, </span>}
                            {selectedTraveler.state && <span>{selectedTraveler.state}</span>}
                            {selectedTraveler.postal_code && <span> {selectedTraveler.postal_code}</span>}
                          </div>
                          {selectedTraveler.country && <div className="text-gray-600">{selectedTraveler.country}</div>}
                        </div>
                      ) : (
                        <p className="text-gray-900">No proporcionada</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-start">
                    <Calendar className="h-5 w-5 text-gray-400 mr-3 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-gray-500">Fecha de Nacimiento</p>
                      <p className="text-gray-900">
                        {selectedTraveler.date_of_birth
                          ? new Date(selectedTraveler.date_of_birth).toLocaleDateString('es-MX')
                          : 'No proporcionada'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="font-semibold text-gray-900 text-lg border-b pb-2">
                    Información Adicional
                  </h4>

                  <div className="flex items-start">
                    <User className="h-5 w-5 text-gray-400 mr-3 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-gray-500">Tipo de Viajero</p>
                      <p className="text-gray-900">
                        {selectedTraveler.is_foreign_traveler ? 'Extranjero' : 'Nacional'}
                      </p>
                    </div>
                  </div>

                  {!selectedTraveler.is_foreign_traveler && (
                    <div className="flex items-start">
                      <User className="h-5 w-5 text-gray-400 mr-3 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-gray-500">CURP</p>
                        <p className="text-gray-900">
                          {selectedTraveler.curp || 'No proporcionado'}
                        </p>
                      </div>
                    </div>
                  )}

                  {selectedTraveler.is_foreign_traveler && (
                    <div className="flex items-start">
                      <User className="h-5 w-5 text-gray-400 mr-3 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-gray-500">Número de Pasaporte</p>
                        <p className="text-gray-900">
                          {selectedTraveler.passport_number || 'No proporcionado'}
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="flex items-start">
                    <Calendar className="h-5 w-5 text-gray-400 mr-3 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-gray-500">Última Reserva</p>
                      <p className="text-gray-900">
                        {formatDate(selectedTraveler.last_booking_date)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start">
                    <Calendar className="h-5 w-5 text-gray-400 mr-3 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-gray-500">Fecha de Registro</p>
                      <p className="text-gray-900">
                        {new Date(selectedTraveler.created_at).toLocaleDateString('es-MX', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })}
                      </p>
                    </div>
                  </div>

                  {selectedTraveler.has_active_membership && (
                    <div className="flex items-start">
                      <Crown className="h-5 w-5 text-yellow-600 mr-3 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-gray-500">Membresía ToursRed+</p>
                        <p className="text-gray-900">
                          Plan {selectedTraveler.membership_plan_type === 'monthly' ? 'Mensual' : 'Anual'}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-8 flex justify-end space-x-3">
                <button
                  onClick={() => toggleActiveStatus(selectedTraveler.id, selectedTraveler.is_active)}
                  className={`px-4 py-2 rounded-lg font-medium ${
                    selectedTraveler.is_active
                      ? 'bg-red-600 hover:bg-red-700 text-white'
                      : 'bg-green-600 hover:bg-green-700 text-white'
                  }`}
                >
                  {selectedTraveler.is_active ? 'Desactivar Usuario' : 'Activar Usuario'}
                </button>
                <button
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
