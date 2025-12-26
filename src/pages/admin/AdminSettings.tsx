import React, { useState, useEffect } from 'react';
import { Mail, Server, Save, Loader, CheckCircle, AlertCircle, DollarSign, Percent, CreditCard } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface EmailSettings {
  id: string;
  contact_email: string;
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_password: string;
  smtp_api_key: string;
}

interface PlatformSettings {
  id: string;
  service_charge_percentage: number;
  agency_commission_percentage: number;
  stripe_monthly_price_id: string;
  stripe_annual_price_id: string;
}

const AdminSettings: React.FC = () => {
  const [settings, setSettings] = useState<EmailSettings>({
    id: '',
    contact_email: '',
    smtp_host: '',
    smtp_port: 2525,
    smtp_user: '',
    smtp_password: '',
    smtp_api_key: '',
  });
  const [platformSettings, setPlatformSettings] = useState<PlatformSettings>({
    id: '',
    service_charge_percentage: 5,
    agency_commission_percentage: 15,
    stripe_monthly_price_id: '',
    stripe_annual_price_id: '',
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: 'success' | 'error' | null;
    text: string;
  }>({ type: null, text: '' });

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setIsLoading(true);

      const [emailResult, platformResult] = await Promise.all([
        supabase.from('email_settings').select('*').maybeSingle(),
        supabase.from('platform_settings').select('*').maybeSingle()
      ]);

      if (emailResult.error) throw emailResult.error;
      if (platformResult.error) throw platformResult.error;

      if (emailResult.data) {
        setSettings(emailResult.data);
      }

      if (platformResult.data) {
        setPlatformSettings(platformResult.data);
      }
    } catch (error: any) {
      console.error('Error fetching settings:', error);
      setMessage({
        type: 'error',
        text: 'Error al cargar la configuración',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setMessage({ type: null, text: '' });

    try {
      const { data: { user } } = await supabase.auth.getUser();

      const [emailResult, platformResult] = await Promise.all([
        supabase
          .from('email_settings')
          .update({
            contact_email: settings.contact_email,
            smtp_host: settings.smtp_host,
            smtp_port: settings.smtp_port,
            smtp_user: settings.smtp_user,
            smtp_password: settings.smtp_password,
            smtp_api_key: settings.smtp_api_key,
            updated_at: new Date().toISOString(),
          })
          .eq('id', settings.id),
        supabase
          .from('platform_settings')
          .update({
            service_charge_percentage: platformSettings.service_charge_percentage,
            agency_commission_percentage: platformSettings.agency_commission_percentage,
            stripe_monthly_price_id: platformSettings.stripe_monthly_price_id,
            stripe_annual_price_id: platformSettings.stripe_annual_price_id,
            updated_at: new Date().toISOString(),
            updated_by: user?.id
          })
          .eq('id', platformSettings.id)
      ]);

      if (emailResult.error) throw emailResult.error;
      if (platformResult.error) throw platformResult.error;

      setMessage({
        type: 'success',
        text: 'Configuración guardada correctamente',
      });

      setTimeout(() => {
        setMessage({ type: null, text: '' });
      }, 3000);
    } catch (error: any) {
      console.error('Error saving settings:', error);
      setMessage({
        type: 'error',
        text: 'Error al guardar la configuración',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setSettings(prev => ({
      ...prev,
      [name]: name === 'smtp_port' ? parseInt(value) || 0 : value,
    }));
  };

  const handlePlatformChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    const numericFields = ['service_charge_percentage', 'agency_commission_percentage'];
    setPlatformSettings(prev => ({
      ...prev,
      [name]: numericFields.includes(name) ? (parseFloat(value) || 0) : value,
    }));
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-center py-12">
          <Loader className="w-12 h-12 animate-spin text-primary-600" />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Configuración del Sistema</h1>
        <p className="text-gray-600 mt-2">
          Gestiona la configuración de correo electrónico y notificaciones
        </p>
      </div>

      {message.type && (
        <div
          className={`mb-6 p-4 rounded-md flex items-start space-x-3 ${
            message.type === 'success'
              ? 'bg-green-50 text-green-800 border border-green-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
          )}
          <p className="text-sm">{message.text}</p>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center space-x-3 mb-4">
            <DollarSign className="w-6 h-6 text-primary-600" />
            <h2 className="text-xl font-semibold text-gray-900">
              Configuración de Comisiones y Cargos
            </h2>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-md p-4 mb-4">
            <div className="flex items-start">
              <AlertCircle className="w-5 h-5 text-blue-500 mt-0.5 mr-2 flex-shrink-0" />
              <div className="text-sm text-blue-800">
                <p className="font-medium mb-2">Información importante sobre los porcentajes:</p>
                <ul className="space-y-1 text-xs">
                  <li>• <strong>Cargo por Servicio:</strong> Se cobra al viajero adicional al anticipo del tour</li>
                  <li>• <strong>Comisión de Agencia:</strong> Se descuenta del anticipo pagado por el viajero antes de transferir a la agencia</li>
                  <li>• Estos porcentajes se aplican automáticamente a todas las nuevas reservas</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="service_charge_percentage" className="block text-sm font-medium text-gray-700 mb-1">
                Cargo por Servicio (%)
              </label>
              <p className="text-xs text-gray-500 mb-2">
                Porcentaje adicional que se cobra al viajero por el uso de la plataforma
              </p>
              <div className="relative">
                <input
                  type="number"
                  id="service_charge_percentage"
                  name="service_charge_percentage"
                  value={platformSettings.service_charge_percentage}
                  onChange={handlePlatformChange}
                  min="0"
                  max="100"
                  step="0.01"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500 pr-10"
                />
                <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                  <Percent className="w-4 h-4 text-gray-400" />
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Ejemplo: Si el anticipo es $1,000 y el cargo es {platformSettings.service_charge_percentage}%,
                el viajero pagará ${(1000 + (1000 * platformSettings.service_charge_percentage / 100)).toFixed(2)}
              </p>
            </div>

            <div>
              <label htmlFor="agency_commission_percentage" className="block text-sm font-medium text-gray-700 mb-1">
                Comisión de Agencia (%)
              </label>
              <p className="text-xs text-gray-500 mb-2">
                Porcentaje que se descuenta del total del tour como comisión para la plataforma
              </p>
              <div className="relative">
                <input
                  type="number"
                  id="agency_commission_percentage"
                  name="agency_commission_percentage"
                  value={platformSettings.agency_commission_percentage}
                  onChange={handlePlatformChange}
                  min="0"
                  max="100"
                  step="0.01"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500 pr-10"
                />
                <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                  <Percent className="w-4 h-4 text-gray-400" />
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Ejemplo: Tour de $5,000 con anticipo de $1,000. Comisión {platformSettings.agency_commission_percentage}% = $
                {(5000 * platformSettings.agency_commission_percentage / 100).toFixed(2)}.
                La agencia recibe ${(1000 - (5000 * platformSettings.agency_commission_percentage / 100)).toFixed(2)} del anticipo
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center space-x-3 mb-4">
            <CreditCard className="w-6 h-6 text-primary-600" />
            <h2 className="text-xl font-semibold text-gray-900">
              Configuración de Stripe - Membresías ToursRed+
            </h2>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-md p-4 mb-4">
            <div className="flex items-start">
              <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 mr-2 flex-shrink-0" />
              <div className="text-sm text-amber-800">
                <p className="font-medium mb-2">Cómo obtener tus Price IDs de Stripe:</p>
                <ol className="space-y-2 text-xs list-decimal ml-4">
                  <li>Ve a <a href="https://dashboard.stripe.com/products" target="_blank" rel="noopener noreferrer" className="underline font-semibold">Stripe Dashboard → Products</a></li>
                  <li>Crea dos productos recurrentes: uno mensual ($49) y uno anual ($490)</li>
                  <li className="font-semibold text-red-700">
                    IMPORTANTE: Necesitas el <strong>Price ID</strong> (empieza con "price_"), NO el Product ID (que empieza con "prod_")
                  </li>
                  <li>
                    Para obtener el Price ID:
                    <ul className="list-disc ml-4 mt-1 space-y-1 font-normal">
                      <li>Haz clic en tu producto</li>
                      <li>En la tabla "Tarifas", haz clic en el precio (ej: 49.00 MXN)</li>
                      <li>Copia el <strong>API ID</strong> o <strong>Price ID</strong> que empieza con "price_"</li>
                    </ul>
                  </li>
                  <li>Pega los Price IDs (price_xxxxx) en los campos de abajo</li>
                </ol>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="stripe_monthly_price_id" className="block text-sm font-medium text-gray-700 mb-1">
                Stripe Price ID - Plan Mensual
              </label>
              <p className="text-xs text-gray-500 mb-2">
                ID del precio mensual en Stripe. Debe empezar con <span className="font-mono font-semibold">price_</span> (NO con prod_)
              </p>
              <input
                type="text"
                id="stripe_monthly_price_id"
                name="stripe_monthly_price_id"
                value={platformSettings.stripe_monthly_price_id}
                onChange={handlePlatformChange}
                placeholder="price_1ABC2DE3FGH4IJK5..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500 font-mono text-sm"
              />
              {platformSettings.stripe_monthly_price_id && !platformSettings.stripe_monthly_price_id.startsWith('price_') && (
                <p className="text-xs text-red-600 mt-1 flex items-center">
                  <AlertCircle className="w-3 h-3 mr-1" />
                  Este ID debe empezar con "price_" no con "prod_"
                </p>
              )}
            </div>

            <div>
              <label htmlFor="stripe_annual_price_id" className="block text-sm font-medium text-gray-700 mb-1">
                Stripe Price ID - Plan Anual
              </label>
              <p className="text-xs text-gray-500 mb-2">
                ID del precio anual en Stripe. Debe empezar con <span className="font-mono font-semibold">price_</span> (NO con prod_)
              </p>
              <input
                type="text"
                id="stripe_annual_price_id"
                name="stripe_annual_price_id"
                value={platformSettings.stripe_annual_price_id}
                onChange={handlePlatformChange}
                placeholder="price_1ABC2DE3FGH4IJK5..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500 font-mono text-sm"
              />
              {platformSettings.stripe_annual_price_id && !platformSettings.stripe_annual_price_id.startsWith('price_') && (
                <p className="text-xs text-red-600 mt-1 flex items-center">
                  <AlertCircle className="w-3 h-3 mr-1" />
                  Este ID debe empezar con "price_" no con "prod_"
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center space-x-3 mb-4">
            <Mail className="w-6 h-6 text-primary-600" />
            <h2 className="text-xl font-semibold text-gray-900">
              Configuración de Email
            </h2>
          </div>

          <div className="space-y-4">
            <div>
              <label htmlFor="contact_email" className="block text-sm font-medium text-gray-700 mb-1">
                Email de Contacto
              </label>
              <p className="text-xs text-gray-500 mb-2">
                Los mensajes del formulario de contacto se enviarán a este email
              </p>
              <input
                type="email"
                id="contact_email"
                name="contact_email"
                value={settings.contact_email}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center space-x-3 mb-4">
            <Server className="w-6 h-6 text-primary-600" />
            <h2 className="text-xl font-semibold text-gray-900">
              Configuración SMTP
            </h2>
          </div>

          <div className="space-y-4">
            <div>
              <label htmlFor="smtp_host" className="block text-sm font-medium text-gray-700 mb-1">
                Servidor SMTP
              </label>
              <input
                type="text"
                id="smtp_host"
                name="smtp_host"
                value={settings.smtp_host}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
              />
            </div>

            <div>
              <label htmlFor="smtp_port" className="block text-sm font-medium text-gray-700 mb-1">
                Puerto SMTP
              </label>
              <input
                type="number"
                id="smtp_port"
                name="smtp_port"
                value={settings.smtp_port}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
              />
            </div>

            <div>
              <label htmlFor="smtp_user" className="block text-sm font-medium text-gray-700 mb-1">
                Usuario SMTP
              </label>
              <input
                type="text"
                id="smtp_user"
                name="smtp_user"
                value={settings.smtp_user}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
              />
            </div>

            <div>
              <label htmlFor="smtp_password" className="block text-sm font-medium text-gray-700 mb-1">
                Contraseña SMTP
              </label>
              <input
                type="password"
                id="smtp_password"
                name="smtp_password"
                value={settings.smtp_password}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
              />
            </div>

            <div>
              <label htmlFor="smtp_api_key" className="block text-sm font-medium text-gray-700 mb-1">
                API Key SMTP2GO
              </label>
              <p className="text-xs text-gray-500 mb-2">
                El API key se usa para enviar emails a través de SMTP2GO
              </p>
              <input
                type="text"
                id="smtp_api_key"
                name="smtp_api_key"
                value={settings.smtp_api_key}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500 font-mono text-sm"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isSaving}
            className="bg-primary-600 text-white px-6 py-2 rounded-md hover:bg-primary-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center space-x-2"
          >
            {isSaving ? (
              <>
                <Loader className="w-5 h-5 animate-spin" />
                <span>Guardando...</span>
              </>
            ) : (
              <>
                <Save className="w-5 h-5" />
                <span>Guardar Configuración</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default AdminSettings;
