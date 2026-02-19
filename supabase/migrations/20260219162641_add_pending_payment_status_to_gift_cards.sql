/*
  # Add pending_payment status to gift_cards

  Updates the status check constraint to allow 'pending_payment' for gift cards
  that have been created but not yet paid (PayPal/MercadoPago flows).
*/

ALTER TABLE gift_cards DROP CONSTRAINT IF EXISTS gift_cards_status_check;

ALTER TABLE gift_cards ADD CONSTRAINT gift_cards_status_check
  CHECK (status = ANY (ARRAY['active'::text, 'redeemed'::text, 'expired'::text, 'cancelled'::text, 'pending_payment'::text]));
