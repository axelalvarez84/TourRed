import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { signUp, supabase } from '../../lib/supabase';
import { UserRole } from '../../lib/supabase';
import { useFieldAvailability } from '../../hooks/useFieldAvailability';
import AgencySignupFormBody, {
  AgencyFormData,
  defaultAgencyFormData,
} from './AgencySignupFormBody';

const isLeakedPasswordError = (message: string) =>
  /leaked|pwned|compromised|common password/i.test(message);

const AgencySignupPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [activeTermsVersion, setActiveTermsVersion] = useState<{ version_number: number; published_at: string } | null>(null);
  const [formData, setFormData] = useState<AgencyFormData>(defaultAgencyFormData);

  const searchParams = new URLSearchParams(location.search);
  const redirectUrl = searchParams.get('redirect');

  useEffect(() => {
    supabase.rpc('get_active_terms', { p_type: 'agency' }).then(({ data }) => {
      if (data && data.length > 0) setActiveTermsVersion(data[0]);
    });
  }, []);

  const curpAvailability = useFieldAvailability(formData.curp, 'check_curp_available', 18, 18, 'agency');
  const emailAvailability = useFieldAvailability(formData.email, 'check_email_available', 5);

  const handleChange = (field: keyof AgencyFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    const {
      firstName, apellidoPaterno, sexo, email, password, confirmPassword,
      agencyName, website, rfc, razonSocial, personaType, representanteLegalNombre,
    } = formData;

    if (password.trim() !== confirmPassword.trim()) { setError('Las contraseñas no coinciden'); setIsLoading(false); return; }
    if (!firstName.trim()) { setError('El nombre es obligatorio'); setIsLoading(false); return; }
    if (!apellidoPaterno.trim()) { setError('El apellido paterno es obligatorio'); setIsLoading(false); return; }
    if (!sexo) { setError('El sexo es obligatorio'); setIsLoading(false); return; }
    if (!agencyName.trim()) { setError('El nombre de la agencia es obligatorio'); setIsLoading(false); return; }
    if (!website.trim()) { setError('El sitio web o página de Facebook es obligatorio'); setIsLoading(false); return; }
    if (!rfc.trim()) { setError('El RFC es obligatorio'); setIsLoading(false); return; }
    if (!razonSocial.trim()) { setError('La razón social es obligatoria'); setIsLoading(false); return; }
    if (!personaType) { setError('El tipo de persona es obligatorio'); setIsLoading(false); return; }
    if (!representanteLegalNombre.trim()) { setError('El nombre de quien firma el contrato es obligatorio'); setIsLoading(false); return; }

    try {
      const { data, error: signUpError, profileData, isExistingUser } = await signUp(email, password, UserRole.AGENCY);

      if (signUpError) {
        if (isLeakedPasswordError(signUpError.message)) {
          throw new Error('Esta contraseña ha sido expuesta en brechas de datos conocidas y no puede usarse. Por favor elige una contraseña diferente y más segura.');
        }
        throw signUpError;
      }

      if (!data.user) throw new Error('No se pudo crear el usuario');

      // Registrar aceptación de T&C
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/record-terms-acceptance`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
            body: JSON.stringify({ terms_type: 'agency' }),
          });
        }
      } catch { /* best-effort */ }

      // Actualizar perfil de usuario
      await supabase.from('users').update({
        first_name: formData.firstName.trim(),
        last_name: formData.apellidoPaterno.trim(),
        apellido_paterno: formData.apellidoPaterno.trim(),
        apellido_materno: formData.apellidoMaterno.trim() || null,
        date_of_birth: formData.dateOfBirth || null,
        sexo: formData.sexo || null,
        curp: formData.curp.trim() || null,
      }).eq('id', data.user.id);

      // Crear perfil de agencia
      const { error: agencyError } = await supabase.from('agencies').insert({
        user_id: data.user.id,
        name: formData.agencyName.trim(),
        contact_email: email,
        contact_phone: formData.phoneNumber || null,
        website: formData.website || null,
        rfc: formData.rfc || null,
        razon_social: formData.razonSocial.trim(),
        persona_type: formData.personaType || null,
        representante_legal_nombre: formData.representanteLegalNombre.trim() || null,
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

      if (agencyError) throw new Error('Error creating agency profile: ' + agencyError.message);

      // Enviar emails
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-agency-registration-admin`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ agencyName: formData.agencyName.trim(), email, firstName: formData.firstName, lastName: formData.apellidoPaterno, phone: formData.phoneNumber || null }),
          });
          await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-agency-welcome`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, firstName: formData.firstName, agencyName: formData.agencyName.trim() }),
          });
        }
      } catch { /* best-effort */ }

      if (isExistingUser) {
        setError('Usuario ya registrado. Se ha iniciado sesión automáticamente y se creó el perfil de agencia.');
        setTimeout(() => navigate('/dashboard'), 2000);
      } else {
        // Enviar código de verificación
        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 24);

        await supabase.from('users').update({
          verification_code: verificationCode,
          verification_code_expires_at: expiresAt.toISOString(),
          verification_code_attempts: 0,
        }).eq('id', data.user.id);

        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-verification-email`, {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId: data.user.id, verificationCode, userName: formData.agencyName }),
            });
          }
        } catch { /* best-effort */ }

        navigate(redirectUrl ? `/verify-email?redirect=${encodeURIComponent(redirectUrl)}` : '/verify-email');
      }
    } catch (err: any) {
      setError(err.message || 'Ocurrió un error durante el registro');
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
      emailAvailability={emailAvailability}
      emailReadOnly={false}
      oauthProviderLabel={null}
      submitLabel="Registrar Agencia"
    />
  );
};

export default AgencySignupPage;
