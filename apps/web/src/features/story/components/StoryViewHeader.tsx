import type { ComponentType } from 'react';

interface StoryViewHeaderProps {
  visibilityIcon: ComponentType<{ className?: string }>;
  visibilityLabel: string;
  authorName?: string;
  createdAt?: string;
  associatedLegaciesLabel: string | null;
  title: string;
}

export default function StoryViewHeader({
  visibilityIcon: VisibilityIcon,
  visibilityLabel,
  authorName,
  createdAt,
  associatedLegaciesLabel,
  title,
}: StoryViewHeaderProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-neutral-500">
        <VisibilityIcon className="size-4" />
        <span>{visibilityLabel}</span>
        <span className="mx-2">|</span>
        <span>{authorName}</span>
        {createdAt && (
          <>
            <span className="mx-2">|</span>
            <span>
              {new Date(createdAt).toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })}
            </span>
          </>
        )}
      </div>
      {associatedLegaciesLabel && (
        <p className="text-sm text-neutral-600">
          About: {associatedLegaciesLabel}
        </p>
      )}
      <h1 className="text-3xl font-semibold text-neutral-900">{title}</h1>
    </div>
  );
}
