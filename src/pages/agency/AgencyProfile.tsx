import React, { useState, useEffect } from 'react';
import { Building, Mail, Phone, Globe, Star, Edit, Save, X, Upload, User, Calendar, MapPin } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import ImageUploader from '../../components/ImageUploader';

interface AgencyProfile {
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

const AgencyProfile: React.FC = () => {
  const { user } = useAuth();
  const [agency, setAgency] = useState<AgencyProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [editForm, setEditForm] = useState({
    name: '',
    description: '',
    logo: '',
    contact_email: '',
    contact_phone: '',
    website: '',
    first_name: '',
    last_name: ''
  });

  useEffect(() => {
    fetchAgencyProfile();
  }, [user]);

  const fetchAgencyProfile = async () => {
    if (!user?.id) return;

    try {
      setIsLoading(true);
      setError('');

      console.log('🏢 Cargando perfil de agencia para usuario:', user.id);

      // Obtener perfil de agencia con información del usuario
      const { data: agencyData, error: agencyError } = await supabase
        .from('agencies')
        .select(`
          *,
          users(first_name, last_name, email)
        `)
        .eq('user_id', user.id)
        .single();

      if (agencyError) {
        if (agencyError.code === 'PGRST116') {
          // No se encontró perfil de agencia
          setError('No se encontró un perfil de agencia para este usuario. ¿Necesitas registrarte como agencia?');
          return;
        }
        throw new Error(agencyError.message);
      }

      console.log('✅ Perfil de agencia cargado:', agencyData);

      // Obtener estadísticas
      const [toursResult, bookingsResult] = await Promise.all([
        supabase
          .from('tours')
          .select('*', { count: 'exact', head: true })
          .eq('agency_id', agencyData.id),
        supabase
          .from('bookings')
          .select('*', { count: 'exact', head: true })
          .eq('agency_id', agencyData.id)
      ]);

      const agencyWithStats = {
        ...agencyData,
        tour_count: toursResult.count || 0,
        booking_count: bookingsResult.count || 0
      };

      setAgency(agencyWithStats);

      // Inicializar formulario de edición
      setEditForm({
        name: agencyData.name || '',
        description: agencyData.description || '',
        logo: agencyData.logo || '',
        contact_email: agencyData.contact_email || '',
        contact_phone: agencyData.contact_phone || '',
        website: agencyData.website || '',
        first_name: agencyData.users?.first_name || '',
        last_name: agencyData.users?.last_name || ''
      });

    } catch (err: any) {
      console.error('❌ Error cargando perfil de agencia:', err);
      setError(err.message || 'Error al cargar el perfil de la agencia');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!agency?.id || !user?.id) return;

    try {
      setIsSaving(true);
      setError('');
      setSuccess('');

      console.log('💾 Guardando cambios del perfil...');

      // Actualizar datos de la agencia
      const { error: agencyError } = await supabase
        .from('agencies')
        .update({
          name: editForm.name,
          description: editForm.description,
          logo: editForm.logo,
          contact_email: editForm.contact_email,
          contact_phone: editForm.contact_phone,
          website: editForm.website,
          updated_at: new Date().toISOString()
        })
        .eq('id', agency.id);

      if (agencyError) {
        throw new Error(`Error actualizando agencia: ${agencyError.message}`);
      }

      // Actualizar datos del usuario propietario
      const { error: userError } = await supabase
        .from('users')
        .update({
          first_name: editForm.first_name,
          last_name: editForm.last_name,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);

      if (userError) {
        console.warn('⚠️ Error actualizando datos del usuario:', userError);
        // No lanzar error aquí, ya que la agencia se actualizó correctamente
      }

      console.log('✅ Perfil actualizado correctamente');
      setSuccess('Perfil actualizado correctamente');
      setIsEditing(false);

      // Recargar datos
      await fetchAgencyProfile();

    } catch (err: any) {
      console.error('❌ Error guardando perfil:', err);
      setError(err.message || 'Error al guardar los cambios');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    if (!agency) return;

    setEditForm({
      name: agency.name || '',
      description: agency.description || '',
      logo: agency.logo || '',
      contact_email: agency.contact_email || '',
      contact_phone: agency.contact_phone || '',
      website: agency.website || '',
      first_name: agency.users?.first_name || '',
      last_name: agency.users?.last_name || ''
    });
    setIsEditing(false);
    setError('');
    setSuccess('');
  };

  const handleLogoSelect = (base64: string, type: string, size: number) => {
    setEditForm({ ...editForm, logo: base64 });
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

  if (error && !agency) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow-md p-8 text-center">
          <Building className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold mb-2">Perfil de Agencia No Encontrado</h3>
          <p className="text-gray-600 mb-6">{error}</p>
          <a href="/agency-signup" className="btn btn-primary">
            Registrarse como Agencia
          </a>
        </div>
      </div>
    );
  }

  if (!agency) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow-md p-8 text-center">
          <Building className="h-12 w-12 text-gray-400 mx-auto mb-4" />
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
                <div className="h-20 w-20 rounded-full bg-white/20 flex items-center justify-center overflow-hidden">
                  {(isEditing ? editForm.logo : agency.logo) ? (
                    <img
                      src={isEditing ? editForm.logo : agency.logo}
                      alt={agency.name}
                      className="h-20 w-20 rounded-full object-cover"
                    />
                  ) : (
                    <Building className="h-10 w-10 text-white" />
                  )}
                </div>
                <div className="ml-6">
                  <h1 className="text-2xl font-bold text-white">
                    {isEditing ? editForm.name : agency.name}
                  </h1>
                  <p className="text-primary-100">Agencia de Viajes</p>
                  <div className="flex items-center mt-2">
                    {agency.rating && (
                      <div className="flex items-center text-white">
                        <Star className="h-4 w-4 fill-current mr-1" />
                        <span className="text-sm">{agency.rating.toFixed(1)}</span>
                      </div>
                    )}
                    <span className={`ml-3 px-2 py-1 rounded-full text-xs font-medium ${
                      agency.is_active 
                        ? 'bg-success-100 text-success-800' 
                        : 'bg-error-100 text-error-800'
                    }`}>
                      {agency.is_active ? 'Activa' : 'Inactiva'}
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
                <div className="text-2xl font-bold text-primary-600">{agency.tour_count || 0}</div>
                <div className="text-sm text-gray-500">Tours Publicados</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-success-600">{agency.booking_count || 0}</div>
                <div className="text-sm text-gray-500">Reservas Totales</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-accent-600">
                  {new Date(agency.created_at).getFullYear()}
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
          {/* Información Principal */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Información de la Agencia
              </h2>

              {isEditing ? (
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Nombre de la Agencia *
                    </label>
                    <input
                      type="text"
                      value={editForm.name}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      className="input"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Descripción
                    </label>
                    <textarea
                      value={editForm.description}
                      onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                      className="input"
                      rows={4}
                      placeholder="Describe tu agencia, servicios y experiencia..."
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Logo de la Agencia
                    </label>
                    <ImageUploader
                      onImageSelect={handleLogoSelect}
                      currentImage={editForm.logo}
                      maxSizeMB={2}
                      placeholder="Subir logo de la agencia"
                    />
                  </div>

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
                      disabled={isSaving || !editForm.name.trim()}
                    >
                      <Save className="h-4 w-4 mr-2" />
                      {isSaving ? 'Guardando...' : 'Guardar Cambios'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-medium text-gray-500 mb-1">Descripción</h3>
                    <p className="text-gray-900">
                      {agency.description || 'No hay descripción disponible.'}
                    </p>
                  </div>

                  <div>
                    <h3 className="text-sm font-medium text-gray-500 mb-1">Fecha de Registro</h3>
                    <div className="flex items-center text-gray-900">
                      <Calendar className="h-4 w-4 mr-2 text-gray-400" />
                      {new Date(agency.created_at).toLocaleDateString('es-ES', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-medium text-gray-500 mb-1">Última Actualización</h3>
                    <div className="flex items-center text-gray-900">
                      <Calendar className="h-4 w-4 mr-2 text-gray-400" />
                      {new Date(agency.updated_at).toLocaleDateString('es-ES', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Información de Contacto y Usuario */}
          <div className="space-y-6">
            {/* Información de Contacto */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Información de Contacto
              </h2>

              {isEditing ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Email de Contacto *
                    </label>
                    <input
                      type="email"
                      value={editForm.contact_email}
                      onChange={(e) => setEditForm({ ...editForm, contact_email: e.target.value })}
                      className="input"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Teléfono
                    </label>
                    <input
                      type="tel"
                      value={editForm.contact_phone}
                      onChange={(e) => setEditForm({ ...editForm, contact_phone: e.target.value })}
                      className="input"
                      placeholder="+52 (55) 1234-5678"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Sitio Web
                    </label>
                    <input
                      type="url"
                      value={editForm.website}
                      onChange={(e) => setEditForm({ ...editForm, website: e.target.value })}
                      className="input"
                      placeholder="https://www.tuagencia.com"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center">
                    <Mail className="h-4 w-4 text-gray-400 mr-3" />
                    <div>
                      <div className="text-sm font-medium text-gray-900">Email</div>
                      <div className="text-sm text-gray-600">{agency.contact_email}</div>
                    </div>
                  </div>

                  {agency.contact_phone && (
                    <div className="flex items-center">
                      <Phone className="h-4 w-4 text-gray-400 mr-3" />
                      <div>
                        <div className="text-sm font-medium text-gray-900">Teléfono</div>
                        <div className="text-sm text-gray-600">{agency.contact_phone}</div>
                      </div>
                    </div>
                  )}

                  {agency.website && (
                    <div className="flex items-center">
                      <Globe className="h-4 w-4 text-gray-400 mr-3" />
                      <div>
                        <div className="text-sm font-medium text-gray-900">Sitio Web</div>
                        <a
                          href={agency.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-primary-600 hover:text-primary-700"
                        >
                          {agency.website}
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Información del Usuario Propietario */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Datos del Propietario
              </h2>

              {isEditing ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Nombre
                    </label>
                    <input
                      type="text"
                      value={editForm.first_name}
                      onChange={(e) => setEditForm({ ...editForm, first_name: e.target.value })}
                      className="input"
                      placeholder="Nombre del propietario"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Apellido
                    </label>
                    <input
                      type="text"
                      value={editForm.last_name}
                      onChange={(e) => setEditForm({ ...editForm, last_name: e.target.value })}
                      className="input"
                      placeholder="Apellido del propietario"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Email del Usuario
                    </label>
                    <div className="flex items-center p-3 bg-gray-50 rounded-md">
                      <Mail className="h-4 w-4 text-gray-400 mr-2" />
                      <span className="text-sm text-gray-600">{agency.users?.email}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      El email del usuario no se puede modificar desde aquí
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center">
                    <User className="h-4 w-4 text-gray-400 mr-3" />
                    <div>
                      <div className="text-sm font-medium text-gray-900">Nombre Completo</div>
                      <div className="text-sm text-gray-600">
                        {editForm.first_name || editForm.last_name
                          ? `${editForm.first_name || ''} ${editForm.last_name || ''}`.trim()
                          : 'No especificado'
                        }
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center">
                    <Mail className="h-4 w-4 text-gray-400 mr-3" />
                    <div>
                      <div className="text-sm font-medium text-gray-900">Email del Usuario</div>
                      <div className="text-sm text-gray-600">{agency.users?.email}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AgencyProfile;