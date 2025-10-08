import React, { useState, useEffect } from 'react';
import { User, Mail, Calendar, Save, CreditCard as Edit, X, MapPin, CreditCard, Globe, Phone } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

interface TravelerProfile {
  id: string;
  first_name?: string;
  last_name?: string;
  email: string;
  role: string;
  created_at: string;
  updated_at: string;
  curp?: string;
  passport_number?: string;
  is_foreign_traveler?: boolean;
  booking_count?: number;
  total_spent?: number;
}

const TravelerProfile: React.FC = () => {
  const { user } = useAuth();
  const [profile, setProfile] = useState<TravelerProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [editForm, setEditForm] = useState({
    first_name: '',
    last_name: '',
    curp: '',
    passport_number: '',
    is_foreign_traveler: false
  });

  useEffect(() => {
    if (user?.id) {
      fetchProfile();
    }
  }, [user]);

  const fetchProfile = async () => {
    if (!user?.id) return;

    try {
      setIsLoading(true);
      setError('');

      console.log('👤 Cargando perfil de viajero para usuario:', user.id);

      // Obtener perfil del usuario
      const { data: profileData, error: profileError } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single();

      if (profileError) {
        throw new Error(profileError.message);
      }

      console.log('✅ Perfil de viajero cargado:', profileData);

      // Obtener estadísticas del viajero
      const [bookingsResult, spentResult] = await Promise.all([
        // Contar reservas
        supabase
          .from('bookings')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id),
        
        // Calcular total gastado (suma de user_payment de reservas exitosas)
        supabase
          .from('bookings')
          .select('user_payment')
          .eq('user_id', user.id)
          .eq('payment_status', 'succeeded')
      ]);

      const totalSpent = spentResult.data?.reduce((sum, booking) => 
        sum + (booking.user_payment || 0), 0) || 0;

      const profileWithStats = {
        ...profileData,
        booking_count: bookingsResult.count || 0,
        total_spent: totalSpent
      };

      setProfile(profileWithStats);

      // Inicializar formulario de edición
      setEditForm({
        first_name: profileData.first_name || '',
        last_name: profileData.last_name || '',
        curp: profileData.curp || '',
        passport_number: profileData.passport_number || '',
        is_foreign_traveler: profileData.is_foreign_traveler || false
      });

    } catch (err: any) {
      console.error('❌ Error cargando perfil de viajero:', err);
      setError(err.message || 'Error al cargar el perfil');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user?.id) return;

    try {
      setIsSaving(true);
      setError('');
      setSuccess('');

      // Validaciones
      if (editForm.is_foreign_traveler) {
        if (!editForm.passport_number?.trim()) {
          throw new Error('El número de pasaporte es obligatorio para viajeros extranjeros');
        }
        if (editForm.passport_number.trim().length < 6) {
          throw new Error('El número de pasaporte debe tener al menos 6 caracteres');
        }
      } else {
        if (!editForm.curp?.trim()) {
          throw new Error('El CURP es obligatorio para viajeros mexicanos');
        }
        if (editForm.curp.trim().length !== 18) {
          throw new Error('El CURP debe tener exactamente 18 caracteres');
        }
      }

      console.log('💾 Guardando cambios del perfil...');

      const updateData: any = {
        first_name: editForm.first_name?.trim() || null,
        last_name: editForm.last_name?.trim() || null,
        is_foreign_traveler: editForm.is_foreign_traveler,
        updated_at: new Date().toISOString()
      };

      // Agregar CURP o pasaporte según el tipo de viajero
      if (editForm.is_foreign_traveler) {
        updateData.passport_number = editForm.passport_number?.trim().toUpperCase() || null;
        updateData.curp = null; // Limpiar CURP si es extranjero
      } else {
        updateData.curp = editForm.curp?.trim().toUpperCase() || null;
        updateData.passport_number = null; // Limpiar pasaporte si es mexicano
      }

      const { error } = await supabase
        .from('users')
        .update(updateData)
        .eq('id', user.id);

      if (error) {
        throw new Error(error.message);
      }

      console.log('✅ Perfil actualizado correctamente');
      setSuccess('Perfil actualizado correctamente');
      setIsEditing(false);

      // Recargar datos
      await fetchProfile();

    } catch (err: any) {
      console.error('❌ Error guardando perfil:', err);
      setError(err.message || 'Error al guardar los cambios');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    if (!profile) return;

    setEditForm({
      first_name: profile.first_name || '',
      last_name: profile.last_name || '',
      curp: profile.curp || '',
      passport_number: profile.passport_number || '',
      is_foreign_traveler: profile.is_foreign_traveler || false
    });
    setIsEditing(false);
    setError('');
    setSuccess('');
  };

  const formatCurp = (curp: string) => {
    if (!curp) return '';
    // Format CURP as ABCD123456HEFGHI01
    return curp.replace(/(.{4})(.{6})(.{6})(.{2})/, '$1 $2 $3 $4');
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

  if (error && !profile) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow-md p-8 text-center">
          <User className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold mb-2">Error al Cargar Perfil</h3>
          <p className="text-gray-600 mb-6">{error}</p>
          <button 
            onClick={fetchProfile}
            className="btn btn-primary"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow-md p-8 text-center">
          <User className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold mb-2">Cargando perfil...</h3>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-md overflow-hidden mb-6">
          <div className="bg-gradient-to-r from-primary-600 to-primary-700 px-6 py-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <div className="h-20 w-20 rounded-full bg-white/20 flex items-center justify-center">
                  <User className="h-10 w-10 text-white" />
                </div>
                <div className="ml-6">
                  <h1 className="text-2xl font-bold text-white">
                    {profile.first_name || profile.last_name 
                      ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim()
                      : 'Viajero'
                    }
                  </h1>
                  <p className="text-primary-100">
                    {profile.is_foreign_traveler ? 'Viajero Internacional' : 'Viajero Nacional'}
                  </p>
                  <div className="flex items-center mt-2">
                    <span className="px-2 py-1 rounded-full text-xs font-medium bg-success-100 text-success-800">
                      Cuenta Activa
                    </span>
                  </div>
                </div>
              </div>
              {!isEditing && (
                <button
                  onClick={() => setIsEditing(true)}
                  className="btn bg-white/20 text-white border-white/30 hover:bg-white/30"
                >
                  <Edit className="h-4 w-4 mr-2" />
                  Editar Perfil
                </button>
              )}
            </div>
          </div>

          {/* Estadísticas */}
          <div className="bg-gray-50 px-6 py-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-primary-600">{profile.booking_count || 0}</div>
                <div className="text-sm text-gray-500">Reservas Realizadas</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-success-600">${(profile.total_spent || 0).toLocaleString()}</div>
                <div className="text-sm text-gray-500">Total Invertido en Viajes</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-accent-600">
                  {new Date(profile.created_at).getFullYear()}
                </div>
                <div className="text-sm text-gray-500">Miembro desde</div>
              </div>
            </div>
          </div>
        </div>

        {/* Mensajes */}
        {error && (
          <div className="mb-6 bg-error-50 text-error-600 p-4 rounded-md">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-6 bg-success-50 text-success-600 p-4 rounded-md">
            {success}
          </div>
        )}

        {/* Contenido Principal */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Información Personal */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Información Personal</h2>
                {!isEditing && (
                  <button
                    onClick={() => setIsEditing(true)}
                    className="btn btn-outline"
                  >
                    <Edit className="h-4 w-4 mr-2" />
                    Editar
                  </button>
                )}
              </div>

              {isEditing ? (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Nombre
                      </label>
                      <input
                        type="text"
                        value={editForm.first_name}
                        onChange={(e) => setEditForm({...editForm, first_name: e.target.value})}
                        className="input"
                        placeholder="Tu nombre"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Apellido
                      </label>
                      <input
                        type="text"
                        value={editForm.last_name}
                        onChange={(e) => setEditForm({...editForm, last_name: e.target.value})}
                        className="input"
                        placeholder="Tu apellido"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center mb-3">
                      <input
                        id="isForeignTraveler"
                        type="checkbox"
                        checked={editForm.is_foreign_traveler}
                        onChange={(e) => setEditForm({...editForm, is_foreign_traveler: e.target.checked})}
                        className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                      />
                      <label htmlFor="isForeignTraveler" className="ml-2 block text-sm text-gray-900">
                        Soy viajero extranjero
                      </label>
                    </div>
                  </div>

                  {!editForm.is_foreign_traveler ? (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        CURP *
                      </label>
                      <input
                        type="text"
                        maxLength={18}
                        value={editForm.curp}
                        onChange={(e) => setEditForm({...editForm, curp: e.target.value.toUpperCase()})}
                        className="input"
                        placeholder="ABCD123456HEFGHI01"
                        required={!editForm.is_foreign_traveler}
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Clave Única de Registro de Población (18 caracteres)
                      </p>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Número de Pasaporte *
                      </label>
                      <input
                        type="text"
                        maxLength={20}
                        value={editForm.passport_number}
                        onChange={(e) => setEditForm({...editForm, passport_number: e.target.value.toUpperCase()})}
                        className="input"
                        placeholder="A12345678"
                        required={editForm.is_foreign_traveler}
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Número de pasaporte válido de tu país de origen
                      </p>
                    </div>
                  )}

                  <div className="flex justify-end space-x-4 pt-4">
                    <button
                      onClick={handleCancel}
                      className="btn btn-outline"
                      disabled={isSaving}
                    >
                      <X className="h-4 w-4 mr-2" />
                      Cancelar
                    </button>
                    <button
                      onClick={handleSave}
                      className="btn btn-primary"
                      disabled={isSaving}
                    >
                      <Save className="h-4 w-4 mr-2" />
                      {isSaving ? 'Guardando...' : 'Guardar Cambios'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-500 mb-1">
                        Nombre Completo
                      </label>
                      <div className="flex items-center p-3 bg-gray-50 rounded-md">
                        <User className="h-4 w-4 text-gray-400 mr-2" />
                        <span>
                          {profile.first_name || profile.last_name
                            ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim()
                            : 'No especificado'
                          }
                        </span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-500 mb-1">
                        Correo Electrónico
                      </label>
                      <div className="flex items-center p-3 bg-gray-50 rounded-md">
                        <Mail className="h-4 w-4 text-gray-400 mr-2" />
                        <span>{profile.email}</span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-500 mb-1">
                        Tipo de Viajero
                      </label>
                      <div className="flex items-center p-3 bg-gray-50 rounded-md">
                        <Globe className="h-4 w-4 text-gray-400 mr-2" />
                        <span>
                          {profile.is_foreign_traveler ? 'Viajero Internacional' : 'Viajero Nacional'}
                        </span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-500 mb-1">
                        {profile.is_foreign_traveler ? 'Número de Pasaporte' : 'CURP'}
                      </label>
                      <div className="flex items-center p-3 bg-gray-50 rounded-md">
                        <CreditCard className="h-4 w-4 text-gray-400 mr-2" />
                        <span className="font-mono text-sm">
                          {profile.is_foreign_traveler 
                            ? (profile.passport_number || 'No especificado')
                            : (profile.curp ? formatCurp(profile.curp) : 'No especificado')
                          }
                        </span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-500 mb-1">
                        Miembro desde
                      </label>
                      <div className="flex items-center p-3 bg-gray-50 rounded-md">
                        <Calendar className="h-4 w-4 text-gray-400 mr-2" />
                        <span>
                          {new Date(profile.created_at).toLocaleDateString('es-ES', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                          })}
                        </span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-500 mb-1">
                        Última Actualización
                      </label>
                      <div className="flex items-center p-3 bg-gray-50 rounded-md">
                        <Calendar className="h-4 w-4 text-gray-400 mr-2" />
                        <span>
                          {new Date(profile.updated_at).toLocaleDateString('es-ES', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                          })}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Información de Cuenta y Estadísticas */}
          <div className="space-y-6">
            {/* Estadísticas de Viaje */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Estadísticas de Viaje
              </h2>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <MapPin className="h-5 w-5 text-primary-600 mr-3" />
                    <div>
                      <div className="text-sm font-medium text-gray-900">Reservas Realizadas</div>
                      <div className="text-xs text-gray-500">Total de tours reservados</div>
                    </div>
                  </div>
                  <div className="text-2xl font-bold text-primary-600">
                    {profile.booking_count || 0}
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <CreditCard className="h-5 w-5 text-success-600 mr-3" />
                    <div>
                      <div className="text-sm font-medium text-gray-900">Total Invertido</div>
                      <div className="text-xs text-gray-500">En experiencias de viaje</div>
                    </div>
                  </div>
                  <div className="text-2xl font-bold text-success-600">
                    ${(profile.total_spent || 0).toLocaleString()}
                  </div>
                </div>
              </div>
            </div>

            {/* Información de Seguridad */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Información de Cuenta
              </h2>
              <div className="space-y-3">
                <div className="flex items-center">
                  <Mail className="h-4 w-4 text-gray-400 mr-3" />
                  <div>
                    <div className="text-sm font-medium text-gray-900">Email de Cuenta</div>
                    <div className="text-sm text-gray-600">{profile.email}</div>
                  </div>
                </div>

                <div className="flex items-center">
                  <User className="h-4 w-4 text-gray-400 mr-3" />
                  <div>
                    <div className="text-sm font-medium text-gray-900">Tipo de Cuenta</div>
                    <div className="text-sm text-gray-600">Viajero</div>
                  </div>
                </div>

                <div className="flex items-center">
                  <Calendar className="h-4 w-4 text-gray-400 mr-3" />
                  <div>
                    <div className="text-sm font-medium text-gray-900">ID de Usuario</div>
                    <div className="text-xs text-gray-500 font-mono break-all">
                      {profile.id}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Información de Identificación */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Identificación
              </h2>
              <div className="space-y-3">
                <div className="flex items-center">
                  <Globe className="h-4 w-4 text-gray-400 mr-3" />
                  <div>
                    <div className="text-sm font-medium text-gray-900">Tipo de Viajero</div>
                    <div className="text-sm text-gray-600">
                      {profile.is_foreign_traveler ? 'Internacional' : 'Nacional (México)'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center">
                  <CreditCard className="h-4 w-4 text-gray-400 mr-3" />
                  <div>
                    <div className="text-sm font-medium text-gray-900">
                      {profile.is_foreign_traveler ? 'Pasaporte' : 'CURP'}
                    </div>
                    <div className="text-sm text-gray-600 font-mono">
                      {profile.is_foreign_traveler 
                        ? (profile.passport_number || 'No especificado')
                        : (profile.curp ? formatCurp(profile.curp) : 'No especificado')
                      }
                    </div>
                  </div>
                </div>
              </div>

              {(!profile.curp && !profile.passport_number) && (
                <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                  <p className="text-sm text-yellow-800">
                    <strong>Acción requerida:</strong> Completa tu información de identificación para poder realizar reservas.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Información Adicional */}
        <div className="mt-6 bg-white rounded-lg shadow-md p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Información del Sistema
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
            <div>
              <h3 className="font-medium text-gray-700 mb-2">Privacidad y Seguridad</h3>
              <ul className="space-y-1 text-gray-600">
                <li>• Tus datos están protegidos con encriptación SSL</li>
                <li>• Solo tú y las agencias con las que reserves pueden ver tu información</li>
                <li>• Puedes actualizar tu información en cualquier momento</li>
                <li>• Tu CURP/Pasaporte se usa solo para verificación de identidad</li>
              </ul>
            </div>
            <div>
              <h3 className="font-medium text-gray-700 mb-2">Beneficios de Completar tu Perfil</h3>
              <ul className="space-y-1 text-gray-600">
                <li>• Proceso de reserva más rápido</li>
                <li>• Recomendaciones personalizadas</li>
                <li>• Comunicación directa con agencias</li>
                <li>• Historial completo de viajes</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TravelerProfile;