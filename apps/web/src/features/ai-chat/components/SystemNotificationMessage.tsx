import { Info } from 'lucide-react';
import { Link } from 'react-router-dom';

interface SystemNotificationMessageProps {
  content: string;
  metadata?: {
    story_id?: string;
    story_title?: string;
    legacy_id?: string;
    notification_type?: string;
  };
}

export function SystemNotificationMessage({
  content,
  metadata,
}: SystemNotificationMessageProps) {
  const storyLink =
    metadata?.legacy_id && metadata?.story_id
      ? `/legacy/${metadata.legacy_id}/story/${metadata.story_id}/evolve`
      : null;

  return (
    <div className="mx-4 my-2 flex items-center gap-2 rounded-lg bg-gray-100 px-3 py-2 dark:bg-gray-800">
      <Info className="h-4 w-4 shrink-0 text-gray-500" />
      <p className="text-sm text-gray-600 dark:text-gray-400">
        {content}
        {storyLink && (
          <>
            {' '}
            <Link
              to={storyLink}
              className="font-medium text-blue-600 hover:underline dark:text-blue-400"
            >
              View story →
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
