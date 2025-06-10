export interface StripeProduct {
  id: string;
  priceId: string;
  name: string;
  description: string;
  mode: 'payment' | 'subscription';
}

export const stripeProducts: StripeProduct[] = [
  {
    id: 'prod_STH0j31AYzyZHz',
    priceId: 'price_1RYKSQGa0TlrgX47BhDL8emD',
    name: 'Cargo Por Servicio',
    description: 'Cargo por servicio de procesamiento de reservas',
    mode: 'payment',
  },
];

export function getProductById(id: string): StripeProduct | undefined {
  return stripeProducts.find(product => product.id === id);
}

export function getProductByPriceId(priceId: string): StripeProduct | undefined {
  return stripeProducts.find(product => product.priceId === priceId);
}