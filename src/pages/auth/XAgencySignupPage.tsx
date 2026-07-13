import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, UserRole } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useFieldAvailability } from '../../hooks/useFieldAvailability';
import AgencySignupFormBody, { AgencyFormData, defaultAgencyFormData } from './AgencySignupFormBody';

const isLeakedPasswordError = (message: string) =>
  /leaked|pwned|compromised|common password/i.test(message);

const XIcon = (
  <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true" fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
  </svg>
);

const XAgencySignupPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, completeOnboarding } = useAuth();

  const meta = user?.user_metadata ?? {};
  const fullName: string = meta.full_name || meta.name || meta.user_name || '';
  const preFirstName = meta.given_name || fullName.split(' ')[0] || '';
  const preLastName  = meta.family_name || fullName.split(' ').slice(1).join(' ') || '';
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
        { user_id: user.id, provider: 'twitter', provider_user_id: user.id },
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
      oauthProviderLabel="X (Twitter)"
      oauthProviderIcon={XIcon}
    />
  );
};

export default XAgencySignupPage;
