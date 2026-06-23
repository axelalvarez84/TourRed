-- ============================================================================
-- PASSWORD RESET CODES TABLE POLICIES
-- ============================================================================

-- Users can read their own password reset codes
CREATE POLICY "Users can view own password reset codes"
  ON public.password_reset_codes
  FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

-- System can insert password reset codes (service role or authenticated users requesting reset)
CREATE POLICY "Users can create own password reset codes"
  ON public.password_reset_codes
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

-- Users can update their own password reset codes (mark as used)
CREATE POLICY "Users can update own password reset codes"
  ON public.password_reset_codes
  FOR UPDATE
  TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

-- Admins can manage all password reset codes
CREATE POLICY "Admins can manage all password reset codes"
  ON public.password_reset_codes
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = (select auth.uid())
      AND role = 'admin'
    )
  );

-- ============================================================================
-- WEBHOOK LOGS TABLE
-- ============================================================================

-- Enable RLS for webhook_logs
ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can view webhook logs
CREATE POLICY "Admins can view all webhook logs"
  ON public.webhook_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = (select auth.uid())
      AND role = 'admin'
    )
  );

-- System/service role can insert webhook logs
CREATE POLICY "Service role can insert webhook logs"
  ON public.webhook_logs
  FOR INSERT
  TO service_role
  WITH CHECK (true);
