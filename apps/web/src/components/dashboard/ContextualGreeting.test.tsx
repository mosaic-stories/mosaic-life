import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ContextualGreeting from './ContextualGreeting';

// Mock auth
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: '1', name: 'Joe Smith', email: 'joe@example.com' },
  }),
}));

// Mock activity hooks
vi.mock('@/features/activity/hooks/useActivity', () => ({
  useRecentlyViewed: () => ({ data: null }),
}));

// Mock notification hooks
vi.mock('@/features/notifications/hooks/useNotifications', () => ({
  useUnreadCount: () => ({ data: { count: 0 } }),
}));

function renderGreeting() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ContextualGreeting />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('ContextualGreeting', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows morning greeting before noon', () => {
    vi.setSystemTime(new Date('2026-03-02T09:00:00'));
    renderGreeting();
    expect(screen.getByText(/good morning, joe/i)).toBeInTheDocument();
  });

  it('shows afternoon greeting after noon', () => {
    vi.setSystemTime(new Date('2026-03-02T14:00:00'));
    renderGreeting();
    expect(screen.getByText(/good afternoon, joe/i)).toBeInTheDocument();
  });

  it('shows evening greeting after 5pm', () => {
    vi.setSystemTime(new Date('2026-03-02T19:00:00'));
    renderGreeting();
    expect(screen.getByText(/good evening, joe/i)).toBeInTheDocument();
  });

  it('shows night greeting after 9pm', () => {
    vi.setSystemTime(new Date('2026-03-02T23:00:00'));
    renderGreeting();
    expect(screen.getByText(/good night, joe/i)).toBeInTheDocument();
  });

  it('shows fallback prompt when no activity or notifications', () => {
    vi.setSystemTime(new Date('2026-03-02T10:00:00'));
    renderGreeting();
    expect(screen.getByText(/what would you like to work on today/i)).toBeInTheDocument();
  });
});
