import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useIsMobile } from '@/components/ui/use-mobile';
import { useHeaderContext } from './HeaderContext';
import HeaderLogo from './HeaderLogo';
import HeaderUserMenu from './HeaderUserMenu';
import HeaderOverflowMenu from './HeaderOverflowMenu';
import { useAuth } from '@/contexts/AuthContext';
import { useAuthModal } from '@/lib/hooks/useAuthModal';

export default function AppHeader() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { slotContent } = useHeaderContext();
  const { user } = useAuth();
  const openAuthModal = useAuthModal((s) => s.open);

  const userInfo = user ? { name: user.name || user.email, email: user.email, avatarUrl: user.avatar_url } : null;

  return (
    <nav className="border-b bg-white/90 backdrop-blur-sm sticky top-0 z-50 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
        {/* Left: Logo */}
        <HeaderLogo onNavigateHome={() => navigate('/')} />

        {/* Center: Slot content (desktop) or Overflow menu (mobile) */}
        {isMobile ? (
          slotContent && <HeaderOverflowMenu>{slotContent}</HeaderOverflowMenu>
        ) : (
          <div className="flex-1 flex items-center justify-center gap-4 max-w-2xl">
            {slotContent}
          </div>
        )}

        {/* Right: Auth */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {userInfo ? (
            <HeaderUserMenu user={userInfo} />
          ) : (
            <Button onClick={openAuthModal} size="sm">
              Sign In
            </Button>
          )}
        </div>
      </div>
    </nav>
  );
}
