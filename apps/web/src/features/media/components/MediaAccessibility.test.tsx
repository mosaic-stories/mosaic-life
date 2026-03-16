import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MediaItem } from '@/features/media/api/media';
import MediaGalleryHeader from './MediaGalleryHeader';
import MediaThumbnail from './MediaThumbnail';
import TagPill from './TagPill';

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal('ResizeObserver', ResizeObserverMock);

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

describe('media accessibility affordances', () => {
  it('renders the thumbnail as a keyboard-activatable button', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();

    render(
      <MediaThumbnail
        media={mediaItem}
        isSelected={false}
        isProfile={false}
        isFavorited={false}
        onClick={onClick}
      />
    );

    const button = screen.getByRole('button', { name: /family photo/i });
    button.focus();
    await user.keyboard('{Enter}');

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('keeps the timeline toggle unavailable while still exposing its tooltip', async () => {
    const user = userEvent.setup();

    render(
      <MediaGalleryHeader photoCount={3} contributorCount={2} onUploadClick={vi.fn()} />
    );

    const timelineButton = screen.getByRole('button', { name: /timeline view unavailable/i });
    expect(timelineButton).toHaveAttribute('aria-disabled', 'true');

    await user.hover(timelineButton);

    expect(await screen.findByRole('tooltip')).toBeInTheDocument();
  });

  it('adds an accessible label to the tag remove button', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();

    render(<TagPill label="Family" onRemove={onRemove} />);

    await user.click(screen.getByRole('button', { name: /remove family/i }));

    expect(onRemove).toHaveBeenCalledTimes(1);
  });
});