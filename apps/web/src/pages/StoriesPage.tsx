import { PageLayout } from '../components/layout/PageLayout';
import { Button } from '../components/ui/Button';

export function StoriesPage() {
  return (
    <PageLayout maxWidth="wide">
      <div style={{ padding: 'var(--space-8) 0' }}>
        <div style={{ marginBottom: 'var(--space-8)' }}>
          <h1 style={{ marginBottom: 'var(--space-4)' }}>Stories</h1>
          <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-6)' }}>
            Browse and create stories across all your legacies
          </p>
          <Button>Write New Story</Button>
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
            No stories yet
          </h2>
          <p style={{ color: 'var(--color-text-muted)', marginBottom: 'var(--space-6)' }}>
            Start writing to capture memories and moments
          </p>
          <Button variant="secondary">Write Your First Story</Button>
        </div>
      </div>
    </PageLayout>
  );
}
