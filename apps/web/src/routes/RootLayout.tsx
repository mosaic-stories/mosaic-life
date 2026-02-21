import { Outlet, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { applyTheme } from '@/lib/themeUtils';
import AuthModal from '@/components/AuthModal';
import { HeaderProvider, AppHeader } from '@/components/header';
import { usePreferences } from '@/features/settings/hooks/useSettings';
import { useTheme } from '@/lib/hooks/useTheme';
import { useAuthModal } from '@/lib/hooks/useAuthModal';

export default function RootLayout() {
  const location = useLocation();
  const { user, login } = useAuth();
  const { currentTheme, setTheme } = useTheme();
  const { isOpen: isAuthModalOpen, open: openAuthModal, close: closeAuthModal } = useAuthModal();
  // Only fetch preferences when user is authenticated
  const { data: preferences } = usePreferences({ enabled: !!user });

  // Check if we should show auth modal (redirected from protected route)
  useEffect(() => {
    if (location.state?.showAuth) {
      openAuthModal();
      // Clear the state
      window.history.replaceState({}, document.title);
    }
  }, [location.state, openAuthModal]);

  // Apply theme when it changes
  useEffect(() => {
    applyTheme(currentTheme);
  }, [currentTheme]);

  // Set document title on mount
  useEffect(() => {
    document.title = 'Mosaic Life - Honoring lives through shared stories';
  }, []);

  // Sync theme from backend - this is authoritative when user is logged in
  // Backend theme takes precedence over localStorage
  useEffect(() => {
    if (preferences?.theme) {
      setTheme(preferences.theme);
    }
  }, [preferences?.theme, setTheme]);

  const handleAuthenticate = () => {
    login();
    closeAuthModal();
  };

  return (
    <HeaderProvider>
      <div className="min-h-screen bg-[rgb(var(--theme-background))] transition-colors duration-300">
        <AppHeader />
        <Outlet />
        <AuthModal
          isOpen={isAuthModalOpen}
          onClose={closeAuthModal}
          onAuthenticate={handleAuthenticate}
        />
      </div>
    </HeaderProvider>
  );
}
