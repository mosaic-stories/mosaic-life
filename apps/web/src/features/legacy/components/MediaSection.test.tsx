import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import type { MediaItem } from '@/features/media/api/media';

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
  default: () => <div data-testid="media-gallery-header" />,
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
  Sheet: ({ children }: { children: ReactNode }) => <div>{children}</div>,
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

describe('MediaSection', () => {
  beforeEach(() => {
    mocks.useMedia.mockReturnValue({ data: [mediaItem], isLoading: false, error: null });
    mocks.deleteMutateAsync.mockReset();
    mocks.favoriteCheck.mockReturnValue({ data: { favorites: {} } });
  });

  it('opens the existing delete confirmation dialog from the detail panel delete affordance', async () => {
    const user = userEvent.setup();

    render(
      <MediaSection legacyId="legacy-1" profileImageId={null} isAuthenticated />
    );

    await user.click(screen.getByRole('button', { name: /family-photo.jpg/i }));
    await user.click(screen.getAllByRole('button', { name: /delete photo/i })[0]);

    expect(screen.getByText(/are you sure you want to delete/i)).toBeInTheDocument();
    expect(screen.getByText(/are you sure you want to delete .*family-photo.jpg/i)).toBeInTheDocument();
  });

  it('confirms deletion through the existing dialog flow', async () => {
    const user = userEvent.setup();

    render(
      <MediaSection legacyId="legacy-1" profileImageId={null} isAuthenticated />
    );

    await user.click(screen.getByRole('button', { name: /family-photo.jpg/i }));
    await user.click(screen.getAllByRole('button', { name: /delete photo/i })[0]);
    await user.click(screen.getByRole('button', { name: /^delete$/i }));

    expect(mocks.deleteMutateAsync).toHaveBeenCalledWith('media-1');
  });
});