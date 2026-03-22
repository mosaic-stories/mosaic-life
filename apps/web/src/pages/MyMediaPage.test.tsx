import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { MediaItem } from '@/features/media/api/media';

const mockMedia: MediaItem[] = [
  {
    id: 'm1',
    filename: 'photo.jpg',
    content_type: 'image/jpeg',
    size_bytes: 1024,
    download_url: '/download/m1',
    uploaded_by: 'user-1',
    uploader_name: 'Pat',
    uploader_username: 'pat',
    uploader_avatar_url: null,
    legacies: [{ legacy_id: 'leg-1', legacy_name: 'Rose Legacy', role: 'primary', position: 0 }],
    created_at: '2026-03-11T00:00:00Z',
    favorite_count: 0,
    caption: null,
    date_taken: null,
    location: null,
    era: null,
    tags: [],
    people: [],
  },
];

const mocks = vi.hoisted(() => ({
  useMedia: vi.fn(() => ({ data: mockMedia, isLoading: false, error: null })),
}));

vi.mock('@/features/media/hooks/useMedia', async () => {
  const actual = await vi.importActual<typeof import('@/features/media/hooks/useMedia')>(
    '@/features/media/hooks/useMedia'
  );
  return { ...actual, useMedia: mocks.useMedia };
});

vi.mock('@/features/media/components/MediaBrowser', () => ({
  default: ({ media, legacyId }: { media: MediaItem[]; legacyId?: string }) => (
    <div data-testid="media-browser" data-legacy-id={legacyId ?? ''}>
      {media.length} items
    </div>
  ),
}));

vi.mock('@/features/media/components/MediaStatsBar', () => ({
  default: ({ media }: { media: MediaItem[] }) => (
    <div data-testid="stats-bar">{media.length} stats</div>
  ),
}));

import MyMediaPage from './MyMediaPage';

describe('MyMediaPage', () => {
  it('renders the page title', () => {
    render(
      <MemoryRouter>
        <MyMediaPage />
      </MemoryRouter>
    );
    expect(screen.getByText('My Media')).toBeInTheDocument();
  });

  it('renders the stats bar with media data', () => {
    render(
      <MemoryRouter>
        <MyMediaPage />
      </MemoryRouter>
    );
    expect(screen.getByTestId('stats-bar')).toHaveTextContent('1 stats');
  });

  it('renders the media browser', () => {
    render(
      <MemoryRouter>
        <MyMediaPage />
      </MemoryRouter>
    );
    expect(screen.getByTestId('media-browser')).toHaveTextContent('1 items');
  });

  it('does not pass a legacy context into the cross-legacy media browser', () => {
    render(
      <MemoryRouter>
        <MyMediaPage />
      </MemoryRouter>
    );

    expect(screen.getByTestId('media-browser')).toHaveAttribute('data-legacy-id', '');
  });

  it('calls useMedia with no legacyId to fetch all media', () => {
    render(
      <MemoryRouter>
        <MyMediaPage />
      </MemoryRouter>
    );
    expect(mocks.useMedia).toHaveBeenCalledWith();
  });
});
