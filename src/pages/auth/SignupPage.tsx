import React, { useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { signUp, supabase, UserRole } from '../../lib/supabase';

const SignupPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isForeignTraveler, setIsForeignTraveler] = useState(false);

  const searchParams = new URLSearchParams(location.search);
  const redirectUrl = searchParams.get('redirect');
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
    phoneNumber: '',
    curp: '',
    passportNumber: '',
    dateOfBirth: '',
    address: ''
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    const { email, password, confirmPassword, firstName, lastName, phoneNumber, curp, passportNumber, dateOfBirth, address } = formData;

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden');
      setIsLoading(false);
      return;
    }

    if (!phoneNumber.trim()) {
      setError('El número de celular es requerido');
      setIsLoading(false);
      return;
    }

    if (isForeignTraveler && !passportNumber.trim()) {
      setError('El número de pasaporte es requerido para viajeros extranjeros');
      setIsLoading(false);
      return;
    }

    if (!isForeignTraveler && !curp.trim()) {
      setError('La CURP es requerida para viajeros nacionales');
      setIsLoading(false);
      return;
    }

    if (!isForeignTraveler && curp.length !== 18) {
      setError('La CURP debe tener 18 caracteres');
      setIsLoading(false);
      return;
    }

    try {
      console.log('🚀 Iniciando registro de viajero...');

      const { data, error, profileData, isExistingUser } = await signUp(
        email,
        password,
        UserRole.TRAVELER,
        {
          first_name: firstName,
          last_name: lastName,
          phone_number: phoneNumber,
          curp: isForeignTraveler ? null : curp,
          passport_number: isForeignTraveler ? passportNumber : null,
          is_foreign_traveler: isForeignTraveler,
          date_of_birth: dateOfBirth || null,
          address: address || null
        }
      );
      
      if (error) {
        throw error;
      }

      if (!data.user) {
        throw new Error('No se pudo crear el usuario');
      }

      console.log('✅ Registro exitoso:', { user: data.user, profile: profileData, isExistingUser });

      if (isExistingUser) {
        setError('Usuario ya registrado. Se ha iniciado sesión automáticamente.');
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
                  userName: `${firstName} ${lastName}`.trim(),
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
      console.error('❌ Error en registro:', err);
      setError(err.message || 'Ocurrió un error durante el registro');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
          Crea tu cuenta
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          O{' '}
          <Link to="/login" className="font-medium text-primary-600 hover:text-primary-500">
            inicia sesión en tu cuenta existente
          </Link>
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
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
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="firstName" className="block text-sm font-medium text-gray-700">
                  Nombre
                </label>
                <div className="mt-1">
                  <input
                    id="firstName"
                    name="firstName"
                    type="text"
                    value={formData.firstName}
                    onChange={handleInputChange}
                    required
                    className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="lastName" className="block text-sm font-medium text-gray-700">
                  Apellido
                </label>
                <div className="mt-1">
                  <input
                    id="lastName"
                    name="lastName"
                    type="text"
                    value={formData.lastName}
                    onChange={handleInputChange}
                    required
                    className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                  />
                </div>
              </div>
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Correo electrónico
              </label>
              <div className="mt-1">
                <input
                  id="email"
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  autoComplete="email"
                  required
                  className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                />
              </div>
            </div>

            <div>
              <label htmlFor="phoneNumber" className="block text-sm font-medium text-gray-700">
                Número de celular
              </label>
              <div className="mt-1">
                <input
                  id="phoneNumber"
                  name="phoneNumber"
                  type="tel"
                  value={formData.phoneNumber}
                  onChange={handleInputChange}
                  placeholder="Ej: +52 55 1234 5678"
                  required
                  className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center space-x-4">
                <label className="flex items-center cursor-pointer">
                  <input
                    type="radio"
                    checked={!isForeignTraveler}
                    onChange={() => setIsForeignTraveler(false)}
                    className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300"
                  />
                  <span className="ml-2 text-sm font-medium text-gray-700">Viajero Nacional</span>
                </label>
                <label className="flex items-center cursor-pointer">
                  <input
                    type="radio"
                    checked={isForeignTraveler}
                    onChange={() => setIsForeignTraveler(true)}
                    className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300"
                  />
                  <span className="ml-2 text-sm font-medium text-gray-700">Viajero Extranjero</span>
                </label>
              </div>

              {!isForeignTraveler ? (
                <div>
                  <label htmlFor="curp" className="block text-sm font-medium text-gray-700">
                    CURP
                  </label>
                  <div className="mt-1">
                    <input
                      id="curp"
                      name="curp"
                      type="text"
                      value={formData.curp}
                      onChange={handleInputChange}
                      placeholder="Ej: ABCD123456HDFRRL09"
                      maxLength={18}
                      required
                      className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm uppercase"
                    />
                    <p className="mt-1 text-xs text-gray-500">18 caracteres alfanuméricos</p>
                  </div>
                </div>
              ) : (
                <div>
                  <label htmlFor="passportNumber" className="block text-sm font-medium text-gray-700">
                    Número de Pasaporte
                  </label>
                  <div className="mt-1">
                    <input
                      id="passportNumber"
                      name="passportNumber"
                      type="text"
                      value={formData.passportNumber}
                      onChange={handleInputChange}
                      placeholder="Ej: A12345678"
                      required
                      className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm uppercase"
                    />
                  </div>
                </div>
              )}
            </div>

            <div>
              <label htmlFor="dateOfBirth" className="block text-sm font-medium text-gray-700">
                Fecha de Nacimiento
              </label>
              <div className="mt-1">
                <input
                  id="dateOfBirth"
                  name="dateOfBirth"
                  type="date"
                  value={formData.dateOfBirth}
                  onChange={handleInputChange}
                  required
                  className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                />
              </div>
            </div>

            <div>
              <label htmlFor="address" className="block text-sm font-medium text-gray-700">
                Domicilio
              </label>
              <div className="mt-1">
                <textarea
                  id="address"
                  name="address"
                  value={formData.address}
                  onChange={handleInputChange}
                  placeholder="Calle, número, colonia, ciudad, estado, código postal"
                  required
                  rows={3}
                  className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Contraseña
              </label>
              <div className="mt-1">
                <input
                  id="password"
                  name="password"
                  type="password"
                  value={formData.password}
                  onChange={handleInputChange}
                  autoComplete="new-password"
                  required
                  className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                />
              </div>
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
                Confirmar Contraseña
              </label>
              <div className="mt-1">
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  value={formData.confirmPassword}
                  onChange={handleInputChange}
                  autoComplete="new-password"
                  required
                  className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                />
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Creando cuenta...' : 'Registrarse'}
              </button>
            </div>
          </form>

          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">¿Eres una agencia de viajes?</span>
              </div>
            </div>

            <div className="mt-6">
              <Link
                to="/agency-signup"
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-primary-600 bg-primary-50 hover:bg-primary-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
              >
                Registrarse como agencia
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SignupPage;