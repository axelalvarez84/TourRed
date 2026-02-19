/*
  # Add payment_status to gift_cards

  Adds a payment_status column to track whether a gift card has been paid or not.
  - 'pending': created but not yet paid (for PayPal/MercadoPago flows)
  - 'paid': payment confirmed
  - 'free': no payment required (discount codes)

  Also updates the status default so new gift cards start as 'pending_payment'
  until payment is confirmed, then move to 'active'.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'gift_cards' AND column_name = 'payment_status'
  ) THEN
    ALTER TABLE gift_cards ADD COLUMN payment_status text NOT NULL DEFAULT 'paid';
  END IF;
END $$;
