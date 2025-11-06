import { Link } from 'react-router-dom';
import { ReadingLayout } from '../components/layout/PageLayout';
import { Button } from '../components/ui/Button';
import { useAuth } from '../contexts/AuthContext';
import './LandingPage.css';

export function LandingPage() {
  const { isAuthenticated, user, login, isLoading } = useAuth();

  return (
    <ReadingLayout>
      <div className="landing-page">
        {/* Show user info if logged in */}
        {isAuthenticated && user && (
          <div
            style={{
              position: 'absolute',
              top: 'var(--space-4)',
              right: 'var(--space-4)',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-3)',
            }}
          >
            <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>
              Welcome, {user.name || user.email}
            </span>
            <Link to="/app">
              <Button size="sm">Go to App</Button>
            </Link>
          </div>
        )}

        <header className="landing-header">
          <h1 className="landing-title">Mosaic Life</h1>
          <p className="landing-subtitle">
            A storytelling platform for capturing and preserving memories about the people who
            matter in our lives
          </p>
        </header>

        <section className="landing-section">
          <h2>Create Living Legacies</h2>
          <p>
            Born from a desire to honor those we've lost, Mosaic Life extends to celebrate
            anyone—living or passed, distant or present—whose story deserves to be told and
            remembered.
          </p>
          <p>
            Through thoughtful conversation, AI-augmented reflection, and meaningful connections,
            we help you transform memories into living legacies.
          </p>
        </section>

        <section className="landing-section">
          <h2>How It Works</h2>
          <div className="landing-features">
            <div className="landing-feature">
              <h3>1. Create a Legacy</h3>
              <p>Set up a dedicated space for someone special in your life</p>
            </div>
            <div className="landing-feature">
              <h3>2. Share Stories</h3>
              <p>Write freely or let our AI biographer guide you through memories</p>
            </div>
            <div className="landing-feature">
              <h3>3. Invite Others</h3>
              <p>Bring family and friends together to contribute their own stories</p>
            </div>
            <div className="landing-feature">
              <h3>4. Preserve & Celebrate</h3>
              <p>Build a rich, multi-faceted portrait that honors their life</p>
            </div>
          </div>
        </section>

        <section className="landing-cta">
          {isAuthenticated ? (
            <>
              <Link to="/app">
                <Button size="lg">Go to Your Legacies</Button>
              </Link>
              <p className="landing-cta-note">Continue building your legacy collection</p>
            </>
          ) : (
            <>
              <Button size="lg" onClick={login} disabled={isLoading}>
                {isLoading ? 'Loading...' : 'Get Started'}
              </Button>
              <p className="landing-cta-note">
                Sign in with Google to create your first legacy
              </p>
            </>
          )}
        </section>
      </div>
    </ReadingLayout>
  );
}
