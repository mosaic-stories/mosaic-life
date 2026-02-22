import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

// User type matching backend response
export interface User {
  id: string;
  email: string;
  name?: string;
  avatar_url?: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: () => void;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch current user from /api/me
  const refreshUser = useCallback(async () => {
    try {
      const response = await fetch('/api/me', {
        credentials: 'include',
      });

      if (response.ok) {
        const userData = await response.json();
        setUser(userData);
      } else {
        setUser(null);
      }
    } catch (error) {
      console.error('Failed to fetch user:', error);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Check auth status on mount
  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  // Listen for 401 events from API client
  useEffect(() => {
    const handleAuthExpired = () => {
      setUser(null);
      // Only redirect if on a protected page (not already on a public page)
      const publicPaths = ['/', '/about', '/how-it-works'];
      if (!publicPaths.includes(window.location.pathname)) {
        window.location.href = '/';
      }
    };

    window.addEventListener('auth:expired', handleAuthExpired);
    return () => window.removeEventListener('auth:expired', handleAuthExpired);
  }, []);

  // Redirect to Google OAuth
  const login = useCallback(() => {
    // Get the current URL to redirect back after login
    const returnUrl = window.location.pathname + window.location.search;
    // Store return URL in sessionStorage for after OAuth callback
    sessionStorage.setItem('auth_return_url', returnUrl);
    // Redirect to backend OAuth endpoint
    window.location.href = '/api/auth/google';
  }, []);

  // Logout user
  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } catch (error) {
      console.error('Logout request failed:', error);
    } finally {
      setUser(null);
    }
  }, []);

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    logout,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
