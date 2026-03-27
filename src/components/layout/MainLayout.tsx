import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import AppSidebar from './AppSidebar';
import AppHeader from './AppHeader';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { ChatWidget } from '@/components/dashboard/ChatWidget';
import { supabase } from '@/integrations/supabase/client';

interface OnlineUser {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
}

const SIDEBAR_WIDTH_KEY = 'sidebar-width';
const SIDEBAR_COLLAPSED_KEY = 'sidebar-collapsed';
const MIN_SIDEBAR_WIDTH = 220;
const DEFAULT_SIDEBAR_WIDTH = 280;
const MAX_SIDEBAR_WIDTH = 420;
const COLLAPSED_SIDEBAR_WIDTH = 64;

export default function MainLayout() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(() => {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
  });
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? Math.min(Math.max(parseInt(saved, 10), MIN_SIDEBAR_WIDTH), MAX_SIDEBAR_WIDTH) : DEFAULT_SIDEBAR_WIDTH;
  });
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);

  // Persist sidebar state
  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, isCollapsed.toString());
  }, [isCollapsed]);

  const toggleCollapsed = useCallback(() => {
    setIsCollapsed(prev => !prev);
  }, []);

  // Handle resize
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (isCollapsed) return;
    e.preventDefault();
    setIsResizing(true);
  }, [isCollapsed]);

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

  // Online presence tracking for chat
  useEffect(() => {
    if (!user) return;

    const presenceChannel = supabase.channel('app-presence', {
      config: {
        presence: {
          key: user.id,
        },
      },
    });

    presenceChannel
      .on('presence', { event: 'sync' }, () => {
        const state = presenceChannel.presenceState();
        const users: OnlineUser[] = [];
        
        Object.keys(state).forEach((key) => {
          const presences = state[key] as unknown as OnlineUser[];
          if (presences && presences.length > 0) {
            users.push(presences[0]);
          }
        });
        
        setOnlineUsers(users);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await presenceChannel.track({
            id: user.id,
            email: user.email,
            name: user.name,
            avatar_url: user.avatar || null,
          });
        }
      });

    return () => {
      presenceChannel.unsubscribe();
    };
  }, [user]);

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
      <div className="flex flex-1 overflow-hidden" style={{ height: 'calc(100vh - 64px - env(safe-area-inset-top, 0px))' }}>
        {/* Desktop Sidebar - only visible on lg+ */}
        <div
          ref={sidebarRef}
          className="hidden lg:flex relative flex-shrink-0 group transition-all duration-300 ease-in-out"
          style={{ width: isCollapsed ? COLLAPSED_SIDEBAR_WIDTH : sidebarWidth }}
        >
          <AppSidebar 
            isMobile={false}
            isOpen={true}
            isCollapsed={isCollapsed}
            onToggleCollapse={toggleCollapsed}
            onClose={() => {}}
            onNavigate={() => {}}
          />
          {/* Resize handle - hidden when collapsed */}
          {!isCollapsed && (
            <div
              className="resize-handle"
              onMouseDown={handleMouseDown}
            />
          )}
        </div>

        {/* Mobile Drawer Overlay */}
        {isMobileDrawerOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            style={{ top: 'calc(64px + env(safe-area-inset-top, 0px))' }}
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
            top: 'calc(64px + env(safe-area-inset-top, 0px))', 
            height: 'calc(100vh - 64px - env(safe-area-inset-top, 0px))',
            width: 'min(80vw, 320px)'
          }}
        >
          <AppSidebar 
            isMobile={true}
            isOpen={isMobileDrawerOpen}
            isCollapsed={false}
            onToggleCollapse={() => {}}
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

      {/* Global Chat Widget */}
      <ChatWidget onlineUsers={onlineUsers} />
    </div>
  );
}