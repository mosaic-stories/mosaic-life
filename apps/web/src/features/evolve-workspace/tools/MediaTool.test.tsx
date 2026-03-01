import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MediaTool } from './MediaTool';

const { useMediaMock, useMediaUploadMock, rewriteBackendUrlForDevMock } = vi.hoisted(() => ({
  useMediaMock: vi.fn(),
  useMediaUploadMock: vi.fn(),
  rewriteBackendUrlForDevMock: vi.fn((url: string) => `/rewritten${url}`),
}));

vi.mock('@/features/media/hooks/useMedia', () => ({
  useMedia: useMediaMock,
  useMediaUpload: useMediaUploadMock,
}));

vi.mock('@/lib/url', () => ({
  rewriteBackendUrlForDev: rewriteBackendUrlForDevMock,
}));

describe('MediaTool', () => {
  beforeEach(() => {
    useMediaUploadMock.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });

    useMediaMock.mockReturnValue({
      data: [
        {
          id: 'media-123',
          filename: 'family-photo.jpg',
          download_url: '/api/media/media-123/content',
        },
      ],
    });
  });

  it('does not render click-to-insert affordance and uses rewritten media URL', () => {
    render(<MediaTool legacyId="legacy-1" />);

    expect(screen.queryByText(/click to insert into story/i)).not.toBeInTheDocument();
    expect(screen.queryByTitle(/click to insert into story/i)).not.toBeInTheDocument();

    const image = screen.getByRole('img', { name: 'family-photo.jpg' });
    expect(rewriteBackendUrlForDevMock).toHaveBeenCalledWith('/api/media/media-123/content');
    expect(image).toHaveAttribute('src', '/rewritten/api/media/media-123/content');
  });
});
