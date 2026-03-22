import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { MediaItem } from '@/features/media/api/media';
import MediaThumbnail from './MediaThumbnail';

vi.mock('@/lib/url', () => ({
  rewriteBackendUrlForDev: (value: string) => value,
}));

const mediaItem: MediaItem = {
  id: 'media-1',
  filename: 'family-photo.jpg',
  content_type: 'image/jpeg',
  size_bytes: 1024,
  download_url: '/download/media-1',
  uploaded_by: 'user-1',
  uploader_name: 'Pat Doe',
  uploader_username: 'pat-doe',
  uploader_avatar_url: null,
  legacies: [],
  created_at: '2026-03-11T00:00:00Z',
  favorite_count: 0,
  caption: 'Family photo',
  date_taken: null,
  location: null,
  era: null,
  tags: [],
  people: [],
};

describe('MediaThumbnail', () => {
  it('renders a custom badge in the bottom-left when provided', () => {
    render(
      <MediaThumbnail
        media={mediaItem}
        isSelected={false}
        isProfile={false}
        isFavorited={false}
        onClick={vi.fn()}
        badge={<span data-testid="legacy-badge">Rose Legacy</span>}
      />
    );

    expect(screen.getByTestId('legacy-badge')).toBeInTheDocument();
    expect(screen.getByTestId('legacy-badge')).toHaveTextContent('Rose Legacy');
  });

  it('does not render badge area when badge is not provided', () => {
    const { container } = render(
      <MediaThumbnail
        media={mediaItem}
        isSelected={false}
        isProfile={false}
        isFavorited={false}
        onClick={vi.fn()}
      />
    );

    expect(container.querySelector('[data-slot="badge"]')).not.toBeInTheDocument();
  });
});
