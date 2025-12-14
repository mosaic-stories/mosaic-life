import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { applyTheme } from '@/lib/themeUtils';
import AuthModal from '@/components/AuthModal';
import { HeaderProvider, AppHeader } from '@/components/header';

export interface SharedPageProps {
  onNavigate: (view: string) => void;
  onSelectLegacy: (legacyId: string) => void;
  currentTheme: string;
  onThemeChange: (themeId: string) => void;
  user: { name: string; email: string; avatarUrl?: string } | null;
  onAuthClick: () => void;
  onSignOut: () => void;
}

export default function RootLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, login } = useAuth();
  const [currentTheme, setCurrentTheme] = useState<string>('warm-amber');
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  // Check if we should show auth modal (redirected from protected route)
  useEffect(() => {
    if (location.state?.showAuth) {
      setIsAuthModalOpen(true);
      // Clear the state
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  // Apply theme when it changes
  useEffect(() => {
    applyTheme(currentTheme);
  }, [currentTheme]);

  // Load saved theme from localStorage
  useEffect(() => {
    const savedTheme = localStorage.getItem('mosaic-theme');
    if (savedTheme) {
      setCurrentTheme(savedTheme);
    }
    document.title = 'Mosaic Life - Honoring lives through shared stories';
  }, []);

  // Save theme when it changes
  const handleThemeChange = useCallback((theme: string) => {
    setCurrentTheme(theme);
    localStorage.setItem('mosaic-theme', theme);
  }, []);

  // Navigation handler that maps view names to routes
  const handleNavigate = useCallback((view: string) => {
    const routeMap: Record<string, string> = {
      'home': '/',
      'home-minimal': '/minimal',
      'about': '/about',
      'about-minimal': '/about/minimal',
      'how-it-works': '/how-it-works',
      'how-it-works-minimal': '/how-it-works/minimal',
      'explore': '/explore',
      'explore-minimal': '/explore',
      'community': '/community',
      'community-minimal': '/community/minimal',
      'my-legacies': '/my-legacies',
      'my-legacies-minimal': '/my-legacies/minimal',
      'notifications': '/notifications',
      'profile': '/legacy/1', // Default to legacy 1 for now
      'story': '/legacy/new', // Create a new legacy
      'create-legacy': '/legacy/new',
    };

    const route = routeMap[view] || '/';
    navigate(route);
  }, [navigate]);

  // Legacy-specific navigation
  const handleSelectLegacy = useCallback((legacyId: string) => {
    navigate(`/legacy/${legacyId}`);
  }, [navigate]);

  const handleAuthClick = useCallback(() => {
    setIsAuthModalOpen(true);
  }, []);

  const handleAuthenticate = useCallback((_provider: string) => {
    // Trigger the OAuth flow
    login();
    setIsAuthModalOpen(false);
  }, [login]);

  const handleSignOut = useCallback(async () => {
    await logout();
    navigate('/');
  }, [logout, navigate]);

  // Create shared props for all page components
  const sharedProps: SharedPageProps = {
    onNavigate: handleNavigate,
    onSelectLegacy: handleSelectLegacy,
    currentTheme,
    onThemeChange: handleThemeChange,
    user: user ? { name: user.name || user.email, email: user.email, avatarUrl: user.avatar_url } : null,
    onAuthClick: handleAuthClick,
    onSignOut: handleSignOut,
  };

  return (
    <HeaderProvider>
      <div className="min-h-screen bg-[rgb(var(--theme-background))] transition-colors duration-300">
        <AppHeader
          user={sharedProps.user}
          onNavigate={handleNavigate}
          onAuthClick={handleAuthClick}
          onSignOut={handleSignOut}
        />
        <Outlet context={sharedProps} />
        <AuthModal
          isOpen={isAuthModalOpen}
          onClose={() => setIsAuthModalOpen(false)}
          onAuthenticate={handleAuthenticate}
        />
      </div>
    </HeaderProvider>
  );
}
