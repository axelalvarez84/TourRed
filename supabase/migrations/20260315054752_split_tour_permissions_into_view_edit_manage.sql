/*
  # Granular Tour Permissions for Agency Staff

  ## Changes
  Splits the single `can_manage_tours` permission into three granular levels:

  1. `can_view_tours`   - Read-only access to the tours list and details
  2. `can_edit_tours`   - Can edit existing tours but cannot create or delete
  3. `can_manage_tours` - Full control: create, edit, delete tours (kept for backwards compat)

  ## Migration Strategy
  - Add the two new columns with DEFAULT false
  - Backfill: any staff that had can_manage_tours = true also gets can_edit_tours = true and can_view_tours = true
  - Keep can_manage_tours as-is (now strictly means create + delete in addition to edit)
*/

ALTER TABLE agency_staff_permissions
  ADD COLUMN IF NOT EXISTS can_view_tours boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_edit_tours boolean DEFAULT false;

-- Backfill: staff with full manage also gets edit and view
UPDATE agency_staff_permissions
SET
  can_view_tours = true,
  can_edit_tours = true
WHERE can_manage_tours = true;
