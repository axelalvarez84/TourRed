/*
  # Eliminar funcion get_admin_bookings

  Ya no se necesita — la vista admin usara query directo con RLS optimizado.
*/
DROP FUNCTION IF EXISTS get_admin_bookings();
