import { useState } from 'react';
import { Gift, Check, CreditCard } from 'lucide-react';
import { supabase } from '../lib/supabase';

const GIFT_CARD_AMOUNTS = [100, 200, 500, 1000];

export default function GiftCardsPage() {
  const [selectedAmount, setSelectedAmount] = useState<number>(500);
  const [purchaserName, setPurchaserName] = useState('');
  const [purchaserEmail, setPurchaserEmail] = useState('');
  const [isGift, setIsGift] = useState(false);
  const [recipientName, setRecipientName] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [personalMessage, setPersonalMessage] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsProcessing(true);

    try {
      const { data, error: functionError } = await supabase.functions.invoke('purchase-gift-card', {
        body: {
          amount: selectedAmount,
          purchaserEmail,
          purchaserName,
          recipientEmail: isGift ? recipientEmail : undefined,
          recipientName: isGift ? recipientName : undefined,
          personalMessage: isGift && personalMessage ? personalMessage : undefined,
        },
      });

      if (functionError) {
        throw functionError;
      }

      if (data?.url) {
        window.location.href = data.url;
      } else {
        throw new Error('No se pudo crear la sesión de pago');
      }
    } catch (err: any) {
      console.error('Error purchasing gift card:', err);
      setError(err.message || 'Error al procesar tu solicitud. Por favor intenta nuevamente.');
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-amber-500 to-orange-600 rounded-full mb-6">
            <Gift className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Tarjetas de Regalo ToursRed
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Regala experiencias inolvidables. La manera perfecta de compartir la aventura con tus seres queridos.
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          <div className="bg-gradient-to-r from-amber-500 to-orange-600 px-8 py-6">
            <h2 className="text-2xl font-bold text-white">Compra tu Tarjeta de Regalo</h2>
            <p className="text-amber-100 mt-2">Válida por 1 año desde la fecha de compra</p>
          </div>

          <form onSubmit={handlePurchase} className="p-8">
            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
                {error}
              </div>
            )}

            <div className="mb-8">
              <label className="block text-sm font-semibold text-gray-700 mb-4">
                Selecciona el Monto
              </label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {GIFT_CARD_AMOUNTS.map((amount) => (
                  <button
                    key={amount}
                    type="button"
                    onClick={() => setSelectedAmount(amount)}
                    className={`relative p-6 rounded-xl border-2 transition-all ${
                      selectedAmount === amount
                        ? 'border-amber-500 bg-amber-50 shadow-lg scale-105'
                        : 'border-gray-200 hover:border-amber-300 hover:shadow-md'
                    }`}
                  >
                    {selectedAmount === amount && (
                      <div className="absolute top-2 right-2 w-6 h-6 bg-amber-500 rounded-full flex items-center justify-center">
                        <Check className="w-4 h-4 text-white" />
                      </div>
                    )}
                    <div className="text-3xl font-bold text-gray-900">${amount}</div>
                    <div className="text-sm text-gray-500">MXN</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Información del Comprador</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Tu Nombre *
                  </label>
                  <input
                    type="text"
                    required
                    value={purchaserName}
                    onChange={(e) => setPurchaserName(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    placeholder="Juan Pérez"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Tu Email *
                  </label>
                  <input
                    type="email"
                    required
                    value={purchaserEmail}
                    onChange={(e) => setPurchaserEmail(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    placeholder="tu@email.com"
                  />
                </div>
              </div>
            </div>

            <div className="mb-6">
              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isGift}
                  onChange={(e) => setIsGift(e.target.checked)}
                  className="w-5 h-5 text-amber-500 border-gray-300 rounded focus:ring-amber-500"
                />
                <span className="text-sm font-medium text-gray-700">
                  Enviar como regalo a otra persona
                </span>
              </label>
            </div>

            {isGift && (
              <div className="mb-6 p-6 bg-amber-50 rounded-xl border border-amber-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  Información del Destinatario
                </h3>
                <div className="grid md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Nombre del Destinatario
                    </label>
                    <input
                      type="text"
                      value={recipientName}
                      onChange={(e) => setRecipientName(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent bg-white"
                      placeholder="María García"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Email del Destinatario
                    </label>
                    <input
                      type="email"
                      value={recipientEmail}
                      onChange={(e) => setRecipientEmail(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent bg-white"
                      placeholder="destinatario@email.com"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Mensaje Personal (Opcional)
                  </label>
                  <textarea
                    value={personalMessage}
                    onChange={(e) => setPersonalMessage(e.target.value)}
                    maxLength={200}
                    rows={3}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent bg-white resize-none"
                    placeholder="¡Espero que disfrutes esta experiencia!"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {personalMessage.length}/200 caracteres
                  </p>
                </div>
              </div>
            )}

            <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl p-6 mb-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Resumen de Compra</h3>
              <div className="flex justify-between items-center text-lg">
                <span className="text-gray-700">Total a Pagar:</span>
                <span className="text-3xl font-bold text-amber-600">
                  ${selectedAmount.toLocaleString('es-MX')} MXN
                </span>
              </div>
              {isGift && recipientEmail && (
                <p className="text-sm text-gray-600 mt-3">
                  Se enviará a: <strong>{recipientEmail}</strong>
                </p>
              )}
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <h4 className="font-semibold text-blue-900 mb-2">Métodos de Pago Disponibles:</h4>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• Tarjeta de Crédito/Débito</li>
                <li>• OXXO (pago en efectivo)</li>
                <li>• Transferencia Bancaria</li>
              </ul>
            </div>

            <button
              type="submit"
              disabled={isProcessing}
              className="w-full bg-gradient-to-r from-amber-500 to-orange-600 text-white py-4 rounded-xl font-bold text-lg hover:from-amber-600 hover:to-orange-700 transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
            >
              {isProcessing ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Procesando...</span>
                </>
              ) : (
                <>
                  <CreditCard className="w-6 h-6" />
                  <span>Proceder al Pago</span>
                </>
              )}
            </button>

            <p className="text-xs text-gray-500 text-center mt-4">
              Al continuar, aceptas nuestros términos y condiciones. Las tarjetas de regalo son válidas por 1 año y pueden ser canjeadas por viajeros registrados en ToursRed.
            </p>
          </form>
        </div>

        <div className="mt-12 grid md:grid-cols-3 gap-6">
          <div className="bg-white rounded-xl p-6 shadow-md">
            <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mb-4">
              <Gift className="w-6 h-6 text-amber-600" />
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">Entrega Inmediata</h3>
            <p className="text-sm text-gray-600">
              La tarjeta de regalo se envía por email inmediatamente después de confirmar el pago.
            </p>
          </div>
          <div className="bg-white rounded-xl p-6 shadow-md">
            <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mb-4">
              <Check className="w-6 h-6 text-amber-600" />
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">Fácil de Canjear</h3>
            <p className="text-sm text-gray-600">
              Solo ingresa el código único para agregar el saldo a tu ToursRed Cash.
            </p>
          </div>
          <div className="bg-white rounded-xl p-6 shadow-md">
            <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mb-4">
              <CreditCard className="w-6 h-6 text-amber-600" />
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">Válida por 1 Año</h3>
            <p className="text-sm text-gray-600">
              El destinatario tiene 1 año completo para canjear y usar su tarjeta de regalo.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
