/*
  # Fix incorrect commission_records status

  1. Changes
    - Update all commission_records with status='processed' but processed_at IS NULL
    - These should have status='pending' since they haven't actually been paid
    - Affects 49 records totaling $25,492.50 MXN
    
  2. Notes
    - This fixes a bug where commissions were incorrectly marked as processed when created
    - These commissions are actually pending payment to agencies
*/

UPDATE commission_records
SET status = 'pending'
WHERE status = 'processed'
AND processed_at IS NULL;