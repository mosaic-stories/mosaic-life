import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import StoryCard from './StoryCard';
import type { StorySummary } from '@/features/story/api/stories';

vi.mock('@/features/favorites/components/FavoriteButton', () => ({
  default: () => <button type="button">Favorite</button>,
}));

const story: StorySummary = {
  id: 'story-1',
  title: 'A very long story title that should never force its parent hub card wider than the available grid track in production layouts',
  content_preview: 'Long content preview that should remain inside the card body and not cause unexpected horizontal growth in any stories hub layout.',
  status: 'published',
  visibility: 'public',
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
  author_id: 'user-1',
  author_name: 'Jordan Example',
  legacies: [
    { legacy_id: 'legacy-1', legacy_name: 'An exceptionally long associated legacy name used to verify truncation in card metadata', role: 'primary', position: 0 },
  ],
  favorite_count: 0,
  shared_from: null,
};

describe('StoryCard', () => {
  it('uses truncation-safe layout classes for long content', () => {
    render(<StoryCard story={story} />);

    const title = screen.getByRole('heading', {
      level: 3,
      name: /a very long story title/i,
    });
    // Title should have truncation via truncate or line-clamp
    expect(title.className).toMatch(/truncate|line-clamp/);
  });
});