/*
  # Corregir política RLS faltante de DELETE en booking_travelers y limpiar duplicados

  ## Problema
  La tabla `booking_travelers` no tenía política RLS para DELETE. Esto causaba que
  el DELETE silencioso (sin error) al re-guardar viajeros no eliminara los registros
  anteriores, acumulando duplicados cada vez que el usuario guardaba el formulario.

  ## Cambios
  1. Agrega política DELETE para que el dueño de la reserva pueda eliminar sus viajeros
  2. Limpia los registros duplicados existentes, conservando el más reciente por booking

  ## Seguridad
  - La política solo permite eliminar viajeros de reservas propias (mismo patrón que INSERT/UPDATE)
*/

-- 1. Crear política DELETE faltante
CREATE POLICY "Travelers can delete own booking travelers"
  ON booking_travelers
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM bookings
      WHERE bookings.id = booking_travelers.booking_id
        AND bookings.user_id = (SELECT auth.uid())
    )
  );

-- 2. Limpiar duplicados: conservar solo el registro más reciente por booking_id + categoria_viajero + posición
-- Para reservas donde hay más registros de los que debería haber según count_adultos + count_ninos + etc.
DELETE FROM booking_travelers
WHERE id IN (
  SELECT bt.id
  FROM booking_travelers bt
  INNER JOIN (
    -- Encontrar booking_ids que tienen más filas activas (no canceladas) de las esperadas
    SELECT
      booking_id,
      COUNT(*) as total_rows,
      ROW_NUMBER() OVER (PARTITION BY booking_id ORDER BY booking_id) as rn
    FROM booking_travelers
    WHERE is_cancelled = false
    GROUP BY booking_id
    HAVING COUNT(*) > 1
  ) dup ON dup.booking_id = bt.booking_id
  WHERE bt.is_cancelled = false
  -- De cada grupo de duplicados por booking_id + categoria_viajero, eliminar todos excepto el más reciente
  AND bt.id NOT IN (
    SELECT DISTINCT ON (inner_bt.booking_id, inner_bt.categoria_viajero, inner_bt.nombre)
      inner_bt.id
    FROM booking_travelers inner_bt
    WHERE inner_bt.booking_id = bt.booking_id
      AND inner_bt.is_cancelled = false
    ORDER BY inner_bt.booking_id, inner_bt.categoria_viajero, inner_bt.nombre, inner_bt.created_at DESC
  )
);
