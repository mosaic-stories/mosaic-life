import { PageLayout } from '../components/layout/PageLayout';
import { Button } from '../components/ui/Button';

export function LegaciesPage() {
  return (
    <PageLayout maxWidth="wide">
      <div style={{ padding: 'var(--space-8) 0' }}>
        <div style={{ marginBottom: 'var(--space-8)' }}>
          <h1 style={{ marginBottom: 'var(--space-4)' }}>Your Legacies</h1>
          <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-6)' }}>
            Spaces you've created to honor and remember special people in your life
          </p>
          <Button>Create New Legacy</Button>
        </div>

        <div
          style={{
            padding: 'var(--space-16)',
            textAlign: 'center',
            backgroundColor: 'var(--color-bg-surface)',
            borderRadius: 'var(--radius-lg)',
            border: '2px dashed var(--color-border-default)',
          }}
        >
          <h2 style={{ color: 'var(--color-text-muted)', marginBottom: 'var(--space-4)' }}>
            No legacies yet
          </h2>
          <p style={{ color: 'var(--color-text-muted)', marginBottom: 'var(--space-6)' }}>
            Create your first legacy to start preserving memories
          </p>
          <Button variant="secondary">Get Started</Button>
        </div>
      </div>
    </PageLayout>
  );
}
