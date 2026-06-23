
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'admin_permissions' AND column_name = 'can_manage_travelers'
  ) THEN
    ALTER TABLE admin_permissions 
    ADD COLUMN can_manage_travelers boolean DEFAULT false;
  END IF;
END $$;
