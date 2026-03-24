/*
  # Sincronizar capacidad de slots al actualizar horario

  ## Problema
  Cuando una agencia actualiza el `slot_capacity` en `tour_schedules`,
  los slots futuros ya generados en `tour_slots` conservan la capacidad
  anterior porque no existe un mecanismo de sincronización.

  ## Solución
  1. Trigger en `tour_schedules` que, al detectar un cambio en `slot_capacity`,
     actualiza todos los slots futuros (abiertos) asociados a ese horario,
     siempre que el slot no tenga reservas activas que superen la nueva capacidad.
  2. También sincroniza cuando cambia `default_slot_capacity` en `tours`.

  ## Notas
  - Solo actualiza slots con status = 'available' y fecha futura.
  - No reduce la capacidad por debajo de `booked_count` para evitar overbooking.
*/

CREATE OR REPLACE FUNCTION public.sync_tour_slots_capacity_on_schedule_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_capacity integer;
  v_tour_default integer;
BEGIN
  IF OLD.slot_capacity IS NOT DISTINCT FROM NEW.slot_capacity THEN
    RETURN NEW;
  END IF;

  IF NEW.slot_capacity IS NOT NULL THEN
    v_new_capacity := NEW.slot_capacity;
  ELSE
    SELECT default_slot_capacity INTO v_tour_default
    FROM tours WHERE id = NEW.tour_id;
    v_new_capacity := v_tour_default;
  END IF;

  IF v_new_capacity IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE tour_slots
  SET
    capacity = GREATEST(v_new_capacity, booked_count),
    updated_at = now()
  WHERE
    schedule_id = NEW.id
    AND slot_date >= CURRENT_DATE
    AND status = 'available';

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_slot_capacity_on_schedule_update ON tour_schedules;
CREATE TRIGGER trg_sync_slot_capacity_on_schedule_update
AFTER UPDATE ON tour_schedules
FOR EACH ROW
EXECUTE FUNCTION public.sync_tour_slots_capacity_on_schedule_update();


CREATE OR REPLACE FUNCTION public.sync_tour_slots_capacity_on_tour_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.default_slot_capacity IS NOT DISTINCT FROM NEW.default_slot_capacity THEN
    RETURN NEW;
  END IF;

  IF NEW.default_slot_capacity IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE tour_slots ts
  SET
    capacity = GREATEST(NEW.default_slot_capacity, ts.booked_count),
    updated_at = now()
  FROM tour_schedules sch
  WHERE
    ts.schedule_id = sch.id
    AND sch.tour_id = NEW.id
    AND sch.slot_capacity IS NULL
    AND ts.slot_date >= CURRENT_DATE
    AND ts.status = 'available';

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_slot_capacity_on_tour_update ON tours;
CREATE TRIGGER trg_sync_slot_capacity_on_tour_update
AFTER UPDATE ON tours
FOR EACH ROW
EXECUTE FUNCTION public.sync_tour_slots_capacity_on_tour_update();
