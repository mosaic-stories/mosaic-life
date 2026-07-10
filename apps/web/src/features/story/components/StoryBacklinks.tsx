import { Link } from 'react-router-dom';
import type { StoryBacklinkSummary } from '@/features/story/api/stories';

interface StoryBacklinksProps {
  /** The story this story grew out of (a response on it was converted here), if any. */
  sourceStory: StoryBacklinkSummary | null;
  /** Other stories that grew out of a response left on this story. */
  grownStories: StoryBacklinkSummary[];
}

/** Builds the read-page path for a backlink target, or null if it can't be
 * linked (a story summary without a legacy id — defensive, shouldn't happen
 * in practice since story creation always requires a legacy). */
function backlinkPath(story: StoryBacklinkSummary): string | null {
  return story.legacy_id ? `/legacy/${story.legacy_id}/story/${story.id}` : null;
}

function BacklinkTitle({ story }: { story: StoryBacklinkSummary }) {
  const path = backlinkPath(story);
  if (!path) {
    return <span className="font-medium text-neutral-600">{story.title}</span>;
  }
  return (
    <Link
      to={path}
      className="font-medium text-neutral-600 underline underline-offset-2 hover:text-neutral-900"
    >
      {story.title}
    </Link>
  );
}

/**
 * Quiet, reciprocal backlinks between a story and the story it grew out of
 * (or the stories that grew out of it) — see openspec/changes/response-to-story.
 * Renders nothing when there is neither a source story nor any grown stories.
 */
export default function StoryBacklinks({
  sourceStory = null,
  grownStories = [],
}: StoryBacklinksProps) {
  if (!sourceStory && grownStories.length === 0) {
    return null;
  }

  return (
    <div className="mt-8 space-y-2 text-sm text-neutral-500" data-testid="story-backlinks">
      {sourceStory && (
        <p data-testid="source-story-backlink">
          Grew out of a memory on <BacklinkTitle story={sourceStory} />
        </p>
      )}
      {grownStories.length > 0 && (
        <div data-testid="grown-stories-backlink">
          <p className="text-neutral-400">Stories grown from responses here</p>
          <ul className="mt-1 space-y-0.5">
            {grownStories.map((story) => (
              <li key={story.id}>
                <BacklinkTitle story={story} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
