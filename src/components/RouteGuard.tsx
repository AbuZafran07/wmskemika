/**
 * RouteGuard Component
 * 
 * Protects routes based on user role permissions.
 * Redirects unauthorized users to dashboard.
 */

import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { canAccessRoute, MenuKey, canAccessMenu } from '@/lib/permissions';

interface RouteGuardProps {
  children: React.ReactNode;
  /** Optional: Specific menu key to check access for */
  menuKey?: MenuKey;
}

export function RouteGuard({ children, menuKey }: RouteGuardProps) {
  const { user, isAuthenticated } = useAuth();
  const location = useLocation();

  // If not authenticated, MainLayout will handle redirect to login
  if (!isAuthenticated || !user) {
    return <>{children}</>;
  }

  // Check if user can access this route
  const hasAccess = menuKey 
    ? canAccessMenu(user.role, menuKey)
    : canAccessRoute(user.role, location.pathname);

  if (!hasAccess) {
    // Redirect to dashboard for unauthorized access
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

export default RouteGuard;
