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

  const determineUserRole = async (authUser: any): Promise<UserRole | null> => {
    if (!authUser) {
      console.log('ℹ️ No hay usuario autenticado');
      return null;
    }

    console.log('🔍 Determinando rol para usuario:', authUser.email);

    // VERIFICACIÓN ESPECIAL PARA ADMIN PRIMERO
    if (authUser.email === 'tourredmx@gmail.com') {
      console.log('👑 Usuario administrador detectado por email - FORZANDO ADMIN');
      return UserRole.ADMIN;
    }

    // Verificar metadata
    const metadataRole = authUser.user_metadata?.role;
    console.log('📋 Rol en metadata:', metadataRole);

    if (metadataRole && Object.values(UserRole).includes(metadataRole as UserRole)) {
      console.log('✅ Usando rol de metadata:', metadataRole);
      return metadataRole as UserRole;
    }

    // Verificar en la base de datos
    try {
      console.log('🔍 Consultando perfil en BD para:', authUser.id);
      
      const { data: profile, error } = await supabase
        .from('users')
        .select('role, email')
        .eq('id', authUser.id)
        .maybeSingle();

      if (error) {
        console.error('❌ Error consultando perfil:', error);
      } else if (profile) {
        console.log('✅ Perfil encontrado en BD:', profile);
        return profile.role as UserRole;
      } else {
        console.log('⚠️ No se encontró perfil en BD');
      }
    } catch (err: any) {
      console.error('❌ Error en consulta de BD:', err);
    }

    // Por defecto, traveler
    console.log('🎒 Asignando rol por defecto: traveler');
    return UserRole.TRAVELER;
  };

  const updateAuthState = async (authUser: any) => {
    console.log('🔄 Actualizando estado de autenticación...');
    
    try {
      setUser(authUser);
      
      if (authUser) {
        const role = await determineUserRole(authUser);
        console.log('🎭 Rol determinado:', role);
        setUserRole(role);
      } else {
        setUserRole(null);
      }
    } catch (err: any) {
      console.error('❌ Error determinando rol:', err);
      // En caso de error, asignar rol por defecto
      if (authUser) {
        if (authUser.email === 'tourredmx@gmail.com') {
          setUserRole(UserRole.ADMIN);
        } else {
          setUserRole(UserRole.TRAVELER);
        }
      } else {
        setUserRole(null);
      }
    } finally {
      // IMPORTANTE: SIEMPRE establecer isLoading en false
      console.log('✅ Finalizando carga - estableciendo isLoading: false');
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;

    const initializeAuth = async () => {
      console.log('🚀 Inicializando autenticación...');
      
      try {
        // Obtener usuario actual
        const currentUser = await getCurrentUser();
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

      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        await updateAuthState(session?.user || null);
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