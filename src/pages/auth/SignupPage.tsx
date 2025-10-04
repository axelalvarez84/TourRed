import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { signUp } from '../../lib/supabase';
import { UserRole } from '../../lib/supabase';

const SignupPage: React.FC = () => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isForeignTraveler, setIsForeignTraveler] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    const confirmPassword = formData.get('confirmPassword') as string;
    const firstName = formData.get('firstName') as string;
    const lastName = formData.get('lastName') as string;
    const curp = formData.get('curp') as string;
    const passportNumber = formData.get('passportNumber') as string;

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden');
      setIsLoading(false);
      return;
    }

    // Validate CURP or passport based on traveler type
    if (!isForeignTraveler) {
      if (!curp || curp.trim().length !== 18) {
        setError('El CURP debe tener exactamente 18 caracteres');
        setIsLoading(false);
        return;
      }
    } else {
      if (!passportNumber || passportNumber.trim().length < 6) {
        setError('El número de pasaporte debe tener al menos 6 caracteres');
        setIsLoading(false);
        return;
      }
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
          is_foreign_traveler: isForeignTraveler,
          curp: isForeignTraveler ? null : curp.trim().toUpperCase(),
          passport_number: isForeignTraveler ? passportNumber.trim().toUpperCase() : null
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
        // Wait a moment to show the message, then redirect
        setTimeout(() => navigate('/dashboard'), 2000);
      } else {
        navigate('/dashboard');
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
                  autoComplete="email"
                  required
                  className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center mb-3">
                <input
                  id="isForeignTraveler"
                  name="isForeignTraveler"
                  type="checkbox"
                  checked={isForeignTraveler}
                  onChange={(e) => setIsForeignTraveler(e.target.checked)}
                  className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                />
                <label htmlFor="isForeignTraveler" className="ml-2 block text-sm text-gray-900">
                  Soy viajero extranjero
                </label>
              </div>
            </div>

            {!isForeignTraveler ? (
              <div>
                <label htmlFor="curp" className="block text-sm font-medium text-gray-700">
                  CURP *
                </label>
                <div className="mt-1">
                  <input
                    id="curp"
                    name="curp"
                    type="text"
                    maxLength={18}
                    value={formData.get('curp') || ''}
                    onChange={(e) => {
                      e.target.value = e.target.value.toUpperCase();
                    }}
                    className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                    placeholder="ABCD123456HEFGHI01"
                    required={!isForeignTraveler}
                  />
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  Clave Única de Registro de Población (18 caracteres)
                </p>
              </div>
            ) : (
              <div>
                <label htmlFor="passportNumber" className="block text-sm font-medium text-gray-700">
                  Número de Pasaporte *
                </label>
                <div className="mt-1">
                  <input
                    id="passportNumber"
                    name="passportNumber"
                    type="text"
                    maxLength={20}
                    className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                    placeholder="A12345678"
                    required={isForeignTraveler}
                  />
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  Número de pasaporte válido de tu país de origen
                </p>
              </div>
            )}

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Contraseña
              </label>
              <div className="mt-1">
                <input
                  id="password"
                  name="password"
                  type="password"
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