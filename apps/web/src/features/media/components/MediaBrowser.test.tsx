import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { MediaItem } from '@/features/media/api/media';

const mocks = vi.hoisted(() => ({
  useDeleteMedia: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  favoriteCheck: vi.fn(() => ({ data: { favorites: {} } })),
}));

vi.mock('@/features/media/hooks/useMedia', async () => {
  const actual = await vi.importActual<typeof import('@/features/media/hooks/useMedia')>(
    '@/features/media/hooks/useMedia'
  );
  return { ...actual, useDeleteMedia: mocks.useDeleteMedia };
});

vi.mock('@/features/favorites/hooks/useFavorites', () => ({
  useFavoriteCheck: mocks.favoriteCheck,
}));

vi.mock('./MediaDetailPanel', () => ({
  default: ({ media }: { media: MediaItem }) => (
    <div data-testid="detail-panel">{media.filename}</div>
  ),
}));

vi.mock('./MediaThumbnail', () => ({
  default: ({ media, onClick, badge }: { media: MediaItem; onClick: () => void; badge?: React.ReactNode }) => (
    <button data-testid={`thumb-${media.id}`} onClick={onClick}>
      {media.filename}
      {badge}
    </button>
  ),
}));

vi.mock('@/lib/url', () => ({
  rewriteBackendUrlForDev: (value: string) => value,
}));

import MediaBrowser from './MediaBrowser';

const makeMedia = (id: string, filename: string): MediaItem => ({
  id,
  filename,
  content_type: 'image/jpeg',
  size_bytes: 1024,
  download_url: `/download/${id}`,
  uploaded_by: 'user-1',
  uploader_name: 'Pat Doe',
  uploader_username: 'pat-doe',
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
});

const media = [makeMedia('m1', 'photo1.jpg'), makeMedia('m2', 'photo2.jpg')];

describe('MediaBrowser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a loading spinner when isLoading is true', () => {
    render(
      <MemoryRouter>
        <MediaBrowser media={[]} isLoading={true} error={null} isAuthenticated={true} />
      </MemoryRouter>
    );
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders an error message when error is provided', () => {
    render(
      <MemoryRouter>
        <MediaBrowser media={[]} isLoading={false} error={new Error('fail')} isAuthenticated={true} />
      </MemoryRouter>
    );
    expect(screen.getByText(/failed to load/i)).toBeInTheDocument();
  });

  it('renders empty state when media is empty', () => {
    render(
      <MemoryRouter>
        <MediaBrowser media={[]} isLoading={false} error={null} isAuthenticated={true} />
      </MemoryRouter>
    );
    expect(screen.getByText(/no photos yet/i)).toBeInTheDocument();
  });

  it('renders custom empty message', () => {
    render(
      <MemoryRouter>
        <MediaBrowser
          media={[]}
          isLoading={false}
          error={null}
          isAuthenticated={true}
          emptyMessage="Nothing here"
        />
      </MemoryRouter>
    );
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
  });

  it('renders thumbnails for all media items', () => {
    render(
      <MemoryRouter>
        <MediaBrowser media={media} isLoading={false} error={null} isAuthenticated={true} />
      </MemoryRouter>
    );
    expect(screen.getByTestId('thumb-m1')).toBeInTheDocument();
    expect(screen.getByTestId('thumb-m2')).toBeInTheDocument();
  });

  it('opens the detail panel when a thumbnail is clicked', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <MediaBrowser media={media} isLoading={false} error={null} isAuthenticated={true} />
      </MemoryRouter>
    );

    await user.click(screen.getByTestId('thumb-m1'));
    expect(screen.getByTestId('detail-panel')).toHaveTextContent('photo1.jpg');
  });

  it('passes renderThumbnailBadge output as badge prop', () => {
    render(
      <MemoryRouter>
        <MediaBrowser
          media={media}
          isLoading={false}
          error={null}
          isAuthenticated={true}
          renderThumbnailBadge={(m) => <span data-testid={`badge-${m.id}`}>{m.legacies[0]?.legacy_name}</span>}
        />
      </MemoryRouter>
    );
    expect(screen.getByTestId('badge-m1')).toHaveTextContent('Rose Legacy');
    expect(screen.getByTestId('badge-m2')).toHaveTextContent('Rose Legacy');
  });
});
