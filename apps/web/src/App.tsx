import { useEffect, useState } from 'react';
import { Route, Routes, useNavigate } from 'react-router-dom';
import { getMe } from './lib/api/client';
import { LandingPage } from './pages/LandingPage';
import { AppShell } from './pages/AppShell';
import { LegaciesPage } from './pages/LegaciesPage';
import { StoriesPage } from './pages/StoriesPage';
import { ChatPage } from './pages/ChatPage';
import { SearchPage } from './pages/SearchPage';

function Protected({ children }: { children: JSX.Element }) {
  const [loading, setLoading] = useState(true);
  const [ok, setOk] = useState(false);
  const nav = useNavigate();

  useEffect(() => {
    getMe()
      .then(() => setOk(true))
      .catch(() => nav('/login'))
      .finally(() => setLoading(false));
  }, [nav]);

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
        }}
      >
        <div>
          <span className="loading-spinner" style={{ width: '48px', height: '48px' }}></span>
          <p style={{ marginTop: 'var(--space-4)', color: 'var(--color-text-muted)' }}>
            Loading...
          </p>
        </div>
      </div>
    );
  }

  return ok ? children : null;
}

function Login() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        padding: 'var(--space-8)',
      }}
    >
      <div style={{ textAlign: 'center', maxWidth: '28rem' }}>
        <h2 style={{ marginBottom: 'var(--space-4)' }}>Sign In</h2>
        <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-8)' }}>
          OIDC authentication flow will be implemented here
        </p>
        <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>
          For development: Authentication is handled by the Core API
        </p>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<Login />} />
      <Route
        path="/app"
        element={
          <Protected>
            <AppShell />
          </Protected>
        }
      >
        <Route index element={<LegaciesPage />} />
        <Route path="legacies" element={<LegaciesPage />} />
        <Route path="stories" element={<StoriesPage />} />
        <Route path="chat" element={<ChatPage />} />
        <Route path="search" element={<SearchPage />} />
      </Route>
    </Routes>
  );
}
