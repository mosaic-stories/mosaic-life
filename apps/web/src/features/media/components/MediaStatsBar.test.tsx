import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { MediaItem } from '@/features/media/api/media';
import MediaStatsBar from './MediaStatsBar';

const makeMedia = (id: string, contentType: string): MediaItem => ({
  id,
  filename: `file-${id}`,
  content_type: contentType,
  size_bytes: 1024,
  download_url: `/download/${id}`,
  uploaded_by: 'user-1',
  uploader_name: 'Pat',
  uploader_username: 'pat',
  uploader_avatar_url: null,
  legacies: [],
  created_at: '2026-03-11T00:00:00Z',
  tags: [],
  people: [],
});

describe('MediaStatsBar', () => {
  it('renders correct counts for each media type', () => {
    const media = [
      makeMedia('1', 'image/jpeg'),
      makeMedia('2', 'image/png'),
      makeMedia('3', 'video/mp4'),
      makeMedia('4', 'audio/mpeg'),
      makeMedia('5', 'application/pdf'),
    ];

    render(<MediaStatsBar media={media} />);

    // Total
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('Total')).toBeInTheDocument();

    // Images
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('Images')).toBeInTheDocument();

    // Videos
    expect(screen.getByText('Videos')).toBeInTheDocument();

    // Audio
    expect(screen.getByText('Audio')).toBeInTheDocument();

    // Documents
    expect(screen.getByText('Documents')).toBeInTheDocument();
  });

  it('renders all zeros for empty media', () => {
    render(<MediaStatsBar media={[]} />);

    const zeros = screen.getAllByText('0');
    expect(zeros).toHaveLength(5);
  });
});
