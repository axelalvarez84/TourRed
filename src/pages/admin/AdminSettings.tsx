import React, { useState, useEffect } from 'react';
import { Mail, Server, Save, Loader, CheckCircle, AlertCircle, DollarSign, Percent, CreditCard, Crown, Gift, Award, Users, Globe, FileText, Shield } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatCurrency } from '../../utils/formatCurrency';

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
  membership_monthly_price: number;
  membership_annual_price: number;
  default_max_referrals_per_user: number;
  referral_bonus_points: number;
  referral_program_enabled: boolean;
  mercadopago_enabled: boolean;
  paypal_enabled: boolean;
  mercadopago_public_key: string;
  mercadopago_access_token: string;
  paypal_client_id: string;
  paypal_client_secret: string;
  pac_provider: string;
  pac_api_key_encrypted: string;
  pac_organization_id: string;
  cfdi_serie_booking: string;
  cfdi_serie_commission: string;
  pac_sandbox_mode: boolean;
  pac_issuer_rfc: string;
  pac_issuer_razon_social: string;
  pac_issuer_regimen_fiscal: string;
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
    membership_monthly_price: 49,
    membership_annual_price: 490,
    default_max_referrals_per_user: 10,
    referral_bonus_points: 5000,
    referral_program_enabled: true,
    mercadopago_enabled: false,
    paypal_enabled: false,
    mercadopago_public_key: '',
    mercadopago_access_token: '',
    paypal_client_id: '',
    paypal_client_secret: '',
    pac_provider: 'none',
    pac_api_key_encrypted: '',
    pac_organization_id: '',
    cfdi_serie_booking: 'A',
    cfdi_serie_commission: 'B',
    pac_sandbox_mode: true,
    pac_issuer_rfc: '',
    pac_issuer_razon_social: '',
    pac_issuer_regimen_fiscal: '',
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
            membership_monthly_price: platformSettings.membership_monthly_price,
            membership_annual_price: platformSettings.membership_annual_price,
            default_max_referrals_per_user: platformSettings.default_max_referrals_per_user,
            referral_bonus_points: platformSettings.referral_bonus_points,
            referral_program_enabled: platformSettings.referral_program_enabled,
            mercadopago_enabled: platformSettings.mercadopago_enabled,
            paypal_enabled: platformSettings.paypal_enabled,
            mercadopago_public_key: platformSettings.mercadopago_public_key,
            mercadopago_access_token: platformSettings.mercadopago_access_token,
            paypal_client_id: platformSettings.paypal_client_id,
            paypal_client_secret: platformSettings.paypal_client_secret,
            pac_provider: platformSettings.pac_provider,
            pac_api_key_encrypted: platformSettings.pac_api_key_encrypted,
            pac_organization_id: platformSettings.pac_organization_id,
            cfdi_serie_booking: platformSettings.cfdi_serie_booking,
            cfdi_serie_commission: platformSettings.cfdi_serie_commission,
            pac_sandbox_mode: platformSettings.pac_sandbox_mode,
            pac_issuer_rfc: platformSettings.pac_issuer_rfc,
            pac_issuer_razon_social: platformSettings.pac_issuer_razon_social,
            pac_issuer_regimen_fiscal: platformSettings.pac_issuer_regimen_fiscal,
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
    const { name, value, type, checked } = e.target;
    const numericFields = ['service_charge_percentage', 'agency_commission_percentage', 'membership_monthly_price', 'membership_annual_price', 'default_max_referrals_per_user', 'referral_bonus_points'];
    const booleanFields = ['referral_program_enabled', 'mercadopago_enabled', 'paypal_enabled'];
    setPlatformSettings(prev => ({
      ...prev,
      [name]: booleanFields.includes(name) ? checked : (numericFields.includes(name) ? (parseFloat(value) || 0) : value),
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
                el viajero pagará ${formatCurrency(1000 + (1000 * platformSettings.service_charge_percentage / 100))}
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
                {formatCurrency(5000 * platformSettings.agency_commission_percentage / 100)}.
                La agencia recibe ${formatCurrency(1000 - (5000 * platformSettings.agency_commission_percentage / 100))} del anticipo
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
            <Crown className="w-6 h-6 text-amber-600" />
            <h2 className="text-xl font-semibold text-gray-900">
              Precios de Membresías ToursRed+
            </h2>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-md p-4 mb-4">
            <div className="flex items-start">
              <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 mr-2 flex-shrink-0" />
              <div className="text-sm text-amber-800">
                <p className="font-medium mb-2">Información importante:</p>
                <ul className="space-y-1 text-xs">
                  <li>• Los precios se mostrarán en todas las páginas de membresía y correos electrónicos</li>
                  <li>• Asegúrate de que estos precios coincidan con los productos en Stripe</li>
                  <li>• Los cambios se reflejarán inmediatamente después de guardar</li>
                  <li>• El ahorro del plan anual se calcula automáticamente</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="membership_monthly_price" className="block text-sm font-medium text-gray-700 mb-1">
                Precio Plan Mensual (MXN)
              </label>
              <p className="text-xs text-gray-500 mb-2">
                Precio mensual de la membresía ToursRed+
              </p>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                <input
                  type="number"
                  id="membership_monthly_price"
                  name="membership_monthly_price"
                  value={platformSettings.membership_monthly_price}
                  onChange={handlePlatformChange}
                  min="1"
                  step="0.01"
                  required
                  className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
            </div>

            <div>
              <label htmlFor="membership_annual_price" className="block text-sm font-medium text-gray-700 mb-1">
                Precio Plan Anual (MXN)
              </label>
              <p className="text-xs text-gray-500 mb-2">
                Precio anual de la membresía ToursRed+
              </p>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                <input
                  type="number"
                  id="membership_annual_price"
                  name="membership_annual_price"
                  value={platformSettings.membership_annual_price}
                  onChange={handlePlatformChange}
                  min="1"
                  step="0.01"
                  required
                  className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
            </div>
          </div>

          <div className="mt-4 bg-blue-50 border border-blue-200 rounded-md p-4">
            <h4 className="text-sm font-semibold text-blue-900 mb-2">Vista Previa del Ahorro:</h4>
            <div className="text-sm text-blue-800 space-y-1">
              <p>• Plan Mensual x 12 meses = ${formatCurrency(platformSettings.membership_monthly_price * 12)} MXN</p>
              <p>• Plan Anual = ${formatCurrency(platformSettings.membership_annual_price)} MXN</p>
              <p className="font-semibold text-green-700">
                • Ahorro con Plan Anual = ${formatCurrency((platformSettings.membership_monthly_price * 12) - platformSettings.membership_annual_price)} MXN
                ({Math.round((((platformSettings.membership_monthly_price * 12) - platformSettings.membership_annual_price) / (platformSettings.membership_monthly_price * 12)) * 100)}% de descuento)
              </p>
              <p>• Equivalente Mensual del Plan Anual = ${formatCurrency(platformSettings.membership_annual_price / 12)} MXN/mes</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center space-x-3 mb-4">
            <Gift className="w-6 h-6 text-blue-600" />
            <h2 className="text-xl font-semibold text-gray-900">
              Programa de Referidos
            </h2>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-md p-4 mb-4">
            <div className="flex items-start">
              <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 mr-2 flex-shrink-0" />
              <div className="text-sm text-blue-800">
                <p className="font-medium mb-2">Configuración del programa de referidos:</p>
                <ul className="space-y-1 text-xs">
                  <li>• Los usuarios pueden invitar amigos usando su código de referido único</li>
                  <li>• Ambos usuarios ganan puntos cuando el referido completa su primera reserva</li>
                  <li>• Los puntos solo se pueden usar con membresía activa</li>
                  <li>• El límite de referidos puede ajustarse individualmente desde la página de gestión</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center">
              <input
                type="checkbox"
                id="referral_program_enabled"
                name="referral_program_enabled"
                checked={platformSettings.referral_program_enabled}
                onChange={handlePlatformChange}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor="referral_program_enabled" className="ml-2 block text-sm font-medium text-gray-700">
                Habilitar Programa de Referidos
              </label>
            </div>

            <div>
              <label htmlFor="referral_bonus_points" className="block text-sm font-medium text-gray-700 mb-1">
                Puntos de Bono por Referido
              </label>
              <p className="text-xs text-gray-500 mb-2">
                Cantidad de puntos que ganan tanto el referidor como el referido
              </p>
              <div className="relative">
                <Award className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="number"
                  id="referral_bonus_points"
                  name="referral_bonus_points"
                  value={platformSettings.referral_bonus_points}
                  onChange={handlePlatformChange}
                  min="100"
                  step="100"
                  required
                  disabled={!platformSettings.referral_program_enabled}
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                />
              </div>
              <p className="mt-1 text-xs text-gray-500">
                Equivalente a ${formatCurrency(platformSettings.referral_bonus_points / 100)} MXN
              </p>
            </div>

            <div>
              <label htmlFor="default_max_referrals_per_user" className="block text-sm font-medium text-gray-700 mb-1">
                Límite de Referidos por Usuario
              </label>
              <p className="text-xs text-gray-500 mb-2">
                Número máximo de referidos que cada usuario puede tener por defecto
              </p>
              <div className="relative">
                <Users className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="number"
                  id="default_max_referrals_per_user"
                  name="default_max_referrals_per_user"
                  value={platformSettings.default_max_referrals_per_user}
                  onChange={handlePlatformChange}
                  min="1"
                  max="100"
                  required
                  disabled={!platformSettings.referral_program_enabled}
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                />
              </div>
              <p className="mt-1 text-xs text-gray-500">
                Este límite puede ajustarse individualmente por usuario desde la página de gestión de referidos
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center space-x-3 mb-4">
            <Globe className="w-6 h-6 text-primary-600" />
            <h2 className="text-xl font-semibold text-gray-900">
              Proveedores de Pago Adicionales
            </h2>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-md p-4 mb-4">
            <div className="flex items-start">
              <AlertCircle className="w-5 h-5 text-blue-500 mt-0.5 mr-2 flex-shrink-0" />
              <div className="text-sm text-blue-800">
                <p className="font-medium mb-1">Informacion importante:</p>
                <ul className="space-y-1 text-xs">
                  <li>• Stripe siempre esta disponible y es el unico proveedor para membresias (requiere cobro recurrente)</li>
                  <li>• MercadoPago y PayPal aplican solo para reservas sin membresia y tarjetas de regalo</li>
                  <li>• Las claves secretas se configuran como secrets de Supabase Edge Functions</li>
                  <li>• Aqui solo se guardan las claves publicas (no sensibles) necesarias para el frontend</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-sky-100 rounded-lg flex items-center justify-center">
                    <CreditCard className="w-4 h-4 text-sky-600" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">MercadoPago</h3>
                    <p className="text-xs text-gray-500">Para reservas y tarjetas de regalo</p>
                  </div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    name="mercadopago_enabled"
                    checked={platformSettings.mercadopago_enabled}
                    onChange={handlePlatformChange}
                    className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                  />
                  <span className="text-sm font-medium text-gray-700">Habilitado</span>
                </label>
              </div>

              {platformSettings.mercadopago_enabled && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Public Key de MercadoPago
                    </label>
                    <p className="text-xs text-gray-500 mb-2">
                      Clave publica de tu cuenta MercadoPago (empieza con APP_USR- o TEST-)
                    </p>
                    <input
                      type="text"
                      name="mercadopago_public_key"
                      value={platformSettings.mercadopago_public_key}
                      onChange={handlePlatformChange}
                      placeholder="APP_USR-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500 font-mono text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Access Token de MercadoPago
                    </label>
                    <p className="text-xs text-gray-500 mb-2">
                      Token privado de acceso de tu cuenta MercadoPago (empieza con APP_USR- o TEST-)
                    </p>
                    <input
                      type="password"
                      name="mercadopago_access_token"
                      value={platformSettings.mercadopago_access_token}
                      onChange={handlePlatformChange}
                      placeholder="APP_USR-xxxxxxxxxxxxxxxxxxxx"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500 font-mono text-sm"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                    <CreditCard className="w-4 h-4 text-blue-700" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">PayPal</h3>
                    <p className="text-xs text-gray-500">Para reservas y tarjetas de regalo</p>
                  </div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    name="paypal_enabled"
                    checked={platformSettings.paypal_enabled}
                    onChange={handlePlatformChange}
                    className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                  />
                  <span className="text-sm font-medium text-gray-700">Habilitado</span>
                </label>
              </div>

              {platformSettings.paypal_enabled && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Client ID de PayPal
                    </label>
                    <p className="text-xs text-gray-500 mb-2">
                      Client ID de tu app en PayPal Developer (empieza con AV o At en produccion)
                    </p>
                    <input
                      type="text"
                      name="paypal_client_id"
                      value={platformSettings.paypal_client_id}
                      onChange={handlePlatformChange}
                      placeholder="AVxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500 font-mono text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Client Secret de PayPal
                    </label>
                    <p className="text-xs text-gray-500 mb-2">
                      Secret de tu app en PayPal Developer
                    </p>
                    <input
                      type="password"
                      name="paypal_client_secret"
                      value={platformSettings.paypal_client_secret}
                      onChange={handlePlatformChange}
                      placeholder="EGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500 font-mono text-sm"
                    />
                  </div>
                </div>
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
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500 font-mono text-sm"
              />
            </div>
          </div>
        </div>

        {/* PAC / CFDI Configuration */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center space-x-3 mb-2">
            <FileText className="w-6 h-6 text-primary-600" />
            <h2 className="text-xl font-semibold text-gray-900">Configuración CFDI / PAC</h2>
          </div>
          <p className="text-sm text-gray-500 mb-6">
            Configura el proveedor de timbrado (PAC) para la emisión de Comprobantes Fiscales Digitales por Internet.
            La arquitectura está diseñada para cambiar de proveedor sin modificar la lógica de negocio.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Proveedor PAC Activo</label>
              <select
                value={platformSettings.pac_provider}
                onChange={(e) => setPlatformSettings(prev => ({ ...prev, pac_provider: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
              >
                <option value="none">Sin proveedor (desactivado)</option>
                <option value="facturapi">FacturAPI</option>
                <option value="sw_sapien">SW Sapien</option>
                <option value="contpaqi">Contpaqi Cloud</option>
              </select>
              <p className="text-xs text-gray-400 mt-1">Cambiar el proveedor no afecta los CFDI ya emitidos.</p>
            </div>

            <div className="flex items-center gap-3 md:pt-6">
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={platformSettings.pac_sandbox_mode}
                  onChange={(e) => setPlatformSettings(prev => ({ ...prev, pac_sandbox_mode: e.target.checked }))}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
              </label>
              <div>
                <div className="text-sm font-medium text-gray-700">Modo Sandbox</div>
                <div className="text-xs text-gray-400">{platformSettings.pac_sandbox_mode ? 'Activo (pruebas)' : 'Producción (CFDIs reales)'}</div>
              </div>
              {!platformSettings.pac_sandbox_mode && (
                <span className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-error-100 text-error-700">
                  <Shield className="h-3 w-3" /> Producción
                </span>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">API Key del PAC</label>
              <input
                type="password"
                value={platformSettings.pac_api_key_encrypted}
                onChange={(e) => setPlatformSettings(prev => ({ ...prev, pac_api_key_encrypted: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500 font-mono text-sm"
                placeholder="sk_live_xxxxxxxxxxxx o equivalente"
                autoComplete="off"
              />
              <p className="text-xs text-gray-400 mt-1">En FacturAPI: Configuración → API Keys → Live Key.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ID de Organización / Emisor</label>
              <input
                type="text"
                value={platformSettings.pac_organization_id}
                onChange={(e) => setPlatformSettings(prev => ({ ...prev, pac_organization_id: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500 font-mono text-sm"
                placeholder="ID de la organización en el PAC"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Serie CFDI — Reservas</label>
              <input
                type="text"
                value={platformSettings.cfdi_serie_booking}
                onChange={(e) => setPlatformSettings(prev => ({ ...prev, cfdi_serie_booking: e.target.value.toUpperCase() }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500 uppercase"
                maxLength={5}
                placeholder="A"
              />
              <p className="text-xs text-gray-400 mt-1">Serie para facturas de viajeros (comprobantes de pago de tours).</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Serie CFDI — Comisiones</label>
              <input
                type="text"
                value={platformSettings.cfdi_serie_commission}
                onChange={(e) => setPlatformSettings(prev => ({ ...prev, cfdi_serie_commission: e.target.value.toUpperCase() }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500 uppercase"
                maxLength={5}
                placeholder="B"
              />
              <p className="text-xs text-gray-400 mt-1">Serie para facturas de comisión emitidas a las agencias.</p>
            </div>
          </div>

          <div className="mt-6 border-t pt-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary-500" />
              Datos del Emisor (ToursRed)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">RFC del Emisor</label>
                <input
                  type="text"
                  value={platformSettings.pac_issuer_rfc}
                  onChange={(e) => setPlatformSettings(prev => ({ ...prev, pac_issuer_rfc: e.target.value.toUpperCase() }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500 uppercase font-mono text-sm"
                  placeholder="RFC de ToursRed"
                  maxLength={13}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Razón Social</label>
                <input
                  type="text"
                  value={platformSettings.pac_issuer_razon_social}
                  onChange={(e) => setPlatformSettings(prev => ({ ...prev, pac_issuer_razon_social: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
                  placeholder="Nombre legal de ToursRed"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Régimen Fiscal</label>
                <select
                  value={platformSettings.pac_issuer_regimen_fiscal}
                  onChange={(e) => setPlatformSettings(prev => ({ ...prev, pac_issuer_regimen_fiscal: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
                >
                  <option value="">Seleccionar</option>
                  <option value="601">601 - General de Ley Personas Morales</option>
                  <option value="603">603 - Personas Morales con Fines no Lucrativos</option>
                  <option value="612">612 - Personas Físicas con Actividades Empresariales</option>
                  <option value="621">621 - Incorporación Fiscal</option>
                  <option value="625">625 - Régimen Simplificado de Confianza</option>
                </select>
              </div>
            </div>
          </div>

          {platformSettings.pac_provider !== 'none' && (
            <div className="mt-4 bg-blue-50 border border-blue-200 rounded-md p-4 text-sm text-blue-700">
              <strong>Proveedor activo: {platformSettings.pac_provider}</strong>
              {platformSettings.pac_sandbox_mode
                ? ' — Modo sandbox. Los CFDIs generados son de prueba y no tienen validez fiscal.'
                : ' — Modo producción. Los CFDIs generados son válidos ante el SAT.'}
            </div>
          )}
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
