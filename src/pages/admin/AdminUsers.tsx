import React, { useState, useEffect } from 'react';
import { Users, Search, Filter, Edit, Trash2, Eye, UserPlus, Shield, Building, MapPin, Calendar, Mail, Phone, MoreVertical, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { format } from 'date-fns';

interface AdminUser {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  role: 'admin' | 'agency' | 'traveler';
  created_at: string;
  updated_at: string;
  agencies?: {
    id: string;
    name: string;
    is_active: boolean;
    tour_count?: number;
    booking_count?: number;
  };
  booking_count?: number;
  last_login?: string;
}

const AdminUsers: React.FC = () => {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'agency' | 'traveler'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [isEditingUser, setIsEditingUser] = useState(false);
  const [isUpdating, setIsUpdating] = useState<string | null>(null);

  const [userForm, setUserForm] = useState({
    email: '',
    first_name: '',
    last_name: '',
    role: 'traveler' as 'admin' | 'agency' | 'traveler',
    password: '',
    agency_name: '',
    agency_contact_phone: ''
  });

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      setIsLoading(true);
      setError('');

      console.log('👥 Cargando usuarios desde la BD...');

      // Obtener usuarios con información de agencias
      const { data: usersData, error: usersError } = await supabase
        .from('users')
        .select(`
          *,
          agencies(
            id,
            name,
            is_active
          )
        `)
        .order('created_at', { ascending: false });

      if (usersError) {
        throw new Error(usersError.message);
      }

      console.log('✅ Usuarios cargados:', usersData);

      // Obtener estadísticas adicionales para cada usuario
      const usersWithStats = await Promise.all(
        (usersData || []).map(async (user) => {
          try {
            let agencyStats = null;
            let bookingCount = 0;

            if (user.role === 'agency' && user.agencies) {
              // Estadísticas para agencias
              const [toursResult, bookingsResult] = await Promise.all([
                supabase
                  .from('tours')
                  .select('*', { count: 'exact', head: true })
                  .eq('agency_id', user.agencies.id),
                supabase
                  .from('bookings')
                  .select('*', { count: 'exact', head: true })
                  .eq('agency_id', user.agencies.id)
              ]);

              agencyStats = {
                ...user.agencies,
                tour_count: toursResult.count || 0,
                booking_count: bookingsResult.count || 0
              };
            } else if (user.role === 'traveler') {
              // Estadísticas para viajeros
              const { count } = await supabase
                .from('bookings')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', user.id);

              bookingCount = count || 0;
            }

            return {
              ...user,
              agencies: agencyStats,
              booking_count: bookingCount
            };
          } catch (err) {
            console.error('Error obteniendo estadísticas para usuario:', user.id, err);
            return {
              ...user,
              booking_count: 0
            };
          }
        })
      );

      setUsers(usersWithStats);
    } catch (err: any) {
      console.error('❌ Error cargando usuarios:', err);
      setError(err.message || 'Error al cargar usuarios');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateUser = async () => {
    try {
      setIsUpdating('creating');
      setError('');

      // Validaciones
      if (!userForm.email || !userForm.password || !userForm.role) {
        throw new Error('Email, contraseña y rol son obligatorios');
      }

      if (userForm.role === 'agency' && !userForm.agency_name) {
        throw new Error('El nombre de la agencia es obligatorio para usuarios tipo agencia');
      }

      // Crear usuario en Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: userForm.email,
        password: userForm.password,
        email_confirm: true,
        user_metadata: {
          role: userForm.role
        }
      });

      if (authError) {
        throw new Error(`Error creando usuario: ${authError.message}`);
      }

      if (!authData.user) {
        throw new Error('No se pudo crear el usuario');
      }

      // Crear perfil de usuario
      const { error: profileError } = await supabase
        .from('users')
        .insert({
          id: authData.user.id,
          email: userForm.email,
          first_name: userForm.first_name || null,
          last_name: userForm.last_name || null,
          role: userForm.role
        });

      if (profileError) {
        throw new Error(`Error creando perfil: ${profileError.message}`);
      }

      // Si es agencia, crear perfil de agencia
      if (userForm.role === 'agency') {
        const { error: agencyError } = await supabase
          .from('agencies')
          .insert({
            user_id: authData.user.id,
            name: userForm.agency_name,
            contact_email: userForm.email,
            contact_phone: userForm.agency_contact_phone || null,
            is_active: true
          });

        if (agencyError) {
          throw new Error(`Error creando agencia: ${agencyError.message}`);
        }
      }

      console.log('✅ Usuario creado correctamente');
      await fetchUsers();
      setIsCreatingUser(false);
      resetForm();
    } catch (err: any) {
      console.error('❌ Error creando usuario:', err);
      setError(err.message || 'Error al crear usuario');
    } finally {
      setIsUpdating(null);
    }
  };

  const handleUpdateUser = async () => {
    if (!selectedUser) return;

    try {
      setIsUpdating(selectedUser.id);
      setError('');

      // Actualizar perfil de usuario
      const { error: profileError } = await supabase
        .from('users')
        .update({
          first_name: userForm.first_name || null,
          last_name: userForm.last_name || null,
          role: userForm.role,
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedUser.id);

      if (profileError) {
        throw new Error(`Error actualizando perfil: ${profileError.message}`);
      }

      // Si es agencia y tiene perfil de agencia, actualizar
      if (userForm.role === 'agency' && selectedUser.agencies) {
        const { error: agencyError } = await supabase
          .from('agencies')
          .update({
            name: userForm.agency_name,
            contact_phone: userForm.agency_contact_phone || null,
            updated_at: new Date().toISOString()
          })
          .eq('id', selectedUser.agencies.id);

        if (agencyError) {
          throw new Error(`Error actualizando agencia: ${agencyError.message}`);
        }
      }

      console.log('✅ Usuario actualizado correctamente');
      await fetchUsers();
      setIsEditingUser(false);
      setSelectedUser(null);
      resetForm();
    } catch (err: any) {
      console.error('❌ Error actualizando usuario:', err);
      setError(err.message || 'Error al actualizar usuario');
    } finally {
      setIsUpdating(null);
    }
  };

  const handleDeleteUser = async (user: AdminUser) => {
    if (!confirm(`¿Estás seguro de que quieres eliminar al usuario "${user.email}"?\n\nEsta acción eliminará:\n- El perfil del usuario\n- Su agencia (si la tiene)\n- Todos sus tours y reservas\n\nEsta acción NO se puede deshacer.`)) {
      return;
    }

    try {
      setIsUpdating(user.id);
      setError('');

      // Eliminar usuario de Supabase Auth (esto activará el CASCADE en la BD)
      const { error: authError } = await supabase.auth.admin.deleteUser(user.id);

      if (authError) {
        throw new Error(`Error eliminando usuario: ${authError.message}`);
      }

      console.log('✅ Usuario eliminado correctamente');
      await fetchUsers();
    } catch (err: any) {
      console.error('❌ Error eliminando usuario:', err);
      setError(err.message || 'Error al eliminar usuario');
    } finally {
      setIsUpdating(null);
    }
  };

  const handleToggleAgencyStatus = async (user: AdminUser) => {
    if (!user.agencies) return;

    try {
      setIsUpdating(user.id);
      setError('');

      const newStatus = !user.agencies.is_active;

      const { error } = await supabase
        .from('agencies')
        .update({ 
          is_active: newStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.agencies.id);

      if (error) {
        throw new Error(error.message);
      }

      console.log(`✅ Estado de agencia actualizado a: ${newStatus}`);
      await fetchUsers();
    } catch (err: any) {
      console.error('❌ Error actualizando estado de agencia:', err);
      setError(err.message || 'Error al actualizar estado de agencia');
    } finally {
      setIsUpdating(null);
    }
  };

  const resetForm = () => {
    setUserForm({
      email: '',
      first_name: '',
      last_name: '',
      role: 'traveler',
      password: '',
      agency_name: '',
      agency_contact_phone: ''
    });
  };

  const openCreateModal = () => {
    resetForm();
    setIsCreatingUser(true);
    setSelectedUser(null);
  };

  const openEditModal = (user: AdminUser) => {
    setUserForm({
      email: user.email,
      first_name: user.first_name || '',
      last_name: user.last_name || '',
      role: user.role,
      password: '',
      agency_name: user.agencies?.name || '',
      agency_contact_phone: user.agencies?.contact_phone || ''
    });
    setSelectedUser(user);
    setIsEditingUser(true);
  };

  const closeModals = () => {
    setIsCreatingUser(false);
    setIsEditingUser(false);
    setSelectedUser(null);
    resetForm();
    setError('');
  };

  const filteredUsers = users.filter(user => {
    const matchesSearch = 
      user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (user.first_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (user.last_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (user.agencies?.name || '').toLowerCase().includes(searchTerm.toLowerCase());

    const matchesRole = roleFilter === 'all' || user.role === roleFilter;

    const matchesStatus = statusFilter === 'all' || 
      (statusFilter === 'active' && (user.role !== 'agency' || user.agencies?.is_active)) ||
      (statusFilter === 'inactive' && user.role === 'agency' && !user.agencies?.is_active);

    return matchesSearch && matchesRole && matchesStatus;
  });

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'admin':
        return <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-800 rounded-full flex items-center"><Shield className="h-3 w-3 mr-1" />Admin</span>;
      case 'agency':
        return <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full flex items-center"><Building className="h-3 w-3 mr-1" />Agencia</span>;
      default:
        return <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full flex items-center"><MapPin className="h-3 w-3 mr-1" />Viajero</span>;
    }
  };

  const getStatusBadge = (user: AdminUser) => {
    if (user.role === 'agency') {
      return user.agencies?.is_active ? (
        <span className="px-2 py-1 text-xs font-medium bg-success-100 text-success-800 rounded-full flex items-center">
          <CheckCircle className="h-3 w-3 mr-1" />Activa
        </span>
      ) : (
        <span className="px-2 py-1 text-xs font-medium bg-error-100 text-error-800 rounded-full flex items-center">
          <XCircle className="h-3 w-3 mr-1" />Inactiva
        </span>
      );
    }
    return (
      <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-800 rounded-full">
        N/A
      </span>
    );
  };

  const getUserDisplayName = (user: AdminUser) => {
    if (user.first_name || user.last_name) {
      return `${user.first_name || ''} ${user.last_name || ''}`.trim();
    }
    return user.email;
  };

  const stats = {
    total: users.length,
    admins: users.filter(u => u.role === 'admin').length,
    agencies: users.filter(u => u.role === 'agency').length,
    travelers: users.filter(u => u.role === 'traveler').length,
    activeAgencies: users.filter(u => u.role === 'agency' && u.agencies?.is_active).length
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
          <h1 className="text-3xl font-bold text-gray-900">Gestión de Usuarios</h1>
          <p className="text-gray-600 mt-1">
            Administra todos los usuarios registrados en la plataforma
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="btn btn-primary"
        >
          <UserPlus className="h-5 w-5 mr-2" />
          Crear Usuario
        </button>
      </div>

      {error && (
        <div className="mb-6 bg-error-50 text-error-600 p-4 rounded-md flex items-start">
          <AlertTriangle className="h-5 w-5 mr-2 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium">Error</p>
            <p className="text-sm">{error}</p>
          </div>
        </div>
      )}

      {/* Estadísticas */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow-md p-4">
          <div className="text-2xl font-bold text-primary-600">{stats.total}</div>
          <div className="text-sm text-gray-500">Total Usuarios</div>
        </div>
        <div className="bg-white rounded-lg shadow-md p-4">
          <div className="text-2xl font-bold text-red-600">{stats.admins}</div>
          <div className="text-sm text-gray-500">Administradores</div>
        </div>
        <div className="bg-white rounded-lg shadow-md p-4">
          <div className="text-2xl font-bold text-blue-600">{stats.agencies}</div>
          <div className="text-sm text-gray-500">Agencias</div>
        </div>
        <div className="bg-white rounded-lg shadow-md p-4">
          <div className="text-2xl font-bold text-green-600">{stats.travelers}</div>
          <div className="text-sm text-gray-500">Viajeros</div>
        </div>
        <div className="bg-white rounded-lg shadow-md p-4">
          <div className="text-2xl font-bold text-success-600">{stats.activeAgencies}</div>
          <div className="text-sm text-gray-500">Agencias Activas</div>
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
                placeholder="Buscar por nombre, email o agencia..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <Filter className="h-4 w-4 text-gray-400" />
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value as any)}
                className="border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              >
                <option value="all">Todos los roles</option>
                <option value="admin">Administradores</option>
                <option value="agency">Agencias</option>
                <option value="traveler">Viajeros</option>
              </select>
            </div>
            <div className="flex items-center space-x-2">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              >
                <option value="all">Todos los estados</option>
                <option value="active">Activos</option>
                <option value="inactive">Inactivos</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Lista de Usuarios */}
      {filteredUsers.length === 0 ? (
        <div className="bg-white rounded-lg shadow-md p-8 text-center">
          <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold mb-2">
            {users.length === 0 ? 'No hay usuarios registrados' : 'No se encontraron usuarios'}
          </h3>
          <p className="text-gray-600">
            {users.length === 0 
              ? 'Los usuarios aparecerán aquí cuando se registren en la plataforma.'
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
                    Usuario
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Rol
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Información Adicional
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Estado
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Estadísticas
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
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10">
                          <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center">
                            {user.role === 'admin' ? (
                              <Shield className="h-5 w-5 text-red-500" />
                            ) : user.role === 'agency' ? (
                              <Building className="h-5 w-5 text-blue-500" />
                            ) : (
                              <Users className="h-5 w-5 text-green-500" />
                            )}
                          </div>
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">
                            {getUserDisplayName(user)}
                          </div>
                          <div className="text-sm text-gray-500">{user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getRoleBadge(user.role)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {user.role === 'agency' && user.agencies ? (
                        <div className="text-sm">
                          <div className="font-medium text-gray-900">{user.agencies.name}</div>
                          <div className="text-gray-500">Agencia de Viajes</div>
                        </div>
                      ) : user.role === 'admin' ? (
                        <div className="text-sm text-gray-500">
                          Administrador del Sistema
                        </div>
                      ) : (
                        <div className="text-sm text-gray-500">
                          Usuario Viajero
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(user)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {user.role === 'agency' && user.agencies ? (
                          <div className="space-y-1">
                            <div>{user.agencies.tour_count || 0} tours</div>
                            <div className="text-gray-500">{user.agencies.booking_count || 0} reservas</div>
                          </div>
                        ) : user.role === 'traveler' ? (
                          <div>{user.booking_count || 0} reservas</div>
                        ) : (
                          <div className="text-gray-500">N/A</div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center text-sm text-gray-500">
                        <Calendar className="h-3 w-3 mr-1" />
                        {format(new Date(user.created_at), 'dd/MM/yyyy')}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => openEditModal(user)}
                          disabled={isUpdating === user.id}
                          className="text-primary-600 hover:text-primary-900 disabled:opacity-50"
                          title="Editar usuario"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        
                        {user.role === 'agency' && user.agencies && (
                          <button
                            onClick={() => handleToggleAgencyStatus(user)}
                            disabled={isUpdating === user.id}
                            className={`${
                              user.agencies.is_active
                                ? 'text-error-600 hover:text-error-900'
                                : 'text-success-600 hover:text-success-900'
                            } disabled:opacity-50`}
                            title={user.agencies.is_active ? 'Desactivar agencia' : 'Activar agencia'}
                          >
                            {user.agencies.is_active ? <XCircle className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
                          </button>
                        )}
                        
                        <button
                          onClick={() => handleDeleteUser(user)}
                          disabled={isUpdating === user.id}
                          className="text-error-600 hover:text-error-900 disabled:opacity-50"
                          title="Eliminar usuario"
                        >
                          {isUpdating === user.id ? (
                            <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-error-600"></div>
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
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

      {/* Modal de Crear Usuario */}
      {isCreatingUser && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-full max-w-md shadow-lg rounded-md bg-white">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium text-gray-900">Crear Nuevo Usuario</h3>
              <button onClick={closeModals} className="text-gray-400 hover:text-gray-600">
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email *
                </label>
                <input
                  type="email"
                  value={userForm.email}
                  onChange={(e) => setUserForm({...userForm, email: e.target.value})}
                  className="input"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Contraseña *
                </label>
                <input
                  type="password"
                  value={userForm.password}
                  onChange={(e) => setUserForm({...userForm, password: e.target.value})}
                  className="input"
                  required
                  minLength={6}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nombre
                  </label>
                  <input
                    type="text"
                    value={userForm.first_name}
                    onChange={(e) => setUserForm({...userForm, first_name: e.target.value})}
                    className="input"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Apellido
                  </label>
                  <input
                    type="text"
                    value={userForm.last_name}
                    onChange={(e) => setUserForm({...userForm, last_name: e.target.value})}
                    className="input"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Rol *
                </label>
                <select
                  value={userForm.role}
                  onChange={(e) => setUserForm({...userForm, role: e.target.value as any})}
                  className="input"
                  required
                >
                  <option value="traveler">Viajero</option>
                  <option value="agency">Agencia</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>

              {userForm.role === 'agency' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Nombre de la Agencia *
                    </label>
                    <input
                      type="text"
                      value={userForm.agency_name}
                      onChange={(e) => setUserForm({...userForm, agency_name: e.target.value})}
                      className="input"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Teléfono de Contacto
                    </label>
                    <input
                      type="tel"
                      value={userForm.agency_contact_phone}
                      onChange={(e) => setUserForm({...userForm, agency_contact_phone: e.target.value})}
                      className="input"
                    />
                  </div>
                </>
              )}
            </div>

            <div className="flex justify-end space-x-4 mt-6">
              <button
                onClick={closeModals}
                className="btn btn-outline"
                disabled={isUpdating === 'creating'}
              >
                Cancelar
              </button>
              <button
                onClick={handleCreateUser}
                className="btn btn-primary"
                disabled={isUpdating === 'creating' || !userForm.email || !userForm.password}
              >
                {isUpdating === 'creating' ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-2"></div>
                    Creando...
                  </>
                ) : (
                  <>
                    <UserPlus className="h-4 w-4 mr-2" />
                    Crear Usuario
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Editar Usuario */}
      {isEditingUser && selectedUser && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-full max-w-md shadow-lg rounded-md bg-white">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium text-gray-900">Editar Usuario</h3>
              <button onClick={closeModals} className="text-gray-400 hover:text-gray-600">
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <div className="flex items-center p-3 bg-gray-50 rounded-md">
                  <Mail className="h-4 w-4 text-gray-400 mr-2" />
                  <span className="text-sm text-gray-600">{selectedUser.email}</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  El email no se puede modificar
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nombre
                  </label>
                  <input
                    type="text"
                    value={userForm.first_name}
                    onChange={(e) => setUserForm({...userForm, first_name: e.target.value})}
                    className="input"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Apellido
                  </label>
                  <input
                    type="text"
                    value={userForm.last_name}
                    onChange={(e) => setUserForm({...userForm, last_name: e.target.value})}
                    className="input"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Rol *
                </label>
                <select
                  value={userForm.role}
                  onChange={(e) => setUserForm({...userForm, role: e.target.value as any})}
                  className="input"
                  required
                >
                  <option value="traveler">Viajero</option>
                  <option value="agency">Agencia</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>

              {userForm.role === 'agency' && selectedUser.agencies && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Nombre de la Agencia *
                    </label>
                    <input
                      type="text"
                      value={userForm.agency_name}
                      onChange={(e) => setUserForm({...userForm, agency_name: e.target.value})}
                      className="input"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Teléfono de Contacto
                    </label>
                    <input
                      type="tel"
                      value={userForm.agency_contact_phone}
                      onChange={(e) => setUserForm({...userForm, agency_contact_phone: e.target.value})}
                      className="input"
                    />
                  </div>
                </>
              )}

              <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
                <p className="text-sm text-yellow-800">
                  <strong>Nota:</strong> Cambiar el rol de un usuario puede afectar su acceso a la plataforma.
                </p>
              </div>
            </div>

            <div className="flex justify-end space-x-4 mt-6">
              <button
                onClick={closeModals}
                className="btn btn-outline"
                disabled={isUpdating === selectedUser.id}
              >
                Cancelar
              </button>
              <button
                onClick={handleUpdateUser}
                className="btn btn-primary"
                disabled={isUpdating === selectedUser.id}
              >
                {isUpdating === selectedUser.id ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-2"></div>
                    Actualizando...
                  </>
                ) : (
                  <>
                    <Edit className="h-4 w-4 mr-2" />
                    Actualizar Usuario
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminUsers;