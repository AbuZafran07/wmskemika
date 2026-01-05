import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import AppSidebar from './AppSidebar';
import AppHeader from './AppHeader';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

const SIDEBAR_WIDTH_KEY = 'sidebar-width';
const MIN_SIDEBAR_WIDTH = 220;
const DEFAULT_SIDEBAR_WIDTH = 280;
const MAX_SIDEBAR_WIDTH = 420;

export default function MainLayout() {
  const { isAuthenticated, isLoading } = useAuth();
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? Math.min(Math.max(parseInt(saved, 10), MIN_SIDEBAR_WIDTH), MAX_SIDEBAR_WIDTH) : DEFAULT_SIDEBAR_WIDTH;
  });
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);

  // Persist sidebar width to localStorage
  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  // Handle resize
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing) return;
    const newWidth = Math.min(Math.max(e.clientX, MIN_SIDEBAR_WIDTH), MAX_SIDEBAR_WIDTH);
    setSidebarWidth(newWidth);
  }, [isResizing]);

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
  }, []);

  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, handleMouseMove, handleMouseUp]);

  // Close mobile drawer on route change
  const closeMobileDrawer = useCallback(() => {
    setIsMobileDrawerOpen(false);
  }, []);

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
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
    <div className="h-screen flex flex-col overflow-hidden bg-background">
      {/* Fixed Header - 64px, always on top */}
      <AppHeader 
        onMenuClick={() => setIsMobileDrawerOpen(!isMobileDrawerOpen)} 
        isMobileDrawerOpen={isMobileDrawerOpen}
      />

      {/* Body area below header */}
      <div className="flex flex-1 overflow-hidden" style={{ height: 'calc(100vh - 64px)' }}>
        {/* Desktop Sidebar - only visible on lg+ */}
        <div
          ref={sidebarRef}
          className="hidden lg:flex relative flex-shrink-0 group"
          style={{ width: sidebarWidth }}
        >
          <AppSidebar 
            isMobile={false}
            isOpen={true}
            onClose={() => {}}
            onNavigate={() => {}}
          />
          {/* Resize handle */}
          <div
            className="resize-handle"
            onMouseDown={handleMouseDown}
          />
        </div>

        {/* Mobile Drawer Overlay */}
        {isMobileDrawerOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            style={{ top: '64px' }}
            onClick={closeMobileDrawer}
          />
        )}

        {/* Mobile Drawer Sidebar */}
        <div
          className={cn(
            'fixed left-0 z-50 lg:hidden transition-transform duration-300 ease-out',
            isMobileDrawerOpen ? 'translate-x-0' : '-translate-x-full'
          )}
          style={{ 
            top: '64px', 
            height: 'calc(100vh - 64px)',
            width: 'min(80vw, 320px)'
          }}
        >
          <AppSidebar 
            isMobile={true}
            isOpen={isMobileDrawerOpen}
            onClose={closeMobileDrawer}
            onNavigate={closeMobileDrawer}
          />
        </div>

        {/* Main Content - scrollable */}
        <main className="flex-1 overflow-y-auto bg-background">
          <div className="p-4 lg:p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
