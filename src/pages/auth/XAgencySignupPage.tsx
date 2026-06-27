import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Eye, EyeOff, Info, CheckCircle, XCircle, Loader } from 'lucide-react';
import { supabase, UserRole } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useFieldAvailability } from '../../hooks/useFieldAvailability';

const isLeakedPasswordError = (message: string) =>
  /leaked|pwned|compromised|common password/i.test(message);

const XAgencySignupPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, completeOnboarding } = useAuth();

  const meta = user?.user_metadata ?? {};
  const fullName: string = meta.full_name || meta.name || meta.user_name || '';
  const firstName = meta.given_name || fullName.split(' ')[0] || '';
  const lastName = meta.family_name || fullName.split(' ').slice(1).join(' ') || '';
  const email: string = user?.email || meta.email || '';
  const avatarUrl: string = meta.avatar_url || meta.picture || '';

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [activeTermsVersion, setActiveTermsVersion] = useState<{ version_number: number; published_at: string } | null>(null);

  const [formData, setFormData] = useState({
    firstName,
    apellidoPaterno: lastName,
    apellidoMaterno: '',
    dateOfBirth: '',
    sexo: '' as '' | 'masculino' | 'femenino' | 'no_binario',
    curp: '',
    email,
    password: '',
    confirmPassword: '',
    agencyName: '',
    phoneNumber: '',
    website: '',
    rfc: '',
    razonSocial: '',
    rnt: '',
    regimenFiscal: '',
    banco: '',
    cuentaClabe: '',
    titularCuenta: '',
    street: '',
    exteriorNumber: '',
    interiorNumber: '',
    colony: '',
    city: '',
    state: '',
    postalCode: '',
    country: 'México',
  });

  useEffect(() => {
    supabase.rpc('get_active_terms', { p_type: 'agency' }).then(({ data }) => {
      if (data && data.length > 0) setActiveTermsVersion(data[0]);
    });
  }, []);

  useEffect(() => {
    if (!user) navigate('/login');
  }, [user, navigate]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'rfc' || name === 'curp' ? value.toUpperCase() : value,
    }));
  };

  const handleSexoChange = (value: 'masculino' | 'femenino' | 'no_binario') => {
    setFormData(prev => ({ ...prev, sexo: value }));
  };

  const curpAvailability = useFieldAvailability(formData.curp, 'check_curp_available', 18, 18, 'agency');
  const identifierUnavailable = curpAvailability.isAvailable === false;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    const {
      firstName: fn, apellidoPaterno, apellidoMaterno, dateOfBirth, sexo, curp, email: em, password, confirmPassword,
      agencyName, phoneNumber, website, rfc, razonSocial, rnt, regimenFiscal, banco, cuentaClabe, titularCuenta,
      street, exteriorNumber, interiorNumber, colony, city, state, postalCode, country,
    } = formData;

    if (!apellidoPaterno.trim()) { setError('El apellido paterno es obligatorio'); setIsLoading(false); return; }
    if (!sexo) { setError('El sexo es obligatorio'); setIsLoading(false); return; }
    if (password !== confirmPassword) { setError('Las contraseñas no coinciden'); setIsLoading(false); return; }
    if (!agencyName.trim()) { setError('El nombre de la agencia es obligatorio'); setIsLoading(false); return; }
    if (!website.trim()) { setError('El sitio web o página es obligatorio'); setIsLoading(false); return; }
    if (!rfc.trim()) { setError('El RFC es obligatorio'); setIsLoading(false); return; }
    if (!razonSocial.trim()) { setError('La razón social es obligatoria'); setIsLoading(false); return; }
    if (!phoneNumber.trim()) { setError('El teléfono es obligatorio'); setIsLoading(false); return; }

    try {
      if (!user) throw new Error('Sesión no encontrada');

      const { error: insertError } = await supabase.from('users').insert({
        id: user.id,
        email: em,
        role: UserRole.AGENCY,
        first_name: fn.trim(),
        last_name: apellidoPaterno.trim(),
        apellido_paterno: apellidoPaterno.trim(),
        apellido_materno: apellidoMaterno.trim() || null,
        date_of_birth: dateOfBirth || null,
        sexo: sexo || null,
        curp: curp.trim() || null,
        phone_number: phoneNumber.trim(),
        email_verified: true,
        onboarding_completed: true,
        profile_picture_url: avatarUrl || null,
      });

      if (insertError) throw insertError;

      const { error: pwError } = await supabase.auth.updateUser({ password });
      if (pwError) {
        if (isLeakedPasswordError(pwError.message)) throw new Error('Esta contraseña ha sido expuesta en brechas de datos. Por favor elige una más segura.');
        throw pwError;
      }

      const { error: agencyError } = await supabase.from('agencies').insert({
        user_id: user.id,
        name: agencyName.trim(),
        contact_email: em,
        contact_phone: phoneNumber || null,
        website: website || null,
        rfc: rfc || null,
        razon_social: razonSocial.trim(),
        rnt: rnt || null,
        regimen_fiscal: regimenFiscal || null,
        banco: banco || null,
        cuenta_clabe: cuentaClabe || null,
        titular_cuenta: titularCuenta || null,
        street: street || null,
        exterior_number: exteriorNumber || null,
        interior_number: interiorNumber || null,
        colony: colony || null,
        city: city || null,
        state: state || null,
        postal_code: postalCode || null,
        country: country || 'México',
        is_active: true,
      });

      if (agencyError) throw new Error('Error al crear el perfil de agencia: ' + agencyError.message);

      await supabase.from('user_auth_providers').upsert(
        { user_id: user.id, provider: 'x', provider_user_id: user.id },
        { onConflict: 'user_id,provider' }
      );
      await supabase.from('user_auth_providers').upsert(
        { user_id: user.id, provider: 'email' },
        { onConflict: 'user_id,provider' }
      );

      await supabase.auth.updateUser({
        data: { onboarding_completed: true, role: UserRole.AGENCY },
      });

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/record-terms-acceptance`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
            body: JSON.stringify({ terms_type: 'agency' }),
          });
          await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-agency-registration-admin`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ agencyName: agencyName.trim(), email: em, firstName: fn, lastName: apellidoPaterno, phone: phoneNumber || null }),
          });
          await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-agency-welcome`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: em, firstName: fn, agencyName: agencyName.trim() }),
          });
        }
      } catch { /* best-effort */ }

      await completeOnboarding();
      navigate('/agency/dashboard');
    } catch (err: any) {
      setError(err.message || 'Ocurrió un error al completar el registro');
    } finally {
      setIsLoading(false);
    }
  };

  const inputClass = "appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm";

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-lg">
        <div className="flex items-center justify-center gap-2 mb-2">
          <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true" fill="currentColor">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
          </svg>
          <span className="text-sm font-medium text-gray-500">Registro con X</span>
        </div>
        <h2 className="text-center text-2xl font-bold text-gray-900">Completa tu perfil de Agencia</h2>
        <p className="mt-1 text-center text-sm text-gray-500">Una vez completado, tu perfil será revisado para aprobación.</p>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-lg">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">

          <div className="mb-6 flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
            <Info className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-blue-700">Tus datos de X han sido pre-llenados. Puedes editarlos si lo deseas.</p>
          </div>

          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-600 rounded-md p-3 text-sm">{error}</div>
          )}

          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-900">Información Personal</h3>
              <div>
                <label className="block text-sm font-medium text-gray-700">Nombre(s)</label>
                <input name="firstName" type="text" value={formData.firstName} onChange={handleInputChange} required className={`mt-1 ${inputClass}`} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Apellido Paterno</label>
                  <input name="apellidoPaterno" type="text" value={formData.apellidoPaterno} onChange={handleInputChange} required className={`mt-1 ${inputClass}`} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Apellido Materno <span className="text-gray-400 font-normal">(opcional)</span></label>
                  <input name="apellidoMaterno" type="text" value={formData.apellidoMaterno} onChange={handleInputChange} className={`mt-1 ${inputClass}`} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Fecha de Nacimiento <span className="text-gray-400 font-normal">(opcional)</span></label>
                <input name="dateOfBirth" type="date" value={formData.dateOfBirth} onChange={handleInputChange} className={`mt-1 ${inputClass}`} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Sexo</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['masculino', 'femenino', 'no_binario'] as const).map((opcion) => (
                    <label key={opcion} className={`flex items-center justify-center px-3 py-2 border rounded-md cursor-pointer text-sm font-medium transition-colors ${
                      formData.sexo === opcion ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                    }`}>
                      <input type="radio" name="sexo" value={opcion} checked={formData.sexo === opcion} onChange={() => handleSexoChange(opcion)} className="sr-only" />
                      {opcion === 'masculino' ? 'Masculino' : opcion === 'femenino' ? 'Femenino' : 'No Binario'}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">CURP <span className="text-gray-400 font-normal">(opcional)</span></label>
                <input name="curp" type="text" value={formData.curp} onChange={handleInputChange} placeholder="ABCD123456HDFRRL09" maxLength={18} className={`mt-1 ${inputClass} uppercase`} />
                {curpAvailability.isChecking && <p className="mt-1 text-xs text-gray-500 flex items-center gap-1"><Loader className="h-3 w-3 animate-spin" /> Verificando CURP...</p>}
                {!curpAvailability.isChecking && curpAvailability.isAvailable === true && <p className="mt-1 text-xs text-green-600 flex items-center gap-1"><CheckCircle className="h-3 w-3" /> CURP disponible como agencia</p>}
                {!curpAvailability.isChecking && curpAvailability.isAvailable === false && <p className="mt-1 text-xs text-red-600 flex items-center gap-1"><XCircle className="h-3 w-3" /> Esta CURP ya tiene una cuenta de agencia registrada.</p>}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Correo electrónico</label>
              <input
                name="email"
                type="email"
                value={formData.email}
                onChange={handleInputChange}
                required
                className={`mt-1 ${inputClass} ${email ? 'bg-gray-50' : ''}`}
                readOnly={!!email}
              />
              {email
                ? <p className="mt-1 text-xs text-gray-400">Email verificado por X</p>
                : <p className="mt-1 text-xs text-gray-500">X no proporcionó un email, por favor ingresa el tuyo.</p>
              }
            </div>

            <div className="border-t pt-4 space-y-4">
              <h3 className="text-sm font-semibold text-gray-900">Información de la Agencia</h3>
              <div>
                <label className="block text-sm font-medium text-gray-700">Nombre Comercial de la Agencia</label>
                <input name="agencyName" type="text" value={formData.agencyName} onChange={handleInputChange} required className={`mt-1 ${inputClass}`} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Teléfono</label>
                <input name="phoneNumber" type="tel" value={formData.phoneNumber} onChange={handleInputChange} placeholder="+52 55 1234 5678" required className={`mt-1 ${inputClass}`} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Sitio Web o Perfil de X</label>
                <input name="website" type="text" value={formData.website} onChange={handleInputChange} placeholder="https://mipagina.com" required className={`mt-1 ${inputClass}`} />
              </div>
            </div>

            <div className="border-t pt-4 space-y-4">
              <h3 className="text-sm font-semibold text-gray-900">Información Fiscal</h3>
              <div>
                <label className="block text-sm font-medium text-gray-700">RFC</label>
                <input name="rfc" type="text" value={formData.rfc} onChange={handleInputChange} placeholder="XAXX010101000" maxLength={13} required className={`mt-1 ${inputClass} uppercase`} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Razón Social</label>
                <input name="razonSocial" type="text" value={formData.razonSocial} onChange={handleInputChange} required className={`mt-1 ${inputClass}`} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">RNT <span className="text-gray-400 font-normal">(Opcional)</span></label>
                <input name="rnt" type="text" value={formData.rnt} onChange={handleInputChange} placeholder="Registro Nacional de Turismo" className={`mt-1 ${inputClass}`} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Régimen Fiscal <span className="text-gray-400 font-normal">(opcional)</span></label>
                <select name="regimenFiscal" value={formData.regimenFiscal} onChange={(e) => setFormData(prev => ({ ...prev, regimenFiscal: e.target.value }))} className={`mt-1 ${inputClass} bg-white`}>
                  <option value="">Selecciona tu régimen fiscal</option>
                  <option value="601">601 — General de Ley Personas Morales</option>
                  <option value="612">612 — Personas Físicas con Actividades Empresariales y Profesionales</option>
                  <option value="621">621 — Incorporación Fiscal (RIF)</option>
                  <option value="625">625 — Régimen de las Actividades Empresariales con ingresos a través de Plataformas Tecnológicas</option>
                  <option value="626">626 — Régimen Simplificado de Confianza (RESICO)</option>
                  <option value="608">608 — Demás Ingresos</option>
                </select>
              </div>
            </div>

            <div className="border-t pt-4 space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Información Bancaria</h3>
                <p className="text-xs text-gray-500 mt-0.5">Opcional, pero recomendable completarla desde el inicio para agilizar pagos.</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Banco <span className="text-gray-400 font-normal">(opcional)</span></label>
                  <input name="banco" type="text" value={formData.banco} onChange={handleInputChange} placeholder="Ej: BBVA, Banorte, Santander..." className={`mt-1 ${inputClass}`} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Titular de la Cuenta <span className="text-gray-400 font-normal">(opcional)</span></label>
                  <input name="titularCuenta" type="text" value={formData.titularCuenta} onChange={handleInputChange} placeholder="Nombre del titular" className={`mt-1 ${inputClass}`} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">CLABE Interbancaria <span className="text-gray-400 font-normal">(opcional)</span></label>
                <input name="cuentaClabe" type="text" value={formData.cuentaClabe} onChange={handleInputChange} placeholder="18 dígitos" maxLength={18} className={`mt-1 ${inputClass}`} />
                <p className="mt-1 text-xs text-gray-500">18 dígitos — necesaria para recibir transferencias</p>
              </div>
            </div>

            <div className="border-t pt-4 space-y-3">
              <h3 className="text-sm font-semibold text-gray-900">Domicilio de la Agencia</h3>
              <div>
                <label className="block text-sm font-medium text-gray-700">Calle</label>
                <input name="street" type="text" value={formData.street} onChange={handleInputChange} placeholder="Av. Insurgentes Sur" className={`mt-1 ${inputClass}`} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Núm. Exterior</label>
                  <input name="exteriorNumber" type="text" value={formData.exteriorNumber} onChange={handleInputChange} placeholder="123" className={`mt-1 ${inputClass}`} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Núm. Interior <span className="text-gray-400 font-normal">(opcional)</span></label>
                  <input name="interiorNumber" type="text" value={formData.interiorNumber} onChange={handleInputChange} placeholder="4B" className={`mt-1 ${inputClass}`} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Colonia</label>
                <input name="colony" type="text" value={formData.colony} onChange={handleInputChange} placeholder="Roma Norte" className={`mt-1 ${inputClass}`} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Ciudad</label>
                  <input name="city" type="text" value={formData.city} onChange={handleInputChange} placeholder="Ciudad de México" className={`mt-1 ${inputClass}`} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Estado</label>
                  <input name="state" type="text" value={formData.state} onChange={handleInputChange} placeholder="CDMX" className={`mt-1 ${inputClass}`} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Código Postal</label>
                  <input name="postalCode" type="text" value={formData.postalCode} onChange={handleInputChange} placeholder="06700" maxLength={5} className={`mt-1 ${inputClass}`} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">País</label>
                  <input name="country" type="text" value={formData.country} onChange={handleInputChange} placeholder="México" className={`mt-1 ${inputClass}`} />
                </div>
              </div>
            </div>

            <div className="border-t pt-4 space-y-4">
              <p className="text-sm text-gray-600">Asigna una contraseña para poder iniciar sesión también con tu correo y contraseña.</p>
              <div>
                <label className="block text-sm font-medium text-gray-700">Contraseña</label>
                <div className="mt-1 relative">
                  <input name="password" type={showPassword ? 'text' : 'password'} value={formData.password} onChange={handleInputChange} required autoComplete="new-password" className={`${inputClass} pr-10`} />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400">
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Confirmar Contraseña</label>
                <div className="mt-1 relative">
                  <input name="confirmPassword" type={showConfirmPassword ? 'text' : 'password'} value={formData.confirmPassword} onChange={handleInputChange} required autoComplete="new-password" className={`${inputClass} pr-10`} />
                  <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400">
                    {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={termsAccepted} onChange={e => setTermsAccepted(e.target.checked)} className="mt-0.5 h-4 w-4 text-primary-600 border-gray-300 rounded flex-shrink-0" />
                <span className="text-sm text-gray-700 leading-relaxed">
                  He leído y acepto los{' '}
                  <Link to="/terminos-servicio" target="_blank" className="font-medium text-primary-600 underline">Términos y Condiciones</Link>{' '}
                  y el{' '}
                  <Link to="/aviso-privacidad" target="_blank" className="font-medium text-primary-600 underline">Aviso de Privacidad</Link>{' '}
                  de ToursRed
                  {activeTermsVersion && (
                    <span className="block text-xs text-gray-400 mt-1">
                      Versión {activeTermsVersion.version_number} · vigente desde{' '}
                      {new Date(activeTermsVersion.published_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })}
                    </span>
                  )}
                </span>
              </label>
            </div>

            <button
              type="submit"
              disabled={isLoading || !termsAccepted || identifierUnavailable}
              className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Completando registro...' : 'Crear cuenta de Agencia'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default XAgencySignupPage;
