import React, { useState } from 'react';
import { CreditCard, Loader2, AlertCircle } from 'lucide-react';
import { useStripe } from '../hooks/useStripe';
import { stripeProducts, type StripeProduct } from '../stripe-config';

interface StripeCheckoutProps {
  product?: StripeProduct;
  className?: string;
  children?: React.ReactNode;
}

const StripeCheckout: React.FC<StripeCheckoutProps> = ({ 
  product, 
  className = '',
  children 
}) => {
  const { redirectToCheckout, isLoading } = useStripe();
  const [error, setError] = useState<string | null>(null);

  // Use the first product if none specified
  const selectedProduct = product || stripeProducts[0];

  if (!selectedProduct) {
    return (
      <div className="text-center p-4 text-gray-500">
        No products available
      </div>
    );
  }

  const handleCheckout = async () => {
    try {
      setError(null);
      await redirectToCheckout({
        priceId: selectedProduct?.priceId,
        mode: selectedProduct?.mode || 'payment',
        successUrl: `${window.location.origin}/success?product=${selectedProduct.id}`,
        cancelUrl: `${window.location.origin}/cancel`,
      });
    } catch (err: any) {
      setError(err.message || 'Failed to start checkout process');
    }
  };

  return (
    <div className={`bg-white rounded-lg shadow-md p-6 ${className}`}>
      <div className="text-center">
        <h3 className="text-xl font-semibold mb-2">{selectedProduct.name}</h3>
        <p className="text-gray-600 mb-4">{selectedProduct.description}</p>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-start">
            <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 mr-2 flex-shrink-0" />
            <div>
              <p className="text-red-600 text-sm font-medium">Error al procesar el pago</p>
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          </div>
        )}

        {children || (
          <button
            onClick={handleCheckout}
            disabled={isLoading}
            className="btn btn-primary w-full flex items-center justify-center"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <CreditCard className="h-5 w-5 mr-2" />
                Comprar {selectedProduct.name}
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
};

export default StripeCheckout;