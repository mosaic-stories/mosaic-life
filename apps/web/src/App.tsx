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
  const nav = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Check for error in query params (from failed callback)
    const params = new URLSearchParams(window.location.search);
    const errorParam = params.get('error');
    if (errorParam) {
      setError(errorParam);
    }
  }, []);

  const handleLogin = () => {
    // Redirect to backend login endpoint which initiates OIDC flow
    window.location.href = '/api/auth/login';
  };

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
          Sign in with your Mosaic Life account
        </p>

        {error && (
          <div
            style={{
              padding: 'var(--space-4)',
              marginBottom: 'var(--space-6)',
              backgroundColor: 'var(--color-error-light, #fee)',
              color: 'var(--color-error, #c00)',
              borderRadius: 'var(--border-radius-md, 8px)',
            }}
          >
            Authentication failed: {error}
          </div>
        )}

        <button
          onClick={handleLogin}
          style={{
            padding: 'var(--space-3) var(--space-6)',
            backgroundColor: 'var(--color-primary, #0066cc)',
            color: 'white',
            border: 'none',
            borderRadius: 'var(--border-radius-md, 8px)',
            fontSize: 'var(--font-size-md)',
            fontWeight: '500',
            cursor: 'pointer',
            width: '100%',
          }}
        >
          Sign In with Cognito
        </button>

        <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', marginTop: 'var(--space-6)' }}>
          Secure authentication via AWS Cognito
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
