import React from 'react';
import { Menu, X, Sun, Moon, Bell, User, LogOut, Settings, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import logoImage from '@/assets/logo.png';

interface AppHeaderProps {
  onMenuClick: () => void;
  isMobileDrawerOpen?: boolean;
}

export default function AppHeader({ onMenuClick, isMobileDrawerOpen }: AppHeaderProps) {
  const { language, setLanguage, t } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'super_admin': return 'default';
      case 'admin': return 'info';
      case 'warehouse': return 'success';
      case 'sales': return 'warning';
      default: return 'secondary';
    }
  };

  return (
    <header className="h-16 flex-shrink-0 border-b border-border bg-card header-shadow flex items-center justify-between px-4 lg:px-6 z-50 relative">
      {/* Left side - Logo and hamburger */}
      <div className="flex items-center gap-3">
        {/* Hamburger menu - visible on mobile */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onMenuClick}
          className="lg:hidden flex-shrink-0"
        >
          {isMobileDrawerOpen ? (
            <X className="w-5 h-5" />
          ) : (
            <Menu className="w-5 h-5" />
          )}
        </Button>

        {/* Company logo and name */}
        <div className="flex items-center gap-3">
          <img 
            src={logoImage} 
            alt="Kemika Logo" 
            className="h-9 w-auto object-contain flex-shrink-0"
          />
          <div className="hidden sm:flex flex-col">
            <span className="font-display font-bold text-foreground text-sm leading-tight">
              PT. KEMIKA KARYA PRATAMA
            </span>
            <span className="text-[10px] text-muted-foreground leading-tight">
              Warehouse Management System
            </span>
          </div>
        </div>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-2">
        {/* Language Toggle */}
        <div className="hidden sm:flex items-center border rounded-lg p-1 bg-muted/50">
          <button
            onClick={() => setLanguage('en')}
            className={`px-2 py-1 text-xs rounded transition-all ${
              language === 'en'
                ? 'bg-background shadow-sm text-foreground font-medium'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            EN
          </button>
          <button
            onClick={() => setLanguage('id')}
            className={`px-2 py-1 text-xs rounded transition-all ${
              language === 'id'
                ? 'bg-background shadow-sm text-foreground font-medium'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            ID
          </button>
        </div>

        {/* Theme Toggle */}
        <Button variant="ghost" size="icon" onClick={toggleTheme}>
          {theme === 'light' ? (
            <Moon className="w-5 h-5" />
          ) : (
            <Sun className="w-5 h-5" />
          )}
        </Button>

        {/* Notifications */}
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="w-5 h-5" />
          <span className="absolute top-2 right-2 w-2 h-2 bg-destructive rounded-full" />
        </Button>

        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex items-center gap-2 px-2">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="w-4 h-4 text-primary" />
              </div>
              <div className="hidden md:flex flex-col items-start">
                <span className="text-sm font-medium">{user?.name}</span>
                <Badge variant={getRoleBadgeVariant(user?.role || '')} className="text-[10px] px-1.5 py-0">
                  {user?.role?.replace('_', ' ')}
                </Badge>
              </div>
              <ChevronDown className="w-4 h-4 text-muted-foreground hidden md:block" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium">{user?.name}</p>
                <p className="text-xs text-muted-foreground">{user?.email}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <User className="w-4 h-4 mr-2" />
              {t('auth.profile')}
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Settings className="w-4 h-4 mr-2" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
              <LogOut className="w-4 h-4 mr-2" />
              {t('auth.logout')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
