import { useEffect, useRef, useState } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';

interface MercadoPagoBrickProps {
  preferenceId: string;
  publicKey: string;
  onSuccess: () => void;
  onError: (error: string) => void;
  onPending?: () => void;
}

declare global {
  interface Window {
    MercadoPago: any;
  }
}

export default function MercadoPagoBrick({
  preferenceId,
  publicKey,
  onSuccess,
  onError,
  onPending,
}: MercadoPagoBrickProps) {
  const [sdkLoaded, setSdkLoaded] = useState(false);
  const [brickReady, setBrickReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const brickContainerRef = useRef<HTMLDivElement>(null);
  const brickControllerRef = useRef<any>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (brickControllerRef.current) {
        try {
          brickControllerRef.current.unmount();
        } catch (_) {}
      }
    };
  }, []);

  useEffect(() => {
    if (window.MercadoPago) {
      setSdkLoaded(true);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://sdk.mercadopago.com/js/v2';
    script.async = true;
    script.onload = () => {
      if (mountedRef.current) setSdkLoaded(true);
    };
    script.onerror = () => {
      if (mountedRef.current) setLoadError('No se pudo cargar el SDK de MercadoPago.');
    };
    document.head.appendChild(script);

    return () => {
      if (document.head.contains(script)) {
        document.head.removeChild(script);
      }
    };
  }, []);

  useEffect(() => {
    if (!sdkLoaded || !preferenceId || !publicKey) return;

    let brickController: any = null;

    const initBrick = async () => {
      try {
        const mp = new window.MercadoPago(publicKey);
        const bricksBuilder = mp.bricks();

        brickController = await bricksBuilder.create('payment', 'mp-payment-brick', {
          initialization: {
            amount: 0,
            preferenceId,
          },
          customization: {
            paymentMethods: {
              creditCard: 'all',
              debitCard: 'all',
              ticket: 'all',
              bankTransfer: 'all',
              mercadoPago: 'all',
            },
            visual: {
              style: {
                theme: 'default',
              },
            },
          },
          callbacks: {
            onReady: () => {
              if (mountedRef.current) setBrickReady(true);
            },
            onSubmit: async ({ selectedPaymentMethod, formData }: any) => {
              try {
                const response = await fetch(
                  `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-mercadopago-brick-payment`,
                  {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ formData, selectedPaymentMethod, preferenceId }),
                  }
                );

                const result = await response.json();

                if (!response.ok || result.error) {
                  throw new Error(result.error || 'Error al procesar el pago');
                }

                if (result.status === 'approved') {
                  onSuccess();
                } else if (result.status === 'in_process' || result.status === 'pending') {
                  if (onPending) onPending();
                  else onSuccess();
                } else {
                  onError(result.status_detail || 'El pago no fue aprobado');
                }
              } catch (err: any) {
                onError(err.message || 'Error al procesar el pago');
              }
            },
            onError: (error: any) => {
              console.error('Brick error:', error);
              onError(error?.message || 'Error en el formulario de pago');
            },
          },
        });

        brickControllerRef.current = brickController;
      } catch (err: any) {
        console.error('Error initializing brick:', err);
        if (mountedRef.current) setLoadError(err.message || 'Error al inicializar el pago');
      }
    };

    initBrick();

    return () => {
      if (brickController) {
        try {
          brickController.unmount();
        } catch (_) {}
      }
    };
  }, [sdkLoaded, preferenceId, publicKey]);

  if (loadError) {
    return (
      <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
        <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
        <span>{loadError}</span>
      </div>
    );
  }

  return (
    <div className="relative">
      {!brickReady && (
        <div className="flex flex-col items-center justify-center py-12 gap-3 text-gray-500">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
          <span className="text-sm">Cargando formulario de pago...</span>
        </div>
      )}
      <div
        id="mp-payment-brick"
        ref={brickContainerRef}
        className={brickReady ? 'block' : 'invisible h-0 overflow-hidden'}
      />
    </div>
  );
}
