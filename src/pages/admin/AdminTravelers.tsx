import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { User, Mail, Phone, Calendar, MapPin, Shield, ShieldOff, Edit2, Star, ShoppingBag, X } from 'lucide-react';

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
  date_of_birth: string | null;
  address: string | null;
  curp: string | null;
  passport_number: string | null;
  is_foreign_traveler: boolean;
}

export default function AdminTravelers() {
  const [travelers, setTravelers] = useState<Traveler[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTraveler, setSelectedTraveler] = useState<Traveler | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadTravelers();
  }, []);

  const loadTravelers = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: travelersData, error: travelersError } = await supabase
        .from('users')
        .select('*')
        .eq('role', 'traveler')
        .order('created_at', { ascending: false });

      if (travelersError) throw travelersError;

      const travelersWithBookings = await Promise.all(
        (travelersData || []).map(async (traveler) => {
          const { count } = await supabase
            .from('bookings')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', traveler.id);

          return {
            ...traveler,
            total_bookings: count || 0,
          };
        })
      );

      setTravelers(travelersWithBookings);
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
    } catch (err: any) {
      console.error('Error actualizando estado del viajero:', err);
      alert('Error al actualizar el estado del viajero');
    }
  };

  const handleEditTraveler = (traveler: Traveler) => {
    setSelectedTraveler(traveler);
    setShowEditModal(true);
  };

  const filteredTravelers = travelers.filter(traveler => {
    const searchLower = searchTerm.toLowerCase();
    return (
      traveler.email?.toLowerCase().includes(searchLower) ||
      traveler.first_name?.toLowerCase().includes(searchLower) ||
      traveler.last_name?.toLowerCase().includes(searchLower) ||
      traveler.phone_number?.includes(searchTerm)
    );
  });

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
                    Viajero
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Contacto
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Reservas
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Estado
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Fecha de Registro
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredTravelers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                      {searchTerm ? 'No se encontraron viajeros con ese criterio' : 'No hay viajeros registrados'}
                    </td>
                  </tr>
                ) : (
                  filteredTravelers.map((traveler) => (
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
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(traveler.created_at).toLocaleDateString('es-MX')}
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
          Total de viajeros: {filteredTravelers.length}
        </div>
      </div>

      {showEditModal && selectedTraveler && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
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
                <div className="ml-6">
                  <h3 className="text-xl font-bold text-gray-900">
                    {selectedTraveler.first_name} {selectedTraveler.last_name}
                  </h3>
                  <p className="text-gray-600">{selectedTraveler.email}</p>
                  <span
                    className={`mt-2 inline-block px-3 py-1 text-xs font-semibold rounded-full ${
                      selectedTraveler.is_active
                        ? 'bg-green-100 text-green-800'
                        : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {selectedTraveler.is_active ? 'Activo' : 'Inactivo'}
                  </span>
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
                    <div>
                      <p className="text-sm font-medium text-gray-500">Dirección</p>
                      <p className="text-gray-900">
                        {selectedTraveler.address || 'No proporcionada'}
                      </p>
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
                    Información de Identificación
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
                    <ShoppingBag className="h-5 w-5 text-gray-400 mr-3 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-gray-500">Total de Reservas</p>
                      <p className="text-gray-900 text-2xl font-bold">
                        {selectedTraveler.total_bookings}
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
