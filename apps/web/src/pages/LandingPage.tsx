import { Link } from 'react-router-dom';
import { ReadingLayout } from '../components/layout/PageLayout';
import { Button } from '../components/ui/Button';
import './LandingPage.css';

export function LandingPage() {
  return (
    <ReadingLayout>
      <div className="landing-page">
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
          <Link to="/app">
            <Button size="lg">Get Started</Button>
          </Link>
          <p className="landing-cta-note">
            Create your first legacy and begin preserving memories
          </p>
        </section>
      </div>
    </ReadingLayout>
  );
}
