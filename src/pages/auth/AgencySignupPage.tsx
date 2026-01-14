import React, { useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { signUp, supabase } from '../../lib/supabase';
import { UserRole } from '../../lib/supabase';

const AgencySignupPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const searchParams = new URLSearchParams(location.search);
  const redirectUrl = searchParams.get('redirect');

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
    agencyName: '',
    phoneNumber: '',
    website: '',
    rfc: '',
    razonSocial: '',
    rnt: ''
  });

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    const { firstName, lastName, email, password, confirmPassword, agencyName, phoneNumber, website, rfc, razonSocial, rnt } = formData;

    if (password.trim() !== confirmPassword.trim()) {
      setError('Las contraseñas no coinciden');
      setIsLoading(false);
      return;
    }

    // Validaciones adicionales
    if (!firstName.trim()) {
      setError('El nombre es obligatorio');
      setIsLoading(false);
      return;
    }

    if (!lastName.trim()) {
      setError('El apellido es obligatorio');
      setIsLoading(false);
      return;
    }

    if (!agencyName.trim()) {
      setError('El nombre de la agencia es obligatorio');
      setIsLoading(false);
      return;
    }

    if (!website.trim()) {
      setError('El sitio web o página de Facebook es obligatorio');
      setIsLoading(false);
      return;
    }

    if (!rfc.trim()) {
      setError('El RFC es obligatorio');
      setIsLoading(false);
      return;
    }

    if (!razonSocial.trim()) {
      setError('La razón social es obligatoria');
      setIsLoading(false);
      return;
    }

    try {
      console.log('🚀 Iniciando registro de agencia...');
      
      // 1. Create user account
      const { data, error, profileData, isExistingUser } = await signUp(email, password, UserRole.AGENCY);
      
      if (error) {
        throw error;
      }

      if (!data.user) {
        throw new Error('No se pudo crear el usuario');
      }

      console.log('✅ Usuario creado:', { user: data.user, profile: profileData, isExistingUser });

      // 2. Update user profile with name
      console.log('👤 Actualizando nombre del usuario...');
      const { error: updateError } = await supabase
        .from('users')
        .update({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
        })
        .eq('id', data.user.id);

      if (updateError) {
        console.error('❌ Error actualizando nombre del usuario:', updateError);
      }

      // 3. Create agency profile
      console.log('🏢 Creando perfil de agencia...');
      const { data: agencyData, error: agencyError } = await supabase
        .from('agencies')
        .insert({
          user_id: data.user.id,
          name: agencyName.trim(),
          contact_email: email,
          contact_phone: phoneNumber || null,
          website: website || null,
          rfc: rfc || null,
          razon_social: razonSocial.trim(),
          rnt: rnt || null,
          is_active: true
        })
        .select()
        .single();
      
      if (agencyError) {
        console.error('❌ Error creando perfil de agencia:', agencyError);
        throw new Error('Error creating agency profile: ' + agencyError.message);
      }

      console.log('✅ Agencia creada:', agencyData);

      // 4. Send notification emails
      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (session) {
          // Send email to admin
          console.log('📧 Enviando notificación al administrador...');
          await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-agency-registration-admin`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${session.access_token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                agencyName: agencyName.trim(),
                email: email,
                firstName: firstName,
                lastName: lastName,
                phone: phoneNumber || null,
              }),
            }
          );

          // Send welcome email to agency
          console.log('📧 Enviando email de bienvenida a la agencia...');
          await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-agency-welcome`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${session.access_token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                email: email,
                firstName: firstName,
                agencyName: agencyName.trim(),
              }),
            }
          );
        }
      } catch (emailError) {
        console.error('Error enviando emails de notificación:', emailError);
        // No detenemos el registro si falla el envío de emails
      }

      if (isExistingUser) {
        setError('Usuario ya registrado. Se ha iniciado sesión automáticamente y se creó el perfil de agencia.');
        setTimeout(() => navigate('/dashboard'), 2000);
      } else {
        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 24);

        const { error: updateError } = await supabase
          .from('users')
          .update({
            verification_code: verificationCode,
            verification_code_expires_at: expiresAt.toISOString(),
            verification_code_attempts: 0,
          })
          .eq('id', data.user.id);

        if (updateError) {
          console.error('Error actualizando código de verificación:', updateError);
        }

        try {
          const { data: { session } } = await supabase.auth.getSession();

          if (session) {
            await fetch(
              `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-verification-email`,
              {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${session.access_token}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  userId: data.user.id,
                  verificationCode: verificationCode,
                  userName: formData.agencyName,
                }),
              }
            );
          }
        } catch (emailError) {
          console.error('Error enviando correo de verificación:', emailError);
        }

        if (redirectUrl) {
          navigate(`/verify-email?redirect=${encodeURIComponent(redirectUrl)}`);
        } else {
          navigate('/verify-email');
        }
      }
    } catch (err: any) {
      console.error('❌ Error en registro de agencia:', err);
      setError(err.message || 'Ocurrió un error durante el registro');
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
          Registra tu agencia de viajes
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          O{' '}
          <Link to="/login" className="font-medium text-primary-600 hover:text-primary-500">
            inicia sesión en tu cuenta existente
          </Link>
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-2xl">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          {error && (
            <div className={`mb-4 border rounded-md p-3 ${
              error.includes('ya registrado') 
                ? 'bg-yellow-50 border-yellow-200 text-yellow-700' 
                : 'bg-red-50 border-red-200 text-red-600'
            }`}>
              {error}
            </div>
          )}

          <form className="space-y-6" onSubmit={handleSubmit}>
            {/* Información Básica */}
            <div className="border-b border-gray-200 pb-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Información Personal</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="firstName" className="block text-sm font-medium text-gray-700">
                    Nombre(s) *
                  </label>
                  <div className="mt-1">
                    <input
                      id="firstName"
                      name="firstName"
                      type="text"
                      value={formData.firstName}
                      onChange={(e) => handleInputChange('firstName', e.target.value)}
                      required
                      className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                      placeholder="Ej: Juan"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="lastName" className="block text-sm font-medium text-gray-700">
                    Apellido(s) *
                  </label>
                  <div className="mt-1">
                    <input
                      id="lastName"
                      name="lastName"
                      type="text"
                      value={formData.lastName}
                      onChange={(e) => handleInputChange('lastName', e.target.value)}
                      required
                      className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                      placeholder="Ej: Pérez García"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Información de la Agencia */}
            <div className="border-b border-gray-200 pb-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Información de la Agencia</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="agencyName" className="block text-sm font-medium text-gray-700">
                    Nombre Comercial de la Agencia *
                  </label>
                  <div className="mt-1">
                    <input
                      id="agencyName"
                      name="agencyName"
                      type="text"
                      value={formData.agencyName}
                      onChange={(e) => handleInputChange('agencyName', e.target.value)}
                      required
                      className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                      placeholder="Ej: Viajes Aventura México"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                    Correo electrónico *
                  </label>
                  <div className="mt-1">
                    <input
                      id="email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      value={formData.email}
                      onChange={(e) => handleInputChange('email', e.target.value)}
                      required
                      className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="phoneNumber" className="block text-sm font-medium text-gray-700">
                    Teléfono *
                  </label>
                  <div className="mt-1">
                    <input
                      id="phoneNumber"
                      name="phoneNumber"
                      type="tel"
                      value={formData.phoneNumber}
                      onChange={(e) => handleInputChange('phoneNumber', e.target.value)}
                      required
                      className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                      placeholder="+52 (55) 1234-5678"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="website" className="block text-sm font-medium text-gray-700">
                    Sitio Web o Facebook *
                  </label>
                  <div className="mt-1">
                    <input
                      id="website"
                      name="website"
                      type="url"
                      value={formData.website}
                      onChange={(e) => handleInputChange('website', e.target.value)}
                      required
                      className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                      placeholder="https://www.tuagencia.com o https://facebook.com/tuagencia"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Información Fiscal */}
            <div className="border-b border-gray-200 pb-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Información Fiscal</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="rfc" className="block text-sm font-medium text-gray-700">
                    RFC *
                  </label>
                  <div className="mt-1">
                    <input
                      id="rfc"
                      name="rfc"
                      type="text"
                      value={formData.rfc}
                      onChange={(e) => handleInputChange('rfc', e.target.value.toUpperCase())}
                      required
                      className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                      placeholder="XAXX010101000"
                      maxLength={13}
                    />
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    Registro Federal de Contribuyentes
                  </p>
                </div>

                <div>
                  <label htmlFor="rnt" className="block text-sm font-medium text-gray-700">
                    RNT (Opcional)
                  </label>
                  <div className="mt-1">
                    <input
                      id="rnt"
                      name="rnt"
                      type="text"
                      value={formData.rnt}
                      onChange={(e) => handleInputChange('rnt', e.target.value)}
                      className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                      placeholder="Ej: 12345678"
                    />
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    Registro Nacional de Turismo (opcional)
                  </p>
                </div>

                <div className="md:col-span-2">
                  <label htmlFor="razonSocial" className="block text-sm font-medium text-gray-700">
                    Razón Social *
                  </label>
                  <div className="mt-1">
                    <input
                      id="razonSocial"
                      name="razonSocial"
                      type="text"
                      value={formData.razonSocial}
                      onChange={(e) => handleInputChange('razonSocial', e.target.value)}
                      required
                      className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                      placeholder="Ej: Juan Pérez García (persona física) o Viajes Aventura S.A. de C.V. (persona moral)"
                    />
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    Nombre legal completo del propietario (persona física) o razón social de la empresa (persona moral)
                  </p>
                </div>
              </div>
            </div>

            {/* Información de Cuenta */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">Información de Cuenta</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                    Contraseña *
                  </label>
                  <div className="mt-1">
                    <input
                      id="password"
                      name="password"
                      type="password"
                      autoComplete="new-password"
                      value={formData.password}
                      onChange={(e) => handleInputChange('password', e.target.value)}
                      required
                      className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                      minLength={6}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
                    Confirmar Contraseña *
                  </label>
                  <div className="mt-1">
                    <input
                      id="confirmPassword"
                      name="confirmPassword"
                      type="password"
                      autoComplete="new-password"
                      value={formData.confirmPassword}
                      onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
                      required
                      className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                      minLength={6}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-blue-800">
                    Información importante
                  </h3>
                  <div className="mt-2 text-sm text-blue-700">
                    <ul className="list-disc list-inside space-y-1">
                      <li><strong>Nombre Comercial:</strong> Es como se conoce tu agencia (ej: "Viajes Aventura")</li>
                      <li><strong>Razón Social:</strong> Es el nombre legal para facturación fiscal</li>
                      <li><strong>RFC:</strong> Necesario para emitir facturas y recibir pagos</li>
                      <li><strong>RNT:</strong> Registro Nacional de Turismo (opcional, pero recomendado)</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Creando cuenta...' : 'Registrar Agencia'}
              </button>
            </div>
          </form>

          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">¿Eres un viajero?</span>
              </div>
            </div>

            <div className="mt-6">
              <Link
                to="/signup"
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-primary-600 bg-primary-50 hover:bg-primary-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
              >
                Registrarse como viajero
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AgencySignupPage;