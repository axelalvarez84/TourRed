export interface StripeProduct {
  id: string;
  priceId: string;
  name: string;
  description: string;
  mode: 'payment' | 'subscription';
}

export const stripeProducts: StripeProduct[] = [
  {
    id: 'service_fee',
    priceId: 'price_1RYKSQGa0TlrgX47BhDL8emD', // Reemplaza con tu price_id real
    name: 'Cargo Por Servicio',
    description: 'Cargo por servicio de procesamiento de reservas (3% del valor del tour)',
    mode: 'payment',
  },
];

export function getProductById(id: string): StripeProduct | undefined {
  return stripeProducts.find(product => product.id === id);
}

export function getProductByPriceId(priceId: string): StripeProduct | undefined {
  return stripeProducts.find(product => product.priceId === priceId);
}