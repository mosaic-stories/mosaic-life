import { useState, useRef, useEffect } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import './AppShell.css';

export function AppShell() {
  const location = useLocation();
  const { user, logout } = useAuth();
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const isActive = (path: string) => {
    return location.pathname.startsWith(path);
  };

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };

    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showMenu]);

  return (
    <div className="app-shell">
      <nav className="app-nav" aria-label="Main navigation">
        <div className="app-nav-container">
          <Link to="/app" className="app-logo">
            <h1>Mosaic Life</h1>
          </Link>

          <div className="app-nav-links">
            <Link
              to="/app/legacies"
              className={`app-nav-link ${isActive('/app/legacies') ? 'active' : ''}`}
            >
              Legacies
            </Link>
            <Link
              to="/app/stories"
              className={`app-nav-link ${isActive('/app/stories') ? 'active' : ''}`}
            >
              Stories
            </Link>
            <Link
              to="/app/chat"
              className={`app-nav-link ${isActive('/app/chat') ? 'active' : ''}`}
            >
              AI Chat
            </Link>
            <Link
              to="/app/search"
              className={`app-nav-link ${isActive('/app/search') ? 'active' : ''}`}
            >
              Search
            </Link>
          </div>

          <div className="app-nav-actions" ref={menuRef}>
            <button
              className="app-nav-link"
              onClick={() => setShowMenu(!showMenu)}
              aria-label="User menu"
              aria-expanded={showMenu}
            >
              {user?.name || user?.email || 'Profile'}
            </button>

            {showMenu && (
              <div
                className="user-menu"
                style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: 'var(--space-2)',
                  backgroundColor: 'var(--color-surface, white)',
                  border: '1px solid var(--color-border, #e5e7eb)',
                  borderRadius: 'var(--border-radius-md, 8px)',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                  minWidth: '200px',
                  zIndex: 1000,
                }}
              >
                <div
                  style={{
                    padding: 'var(--space-3)',
                    borderBottom: '1px solid var(--color-border, #e5e7eb)',
                  }}
                >
                  <div style={{ fontWeight: '500' }}>{user?.name}</div>
                  <div
                    style={{
                      fontSize: 'var(--font-size-sm)',
                      color: 'var(--color-text-muted)',
                      marginTop: 'var(--space-1)',
                    }}
                  >
                    {user?.email}
                  </div>
                </div>

                <button
                  onClick={() => {
                    setShowMenu(false);
                    logout();
                  }}
                  style={{
                    width: '100%',
                    padding: 'var(--space-3)',
                    textAlign: 'left',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 'var(--font-size-md)',
                    color: 'var(--color-text)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--color-surface-hover, #f9fafb)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>

      <main className="app-content">
        <Outlet />
      </main>
    </div>
  );
}
