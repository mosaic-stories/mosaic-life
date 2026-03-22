import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import type { MediaItem } from '@/features/media/api/media';
import { ApiError } from '@/lib/api/client';

type MatchMediaStub = {
  matches: boolean;
  media: string;
  onchange: null;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  addListener: ReturnType<typeof vi.fn>;
  removeListener: ReturnType<typeof vi.fn>;
  dispatchEvent: ReturnType<typeof vi.fn>;
};

const mocks = vi.hoisted(() => ({
  useMedia: vi.fn(),
  deleteMutateAsync: vi.fn(),
  favoriteCheck: vi.fn(() => ({ data: { favorites: {} } })),
}));

vi.mock('@/features/media/hooks/useMedia', async () => {
  const actual = await vi.importActual<typeof import('@/features/media/hooks/useMedia')>(
    '@/features/media/hooks/useMedia'
  );

  return {
    ...actual,
    useMedia: mocks.useMedia,
    useDeleteMedia: () => ({ mutateAsync: mocks.deleteMutateAsync, isPending: false }),
  };
});

vi.mock('@/features/favorites/hooks/useFavorites', () => ({
  useFavoriteCheck: mocks.favoriteCheck,
}));

vi.mock('@/features/media/components/MediaGalleryHeader', () => ({
  default: ({ canUpload }: { canUpload?: boolean }) => (
    <div data-testid="media-gallery-header" data-can-upload={String(canUpload)} />
  ),
}));

vi.mock('@/features/media/components/MediaUploader', () => ({
  default: () => <div data-testid="media-uploader" />,
}));

vi.mock('@/features/media/components/MediaThumbnail', () => ({
  default: ({ media, onClick }: { media: MediaItem; onClick: () => void }) => (
    <button onClick={onClick}>{media.filename}</button>
  ),
}));

vi.mock('@/features/media/components/MediaDetailPanel', () => ({
  default: ({ media, onRequestDelete }: { media: MediaItem; onRequestDelete: (mediaId: string) => void }) => (
    <button onClick={() => onRequestDelete(media.id)}>Delete Photo</button>
  ),
}));

vi.mock('@/components/ui/sheet', () => ({
  Sheet: ({ open, children }: { open: boolean; children: ReactNode }) => (
    open ? <div data-testid="mobile-sheet">{children}</div> : null
  ),
  SheetContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: ReactNode }) => (open ? <div>{children}</div> : null),
  DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

import MediaSection from './MediaSection';

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

const originalMatchMedia = window.matchMedia;

function stubMatchMedia(matches: boolean): MatchMediaStub {
  const mql: MatchMediaStub = {
    matches,
    media: '(min-width: 1024px)',
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  };

  vi.stubGlobal('matchMedia', vi.fn(() => mql));

  return mql;
}

describe('MediaSection', () => {
  beforeEach(() => {
    mocks.useMedia.mockReturnValue({ data: [mediaItem], isLoading: false, error: null });
    mocks.deleteMutateAsync.mockReset();
    mocks.favoriteCheck.mockReturnValue({ data: { favorites: {} } });
    stubMatchMedia(false);
  });

  afterEach(() => {
    if (originalMatchMedia) {
      vi.stubGlobal('matchMedia', originalMatchMedia);
      return;
    }

    vi.unstubAllGlobals();
  });

  it('opens the existing delete confirmation dialog from the detail panel delete affordance', async () => {
    const user = userEvent.setup();

    render(
      <MediaSection legacyId="legacy-1" profileImageId={null} backgroundImageId={null} isAuthenticated />
    );

    await user.click(screen.getByRole('button', { name: /family-photo.jpg/i }));
    await user.click(screen.getAllByRole('button', { name: /delete photo/i })[0]);

    expect(screen.getByText(/are you sure you want to delete/i)).toBeInTheDocument();
    expect(screen.getByText(/are you sure you want to delete .*family-photo.jpg/i)).toBeInTheDocument();
  });

  it('confirms deletion through the existing dialog flow', async () => {
    const user = userEvent.setup();

    render(
      <MediaSection legacyId="legacy-1" profileImageId={null} backgroundImageId={null} isAuthenticated />
    );

    await user.click(screen.getByRole('button', { name: /family-photo.jpg/i }));
    await user.click(screen.getAllByRole('button', { name: /delete photo/i })[0]);
    await user.click(screen.getByRole('button', { name: /^delete$/i }));

    expect(mocks.deleteMutateAsync).toHaveBeenCalledWith('media-1');
  });

  it('does not throw when matchMedia is unavailable', () => {
    vi.unstubAllGlobals();

    expect(() => {
      render(
        <MediaSection legacyId="legacy-1" profileImageId={null} backgroundImageId={null} isAuthenticated />
      );
    }).not.toThrow();
  });

  it('does not render the mobile sheet content on desktop', async () => {
    const user = userEvent.setup();
    stubMatchMedia(true);

    render(
      <MediaSection legacyId="legacy-1" profileImageId={null} backgroundImageId={null} isAuthenticated />
    );

    await user.click(screen.getByRole('button', { name: /family-photo.jpg/i }));

    expect(screen.queryByTestId('mobile-sheet')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /delete photo/i })).toHaveLength(1);
  });

  it('shows an empty state instead of an error for non-members who cannot access legacy media', () => {
    mocks.useMedia.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new ApiError(403, 'Forbidden'),
    });

    render(
      <MediaSection
        legacyId="legacy-1"
        profileImageId={null}
        backgroundImageId={null}
        isAuthenticated
        canUploadMedia={false}
      />
    );

    expect(screen.getByTestId('media-gallery-header')).toHaveAttribute('data-can-upload', 'false');
    expect(screen.getByText('No photos yet')).toBeInTheDocument();
    expect(screen.getByText('No public photos are available to view')).toBeInTheDocument();
    expect(screen.queryByText('Failed to load media gallery')).not.toBeInTheDocument();
  });
});
