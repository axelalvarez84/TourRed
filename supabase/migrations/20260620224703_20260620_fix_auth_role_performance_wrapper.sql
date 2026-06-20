
-- Fix: Wrap auth.role() calls with (SELECT auth.role()) to avoid per-row evaluation
-- This resolves performance warnings from the Supabase linter

-- accounting_access_invitations
DROP POLICY IF EXISTS "Service role full access accounting invitations" ON accounting_access_invitations;
CREATE POLICY "Service role full access accounting invitations" ON accounting_access_invitations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- accounting_account_mapping
DROP POLICY IF EXISTS "Service role can manage account mappings" ON accounting_account_mapping;
CREATE POLICY "Service role can manage account mappings" ON accounting_account_mapping
  FOR INSERT TO service_role WITH CHECK (true);

-- accounting_entries
DROP POLICY IF EXISTS "Service role full access accounting entries" ON accounting_entries;
CREATE POLICY "Service role full access accounting entries" ON accounting_entries
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- accounting_entry_lines
DROP POLICY IF EXISTS "Service role full access entry lines" ON accounting_entry_lines;
CREATE POLICY "Service role full access entry lines" ON accounting_entry_lines
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- accounting_sync_log
DROP POLICY IF EXISTS "Service role can insert accounting sync log" ON accounting_sync_log;
CREATE POLICY "Service role can insert accounting sync log" ON accounting_sync_log
  FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can update accounting sync log" ON accounting_sync_log;
CREATE POLICY "Service role can update accounting sync log" ON accounting_sync_log
  FOR UPDATE TO service_role USING (true) WITH CHECK (true);

-- agency_tour_message_recipients
DROP POLICY IF EXISTS "Service role can insert message recipients" ON agency_tour_message_recipients;
CREATE POLICY "Service role can insert message recipients" ON agency_tour_message_recipients
  FOR INSERT TO service_role WITH CHECK (true);

-- agency_tour_messages
DROP POLICY IF EXISTS "Service role can insert tour messages" ON agency_tour_messages;
CREATE POLICY "Service role can insert tour messages" ON agency_tour_messages
  FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can update tour messages" ON agency_tour_messages;
CREATE POLICY "Service role can update tour messages" ON agency_tour_messages
  FOR UPDATE TO service_role USING (true) WITH CHECK (true);

-- booking_cancellations
DROP POLICY IF EXISTS "Service role can insert cancellations" ON booking_cancellations;
CREATE POLICY "Service role can insert cancellations" ON booking_cancellations
  FOR INSERT TO service_role WITH CHECK (true);

-- booking_optional_services
DROP POLICY IF EXISTS "Service role can manage booking optional services" ON booking_optional_services;
CREATE POLICY "Service role can manage booking optional services" ON booking_optional_services
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- booking_payment_plan_installments
DROP POLICY IF EXISTS "service_role_installment" ON booking_payment_plan_installments;
CREATE POLICY "service_role_installment" ON booking_payment_plan_installments
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- booking_payment_plan_transaction_allocations
DROP POLICY IF EXISTS "service_role_alloc" ON booking_payment_plan_transaction_allocations;
CREATE POLICY "service_role_alloc" ON booking_payment_plan_transaction_allocations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- booking_payment_plan_transactions
DROP POLICY IF EXISTS "service_role_ppt" ON booking_payment_plan_transactions;
CREATE POLICY "service_role_ppt" ON booking_payment_plan_transactions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- booking_payment_plans
DROP POLICY IF EXISTS "service_role_payment_plan" ON booking_payment_plans;
CREATE POLICY "service_role_payment_plan" ON booking_payment_plans
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- booking_reschedule_responses
DROP POLICY IF EXISTS "Service role can insert responses" ON booking_reschedule_responses;
CREATE POLICY "Service role can insert responses" ON booking_reschedule_responses
  FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can update all responses" ON booking_reschedule_responses;
CREATE POLICY "Service role can update all responses" ON booking_reschedule_responses
  FOR UPDATE TO service_role USING (true) WITH CHECK (true);

-- booking_supplements
DROP POLICY IF EXISTS "Service role can manage booking supplements" ON booking_supplements;
CREATE POLICY "Service role can manage booking supplements" ON booking_supplements
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- bookings
DROP POLICY IF EXISTS "Service role can update bookings for webhooks" ON bookings;
CREATE POLICY "Service role can update bookings for webhooks" ON bookings
  FOR UPDATE TO service_role USING (true) WITH CHECK (true);

-- cancellation_penalty_records
DROP POLICY IF EXISTS "Service role can insert cancellation penalties" ON cancellation_penalty_records;
CREATE POLICY "Service role can insert cancellation penalties" ON cancellation_penalty_records
  FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can update cancellation penalties" ON cancellation_penalty_records;
CREATE POLICY "Service role can update cancellation penalties" ON cancellation_penalty_records
  FOR UPDATE TO service_role USING (true) WITH CHECK (true);

-- cfdi_cancellation_requests
DROP POLICY IF EXISTS "Service role can insert cfdi cancellations" ON cfdi_cancellation_requests;
CREATE POLICY "Service role can insert cfdi cancellations" ON cfdi_cancellation_requests
  FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can update cfdi cancellations" ON cfdi_cancellation_requests;
CREATE POLICY "Service role can update cfdi cancellations" ON cfdi_cancellation_requests
  FOR UPDATE TO service_role USING (true) WITH CHECK (true);

-- cfdi_invoices
DROP POLICY IF EXISTS "Service role can insert cfdi invoices" ON cfdi_invoices;
CREATE POLICY "Service role can insert cfdi invoices" ON cfdi_invoices
  FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can update cfdi invoices" ON cfdi_invoices;
CREATE POLICY "Service role can update cfdi invoices" ON cfdi_invoices
  FOR UPDATE TO service_role USING (true) WITH CHECK (true);

-- chart_of_accounts
DROP POLICY IF EXISTS "Service role full access chart of accounts" ON chart_of_accounts;
CREATE POLICY "Service role full access chart of accounts" ON chart_of_accounts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- failed_login_attempts
DROP POLICY IF EXISTS "service_role_all_failed_logins" ON failed_login_attempts;
CREATE POLICY "service_role_all_failed_logins" ON failed_login_attempts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- featured_tour_slots
DROP POLICY IF EXISTS "service_role_all_slots" ON featured_tour_slots;
CREATE POLICY "service_role_all_slots" ON featured_tour_slots
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- featured_tour_stats
DROP POLICY IF EXISTS "service_role_all_stats" ON featured_tour_stats;
CREATE POLICY "service_role_all_stats" ON featured_tour_stats
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- featured_tour_waitlist
DROP POLICY IF EXISTS "service_role_all_waitlist" ON featured_tour_waitlist;
CREATE POLICY "service_role_all_waitlist" ON featured_tour_waitlist
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- financial_transactions
DROP POLICY IF EXISTS "Service role can insert transactions" ON financial_transactions;
CREATE POLICY "Service role can insert transactions" ON financial_transactions
  FOR INSERT TO service_role WITH CHECK (true);

-- gift_card_redemption_attempts
DROP POLICY IF EXISTS "Service role has full access to redemption attempts" ON gift_card_redemption_attempts;
CREATE POLICY "Service role has full access to redemption attempts" ON gift_card_redemption_attempts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- gift_cards
DROP POLICY IF EXISTS "Service role has full access to gift cards" ON gift_cards;
CREATE POLICY "Service role has full access to gift cards" ON gift_cards
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- memberships
DROP POLICY IF EXISTS "Service role can insert memberships" ON memberships;
CREATE POLICY "Service role can insert memberships" ON memberships
  FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can update memberships" ON memberships;
CREATE POLICY "Service role can update memberships" ON memberships
  FOR UPDATE TO service_role USING (true) WITH CHECK (true);

-- referral_relationships
DROP POLICY IF EXISTS "Service role can insert referral relationships" ON referral_relationships;
CREATE POLICY "Service role can insert referral relationships" ON referral_relationships
  FOR INSERT TO service_role WITH CHECK (true);

-- slot_reschedule_requests
DROP POLICY IF EXISTS "Service role can manage slot reschedule requests" ON slot_reschedule_requests;
CREATE POLICY "Service role can manage slot reschedule requests" ON slot_reschedule_requests
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- slot_reschedule_responses
DROP POLICY IF EXISTS "Service role can manage slot reschedule responses" ON slot_reschedule_responses;
CREATE POLICY "Service role can manage slot reschedule responses" ON slot_reschedule_responses
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- support_ticket_attachments
DROP POLICY IF EXISTS "Service role can insert ticket attachments" ON support_ticket_attachments;
CREATE POLICY "Service role can insert ticket attachments" ON support_ticket_attachments
  FOR INSERT TO service_role WITH CHECK (true);

-- support_ticket_history
DROP POLICY IF EXISTS "Service role can insert ticket history" ON support_ticket_history;
CREATE POLICY "Service role can insert ticket history" ON support_ticket_history
  FOR INSERT TO service_role WITH CHECK (true);

-- support_tickets
DROP POLICY IF EXISTS "Service role can insert support tickets" ON support_tickets;
CREATE POLICY "Service role can insert support tickets" ON support_tickets
  FOR INSERT TO service_role WITH CHECK (true);

-- terms_acceptances
DROP POLICY IF EXISTS "Service role can insert terms acceptances" ON terms_acceptances;
CREATE POLICY "Service role can insert terms acceptances" ON terms_acceptances
  FOR INSERT TO service_role WITH CHECK (true);

-- terms_versions
DROP POLICY IF EXISTS "Service role can manage terms versions" ON terms_versions;
CREATE POLICY "Service role can manage terms versions" ON terms_versions
  FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can update terms versions" ON terms_versions;
CREATE POLICY "Service role can update terms versions" ON terms_versions
  FOR UPDATE TO service_role USING (true) WITH CHECK (true);

-- tour_cancellations
DROP POLICY IF EXISTS "Service role can insert tour cancellations" ON tour_cancellations;
CREATE POLICY "Service role can insert tour cancellations" ON tour_cancellations
  FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can update tour cancellations" ON tour_cancellations;
CREATE POLICY "Service role can update tour cancellations" ON tour_cancellations
  FOR UPDATE TO service_role USING (true) WITH CHECK (true);

-- toursred_cash_transactions
DROP POLICY IF EXISTS "Service role can insert transactions" ON toursred_cash_transactions;
CREATE POLICY "Service role can insert transactions" ON toursred_cash_transactions
  FOR INSERT TO service_role WITH CHECK (true);

-- toursred_cash_wallets
DROP POLICY IF EXISTS "Service role can insert wallets" ON toursred_cash_wallets;
CREATE POLICY "Service role can insert wallets" ON toursred_cash_wallets
  FOR INSERT TO service_role WITH CHECK (true);

-- toursred_points_transactions
DROP POLICY IF EXISTS "Service role can manage transactions" ON toursred_points_transactions;
CREATE POLICY "Service role can manage transactions" ON toursred_points_transactions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- toursred_points_wallets
DROP POLICY IF EXISTS "Service role can manage wallets" ON toursred_points_wallets;
CREATE POLICY "Service role can manage wallets" ON toursred_points_wallets
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- user_sessions
DROP POLICY IF EXISTS "service_role_all_user_sessions" ON user_sessions;
CREATE POLICY "service_role_all_user_sessions" ON user_sessions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- webhook_logs
DROP POLICY IF EXISTS "Service role can insert webhook logs" ON webhook_logs;
CREATE POLICY "Service role can insert webhook logs" ON webhook_logs
  FOR INSERT TO service_role WITH CHECK (true);

-- zoho_oauth_tokens
DROP POLICY IF EXISTS "Service role can delete zoho tokens" ON zoho_oauth_tokens;
CREATE POLICY "Service role can delete zoho tokens" ON zoho_oauth_tokens
  FOR DELETE TO service_role USING (true);

DROP POLICY IF EXISTS "Service role can insert zoho tokens" ON zoho_oauth_tokens;
CREATE POLICY "Service role can insert zoho tokens" ON zoho_oauth_tokens
  FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can manage zoho tokens" ON zoho_oauth_tokens;
CREATE POLICY "Service role can manage zoho tokens" ON zoho_oauth_tokens
  FOR SELECT TO service_role USING (true);

DROP POLICY IF EXISTS "Service role can update zoho tokens" ON zoho_oauth_tokens;
CREATE POLICY "Service role can update zoho tokens" ON zoho_oauth_tokens
  FOR UPDATE TO service_role USING (true) WITH CHECK (true);
