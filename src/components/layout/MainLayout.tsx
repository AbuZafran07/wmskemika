import React, { useState } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import AppSidebar from './AppSidebar';
import AppHeader from './AppHeader';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

export default function MainLayout() {
  const { isAuthenticated, isLoading } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-screen flex w-full bg-background">
      <AppSidebar
        isCollapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
      />
      <div className={cn(
        'flex-1 flex flex-col min-h-screen transition-all duration-300',
        !sidebarCollapsed && 'lg:ml-0'
      )}>
        <AppHeader onMenuClick={() => setSidebarCollapsed(!sidebarCollapsed)} />
        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
