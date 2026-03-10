import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/features/legacy/hooks/useLegacies', () => ({
  useLegacies: () => ({
    data: {
      items: [
        {
          id: 'legacy-1',
          name: 'A very long legacy title used to verify the standalone my-legacies card cannot widen beyond its container in production',
          birth_date: '1950-01-01',
          death_date: '2020-12-31',
          biography: 'Long biography text to mimic production content and ensure the old card implementation uses shrink-safe layout primitives.',
          visibility: 'public',
          created_by: 'user-1',
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
          members: [],
          profile_image_url: null,
          story_count: 0,
        },
      ],
    },
    isLoading: false,
    error: null,
  }),
}));

vi.mock('@/features/story/hooks/useStories', () => ({
  useStories: () => ({ data: [], isLoading: false }),
  useUpdateStory: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/components/seo', () => ({
  SEOHead: () => null,
}));

vi.mock('@/components/SearchBar', () => ({
  default: () => <div>Search</div>,
}));

vi.mock('@/features/legacy/components/LegacyMultiSelect', () => ({
  default: () => <div>Legacy Multi Select</div>,
}));

import MyLegacies from './MyLegacies';

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <MyLegacies />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('MyLegacies', () => {
  it('uses truncation-safe card classes for long legacy names', () => {
    renderPage();

    const title = screen.getByRole('heading', {
      level: 3,
      name: /a very long legacy title used to verify the standalone my-legacies card/i,
    });
    expect(title.className).toContain('line-clamp-1');

    const row = title.parentElement?.parentElement;
    expect(row?.className).toContain('min-w-0');
  });
});