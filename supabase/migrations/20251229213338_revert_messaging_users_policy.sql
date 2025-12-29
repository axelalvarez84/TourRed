/*
  # Revertir política de mensajería que causa recursión infinita

  1. Cambios
    - Eliminar la política que causa recursión infinita
    - Esta política causaba un loop al verificar message_participants

  2. Notas
    - Buscaremos una solución alternativa usando SECURITY DEFINER
*/

DROP POLICY IF EXISTS "Users can view other participants in their conversations" ON users;