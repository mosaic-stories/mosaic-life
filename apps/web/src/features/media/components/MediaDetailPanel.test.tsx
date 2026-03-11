import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import type { ComponentProps } from 'react';
import type { MediaItem, PersonSearchResult, TagItem } from '@/features/media/api/media';

const mocks = vi.hoisted(() => ({
  useUpdateMedia: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useTagPerson: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useUntagPerson: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useAddTag: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useRemoveTag: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useSetProfileImage: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useLegacyTags: vi.fn(() => ({ data: [] as TagItem[] })),
  useSearchPersons: vi.fn((_: string) => ({ data: [] as PersonSearchResult[] | undefined })),
  favoriteCheck: vi.fn(() => ({ data: { favorites: {} } })),
  tagPersonMutate: vi.fn(),
  addTagMutate: vi.fn(),
  onRequestDelete: vi.fn(),
  onClose: vi.fn(),
  onNavigate: vi.fn(),
}));

vi.mock('@/features/media/hooks/useMedia', async () => {
  const actual = await vi.importActual<typeof import('@/features/media/hooks/useMedia')>(
    '@/features/media/hooks/useMedia'
  );

  return {
    ...actual,
    useUpdateMedia: mocks.useUpdateMedia,
    useTagPerson: mocks.useTagPerson,
    useUntagPerson: mocks.useUntagPerson,
    useAddTag: mocks.useAddTag,
    useRemoveTag: mocks.useRemoveTag,
    useSetProfileImage: mocks.useSetProfileImage,
    useLegacyTags: mocks.useLegacyTags,
    useSearchPersons: mocks.useSearchPersons,
  };
});

vi.mock('@/features/favorites/hooks/useFavorites', () => ({
  useFavoriteCheck: mocks.favoriteCheck,
}));

vi.mock('@/features/favorites/components/FavoriteButton', () => ({
  default: () => <div data-testid="favorite-button" />,
}));

vi.mock('@/lib/url', () => ({
  rewriteBackendUrlForDev: (value: string) => value,
}));

vi.mock('./DetailSection', () => ({
  default: ({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) => (
    <section>
      <div>
        <h2>{title}</h2>
        {action}
      </div>
      <div>{children}</div>
    </section>
  ),
}));

vi.mock('./MetadataRow', () => ({
  default: ({ label, value }: { label: string; value: string }) => (
    <div>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  ),
}));

vi.mock('./TagPill', () => ({
  default: ({ label }: { label: string }) => <span>{label}</span>,
}));

import MediaDetailPanel from './MediaDetailPanel';

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

function renderPanel(overrides?: Partial<ComponentProps<typeof MediaDetailPanel>>) {
  return render(
    <MediaDetailPanel
      media={mediaItem}
      allMedia={[mediaItem]}
      legacyId="legacy-1"
      profileImageId={null}
      onClose={mocks.onClose}
      onNavigate={mocks.onNavigate}
      isAuthenticated
      onRequestDelete={mocks.onRequestDelete}
      {...overrides}
    />
  );
}

describe('MediaDetailPanel', () => {
  beforeEach(() => {
    mocks.onClose.mockReset();
    mocks.onNavigate.mockReset();
    mocks.onRequestDelete.mockReset();
    mocks.tagPersonMutate.mockReset();
    mocks.addTagMutate.mockReset();
    mocks.useUpdateMedia.mockReturnValue({ mutate: vi.fn(), isPending: false });
    mocks.useTagPerson.mockReturnValue({ mutate: mocks.tagPersonMutate, isPending: false });
    mocks.useUntagPerson.mockReturnValue({ mutate: vi.fn(), isPending: false });
    mocks.useAddTag.mockReturnValue({ mutate: mocks.addTagMutate, isPending: false });
    mocks.useRemoveTag.mockReturnValue({ mutate: vi.fn(), isPending: false });
    mocks.useSetProfileImage.mockReturnValue({ mutate: vi.fn(), isPending: false });
    mocks.useLegacyTags.mockReturnValue({ data: [] as TagItem[] });
    mocks.useSearchPersons.mockImplementation(
      (_query: string) => ({ data: [] as PersonSearchResult[] | undefined })
    );
    mocks.favoriteCheck.mockReturnValue({ data: { favorites: {} } });
  });

  it('shows a delete action for authenticated users and requests deletion for the selected media', async () => {
    const user = userEvent.setup();

    renderPanel();

    await user.click(screen.getByRole('button', { name: /delete photo/i }));

    expect(mocks.onRequestDelete).toHaveBeenCalledWith('media-1');
  });

  it('offers inline person creation when search has no matches', async () => {
    const user = userEvent.setup();
    mocks.useSearchPersons.mockImplementation((query: string) => ({
      data: query.length >= 2 ? [] : undefined,
    }));

    renderPanel();

    await user.click(screen.getByRole('button', { name: /tag someone/i }));
    await user.type(screen.getByPlaceholderText(/search by name/i), 'Alex');
    await user.click(screen.getByRole('button', { name: /create person/i }));

    expect(mocks.tagPersonMutate).toHaveBeenCalledWith(
      { mediaId: 'media-1', data: { name: 'Alex', role: 'subject' } },
      expect.any(Object)
    );
  });

  it('shows legacy tag suggestions and adds a selected suggestion', async () => {
    const user = userEvent.setup();
    mocks.useLegacyTags.mockReturnValue({
      data: [
        { id: 'tag-1', name: 'Family' },
        { id: 'tag-2', name: 'Vacation' },
      ],
    });

    renderPanel();

    await user.type(screen.getByPlaceholderText(/add a tag and press enter/i), 'fam');
    await user.click(screen.getByRole('button', { name: 'Family' }));

    expect(mocks.addTagMutate).toHaveBeenCalledWith(
      { mediaId: 'media-1', name: 'Family', legacyId: 'legacy-1' },
      expect.any(Object)
    );
  });
});