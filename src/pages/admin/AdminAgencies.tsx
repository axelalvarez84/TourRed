import React, { useState, useEffect } from 'react';
import { Building, Users, Eye, EyeOff, Mail, Phone, Globe, Calendar, Search, Filter, MoreVertical, CheckCircle, XCircle } from 'lucide-react';
import { getAllAgencies, updateAgencyStatus, supabase } from '../../lib/supabase';

interface Agency {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  logo?: string;
  contact_email: string;
  contact_phone?: string;
  website?: string;
  rating?: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  users?: {
    first_name?: string;
    last_name?: string;
    email: string;
  };
  tour_count?: number;
  booking_count?: number;
}

const AdminAgencies: React.FC = () => {
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [selectedAgency, setSelectedAgency] = useState<Agency | null>(null);
  const [isUpdating, setIsUpdating] = useState<string | null>(null);

  useEffect(() => {
    fetchAgencies();
  }, []);

  const fetchAgencies = async () => {
    try {
      setIsLoading(true);
      setError('');
      
      console.log('🏢 Cargando agencias desde la BD...');
      
      // Obtener agencias con información del usuario y estadísticas
      const { data: agenciesData, error: agenciesError } = await supabase
        .from('agencies')
        .select(`
          *,
          users(first_name, last_name, email)
        `)
        .order('created_at', { ascending: false });

      if (agenciesError) {
        throw new Error(agenciesError.message);
      }

      console.log('✅ Agencias cargadas:', agenciesData);

      // Obtener estadísticas de tours y reservas para cada agencia
      const agenciesWithStats = await Promise.all(
        (agenciesData || []).map(async (agency) => {
          try {
            // Contar tours
            const { count: tourCount } = await supabase
              .from('tours')
              .select('*', { count: 'exact', head: true })
              .eq('agency_id', agency.id);

            // Contar reservas
            const { count: bookingCount } = await supabase
              .from('bookings')
              .select('*', { count: 'exact', head: true })
              .eq('agency_id', agency.id);

            return {
              ...agency,
              tour_count: tourCount || 0,
              booking_count: bookingCount || 0
            };
          } catch (err) {
            console.error('Error obteniendo estadísticas para agencia:', agency.id, err);
            return {
              ...agency,
              tour_count: 0,
              booking_count: 0
            };
          }
        })
      );

      setAgencies(agenciesWithStats);
    } catch (err: any) {
      console.error('❌ Error cargando agencias:', err);
      setError(err.message || 'Error al cargar las agencias');
    } finally {
      setIsLoading(false);
    }
  };

  const handleStatusToggle = async (agencyId: string, currentStatus: boolean) => {
    try {
      setIsUpdating(agencyId);
      
      const { error } = await updateAgencyStatus(agencyId, !currentStatus);
      
      if (error) {
        throw new Error(error.message);
      }

      // Actualizar el estado local
      setAgencies(agencies.map(agency => 
        agency.id === agencyId 
          ? { ...agency, is_active: !currentStatus }
          : agency
      ));

      console.log(`✅ Estado de agencia ${agencyId} actualizado a:`, !currentStatus);
    } catch (err: any) {
      console.error('❌ Error actualizando estado de agencia:', err);
      setError(err.message || 'Error al actualizar el estado de la agencia');
    } finally {
      setIsUpdating(null);
    }
  };

  const filteredAgencies = agencies.filter(agency => {
    const matchesSearch = 
      agency.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      agency.contact_email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (agency.users?.email || '').toLowerCase().includes(searchTerm.toLowerCase());

    const matchesFilter = 
      filterStatus === 'all' ||
      (filterStatus === 'active' && agency.is_active) ||
      (filterStatus === 'inactive' && !agency.is_active);

    return matchesSearch && matchesFilter;
  });

  const getStatusBadge = (isActive: boolean) => {
    if (isActive) {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-success-100 text-success-800">
          <CheckCircle className="h-3 w-3 mr-1" />
          Activa
        </span>
      );
    } else {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-error-100 text-error-800">
          <XCircle className="h-3 w-3 mr-1" />
          Inactiva
        </span>
      );
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

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Gestión de Agencias</h1>
          <p className="text-gray-600 mt-1">
            Administra las agencias registradas en la plataforma
          </p>
        </div>
        <div className="flex items-center space-x-4">
          <div className="bg-white rounded-lg shadow-sm p-4">
            <div className="text-2xl font-bold text-primary-600">{agencies.length}</div>
            <div className="text-sm text-gray-500">Total Agencias</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-4">
            <div className="text-2xl font-bold text-success-600">
              {agencies.filter(a => a.is_active).length}
            </div>
            <div className="text-sm text-gray-500">Activas</div>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-6 bg-error-50 text-error-600 p-4 rounded-md">
          {error}
        </div>
      )}

      {/* Filtros y búsqueda */}
      <div className="bg-white rounded-lg shadow-md p-4 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar por nombre, email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Filter className="h-4 w-4 text-gray-400" />
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as 'all' | 'active' | 'inactive')}
              className="border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="all">Todas las agencias</option>
              <option value="active">Solo activas</option>
              <option value="inactive">Solo inactivas</option>
            </select>
          </div>
        </div>
      </div>

      {/* Lista de agencias */}
      {filteredAgencies.length === 0 ? (
        <div className="bg-white rounded-lg shadow-md p-8 text-center">
          <Building className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold mb-2">
            {agencies.length === 0 ? 'No hay agencias registradas' : 'No se encontraron agencias'}
          </h3>
          <p className="text-gray-600">
            {agencies.length === 0 
              ? 'Las agencias aparecerán aquí cuando se registren en la plataforma.'
              : 'Intenta ajustar los filtros de búsqueda.'
            }
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Agencia
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Contacto
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Estadísticas
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Estado
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Fecha de Registro
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredAgencies.map((agency) => (
                  <tr key={agency.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10">
                          {agency.logo ? (
                            <img
                              className="h-10 w-10 rounded-full object-cover"
                              src={agency.logo}
                              alt={agency.name}
                            />
                          ) : (
                            <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center">
                              <Building className="h-5 w-5 text-gray-500" />
                            </div>
                          )}
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">
                            {agency.name}
                          </div>
                          {agency.description && (
                            <div className="text-sm text-gray-500 max-w-xs truncate">
                              {agency.description}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="space-y-1">
                        <div className="flex items-center text-sm text-gray-900">
                          <Mail className="h-3 w-3 mr-1 text-gray-400" />
                          {agency.contact_email}
                        </div>
                        {agency.contact_phone && (
                          <div className="flex items-center text-sm text-gray-500">
                            <Phone className="h-3 w-3 mr-1 text-gray-400" />
                            {agency.contact_phone}
                          </div>
                        )}
                        {agency.website && (
                          <div className="flex items-center text-sm text-gray-500">
                            <Globe className="h-3 w-3 mr-1 text-gray-400" />
                            <a 
                              href={agency.website} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="hover:text-primary-600"
                            >
                              Sitio web
                            </a>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="space-y-1">
                        <div className="text-sm text-gray-900">
                          {agency.tour_count || 0} tours
                        </div>
                        <div className="text-sm text-gray-500">
                          {agency.booking_count || 0} reservas
                        </div>
                        {agency.rating && (
                          <div className="text-sm text-gray-500">
                            ⭐ {agency.rating.toFixed(1)}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(agency.is_active)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center text-sm text-gray-500">
                        <Calendar className="h-3 w-3 mr-1" />
                        {new Date(agency.created_at).toLocaleDateString('es-ES')}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => handleStatusToggle(agency.id, agency.is_active)}
                          disabled={isUpdating === agency.id}
                          className={`inline-flex items-center px-3 py-1 rounded-md text-xs font-medium ${
                            agency.is_active
                              ? 'bg-error-100 text-error-700 hover:bg-error-200'
                              : 'bg-success-100 text-success-700 hover:bg-success-200'
                          } disabled:opacity-50`}
                        >
                          {isUpdating === agency.id ? (
                            <div className="animate-spin rounded-full h-3 w-3 border-t border-b border-current mr-1"></div>
                          ) : agency.is_active ? (
                            <EyeOff className="h-3 w-3 mr-1" />
                          ) : (
                            <Eye className="h-3 w-3 mr-1" />
                          )}
                          {agency.is_active ? 'Desactivar' : 'Activar'}
                        </button>
                        <button
                          onClick={() => setSelectedAgency(agency)}
                          className="text-primary-600 hover:text-primary-900"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal de detalles (opcional) */}
      {selectedAgency && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Detalles de {selectedAgency.name}
              </h3>
              <div className="space-y-3 text-sm">
                <div>
                  <span className="font-medium">Usuario propietario:</span>
                  <div className="text-gray-600">
                    {selectedAgency.users?.first_name} {selectedAgency.users?.last_name}
                    <br />
                    {selectedAgency.users?.email}
                  </div>
                </div>
                <div>
                  <span className="font-medium">ID de agencia:</span>
                  <div className="text-gray-600 font-mono text-xs">{selectedAgency.id}</div>
                </div>
                <div>
                  <span className="font-medium">Última actualización:</span>
                  <div className="text-gray-600">
                    {new Date(selectedAgency.updated_at).toLocaleString('es-ES')}
                  </div>
                </div>
              </div>
              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setSelectedAgency(null)}
                  className="btn btn-outline"
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
};

export default AdminAgencies;