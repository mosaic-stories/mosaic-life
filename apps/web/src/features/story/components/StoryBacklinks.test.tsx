import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import StoryBacklinks from './StoryBacklinks';
import type { StoryBacklinkSummary } from '@/features/story/api/stories';

function renderBacklinks(
  props: Partial<React.ComponentProps<typeof StoryBacklinks>> = {},
) {
  return render(
    <MemoryRouter>
      <StoryBacklinks sourceStory={null} grownStories={[]} {...props} />
    </MemoryRouter>,
  );
}

const sourceStory: StoryBacklinkSummary = {
  id: 'story-source',
  title: 'The Summer at the Lake',
  legacy_id: 'legacy-1',
};

const grownStory: StoryBacklinkSummary = {
  id: 'story-grown',
  title: 'A Memory Worth Its Own Page',
  legacy_id: 'legacy-1',
};

describe('StoryBacklinks', () => {
  it('renders nothing when there is no source story and no grown stories', () => {
    const { container } = renderBacklinks();
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the source-story backlink and links to it correctly', () => {
    renderBacklinks({ sourceStory });

    expect(screen.getByTestId('source-story-backlink')).toBeInTheDocument();
    expect(screen.getByText(/grew out of a memory on/i)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: sourceStory.title });
    expect(link).toHaveAttribute('href', '/legacy/legacy-1/story/story-source');
  });

  it('renders each grown-from-responses entry and links to it correctly', () => {
    const secondGrownStory: StoryBacklinkSummary = {
      id: 'story-grown-2',
      title: 'Another Story That Grew',
      legacy_id: 'legacy-2',
    };
    renderBacklinks({ grownStories: [grownStory, secondGrownStory] });

    expect(screen.getByTestId('grown-stories-backlink')).toBeInTheDocument();

    const firstLink = screen.getByRole('link', { name: grownStory.title });
    expect(firstLink).toHaveAttribute('href', '/legacy/legacy-1/story/story-grown');

    const secondLink = screen.getByRole('link', { name: secondGrownStory.title });
    expect(secondLink).toHaveAttribute('href', '/legacy/legacy-2/story/story-grown-2');
  });

  it('renders both sections at once when a story has both a source and grown stories', () => {
    renderBacklinks({ sourceStory, grownStories: [grownStory] });

    expect(screen.getByTestId('source-story-backlink')).toBeInTheDocument();
    expect(screen.getByTestId('grown-stories-backlink')).toBeInTheDocument();
  });

  it('does not render a broken link when a backlink target has no legacy id', () => {
    renderBacklinks({ sourceStory: { ...sourceStory, legacy_id: null } });

    expect(screen.getByTestId('source-story-backlink')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText(sourceStory.title)).toBeInTheDocument();
  });
});
