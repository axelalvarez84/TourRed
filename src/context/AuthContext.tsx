import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase, getCurrentUser, UserRole } from '../lib/supabase';

interface AuthContextType {
  user: any | null;
  userRole: UserRole | null;
  isLoading: boolean;
  isAdmin: boolean;
  isAgency: boolean;
  isTraveler: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  userRole: null,
  isLoading: true,
  isAdmin: false,
  isAgency: false,
  isTraveler: false,
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<any | null>(null);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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

  const determineUserRole = async (authUser: any, forceRefresh: boolean = false): Promise<UserRole | null> => {
    if (!authUser) {
      console.log('ℹ️ No hay usuario autenticado');
      return null;
    }

    console.log('🔍 Determinando rol para usuario:', authUser.email);

    // VERIFICACIÓN ESPECIAL PARA ADMIN PRIMERO
    if (authUser.email === 'tourredmx@gmail.com') {
      console.log('👑 Usuario administrador detectado por email - FORZANDO ADMIN');
      setCachedRole(authUser.id, UserRole.ADMIN);
      return UserRole.ADMIN;
    }

    // Verificar cache primero si no se fuerza refresco
    if (!forceRefresh) {
      const cachedRole = getCachedRole(authUser.id);
      if (cachedRole) {
        console.log('✅ Usando rol del cache:', cachedRole);
        return cachedRole;
      }
    }

    // Verificar metadata
    const metadataRole = authUser.user_metadata?.role;
    console.log('📋 Rol en metadata:', metadataRole);

    if (metadataRole && Object.values(UserRole).includes(metadataRole as UserRole)) {
      console.log('✅ Usando rol de metadata:', metadataRole);
      setCachedRole(authUser.id, metadataRole as UserRole);
      return metadataRole as UserRole;
    }

    // Verificar en la base de datos con timeout
    try {
      console.log('🔍 Consultando perfil en BD para:', authUser.id);

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), 5000)
      );

      const queryPromise = supabase
        .from('users')
        .select('role, email')
        .eq('id', authUser.id)
        .maybeSingle();

      const { data: profile, error } = await Promise.race([queryPromise, timeoutPromise]) as any;

      if (error) {
        console.error('❌ Error consultando perfil:', error);
      } else if (profile) {
        console.log('✅ Perfil encontrado en BD:', profile);
        setCachedRole(authUser.id, profile.role as UserRole);
        return profile.role as UserRole;
      } else {
        console.log('⚠️ No se encontró perfil en BD');
      }
    } catch (err: any) {
      console.error('❌ Error en consulta de BD (puede ser timeout):', err.message);
    }

    // Por defecto, traveler
    console.log('🎒 Asignando rol por defecto: traveler');
    setCachedRole(authUser.id, UserRole.TRAVELER);
    return UserRole.TRAVELER;
  };

  const updateAuthState = async (authUser: any, forceRefresh: boolean = false) => {
    console.log('🔄 Actualizando estado de autenticación...', { forceRefresh });

    try {
      setUser(authUser);

      if (authUser) {
        const role = await determineUserRole(authUser, forceRefresh);
        console.log('🎭 Rol determinado:', role);
        setUserRole(role);
      } else {
        setUserRole(null);
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
        } else {
          const cachedRole = getCachedRole(authUser.id);
          if (cachedRole) {
            console.log('⚠️ Usando rol cacheado debido a error:', cachedRole);
            setUserRole(cachedRole);
          } else {
            setUserRole(UserRole.TRAVELER);
          }
        }
      } else {
        setUserRole(null);
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
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('🔔 Cambio de estado de auth:', event);

      if (!mounted) return;

      if (event === 'SIGNED_IN') {
        await updateAuthState(session?.user || null, true);
      } else if (event === 'TOKEN_REFRESHED') {
        if (session?.user && user && session.user.id === user.id) {
          console.log('♻️ Token refrescado - manteniendo sesión actual');
          setUser(session.user);
        } else {
          await updateAuthState(session?.user || null, false);
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
      isLoading 
    });
  }, [user, userRole, isLoading, isAdmin, isAgency, isTraveler]);

  return (
    <AuthContext.Provider value={{ 
      user, 
      userRole, 
      isLoading,
      isAdmin,
      isAgency,
      isTraveler
    }}>
      {children}
    </AuthContext.Provider>
  );
};