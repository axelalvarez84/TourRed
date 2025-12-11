import React, { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { CheckCircle, ArrowRight, Home, CreditCard } from 'lucide-react';
import { getProductById } from '../stripe-config';
import { supabase } from '../lib/supabase';

const SuccessPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [product, setProduct] = useState<any>(null);
  const [isUpdating, setIsUpdating] = useState(true);

  useEffect(() => {
    const updateBookingStatus = async () => {
      try {
        const bookingId = searchParams.get('booking_id');
        const productId = searchParams.get('product');

        if (productId) {
          const foundProduct = getProductById(productId);
          setProduct(foundProduct);
        }

        if (bookingId) {
          const { error } = await supabase
            .from('bookings')
            .update({
              payment_status: 'succeeded',
              status: 'confirmed',
              paid_at: new Date().toISOString()
            })
            .eq('id', bookingId);

          if (error) {
            console.error('Error updating booking:', error);
          }
        }
      } catch (err) {
        console.error('Error in success page:', err);
      } finally {
        setIsUpdating(false);
      }
    };

    updateBookingStatus();
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-100 mb-6">
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
          
          <h2 className="text-3xl font-bold text-gray-900 mb-2">
            ¡Pago Exitoso!
          </h2>
          
          <p className="text-gray-600 mb-6">
            Gracias por tu compra. Tu pago ha sido procesado exitosamente.
          </p>

          {product && (
            <div className="bg-white rounded-lg shadow-md p-6 mb-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-2 flex items-center">
                <CreditCard className="h-5 w-5 mr-2 text-primary-600" />
                Detalles de la Compra
              </h3>
              <div className="text-left space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">Producto:</span>
                  <span className="font-medium">{product.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Tipo:</span>
                  <span className="font-medium capitalize">
                    {product.mode === 'payment' ? 'Pago único' : 'Suscripción'}
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-4">
            <Link
              to="/dashboard"
              className="w-full flex items-center justify-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
            >
              Ir al Panel
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
            
            <Link
              to="/"
              className="w-full flex items-center justify-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
            >
              <Home className="mr-2 h-4 w-4" />
              Volver al Inicio
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SuccessPage;