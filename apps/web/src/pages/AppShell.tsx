import { Link, Outlet, useLocation } from 'react-router-dom';
import './AppShell.css';

export function AppShell() {
  const location = useLocation();

  const isActive = (path: string) => {
    return location.pathname.startsWith(path);
  };

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

          <div className="app-nav-actions">
            <button className="app-nav-link" aria-label="User menu">
              Profile
            </button>
          </div>
        </div>
      </nav>

      <main className="app-content">
        <Outlet />
      </main>
    </div>
  );
}
