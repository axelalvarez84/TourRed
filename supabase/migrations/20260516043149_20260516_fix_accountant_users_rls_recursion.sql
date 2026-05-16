/*
  # Fix: Eliminar politica recursiva en tabla users

  La politica "Accountant can view own profile" contenia una subquery
  SELECT FROM users que causaba recursion infinita en RLS para todos
  los usuarios, haciendo que el rol admin no se detectara correctamente.

  Se elimina esa politica ya que las politicas existentes
  "Users can read own data" y "Super admins can view all users"
  ya cubren los casos necesarios.
*/

DROP POLICY IF EXISTS "Accountant can view own profile" ON users;
