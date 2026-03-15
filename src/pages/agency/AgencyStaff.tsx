import { useState, useEffect } from 'react';
import { Users, Plus, UserCheck, UserX, CreditCard as Edit2, Search, Shield, ChevronDown, ChevronUp, AlertCircle, CheckCircle, X, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface StaffMember {
  id: string;
  user_id: string;
  title: string;
  is_active: boolean;
  linked_at: string;
  unlinked_at: string | null;
  user: {
    first_name: string;
    last_name: string;
    email: string;
    profile_picture_url: string | null;
  };
  permissions: {
    id: string;
    can_scan_checkin: boolean;
    can_view_bookings: boolean;
    can_manage_tours: boolean;
    can_view_financials: boolean;
    can_view_reports: boolean;
    can_manage_discount_codes: boolean;
    can_view_messages: boolean;
    can_manage_destinations: boolean;
  } | null;
}

interface PermissionsForm {
  can_scan_checkin: boolean;
  can_view_bookings: boolean;
  can_manage_tours: boolean;
  can_view_financials: boolean;
  can_view_reports: boolean;
  can_manage_discount_codes: boolean;
  can_view_messages: boolean;
  can_manage_destinations: boolean;
}

const defaultPermissions: PermissionsForm = {
  can_scan_checkin: false,
  can_view_bookings: false,
  can_manage_tours: false,
  can_view_financials: false,
  can_view_reports: false,
  can_manage_discount_codes: false,
  can_view_messages: false,
  can_manage_destinations: false,
};

const permissionLabels: Record<keyof PermissionsForm, string> = {
  can_scan_checkin: 'Escanear Check-in QR',
  can_view_bookings: 'Ver Reservas',
  can_manage_tours: 'Gestionar Tours',
  can_view_financials: 'Ver Finanzas',
  can_view_reports: 'Ver Reportes',
  can_manage_discount_codes: 'Gestionar Codigos de Descuento',
  can_view_messages: 'Ver Mensajes',
  can_manage_destinations: 'Gestionar Destinos',
};

const permissionDescriptions: Record<keyof PermissionsForm, string> = {
  can_scan_checkin: 'Puede confirmar asistencia de viajeros mediante codigo QR',
  can_view_bookings: 'Puede ver el listado de reservas y sus detalles',
  can_manage_tours: 'Puede crear, editar y gestionar los tours de la agencia',
  can_view_financials: 'Puede ver los estados de cuenta y registros financieros',
  can_view_reports: 'Puede acceder a los reportes de actividad',
  can_manage_discount_codes: 'Puede crear y gestionar codigos de descuento',
  can_view_messages: 'Puede leer y responder mensajes de la agencia',
  can_manage_destinations: 'Puede crear y gestionar los destinos de la agencia',
};

export default function AgencyStaff() {
  const { user, isAgencyStaff } = useAuth();
  const [agencyId, setAgencyId] = useState<string | null>(null);
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [expandedStaff, setExpandedStaff] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('active');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [emailSearch, setEmailSearch] = useState('');
  const [foundUser, setFoundUser] = useState<{ id: string; first_name: string; last_name: string; email: string } | null>(null);
  const [searchingUser, setSearchingUser] = useState(false);
  const [userSearchError, setUserSearchError] = useState('');
  const [title, setTitle] = useState('Coordinador');
  const [permissions, setPermissions] = useState<PermissionsForm>({ ...defaultPermissions });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchAgencyId();
  }, [user?.id]);

  useEffect(() => {
    if (agencyId) fetchStaff();
  }, [agencyId]);

  const fetchAgencyId = async () => {
    if (!user?.id) return;
    try {
      const { data, error } = await supabase
        .from('agencies')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw error;
      if (data) setAgencyId(data.id);
    } catch (err) {
      console.error('Error fetching agency:', err);
    }
  };

  const fetchStaff = async () => {
    if (!agencyId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('agency_staff')
        .select(`
          id, user_id, title, is_active, linked_at, unlinked_at,
          user:users!agency_staff_user_id_fkey(first_name, last_name, email, profile_picture_url),
          permissions:agency_staff_permissions(id, can_scan_checkin, can_view_bookings, can_manage_tours, can_view_financials, can_view_reports, can_manage_discount_codes, can_view_messages, can_manage_destinations)
        `)
        .eq('agency_id', agencyId)
        .order('linked_at', { ascending: false });

      if (error) throw error;
      const mapped = (data || []).map((s: any) => ({
        ...s,
        user: Array.isArray(s.user) ? s.user[0] : s.user,
        permissions: Array.isArray(s.permissions) ? s.permissions[0] || null : s.permissions,
      }));
      setStaffList(mapped);
    } catch (err) {
      console.error('Error fetching staff:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchUser = async () => {
    if (!emailSearch.trim()) return;
    setSearchingUser(true);
    setUserSearchError('');
    setFoundUser(null);
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, first_name, last_name, email')
        .eq('email', emailSearch.trim().toLowerCase())
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        setUserSearchError('No se encontro un usuario con ese correo electronico.');
        return;
      }
      const alreadyLinked = staffList.find(s => s.user_id === data.id && s.is_active);
      if (alreadyLinked) {
        setUserSearchError('Este usuario ya es coordinador activo de tu agencia.');
        return;
      }
      setFoundUser(data);
    } catch {
      setUserSearchError('Error al buscar el usuario. Intenta de nuevo.');
    } finally {
      setSearchingUser(false);
    }
  };

  const openAddModal = () => {
    setEditingStaff(null);
    setEmailSearch('');
    setFoundUser(null);
    setUserSearchError('');
    setTitle('Coordinador');
    setPermissions({ ...defaultPermissions });
    setError('');
    setShowModal(true);
  };

  const openEditModal = (staff: StaffMember) => {
    setEditingStaff(staff);
    setEmailSearch(staff.user.email);
    setFoundUser(null);
    setUserSearchError('');
    setTitle(staff.title);
    if (staff.permissions) {
      setPermissions({
        can_scan_checkin: staff.permissions.can_scan_checkin,
        can_view_bookings: staff.permissions.can_view_bookings,
        can_manage_tours: staff.permissions.can_manage_tours,
        can_view_financials: staff.permissions.can_view_financials,
        can_view_reports: staff.permissions.can_view_reports,
        can_manage_discount_codes: staff.permissions.can_manage_discount_codes,
        can_view_messages: staff.permissions.can_view_messages,
        can_manage_destinations: staff.permissions.can_manage_destinations,
      });
    } else {
      setPermissions({ ...defaultPermissions });
    }
    setError('');
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!agencyId) return;
    setSaving(true);
    setError('');
    try {
      if (editingStaff) {
        const { error: titleError } = await supabase
          .from('agency_staff')
          .update({ title })
          .eq('id', editingStaff.id);
        if (titleError) throw titleError;

        if (editingStaff.permissions) {
          const { error: permError } = await supabase
            .from('agency_staff_permissions')
            .update({ ...permissions, updated_at: new Date().toISOString() })
            .eq('staff_id', editingStaff.id);
          if (permError) throw permError;
        } else {
          const { error: permError } = await supabase
            .from('agency_staff_permissions')
            .insert({ staff_id: editingStaff.id, ...permissions });
          if (permError) throw permError;
        }
        setSuccess('Permisos actualizados correctamente.');
      } else {
        if (!foundUser) {
          setError('Busca y selecciona un usuario primero.');
          setSaving(false);
          return;
        }

        const existingInactive = staffList.find(s => s.user_id === foundUser.id && !s.is_active);
        let staffId: string;

        if (existingInactive) {
          const { error: reactivateError } = await supabase
            .from('agency_staff')
            .update({ is_active: true, title, linked_at: new Date().toISOString(), unlinked_at: null })
            .eq('id', existingInactive.id);
          if (reactivateError) throw reactivateError;
          staffId = existingInactive.id;

          if (existingInactive.permissions) {
            await supabase.from('agency_staff_permissions').update({ ...permissions }).eq('staff_id', staffId);
          } else {
            await supabase.from('agency_staff_permissions').insert({ staff_id: staffId, ...permissions });
          }
        } else {
          const { data: newStaff, error: staffError } = await supabase
            .from('agency_staff')
            .insert({ agency_id: agencyId, user_id: foundUser.id, title, is_active: true })
            .select('id')
            .single();
          if (staffError) throw staffError;
          staffId = newStaff.id;

          const { error: permError } = await supabase
            .from('agency_staff_permissions')
            .insert({ staff_id: staffId, ...permissions });
          if (permError) throw permError;
        }
        setSuccess('Coordinador vinculado correctamente.');
      }

      setShowModal(false);
      await fetchStaff();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || 'Error al guardar los cambios.');
    } finally {
      setSaving(false);
    }
  };

  const handleUnlink = async (staff: StaffMember) => {
    if (!confirm(`Desvincular a ${staff.user.first_name} ${staff.user.last_name} como coordinador?`)) return;
    try {
      const { error } = await supabase
        .from('agency_staff')
        .update({ is_active: false, unlinked_at: new Date().toISOString() })
        .eq('id', staff.id);
      if (error) throw error;
      setSuccess('Coordinador desvinculado.');
      await fetchStaff();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleRelink = async (staff: StaffMember) => {
    try {
      const { error } = await supabase
        .from('agency_staff')
        .update({ is_active: true, linked_at: new Date().toISOString(), unlinked_at: null })
        .eq('id', staff.id);
      if (error) throw error;
      setSuccess('Coordinador reactivado.');
      await fetchStaff();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const toggleGrantAll = () => {
    const allGranted = Object.values(permissions).every(Boolean);
    const newVal = !allGranted;
    setPermissions(Object.fromEntries(Object.keys(defaultPermissions).map(k => [k, newVal])) as PermissionsForm);
  };

  const filteredStaff = staffList.filter(s => {
    const matchSearch = `${s.user.first_name} ${s.user.last_name} ${s.user.email}`.toLowerCase().includes(searchTerm.toLowerCase());
    const matchActive = filterActive === 'all' ? true : filterActive === 'active' ? s.is_active : !s.is_active;
    return matchSearch && matchActive;
  });

  const activeCount = staffList.filter(s => s.is_active).length;

  const formatDate = (d: string) => new Date(d).toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric' });

  const initials = (staff: StaffMember) => `${staff.user.first_name?.[0] || ''}${staff.user.last_name?.[0] || ''}`.toUpperCase();

  if (isAgencyStaff) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md mx-auto p-8">
          <Shield className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Acceso restringido</h2>
          <p className="text-gray-600">Solo el propietario de la agencia puede gestionar coordinadores.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Coordinadores</h1>
            <p className="text-gray-500 mt-1 text-sm">
              {activeCount} coordinador{activeCount !== 1 ? 'es' : ''} activo{activeCount !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            onClick={openAddModal}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 transition-colors text-sm"
          >
            <Plus className="w-4 h-4" />
            Agregar coordinador
          </button>
        </div>

        {success && (
          <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-800 rounded-lg px-4 py-3 mb-6 text-sm">
            <CheckCircle className="w-4 h-4 flex-shrink-0" />
            {success}
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-800 rounded-lg px-4 py-3 mb-6 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
            <button onClick={() => setError('')} className="ml-auto"><X className="w-4 h-4" /></button>
          </div>
        )}

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-6">
          <div className="flex flex-col sm:flex-row gap-3 p-4 border-b border-gray-100">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Buscar coordinador..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <select
              value={filterActive}
              onChange={e => setFilterActive(e.target.value as any)}
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
            >
              <option value="all">Todos</option>
              <option value="active">Activos</option>
              <option value="inactive">Inactivos</option>
            </select>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
            </div>
          ) : filteredStaff.length === 0 ? (
            <div className="text-center py-16">
              <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">Sin coordinadores</p>
              <p className="text-gray-400 text-sm mt-1">Agrega coordinadores para que puedan gestionar tu agencia.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filteredStaff.map(staff => (
                <div key={staff.id} className="p-4">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-primary-100 text-primary-700 font-semibold text-sm flex items-center justify-center flex-shrink-0 overflow-hidden">
                      {staff.user.profile_picture_url ? (
                        <img src={staff.user.profile_picture_url} alt="" className="w-full h-full object-cover" />
                      ) : initials(staff)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-gray-900 text-sm">{staff.user.first_name} {staff.user.last_name}</span>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${staff.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {staff.is_active ? <><UserCheck className="w-3 h-3" /> Activo</> : <><UserX className="w-3 h-3" /> Inactivo</>}
                        </span>
                      </div>
                      <p className="text-gray-500 text-xs mt-0.5">{staff.user.email}</p>
                      <p className="text-gray-600 text-xs mt-0.5">{staff.title} &bull; Vinculado {formatDate(staff.linked_at)}</p>
                      {!staff.is_active && staff.unlinked_at && (
                        <p className="text-gray-400 text-xs">Desvinculado {formatDate(staff.unlinked_at)}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {staff.is_active && (
                        <>
                          <button
                            onClick={() => setExpandedStaff(expandedStaff === staff.id ? null : staff.id)}
                            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                            title="Ver permisos"
                          >
                            {expandedStaff === staff.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>
                          <button
                            onClick={() => openEditModal(staff)}
                            className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                            title="Editar permisos"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleUnlink(staff)}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Desvincular"
                          >
                            <UserX className="w-4 h-4" />
                          </button>
                        </>
                      )}
                      {!staff.is_active && (
                        <button
                          onClick={() => handleRelink(staff)}
                          className="px-3 py-1.5 text-xs font-medium text-primary-600 border border-primary-200 hover:bg-primary-50 rounded-lg transition-colors"
                        >
                          Reactivar
                        </button>
                      )}
                    </div>
                  </div>

                  {expandedStaff === staff.id && staff.permissions && (
                    <div className="mt-4 ml-14 grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {(Object.keys(permissionLabels) as (keyof PermissionsForm)[]).map(key => (
                        <div key={key} className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs ${staff.permissions![key] ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-400'}`}>
                          {staff.permissions![key] ? <CheckCircle className="w-3 h-3 flex-shrink-0" /> : <X className="w-3 h-3 flex-shrink-0" />}
                          <span>{permissionLabels[key]}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">
                {editingStaff ? 'Editar coordinador' : 'Agregar coordinador'}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {error && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {error}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Correo electronico</label>
                {editingStaff ? (
                  <p className="text-gray-900 font-medium text-sm bg-gray-50 px-3 py-2 rounded-lg">{editingStaff.user.email}</p>
                ) : (
                  <div className="flex gap-2">
                    <input
                      type="email"
                      value={emailSearch}
                      onChange={e => { setEmailSearch(e.target.value); setFoundUser(null); setUserSearchError(''); }}
                      placeholder="correo@ejemplo.com"
                      className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                      onKeyDown={e => e.key === 'Enter' && handleSearchUser()}
                    />
                    <button
                      onClick={handleSearchUser}
                      disabled={searchingUser || !emailSearch.trim()}
                      className="px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors flex items-center gap-1"
                    >
                      {searchingUser ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                      Buscar
                    </button>
                  </div>
                )}

                {userSearchError && (
                  <p className="text-red-600 text-xs mt-2 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{userSearchError}</p>
                )}
                {foundUser && (
                  <div className="mt-2 flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                    <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                    <div>
                      <p className="text-green-800 text-sm font-medium">{foundUser.first_name} {foundUser.last_name}</p>
                      <p className="text-green-600 text-xs">{foundUser.email}</p>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cargo / Titulo</label>
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="ej. Coordinador, Guia, Supervisor..."
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-medium text-gray-700">Permisos</label>
                  <button
                    onClick={toggleGrantAll}
                    className="text-xs text-primary-600 hover:text-primary-700 font-medium"
                  >
                    {Object.values(permissions).every(Boolean) ? 'Quitar todos' : 'Otorgar todos'}
                  </button>
                </div>
                <div className="space-y-2">
                  {(Object.keys(permissionLabels) as (keyof PermissionsForm)[]).map(key => (
                    <label key={key} className="flex items-start gap-3 p-3 rounded-lg border border-gray-100 hover:border-primary-200 hover:bg-primary-50/30 cursor-pointer transition-colors">
                      <input
                        type="checkbox"
                        checked={permissions[key]}
                        onChange={e => setPermissions(p => ({ ...p, [key]: e.target.checked }))}
                        className="mt-0.5 w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">{permissionLabels[key]}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{permissionDescriptions[key]}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving || (!editingStaff && !foundUser)}
                className="px-5 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg disabled:opacity-50 transition-colors flex items-center gap-2"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {editingStaff ? 'Guardar cambios' : 'Vincular coordinador'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
