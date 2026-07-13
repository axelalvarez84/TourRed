import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, UserRole } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useFieldAvailability } from '../../hooks/useFieldAvailability';
import AgencySignupFormBody, { AgencyFormData, defaultAgencyFormData } from './AgencySignupFormBody';

const isLeakedPasswordError = (message: string) =>
  /leaked|pwned|compromised|common password/i.test(message);

const GoogleIcon = (
  <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
);

const GoogleAgencySignupPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, completeOnboarding } = useAuth();

  const meta = user?.user_metadata ?? {};
  const googleFullName: string = meta.full_name || meta.name || '';
  const preFirstName = meta.given_name || googleFullName.split(' ')[0] || '';
  const preLastName  = meta.family_name || googleFullName.split(' ').slice(1).join(' ') || '';
  const preEmail     = user?.email || meta.email || '';
  const avatarUrl    = meta.avatar_url || meta.picture || '';

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [activeTermsVersion, setActiveTermsVersion] = useState<{ version_number: number; published_at: string } | null>(null);
  const [formData, setFormData] = useState<AgencyFormData>({
    ...defaultAgencyFormData,
    firstName: preFirstName,
    apellidoPaterno: preLastName,
    email: preEmail,
  });

  useEffect(() => {
    supabase.rpc('get_active_terms', { p_type: 'agency' }).then(({ data }) => {
      if (data && data.length > 0) setActiveTermsVersion(data[0]);
    });
  }, []);

  useEffect(() => {
    if (!user) navigate('/login');
  }, [user, navigate]);

  const curpAvailability = useFieldAvailability(formData.curp, 'check_curp_available', 18, 18, 'agency');

  const handleChange = (field: keyof AgencyFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    const { firstName, apellidoPaterno, sexo, password, confirmPassword,
            agencyName, website, rfc, razonSocial, personaType, representanteLegalNombre } = formData;

    if (!apellidoPaterno.trim()) { setError('El apellido paterno es obligatorio'); setIsLoading(false); return; }
    if (!sexo) { setError('El sexo es obligatorio'); setIsLoading(false); return; }
    if (password !== confirmPassword) { setError('Las contraseñas no coinciden'); setIsLoading(false); return; }
    if (!agencyName.trim()) { setError('El nombre de la agencia es obligatorio'); setIsLoading(false); return; }
    if (!website.trim()) { setError('El sitio web o página de Facebook es obligatorio'); setIsLoading(false); return; }
    if (!rfc.trim()) { setError('El RFC es obligatorio'); setIsLoading(false); return; }
    if (!razonSocial.trim()) { setError('La razón social es obligatoria'); setIsLoading(false); return; }
    if (!personaType) { setError('El tipo de persona es obligatorio'); setIsLoading(false); return; }
    if (!representanteLegalNombre.trim()) { setError('El nombre de quien firma el contrato es obligatorio'); setIsLoading(false); return; }

    try {
      if (!user) throw new Error('Sesión no encontrada');

      const { error: insertError } = await supabase.from('users').insert({
        id: user.id,
        email: formData.email,
        role: UserRole.AGENCY,
        first_name: firstName.trim(),
        last_name: apellidoPaterno.trim(),
        apellido_paterno: apellidoPaterno.trim(),
        apellido_materno: formData.apellidoMaterno.trim() || null,
        date_of_birth: formData.dateOfBirth || null,
        sexo: sexo || null,
        curp: formData.curp.trim() || null,
        phone_number: formData.phoneNumber.trim(),
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
        contact_email: formData.email,
        contact_phone: formData.phoneNumber || null,
        website: formData.website || null,
        rfc: formData.rfc || null,
        razon_social: formData.razonSocial.trim(),
        persona_type: personaType || null,
        representante_legal_nombre: representanteLegalNombre.trim() || null,
        rnt: formData.rnt || null,
        regimen_fiscal: formData.regimenFiscal || null,
        banco: formData.banco || null,
        cuenta_clabe: formData.cuentaClabe || null,
        titular_cuenta: formData.titularCuenta || null,
        street: formData.street || null,
        exterior_number: formData.exteriorNumber || null,
        interior_number: formData.interiorNumber || null,
        colony: formData.colony || null,
        city: formData.city || null,
        state: formData.state || null,
        postal_code: formData.postalCode || null,
        country: formData.country || 'México',
        is_active: true,
      });
      if (agencyError) throw new Error('Error al crear el perfil de agencia: ' + agencyError.message);

      await supabase.from('user_auth_providers').upsert(
        { user_id: user.id, provider: 'google', provider_user_id: user.id },
        { onConflict: 'user_id,provider' }
      );
      await supabase.from('user_auth_providers').upsert(
        { user_id: user.id, provider: 'email' },
        { onConflict: 'user_id,provider' }
      );

      await supabase.auth.updateUser({ data: { onboarding_completed: true, role: UserRole.AGENCY } });

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
            body: JSON.stringify({ agencyName: agencyName.trim(), email: formData.email, firstName, lastName: apellidoPaterno, phone: formData.phoneNumber || null }),
          });
          await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-agency-welcome`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: formData.email, firstName, agencyName: agencyName.trim() }),
          });
        }
      } catch { /* best-effort */ }

      await completeOnboarding();
      navigate('/agency/pending-approval');
    } catch (err: any) {
      setError(err.message || 'Ocurrió un error al completar el registro');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AgencySignupFormBody
      formData={formData}
      onChange={handleChange}
      onSubmit={handleSubmit}
      isLoading={isLoading}
      error={error}
      termsAccepted={termsAccepted}
      setTermsAccepted={setTermsAccepted}
      activeTermsVersion={activeTermsVersion}
      showPassword={showPassword}
      setShowPassword={setShowPassword}
      showConfirmPassword={showConfirmPassword}
      setShowConfirmPassword={setShowConfirmPassword}
      curpAvailability={curpAvailability}
      emailReadOnly
      oauthProviderLabel="Google"
      oauthProviderIcon={GoogleIcon}
    />
  );
};

export default GoogleAgencySignupPage;
