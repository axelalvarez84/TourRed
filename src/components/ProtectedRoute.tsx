import React, { useState, useEffect, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { UserRole } from '../lib/supabase';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles: UserRole[];
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles }) => {
  const { user, userRole, isLoading, isEmailVerified } = useAuth();
  const [shouldRedirect, setShouldRedirect] = useState(false);
  const redirectTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (redirectTimerRef.current) {
      clearTimeout(redirectTimerRef.current);
      redirectTimerRef.current = null;
    }

    if (!isLoading && !user) {
      redirectTimerRef.current = setTimeout(() => {
        setShouldRedirect(true);
      }, 300);
    } else {
      setShouldRedirect(false);
    }

    return () => {
      if (redirectTimerRef.current) {
        clearTimeout(redirectTimerRef.current);
      }
    };
  }, [user, isLoading]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!user && shouldRedirect) {
    return <Navigate to="/login" replace />;
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!isEmailVerified) {
    return <Navigate to="/verify-email" replace />;
  }

  if (!userRole || !allowedRoles.includes(userRole)) {
    // Redirect to the appropriate dashboard based on role
    if (userRole === UserRole.ADMIN) {
      return <Navigate to="/admin/dashboard" replace />;
    } else if (userRole === UserRole.AGENCY) {
      return <Navigate to="/agency/dashboard" replace />;
    } else if (userRole === UserRole.TRAVELER) {
      return <Navigate to="/traveler/dashboard" replace />;
    } else {
      return <Navigate to="/" replace />;
    }
  }

  return <>{children}</>;
};

export default ProtectedRoute;