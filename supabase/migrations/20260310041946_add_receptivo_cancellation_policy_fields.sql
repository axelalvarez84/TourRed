/*
  # Agregar campos configurables de política de cancelación para tours receptivos

  ## Descripción
  Agrega columnas a la tabla `tours` para que las agencias puedan configurar
  sus propias políticas de cancelación en tours de tipo receptivo. Los tours
  de tipo excursión continúan usando la lógica fija existente sin cambios.

  ## Nuevas columnas
  - `flexible_hours` - Umbral de horas para política flexible (ej: 48+ horas = reembolso total)
  - `flexible_refund_percentage` - Porcentaje de reembolso en zona flexible (0-100)
  - `moderate_hours` - Umbral de horas para política moderada (ej: 24-47 horas = reembolso parcial)
  - `moderate_refund_percentage` - Porcentaje de reembolso en zona moderada (0-100)
  - La zona de sin reembolso se calcula automáticamente: menos de `moderate_hours`

  ## Notas importantes
  1. Estas columnas solo aplican a tours con `tour_type = 'receptivo'`
  2. Los tours de tipo `excursion` siguen usando la lógica fija basada en días
  3. Se mantienen las columnas existentes `cancellation_policy`, `cancellation_hours_limit`
     y `cancellation_refund_percentage` para compatibilidad con datos existentes
  4. Todos los valores por defecto reflejan la política moderada estándar
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tours' AND column_name = 'flexible_hours'
  ) THEN
    ALTER TABLE tours ADD COLUMN flexible_hours integer DEFAULT 48 CHECK (flexible_hours > 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tours' AND column_name = 'flexible_refund_percentage'
  ) THEN
    ALTER TABLE tours ADD COLUMN flexible_refund_percentage integer DEFAULT 100 CHECK (flexible_refund_percentage >= 0 AND flexible_refund_percentage <= 100);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tours' AND column_name = 'moderate_hours'
  ) THEN
    ALTER TABLE tours ADD COLUMN moderate_hours integer DEFAULT 24 CHECK (moderate_hours > 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tours' AND column_name = 'moderate_refund_percentage'
  ) THEN
    ALTER TABLE tours ADD COLUMN moderate_refund_percentage integer DEFAULT 50 CHECK (moderate_refund_percentage >= 0 AND moderate_refund_percentage <= 100);
  END IF;
END $$;
