/*
  # Fix RLS always-true policies

  ## Summary
  Policies with USING (true) or WITH CHECK (true) effectively bypass RLS for
  the authenticated role. These should be restricted to the service_role only,
  since they are intended for internal system operations (edge functions,
  triggers, etc.) that run with service role credentials.

  ## Changes
  - booking_cancellations: Service role insert policy -> service_role only
  - booking_reschedule_responses: Service role insert/update policies -> service_role only
  - financial_transactions: Service role insert policy -> service_role only
  - tour_cancellations: Service role insert/update policies -> service_role only
  - toursred_cash_transactions: Service role insert policy -> service_role only
  - toursred_cash_wallets: Service role insert policy -> service_role only

  ## Note on public insert policies
  - cookie_consents "Anyone can record consent" remains open (intentional public feature)
  - international_tour_inquiries "Anyone can submit inquiry" remains open (intentional public feature)
  - newsletter_subscriptions "Anyone can subscribe" remains open (intentional public feature)
  - notifications "System can create notifications" -> restricted to service_role
*/

-- booking_cancellations
DROP POLICY IF EXISTS "Service role can insert cancellations" ON public.booking_cancellations;
CREATE POLICY "Service role can insert cancellations"
  ON public.booking_cancellations FOR INSERT
  TO service_role
  WITH CHECK (true);

-- booking_reschedule_responses
DROP POLICY IF EXISTS "Service role can insert responses" ON public.booking_reschedule_responses;
CREATE POLICY "Service role can insert responses"
  ON public.booking_reschedule_responses FOR INSERT
  TO service_role
  WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can update all responses" ON public.booking_reschedule_responses;
CREATE POLICY "Service role can update all responses"
  ON public.booking_reschedule_responses FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- financial_transactions
DROP POLICY IF EXISTS "Service role can insert transactions" ON public.financial_transactions;
CREATE POLICY "Service role can insert transactions"
  ON public.financial_transactions FOR INSERT
  TO service_role
  WITH CHECK (true);

-- tour_cancellations
DROP POLICY IF EXISTS "Service role can insert tour cancellations" ON public.tour_cancellations;
CREATE POLICY "Service role can insert tour cancellations"
  ON public.tour_cancellations FOR INSERT
  TO service_role
  WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can update tour cancellations" ON public.tour_cancellations;
CREATE POLICY "Service role can update tour cancellations"
  ON public.tour_cancellations FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- toursred_cash_transactions
DROP POLICY IF EXISTS "Service role can insert transactions" ON public.toursred_cash_transactions;
CREATE POLICY "Service role can insert transactions"
  ON public.toursred_cash_transactions FOR INSERT
  TO service_role
  WITH CHECK (true);

-- toursred_cash_wallets
DROP POLICY IF EXISTS "Service role can insert wallets" ON public.toursred_cash_wallets;
CREATE POLICY "Service role can insert wallets"
  ON public.toursred_cash_wallets FOR INSERT
  TO service_role
  WITH CHECK (true);

-- notifications: restrict system insert to service_role
DROP POLICY IF EXISTS "System can create notifications" ON public.notifications;
CREATE POLICY "System can create notifications"
  ON public.notifications FOR INSERT
  TO service_role
  WITH CHECK (true);
