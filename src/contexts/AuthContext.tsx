import React, { createContext, useContext, useState, useEffect } from 'react';

export type UserRole = 'super_admin' | 'admin' | 'finance' | 'purchasing' | 'warehouse' | 'sales' | 'viewer';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  avatar?: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  hasPermission: (allowedRoles: UserRole[]) => boolean;
}

// Mock users for demo - in production this would be from Supabase
const mockUsers: Record<string, { password: string; user: User }> = {
  'ferry@kemika.co.id': {
    password: '123456',
    user: {
      id: '1',
      email: 'ferry@kemika.co.id',
      name: 'Ferry Admin',
      role: 'super_admin',
    },
  },
  'admin@kemika.co.id': {
    password: '123456',
    user: {
      id: '2',
      email: 'admin@kemika.co.id',
      name: 'Admin User',
      role: 'admin',
    },
  },
  'warehouse@kemika.co.id': {
    password: '123456',
    user: {
      id: '3',
      email: 'warehouse@kemika.co.id',
      name: 'Warehouse Staff',
      role: 'warehouse',
    },
  },
  'sales@kemika.co.id': {
    password: '123456',
    user: {
      id: '4',
      email: 'sales@kemika.co.id',
      name: 'Sales Rep',
      role: 'sales',
    },
  },
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check for existing session
    const savedUser = localStorage.getItem('wms-user');
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch {
        localStorage.removeItem('wms-user');
      }
    }
    setIsLoading(false);
  }, []);

  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 500));

    const mockUser = mockUsers[email.toLowerCase()];
    
    if (!mockUser) {
      return { success: false, error: 'User not found' };
    }
    
    if (mockUser.password !== password) {
      return { success: false, error: 'Invalid password' };
    }

    setUser(mockUser.user);
    localStorage.setItem('wms-user', JSON.stringify(mockUser.user));
    return { success: true };
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('wms-user');
  };

  const hasPermission = (allowedRoles: UserRole[]): boolean => {
    if (!user) return false;
    return allowedRoles.includes(user.role);
  };

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, isLoading, login, logout, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
