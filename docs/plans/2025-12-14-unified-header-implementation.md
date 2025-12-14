# Unified Header Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a unified header component with slot-based composition that all pages share, eliminating inconsistent inline headers across the application.

**Architecture:** A `HeaderProvider` context wraps the app and manages slot content. Pages use `<HeaderSlot>` to inject contextual controls that get portaled into the `<AppHeader>`. On mobile, slot content moves to an overflow menu.

**Tech Stack:** React 18, TypeScript, React Router, shadcn/ui components, Tailwind CSS, Vitest + React Testing Library

---

## Task 1: Create HeaderProvider Context

**Files:**
- Create: `apps/web/src/components/header/HeaderContext.tsx`
- Test: `apps/web/src/components/header/HeaderContext.test.tsx`

**Step 1: Write the failing test**

Create `apps/web/src/components/header/HeaderContext.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HeaderProvider, useHeaderContext } from './HeaderContext';

function TestConsumer() {
  const { slotContent } = useHeaderContext();
  return <div data-testid="slot-content">{slotContent}</div>;
}

describe('HeaderContext', () => {
  it('provides default empty slot content', () => {
    render(
      <HeaderProvider>
        <TestConsumer />
      </HeaderProvider>
    );

    expect(screen.getByTestId('slot-content')).toBeEmptyDOMElement();
  });

  it('throws error when used outside provider', () => {
    const consoleError = console.error;
    console.error = () => {};

    expect(() => render(<TestConsumer />)).toThrow(
      'useHeaderContext must be used within HeaderProvider'
    );

    console.error = consoleError;
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/web && npm run test -- HeaderContext.test.tsx`

Expected: FAIL with "Cannot find module './HeaderContext'"

**Step 3: Write minimal implementation**

Create `apps/web/src/components/header/HeaderContext.tsx`:

```tsx
import { createContext, useContext, useState, ReactNode } from 'react';

interface HeaderContextValue {
  slotContent: ReactNode;
  setSlotContent: (content: ReactNode) => void;
}

const HeaderContext = createContext<HeaderContextValue | null>(null);

export function useHeaderContext(): HeaderContextValue {
  const context = useContext(HeaderContext);
  if (!context) {
    throw new Error('useHeaderContext must be used within HeaderProvider');
  }
  return context;
}

interface HeaderProviderProps {
  children: ReactNode;
}

export function HeaderProvider({ children }: HeaderProviderProps) {
  const [slotContent, setSlotContent] = useState<ReactNode>(null);

  return (
    <HeaderContext.Provider value={{ slotContent, setSlotContent }}>
      {children}
    </HeaderContext.Provider>
  );
}
```

**Step 4: Run test to verify it passes**

Run: `cd apps/web && npm run test -- HeaderContext.test.tsx`

Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/components/header/
git commit -m "feat(header): add HeaderProvider context for slot management"
```

---

## Task 2: Create HeaderSlot Component

**Files:**
- Create: `apps/web/src/components/header/HeaderSlot.tsx`
- Modify: `apps/web/src/components/header/HeaderContext.test.tsx`

**Step 1: Write the failing test**

Add to `apps/web/src/components/header/HeaderContext.test.tsx`:

```tsx
import { HeaderProvider, useHeaderContext, HeaderSlot } from './HeaderContext';

// ... existing tests ...

describe('HeaderSlot', () => {
  it('updates slot content when rendered', () => {
    function SlotReader() {
      const { slotContent } = useHeaderContext();
      return <div data-testid="slot-reader">{slotContent}</div>;
    }

    render(
      <HeaderProvider>
        <SlotReader />
        <HeaderSlot>
          <button>Test Button</button>
        </HeaderSlot>
      </HeaderProvider>
    );

    expect(screen.getByTestId('slot-reader')).toHaveTextContent('Test Button');
  });

  it('clears slot content on unmount', () => {
    function SlotReader() {
      const { slotContent } = useHeaderContext();
      return <div data-testid="slot-reader">{slotContent}</div>;
    }

    const { rerender } = render(
      <HeaderProvider>
        <SlotReader />
        <HeaderSlot>
          <button>Test Button</button>
        </HeaderSlot>
      </HeaderProvider>
    );

    expect(screen.getByTestId('slot-reader')).toHaveTextContent('Test Button');

    rerender(
      <HeaderProvider>
        <SlotReader />
      </HeaderProvider>
    );

    expect(screen.getByTestId('slot-reader')).toBeEmptyDOMElement();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/web && npm run test -- HeaderContext.test.tsx`

Expected: FAIL with "HeaderSlot is not exported"

**Step 3: Write minimal implementation**

Add to `apps/web/src/components/header/HeaderContext.tsx`:

```tsx
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

// ... existing code ...

interface HeaderSlotProps {
  children: ReactNode;
}

export function HeaderSlot({ children }: HeaderSlotProps) {
  const { setSlotContent } = useHeaderContext();

  useEffect(() => {
    setSlotContent(children);
    return () => setSlotContent(null);
  }, [children, setSlotContent]);

  return null;
}
```

**Step 4: Run test to verify it passes**

Run: `cd apps/web && npm run test -- HeaderContext.test.tsx`

Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/components/header/
git commit -m "feat(header): add HeaderSlot component for injecting page controls"
```

---

## Task 3: Create HeaderLogo Component

**Files:**
- Create: `apps/web/src/components/header/HeaderLogo.tsx`
- Test: `apps/web/src/components/header/HeaderLogo.test.tsx`

**Step 1: Write the failing test**

Create `apps/web/src/components/header/HeaderLogo.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import HeaderLogo from './HeaderLogo';

describe('HeaderLogo', () => {
  it('renders logo icon', () => {
    render(<HeaderLogo onNavigateHome={() => {}} />);

    expect(screen.getByRole('button', { name: /mosaic life/i })).toBeInTheDocument();
  });

  it('shows wordmark on desktop', () => {
    render(<HeaderLogo onNavigateHome={() => {}} />);

    expect(screen.getByText('Mosaic Life')).toBeInTheDocument();
  });

  it('calls onNavigateHome when clicked', () => {
    const handleNavigate = vi.fn();
    render(<HeaderLogo onNavigateHome={handleNavigate} />);

    fireEvent.click(screen.getByRole('button', { name: /mosaic life/i }));
    expect(handleNavigate).toHaveBeenCalled();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/web && npm run test -- HeaderLogo.test.tsx`

Expected: FAIL with "Cannot find module './HeaderLogo'"

**Step 3: Write minimal implementation**

Create `apps/web/src/components/header/HeaderLogo.tsx`:

```tsx
import { BookHeart } from 'lucide-react';

interface HeaderLogoProps {
  onNavigateHome: () => void;
}

export default function HeaderLogo({ onNavigateHome }: HeaderLogoProps) {
  return (
    <button
      onClick={onNavigateHome}
      className="flex items-center gap-2 hover:opacity-80 transition-opacity flex-shrink-0"
      aria-label="Mosaic Life - Go to homepage"
    >
      <BookHeart className="size-6 text-[rgb(var(--theme-primary))]" />
      <span className="tracking-tight hidden sm:inline">Mosaic Life</span>
    </button>
  );
}
```

**Step 4: Run test to verify it passes**

Run: `cd apps/web && npm run test -- HeaderLogo.test.tsx`

Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/components/header/
git commit -m "feat(header): add HeaderLogo component with responsive wordmark"
```

---

## Task 4: Create HeaderUserMenu Component

**Files:**
- Create: `apps/web/src/components/header/HeaderUserMenu.tsx`
- Test: `apps/web/src/components/header/HeaderUserMenu.test.tsx`

**Step 1: Write the failing test**

Create `apps/web/src/components/header/HeaderUserMenu.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import HeaderUserMenu from './HeaderUserMenu';

// Mock notification hooks
vi.mock('@/lib/hooks/useNotifications', () => ({
  useUnreadCount: () => ({ data: { count: 3 } }),
  useNotifications: () => ({ data: [], refetch: vi.fn() }),
  useUpdateNotificationStatus: () => ({ mutate: vi.fn() }),
  useMarkAllAsRead: () => ({ mutate: vi.fn() }),
}));

const mockUser = {
  name: 'John Doe',
  email: 'john@example.com',
  avatarUrl: undefined,
};

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe('HeaderUserMenu', () => {
  it('renders user avatar with initials', () => {
    renderWithProviders(
      <HeaderUserMenu user={mockUser} onNavigate={() => {}} onSignOut={() => {}} />
    );

    expect(screen.getByText('JD')).toBeInTheDocument();
  });

  it('shows notification badge when there are unread notifications', () => {
    renderWithProviders(
      <HeaderUserMenu user={mockUser} onNavigate={() => {}} onSignOut={() => {}} />
    );

    // Red dot indicator should be present
    expect(document.querySelector('.bg-red-500')).toBeInTheDocument();
  });

  it('opens dropdown on click', async () => {
    renderWithProviders(
      <HeaderUserMenu user={mockUser} onNavigate={() => {}} onSignOut={() => {}} />
    );

    fireEvent.click(screen.getByRole('button'));

    expect(await screen.findByText('Notifications')).toBeInTheDocument();
    expect(screen.getByText('My Legacies')).toBeInTheDocument();
    expect(screen.getByText('Sign Out')).toBeInTheDocument();
  });

  it('calls onSignOut when sign out is clicked', async () => {
    const handleSignOut = vi.fn();
    renderWithProviders(
      <HeaderUserMenu user={mockUser} onNavigate={() => {}} onSignOut={handleSignOut} />
    );

    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(await screen.findByText('Sign Out'));

    expect(handleSignOut).toHaveBeenCalled();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/web && npm run test -- HeaderUserMenu.test.tsx`

Expected: FAIL with "Cannot find module './HeaderUserMenu'"

**Step 3: Write minimal implementation**

Create `apps/web/src/components/header/HeaderUserMenu.tsx`:

```tsx
import { User, BookOpen, Settings, HelpCircle, LogOut, Bell, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  useUnreadCount,
  useNotifications,
  useUpdateNotificationStatus,
  useMarkAllAsRead,
} from '@/lib/hooks/useNotifications';

interface HeaderUserMenuProps {
  user: {
    name: string;
    email: string;
    avatarUrl?: string;
  };
  onNavigate: (view: string) => void;
  onSignOut: () => void;
}

export default function HeaderUserMenu({ user, onNavigate, onSignOut }: HeaderUserMenuProps) {
  const navigate = useNavigate();
  const { data: unreadData } = useUnreadCount();
  const { data: notifications, refetch } = useNotifications(false);
  const updateStatus = useUpdateNotificationStatus();
  const markAllRead = useMarkAllAsRead();

  const unreadCount = unreadData?.count ?? 0;
  const recentNotifications = (notifications ?? []).slice(0, 3);

  const initials = user.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase();

  const handleNotificationClick = (notification: { id: string; link: string | null }) => {
    updateStatus.mutate({ notificationId: notification.id, status: 'read' });
    if (notification.link) {
      navigate(notification.link);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (open) {
      refetch();
    }
  };

  return (
    <DropdownMenu onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <button className="relative rounded-full focus:outline-none focus:ring-2 focus:ring-[rgb(var(--theme-primary))] focus:ring-offset-2 transition-all">
          <Avatar className="size-9 cursor-pointer hover:ring-2 hover:ring-neutral-300 transition-all">
            <AvatarImage src={user.avatarUrl} alt={user.name} />
            <AvatarFallback className="bg-[rgb(var(--theme-primary))] text-white text-sm">
              {initials}
            </AvatarFallback>
          </Avatar>
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 size-3 bg-red-500 rounded-full border-2 border-white" />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-72" align="end" sideOffset={8}>
        {/* Notifications Section */}
        <div className="px-2 py-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-neutral-900">
              Notifications {unreadCount > 0 && `(${unreadCount})`}
            </span>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => markAllRead.mutate()}
                className="text-xs h-auto py-1 px-2"
              >
                <Check className="size-3 mr-1" />
                Mark all read
              </Button>
            )}
          </div>
          {recentNotifications.length === 0 ? (
            <p className="text-xs text-neutral-500 py-2">No new notifications</p>
          ) : (
            <div className="space-y-1">
              {recentNotifications.map((notification) => (
                <button
                  key={notification.id}
                  onClick={() => handleNotificationClick(notification)}
                  className="w-full text-left px-2 py-1.5 text-xs text-neutral-600 hover:bg-neutral-100 rounded truncate"
                >
                  <Bell className="size-3 inline mr-2 text-neutral-400" />
                  {notification.message}
                </button>
              ))}
            </div>
          )}
          <button
            onClick={() => onNavigate('notifications')}
            className="w-full text-xs text-[rgb(var(--theme-primary))] hover:underline mt-2 text-left"
          >
            View all notifications
          </button>
        </div>

        <DropdownMenuSeparator />

        {/* User Info */}
        <DropdownMenuLabel className="py-2">
          <div className="flex items-center gap-3">
            <Avatar className="size-8">
              <AvatarImage src={user.avatarUrl} alt={user.name} />
              <AvatarFallback className="bg-[rgb(var(--theme-primary))] text-white text-xs">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-neutral-900 truncate">{user.name}</p>
              <p className="text-xs text-neutral-500 truncate">{user.email}</p>
            </div>
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        {/* Navigation Items */}
        <DropdownMenuItem onClick={() => onNavigate('my-profile')} className="cursor-pointer py-2">
          <User className="size-4 mr-3 text-neutral-500" />
          <span>My Profile</span>
        </DropdownMenuItem>

        <DropdownMenuItem onClick={() => onNavigate('my-legacies')} className="cursor-pointer py-2">
          <BookOpen className="size-4 mr-3 text-neutral-500" />
          <span>My Legacies</span>
        </DropdownMenuItem>

        <DropdownMenuItem onClick={() => onNavigate('settings')} className="cursor-pointer py-2">
          <Settings className="size-4 mr-3 text-neutral-500" />
          <span>Settings</span>
        </DropdownMenuItem>

        <DropdownMenuItem onClick={() => onNavigate('help')} className="cursor-pointer py-2">
          <HelpCircle className="size-4 mr-3 text-neutral-500" />
          <span>Help & Support</span>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={onSignOut}
          className="cursor-pointer py-2 text-red-600 focus:text-red-600"
        >
          <LogOut className="size-4 mr-3" />
          <span>Sign Out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

**Step 4: Run test to verify it passes**

Run: `cd apps/web && npm run test -- HeaderUserMenu.test.tsx`

Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/components/header/
git commit -m "feat(header): add HeaderUserMenu with integrated notifications"
```

---

## Task 5: Create HeaderOverflowMenu Component

**Files:**
- Create: `apps/web/src/components/header/HeaderOverflowMenu.tsx`
- Test: `apps/web/src/components/header/HeaderOverflowMenu.test.tsx`

**Step 1: Write the failing test**

Create `apps/web/src/components/header/HeaderOverflowMenu.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import HeaderOverflowMenu from './HeaderOverflowMenu';

describe('HeaderOverflowMenu', () => {
  it('renders nothing when no children provided', () => {
    const { container } = render(<HeaderOverflowMenu>{null}</HeaderOverflowMenu>);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders overflow button when children provided', () => {
    render(
      <HeaderOverflowMenu>
        <button>Test Action</button>
      </HeaderOverflowMenu>
    );

    expect(screen.getByRole('button', { name: /more options/i })).toBeInTheDocument();
  });

  it('shows children in dropdown when clicked', async () => {
    render(
      <HeaderOverflowMenu>
        <button>Test Action</button>
      </HeaderOverflowMenu>
    );

    fireEvent.click(screen.getByRole('button', { name: /more options/i }));
    expect(await screen.findByText('Test Action')).toBeInTheDocument();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/web && npm run test -- HeaderOverflowMenu.test.tsx`

Expected: FAIL with "Cannot find module './HeaderOverflowMenu'"

**Step 3: Write minimal implementation**

Create `apps/web/src/components/header/HeaderOverflowMenu.tsx`:

```tsx
import { MoreHorizontal } from 'lucide-react';
import { ReactNode } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface HeaderOverflowMenuProps {
  children: ReactNode;
}

export default function HeaderOverflowMenu({ children }: HeaderOverflowMenuProps) {
  if (!children) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="p-2 rounded-full hover:bg-neutral-100 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--theme-primary))] focus:ring-offset-2 transition-all"
          aria-label="More options"
        >
          <MoreHorizontal className="size-5 text-neutral-600" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" sideOffset={8} className="p-2 min-w-[200px]">
        <div className="flex flex-col gap-2">{children}</div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

**Step 4: Run test to verify it passes**

Run: `cd apps/web && npm run test -- HeaderOverflowMenu.test.tsx`

Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/components/header/
git commit -m "feat(header): add HeaderOverflowMenu for mobile slot content"
```

---

## Task 6: Create AppHeader Component

**Files:**
- Create: `apps/web/src/components/header/AppHeader.tsx`
- Test: `apps/web/src/components/header/AppHeader.test.tsx`

**Step 1: Write the failing test**

Create `apps/web/src/components/header/AppHeader.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AppHeader from './AppHeader';
import { HeaderProvider } from './HeaderContext';

// Mock notification hooks
vi.mock('@/lib/hooks/useNotifications', () => ({
  useUnreadCount: () => ({ data: { count: 0 } }),
  useNotifications: () => ({ data: [], refetch: vi.fn() }),
  useUpdateNotificationStatus: () => ({ mutate: vi.fn() }),
  useMarkAllAsRead: () => ({ mutate: vi.fn() }),
}));

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <HeaderProvider>{ui}</HeaderProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('AppHeader', () => {
  it('renders logo', () => {
    renderWithProviders(
      <AppHeader
        user={null}
        onNavigate={() => {}}
        onAuthClick={() => {}}
        onSignOut={() => {}}
      />
    );

    expect(screen.getByRole('button', { name: /mosaic life/i })).toBeInTheDocument();
  });

  it('shows sign in button when not logged in', () => {
    renderWithProviders(
      <AppHeader
        user={null}
        onNavigate={() => {}}
        onAuthClick={() => {}}
        onSignOut={() => {}}
      />
    );

    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('shows user menu when logged in', () => {
    renderWithProviders(
      <AppHeader
        user={{ name: 'John Doe', email: 'john@example.com' }}
        onNavigate={() => {}}
        onAuthClick={() => {}}
        onSignOut={() => {}}
      />
    );

    expect(screen.getByText('JD')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sign in/i })).not.toBeInTheDocument();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/web && npm run test -- AppHeader.test.tsx`

Expected: FAIL with "Cannot find module './AppHeader'"

**Step 3: Write minimal implementation**

Create `apps/web/src/components/header/AppHeader.tsx`:

```tsx
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
```

**Step 4: Run test to verify it passes**

Run: `cd apps/web && npm run test -- AppHeader.test.tsx`

Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/components/header/
git commit -m "feat(header): add AppHeader component with responsive layout"
```

---

## Task 7: Create Barrel Export

**Files:**
- Create: `apps/web/src/components/header/index.ts`

**Step 1: Create barrel export**

Create `apps/web/src/components/header/index.ts`:

```ts
export { HeaderProvider, useHeaderContext, HeaderSlot } from './HeaderContext';
export { default as AppHeader } from './AppHeader';
export { default as HeaderLogo } from './HeaderLogo';
export { default as HeaderUserMenu } from './HeaderUserMenu';
export { default as HeaderOverflowMenu } from './HeaderOverflowMenu';
```

**Step 2: Commit**

```bash
git add apps/web/src/components/header/index.ts
git commit -m "feat(header): add barrel exports for header components"
```

---

## Task 8: Integrate Header into RootLayout

**Files:**
- Modify: `apps/web/src/routes/RootLayout.tsx`

**Step 1: Update RootLayout to use HeaderProvider and AppHeader**

Modify `apps/web/src/routes/RootLayout.tsx`:

```tsx
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
  const handleNavigate = useCallback(
    (view: string) => {
      const routeMap: Record<string, string> = {
        home: '/',
        'home-minimal': '/minimal',
        about: '/about',
        'about-minimal': '/about/minimal',
        'how-it-works': '/how-it-works',
        'how-it-works-minimal': '/how-it-works/minimal',
        explore: '/explore',
        'explore-minimal': '/explore',
        community: '/community',
        'community-minimal': '/community/minimal',
        'my-legacies': '/my-legacies',
        'my-legacies-minimal': '/my-legacies/minimal',
        notifications: '/notifications',
        profile: '/legacy/1', // Default to legacy 1 for now
        story: '/legacy/new', // Create a new legacy
        'create-legacy': '/legacy/new',
      };

      const route = routeMap[view] || '/';
      navigate(route);
    },
    [navigate]
  );

  // Legacy-specific navigation
  const handleSelectLegacy = useCallback(
    (legacyId: string) => {
      navigate(`/legacy/${legacyId}`);
    },
    [navigate]
  );

  const handleAuthClick = useCallback(() => {
    setIsAuthModalOpen(true);
  }, []);

  const handleAuthenticate = useCallback(
    (_provider: string) => {
      // Trigger the OAuth flow
      login();
      setIsAuthModalOpen(false);
    },
    [login]
  );

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
    user: user
      ? { name: user.name || user.email, email: user.email, avatarUrl: user.avatar_url }
      : null,
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
```

**Step 2: Run the app to verify header appears**

Run: `cd apps/web && npm run dev`

Expected: Header appears on all pages with logo on left and sign-in/user menu on right

**Step 3: Commit**

```bash
git add apps/web/src/routes/RootLayout.tsx
git commit -m "feat(header): integrate AppHeader into RootLayout"
```

---

## Task 9: Migrate Homepage

**Files:**
- Modify: `apps/web/src/components/Homepage.tsx`

**Step 1: Remove inline nav, add HeaderSlot with ThemeSelector**

Replace the `<nav>` section (lines 61-149) in `apps/web/src/components/Homepage.tsx` with:

```tsx
import { HeaderSlot } from '@/components/header';

// ... in the component, replace the <nav> with:

{/* Header Slot - Theme Selector on Homepage */}
<HeaderSlot>
  <ThemeSelector currentTheme={currentTheme} onThemeChange={onThemeChange} />
</HeaderSlot>
```

The component should no longer render its own `<nav>` element.

**Step 2: Verify homepage still works**

Run: `cd apps/web && npm run dev`

Navigate to `/` and verify:
- Logo in header (from AppHeader)
- Theme selector appears in center of header
- User menu or Sign In on right

**Step 3: Commit**

```bash
git add apps/web/src/components/Homepage.tsx
git commit -m "refactor(homepage): migrate to unified header with ThemeSelector in slot"
```

---

## Task 10: Migrate HomePageMinimal

**Files:**
- Modify: `apps/web/src/components/HomePageMinimal.tsx`

**Step 1: Read current file**

Check: `apps/web/src/components/HomePageMinimal.tsx` for inline nav structure

**Step 2: Remove inline nav, add HeaderSlot with ThemeSelector**

Remove the `<nav>` section and add:

```tsx
import { HeaderSlot } from '@/components/header';

// ... in the component:
<HeaderSlot>
  <ThemeSelector currentTheme={currentTheme} onThemeChange={onThemeChange} />
</HeaderSlot>
```

**Step 3: Verify minimal homepage works**

Navigate to `/minimal` and verify header is consistent with full homepage

**Step 4: Commit**

```bash
git add apps/web/src/components/HomePageMinimal.tsx
git commit -m "refactor(homepage-minimal): migrate to unified header"
```

---

## Task 11: Migrate MyLegacies Page

**Files:**
- Modify: `apps/web/src/components/MyLegacies.tsx`

**Step 1: Remove inline nav, add HeaderSlot with Search and Create button**

```tsx
import { HeaderSlot } from '@/components/header';
import { Plus } from 'lucide-react';

// ... in the component:
<HeaderSlot>
  <SearchBar onSelectResult={handleSearchSelect} compact />
  <Button
    onClick={() => onNavigate('create-legacy')}
    size="sm"
    className="gap-2 bg-[rgb(var(--theme-primary))] hover:bg-[rgb(var(--theme-primary-dark))]"
  >
    <Plus className="size-4" />
    <span className="hidden sm:inline">Create Legacy</span>
  </Button>
</HeaderSlot>
```

**Step 2: Verify my-legacies works**

Navigate to `/my-legacies` and verify:
- Search bar in header center
- Create Legacy button visible
- User menu on right

**Step 3: Commit**

```bash
git add apps/web/src/components/MyLegacies.tsx
git commit -m "refactor(my-legacies): migrate to unified header with search and create"
```

---

## Task 12: Migrate About Page

**Files:**
- Modify: `apps/web/src/components/About.tsx`

**Step 1: Remove inline nav (empty slot - no contextual controls needed)**

Remove the `<nav>` section entirely. No `<HeaderSlot>` needed as About has no contextual controls.

**Step 2: Verify about page works**

Navigate to `/about` and verify:
- Logo on left
- Empty center (no overflow menu)
- User/Sign In on right

**Step 3: Commit**

```bash
git add apps/web/src/components/About.tsx
git commit -m "refactor(about): migrate to unified header (no slot content)"
```

---

## Task 13: Migrate Remaining Pages

**Files:**
- Modify: `apps/web/src/components/HowItWorks.tsx`
- Modify: `apps/web/src/components/Community.tsx`
- Modify: `apps/web/src/components/LegacyProfile.tsx`
- Modify: `apps/web/src/components/ExploreMinimal.tsx`

**Step 1: Remove inline navs from each page**

For each page:
1. Remove the `<nav>` section
2. Add `<HeaderSlot>` only if page has contextual controls:
   - HowItWorks: No slot
   - Community: No slot
   - LegacyProfile: Consider adding breadcrumb or share button
   - ExploreMinimal: Add SearchBar

**Step 2: Verify each page**

Navigate to each route and verify header consistency

**Step 3: Commit**

```bash
git add apps/web/src/components/
git commit -m "refactor: migrate remaining pages to unified header"
```

---

## Task 14: Cleanup Deprecated Components

**Files:**
- Delete: `apps/web/src/components/UserProfileDropdown.tsx` (if no longer used)
- Modify: `apps/web/src/components/notifications/NotificationBell.tsx` (keep for now, may be useful elsewhere)

**Step 1: Search for usages of UserProfileDropdown**

Run: `grep -r "UserProfileDropdown" apps/web/src/`

If only imported by files that have been migrated, it can be deleted.

**Step 2: Remove unused imports from migrated pages**

Ensure migrated pages no longer import:
- `UserProfileDropdown`
- `NotificationBell` (unless specifically needed)

**Step 3: Commit**

```bash
git add -A
git commit -m "chore: cleanup deprecated header components"
```

---

## Task 15: Run Full Test Suite

**Step 1: Run all tests**

Run: `cd apps/web && npm run test`

Expected: All tests pass

**Step 2: Run linting**

Run: `cd apps/web && npm run lint`

Expected: No linting errors

**Step 3: Run build**

Run: `cd apps/web && npm run build`

Expected: Build succeeds

**Step 4: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address test and lint issues from header migration"
```

---

## Summary

After completing all tasks:

1. **New components created:**
   - `HeaderProvider` - Context for slot management
   - `HeaderSlot` - Portal component for page controls
   - `AppHeader` - Unified header component
   - `HeaderLogo` - Responsive logo
   - `HeaderUserMenu` - Avatar dropdown with notifications
   - `HeaderOverflowMenu` - Mobile overflow menu

2. **Pages migrated:**
   - Homepage (slot: ThemeSelector)
   - HomePageMinimal (slot: ThemeSelector)
   - MyLegacies (slot: SearchBar, Create button)
   - About (no slot)
   - HowItWorks (no slot)
   - Community (no slot)
   - LegacyProfile (optional slot)
   - ExploreMinimal (slot: SearchBar)

3. **Deprecated:**
   - Inline `<nav>` sections in all pages
   - Direct usage of `UserProfileDropdown` in pages
   - Direct usage of `NotificationBell` in headers (now in user menu)
