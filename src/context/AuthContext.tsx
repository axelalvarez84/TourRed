import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase, getCurrentUser, UserRole } from '../lib/supabase';

export interface AdminPermissions {
  canManageAgencies: boolean;
  canManageUsers: boolean;
  canManageTravelers: boolean;
  canManageDestinations: boolean;
  canManageReviews: boolean;
  canManageMessages: boolean;
  canManageSettings: boolean;
  canManageMemberships: boolean;
  canManageInquiries: boolean;
}

interface AuthContextType {
  user: any | null;
  userRole: UserRole | null;
  isLoading: boolean;
  isAdmin: boolean;
  isAgency: boolean;
  isTraveler: boolean;
  isEmailVerified: boolean;
  isSuperAdmin: boolean;
  permissions: AdminPermissions | null;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  userRole: null,
  isLoading: true,
  isAdmin: false,
  isAgency: false,
  isTraveler: false,
  isEmailVerified: false,
  isSuperAdmin: false,
  permissions: null,
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<any | null>(null);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [isEmailVerified, setIsEmailVerified] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [permissions, setPermissions] = useState<AdminPermissions | null>(null);

  const getCachedRole = (userId: string): UserRole | null => {
    try {
      const cached = localStorage.getItem(`user_role_${userId}`);
      if (cached && Object.values(UserRole).includes(cached as UserRole)) {
        return cached as UserRole;
      }
    } catch (err) {
      console.error('Error leyendo cache de rol:', err);
    }
    return null;
  };

  const setCachedRole = (userId: string, role: UserRole) => {
    try {
      localStorage.setItem(`user_role_${userId}`, role);
    } catch (err) {
      console.error('Error guardando cache de rol:', err);
    }
  };

  const determineUserRole = async (authUser: any, forceRefresh: boolean = false): Promise<{ role: UserRole; emailVerified: boolean }> => {
    if (!authUser) {
      console.log('ℹ️ No hay usuario autenticado');
      return { role: UserRole.TRAVELER, emailVerified: false };
    }

    console.log('🔍 Determinando rol para usuario:', authUser.email);

    // VERIFICACIÓN ESPECIAL PARA ADMIN PRIMERO
    if (authUser.email === 'tourredmx@gmail.com') {
      console.log('👑 Usuario administrador detectado por email - FORZANDO ADMIN');
      setCachedRole(authUser.id, UserRole.ADMIN);
      return { role: UserRole.ADMIN, emailVerified: true };
    }

    // Verificar cache primero si no se fuerza refresco
    if (!forceRefresh) {
      const cachedRole = getCachedRole(authUser.id);
      if (cachedRole) {
        console.log('✅ Usando rol del cache:', cachedRole);
      }
    }

    // Verificar metadata
    const metadataRole = authUser.user_metadata?.role;
    console.log('📋 Rol en metadata:', metadataRole);

    // Verificar en la base de datos con timeout
    try {
      console.log('🔍 Consultando perfil en BD para:', authUser.id);

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), 3000)
      );

      const queryPromise = supabase
        .from('users')
        .select('role, email_verified')
        .eq('id', authUser.id)
        .maybeSingle();

      const { data: profile, error } = await Promise.race([queryPromise, timeoutPromise]) as any;

      if (error) {
        console.error('❌ Error consultando perfil:', error);
        // Intentar usar metadata como fallback
        if (metadataRole && Object.values(UserRole).includes(metadataRole as UserRole)) {
          console.log('⚠️ Usando rol de metadata debido a error en BD:', metadataRole);
          setCachedRole(authUser.id, metadataRole as UserRole);
          return { role: metadataRole as UserRole, emailVerified: true };
        }
      } else if (profile) {
        console.log('✅ Perfil encontrado en BD:', profile);
        const role = profile.role as UserRole;
        const emailVerified = profile.email_verified || false;
        setCachedRole(authUser.id, role);
        return { role, emailVerified };
      } else {
        console.log('⚠️ No se encontró perfil en BD');
      }
    } catch (err: any) {
      console.error('❌ Error en consulta de BD (puede ser timeout):', err.message);
      // Intentar usar metadata como fallback
      if (metadataRole && Object.values(UserRole).includes(metadataRole as UserRole)) {
        console.log('⚠️ Usando rol de metadata debido a timeout:', metadataRole);
        setCachedRole(authUser.id, metadataRole as UserRole);
        return { role: metadataRole as UserRole, emailVerified: true };
      }
    }

    // Si hay metadata, usar eso
    if (metadataRole && Object.values(UserRole).includes(metadataRole as UserRole)) {
      console.log('✅ Usando rol de metadata:', metadataRole);
      setCachedRole(authUser.id, metadataRole as UserRole);
      return { role: metadataRole as UserRole, emailVerified: true };
    }

    // Por defecto, traveler
    console.log('🎒 Asignando rol por defecto: traveler');
    setCachedRole(authUser.id, UserRole.TRAVELER);
    return { role: UserRole.TRAVELER, emailVerified: true };
  };

  const updateAuthState = async (authUser: any, forceRefresh: boolean = false) => {
    console.log('🔄 Actualizando estado de autenticación...', { forceRefresh });

    try {
      setUser(authUser);

      if (authUser) {
        const { role, emailVerified } = await determineUserRole(authUser, forceRefresh);
        console.log('🎭 Rol determinado:', role, 'Email verificado:', emailVerified);
        setUserRole(role);
        setIsEmailVerified(emailVerified);

        if (role === UserRole.ADMIN) {
          try {
            const { data: userData } = await supabase
              .from('users')
              .select('is_super_admin')
              .eq('id', authUser.id)
              .maybeSingle();

            if (userData) {
              setIsSuperAdmin(userData.is_super_admin || false);

              if (!userData.is_super_admin) {
                const { data: permsData } = await supabase
                  .from('admin_permissions')
                  .select('*')
                  .eq('user_id', authUser.id)
                  .maybeSingle();

                if (permsData) {
                  setPermissions({
                    canManageAgencies: permsData.can_manage_agencies,
                    canManageUsers: permsData.can_manage_users,
                    canManageTravelers: permsData.can_manage_travelers,
                    canManageDestinations: permsData.can_manage_destinations,
                    canManageReviews: permsData.can_manage_reviews,
                    canManageMessages: permsData.can_manage_messages,
                    canManageSettings: permsData.can_manage_settings,
                    canManageMemberships: permsData.can_manage_memberships,
                    canManageInquiries: permsData.can_manage_inquiries,
                  });
                } else {
                  setPermissions(null);
                }
              } else {
                setPermissions(null);
              }
            }
          } catch (err) {
            console.error('Error cargando permisos de admin:', err);
            setIsSuperAdmin(false);
            setPermissions(null);
          }
        } else {
          setIsSuperAdmin(false);
          setPermissions(null);
        }
      } else {
        setUserRole(null);
        setIsEmailVerified(false);
        setIsSuperAdmin(false);
        setPermissions(null);
        try {
          localStorage.clear();
        } catch (err) {
          console.error('Error limpiando cache:', err);
        }
      }
    } catch (err: any) {
      console.error('❌ Error determinando rol:', err);
      if (authUser) {
        if (authUser.email === 'tourredmx@gmail.com') {
          setUserRole(UserRole.ADMIN);
          setIsEmailVerified(true);
          setIsSuperAdmin(true);
          setPermissions(null);
        } else {
          const cachedRole = getCachedRole(authUser.id);
          if (cachedRole) {
            console.log('⚠️ Usando rol cacheado debido a error:', cachedRole);
            setUserRole(cachedRole);
            setIsEmailVerified(true);
          } else {
            setUserRole(UserRole.TRAVELER);
            setIsEmailVerified(true);
          }
          setIsSuperAdmin(false);
          setPermissions(null);
        }
      } else {
        setUserRole(null);
        setIsEmailVerified(false);
        setIsSuperAdmin(false);
        setPermissions(null);
      }
    } finally {
      console.log('✅ Finalizando carga - estableciendo isLoading: false');
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;

    const initializeAuth = async () => {
      console.log('🚀 Inicializando autenticación...');

      try {
        // Obtener usuario actual con timeout
        const timeoutPromise = new Promise<null>((resolve) =>
          setTimeout(() => {
            console.log('⏱️ Timeout en getCurrentUser, continuando sin usuario');
            resolve(null);
          }, 5000)
        );

        const currentUser = await Promise.race([
          getCurrentUser(),
          timeoutPromise
        ]);

        console.log('👤 Usuario actual:', currentUser?.email || 'ninguno');

        if (mounted) {
          await updateAuthState(currentUser);
        }
      } catch (err: any) {
        console.error('❌ Error inicializando auth:', err);
        if (mounted) {
          setUser(null);
          setUserRole(null);
          setIsLoading(false);
        }
      }
    };

    // Ejecutar inicialización
    initializeAuth();

    // Configurar listener de cambios de auth
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('🔔 Cambio de estado de auth:', event);

      if (!mounted) return;

      if (event === 'SIGNED_IN') {
        // No bloquear el callback, ejecutar en background
        updateAuthState(session?.user || null, true).catch(err => {
          console.error('Error en updateAuthState:', err);
        });
      } else if (event === 'TOKEN_REFRESHED') {
        if (session?.user) {
          console.log('♻️ Token refrescado - actualizando usuario sin revalidar rol');
          setUser(session.user);
          // No revalidar el rol en refresh, usar el cache
          const cachedRole = getCachedRole(session.user.id);
          if (cachedRole) {
            setUserRole(cachedRole);
          }
        }
      } else if (event === 'SIGNED_OUT') {
        console.log('👋 Usuario cerró sesión');
        setUser(null);
        setUserRole(null);
        setIsLoading(false);
      }
    });

    return () => {
      mounted = false;
      authListener?.subscription.unsubscribe();
    };
  }, []);

  const isAdmin = userRole === UserRole.ADMIN;
  const isAgency = userRole === UserRole.AGENCY;
  const isTraveler = userRole === UserRole.TRAVELER;

  // Log del estado actual cada vez que cambia
  useEffect(() => {
    console.log('🎭 Estado del contexto actualizado:', {
      userEmail: user?.email,
      userRole,
      isAdmin,
      isAgency,
      isTraveler,
      isEmailVerified,
      isSuperAdmin,
      permissions,
      isLoading
    });
  }, [user, userRole, isLoading, isAdmin, isAgency, isTraveler, isEmailVerified, isSuperAdmin, permissions]);

  return (
    <AuthContext.Provider value={{
      user,
      userRole,
      isLoading,
      isAdmin,
      isAgency,
      isTraveler,
      isEmailVerified,
      isSuperAdmin,
      permissions
    }}>
      {children}
    </AuthContext.Provider>
  );
};