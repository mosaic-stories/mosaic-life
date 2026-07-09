import { formatDistanceToNow } from 'date-fns';

/**
 * Render-time-only display title for a story. Never persisted or sent to
 * the API — an empty stored title always renders as a placeholder here
 * instead of leaking a stored "Untitled Story" string.
 */
export function getStoryDisplayTitle(title: string, createdAt: string): string {
  if (title.trim()) return title;
  return `Draft story · ${formatDistanceToNow(new Date(createdAt), { addSuffix: true })}`;
}
