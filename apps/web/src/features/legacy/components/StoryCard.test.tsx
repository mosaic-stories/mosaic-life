import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import StoryCard from './StoryCard';
import type { StorySummary } from '@/features/story/api/stories';

vi.mock('@/features/favorites/components/FavoriteButton', () => ({
  default: () => <button type="button">Favorite</button>,
}));

const story: StorySummary = {
  id: 'story-1',
  title: 'A very long story title that should never force its parent hub card wider than the available grid track',
  content_preview: 'Long content preview that should remain inside the card body.',
  status: 'published',
  visibility: 'public',
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
  author_id: 'user-1',
  author_name: 'Jordan Example',
  author_username: 'jordan-example-x1y2',
  author_avatar_url: null,
  legacies: [
    { legacy_id: 'legacy-1', legacy_name: 'Test Legacy', role: 'primary', position: 0 },
  ],
  favorite_count: 0,
  shared_from: null,
};

describe('StoryCard', () => {
  it('renders title and content preview', () => {
    render(<MemoryRouter><StoryCard story={story} /></MemoryRouter>);

    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent(/a very long story title/i);
    expect(screen.getByText(/Long content preview/)).toBeInTheDocument();
  });

  it('uses truncation classes for long titles', () => {
    render(<MemoryRouter><StoryCard story={story} /></MemoryRouter>);

    const title = screen.getByRole('heading', { level: 3 });
    expect(title.className).toMatch(/line-clamp/);
  });

  it('shows visibility label and author name', () => {
    render(<MemoryRouter><StoryCard story={story} /></MemoryRouter>);

    expect(screen.getByText('Public')).toBeInTheDocument();
    expect(screen.getByText('Jordan Example')).toBeInTheDocument();
  });

  it('shows Members only for private visibility', () => {
    const privateStory = { ...story, visibility: 'private' as const };
    render(<MemoryRouter><StoryCard story={privateStory} /></MemoryRouter>);

    expect(screen.getByText('Members only')).toBeInTheDocument();
  });
});
