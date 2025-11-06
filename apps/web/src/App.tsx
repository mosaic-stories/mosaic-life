import { Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LandingPage } from './pages/LandingPage';
import { AppShell } from './pages/AppShell';
import { LegaciesPage } from './pages/LegaciesPage';
import { StoriesPage } from './pages/StoriesPage';
import { ChatPage } from './pages/ChatPage';
import { SearchPage } from './pages/SearchPage';

function Protected({ children }: { children: JSX.Element }) {
  const { isLoading, isAuthenticated, login } = useAuth();

  if (isLoading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <span className="loading-spinner" style={{ width: '48px', height: '48px' }}></span>
          <p style={{ marginTop: 'var(--space-4)', color: 'var(--color-text-muted)' }}>
            Loading...
          </p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login onLogin={login} />;
  }

  return children;
}

function Login({ onLogin }: { onLogin: () => void }) {
  const error = new URLSearchParams(window.location.search).get('error');

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
          onClick={onLogin}
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
          Sign In with Google
        </button>

        <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', marginTop: 'var(--space-6)' }}>
          Secure authentication via Google
        </p>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<LandingPage />} />
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
    </AuthProvider>
  );
}
