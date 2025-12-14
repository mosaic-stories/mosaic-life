import { Button } from '@/components/ui/button';
import { useIsMobile } from '@/components/ui/use-mobile';
import { useHeaderContext } from './HeaderContext';
import HeaderLogo from './HeaderLogo';
import HeaderUserMenu from './HeaderUserMenu';
import HeaderOverflowMenu from './HeaderOverflowMenu';

interface AppHeaderProps {
  user: { name: string; email: string; avatarUrl?: string } | null;
  onNavigate: (view: string) => void;
  onAuthClick: () => void;
  onSignOut: () => void;
}

export default function AppHeader({ user, onNavigate, onAuthClick, onSignOut }: AppHeaderProps) {
  const isMobile = useIsMobile();
  const { slotContent } = useHeaderContext();

  return (
    <nav className="border-b bg-white/90 backdrop-blur-sm sticky top-0 z-50 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
        {/* Left: Logo */}
        <HeaderLogo onNavigateHome={() => onNavigate('home')} />

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
          {user ? (
            <HeaderUserMenu user={user} onNavigate={onNavigate} onSignOut={onSignOut} />
          ) : (
            <Button onClick={onAuthClick} size="sm">
              Sign In
            </Button>
          )}
        </div>
      </div>
    </nav>
  );
}
