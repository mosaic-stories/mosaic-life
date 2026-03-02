import { Globe, Lock, User, BookOpen, Loader2 } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { cn } from '@/components/ui/utils';
import { useStory, useUpdateStory } from '@/features/story/hooks/useStories';

interface SettingsToolProps {
  storyId: string;
  legacyId: string;
}

type Visibility = 'public' | 'private' | 'personal';

const VISIBILITY_OPTIONS: {
  value: Visibility;
  label: string;
  description: string;
  icon: typeof Globe;
}[] = [
  {
    value: 'public',
    label: 'Public',
    description: 'Anyone can view',
    icon: Globe,
  },
  {
    value: 'private',
    label: 'Members Only',
    description: 'Legacy members only',
    icon: Lock,
  },
  {
    value: 'personal',
    label: 'Personal',
    description: 'Only you can view',
    icon: User,
  },
];

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function SettingsTool({ storyId, legacyId: _legacyId }: SettingsToolProps) {
  const { data: story, isLoading } = useStory(storyId);
  const updateStory = useUpdateStory();

  const handleVisibilityChange = (visibility: Visibility) => {
    if (!story || story.visibility === visibility) return;
    updateStory.mutate({ storyId, data: { visibility } });
  };

  if (isLoading) {
    return (
      <div className="p-4 flex items-center gap-2 text-sm text-neutral-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading settings...
      </div>
    );
  }

  if (!story) {
    return (
      <div className="p-4 text-sm text-neutral-400">
        Unable to load story settings.
      </div>
    );
  }

  const wordCount = countWords(story.content);
  const primaryLegacy = story.legacies.find((l) => l.role === 'primary') ?? story.legacies[0];

  return (
    <div className="p-3 space-y-5">
      {/* Visibility section */}
      <div className="space-y-2">
        <Label className="text-xs font-medium text-neutral-500 uppercase tracking-wide">
          Visibility
        </Label>
        <div className="space-y-1.5">
          {VISIBILITY_OPTIONS.map(({ value, label, description, icon: Icon }) => {
            const isActive = story.visibility === value;
            return (
              <button
                key={value}
                onClick={() => handleVisibilityChange(value)}
                disabled={updateStory.isPending}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-md border text-left transition-colors',
                  isActive
                    ? 'border-theme-primary/40 bg-theme-primary/5 text-theme-primary'
                    : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300 hover:bg-neutral-50',
                  updateStory.isPending && 'opacity-60 cursor-not-allowed',
                )}
                aria-pressed={isActive}
              >
                <Icon
                  className={cn(
                    'h-4 w-4 shrink-0',
                    isActive ? 'text-theme-primary' : 'text-neutral-400',
                  )}
                />
                <div className="min-w-0">
                  <div className="text-sm font-medium leading-tight">{label}</div>
                  <div className="text-xs text-neutral-400 leading-tight mt-0.5">{description}</div>
                </div>
                {isActive && updateStory.isPending && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin ml-auto shrink-0 text-theme-primary" />
                )}
              </button>
            );
          })}
        </div>
        {updateStory.isError && (
          <p className="text-xs text-red-500 mt-1">Failed to update visibility. Please try again.</p>
        )}
      </div>

      {/* Story metadata section */}
      <div className="space-y-2">
        <Label className="text-xs font-medium text-neutral-500 uppercase tracking-wide">
          Metadata
        </Label>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between px-3 py-2 rounded-md border border-neutral-100 bg-neutral-50">
            <span className="text-xs text-neutral-500">Word count</span>
            <span className="text-xs font-medium text-neutral-700">
              {wordCount.toLocaleString()} {wordCount === 1 ? 'word' : 'words'}
            </span>
          </div>
          <div className="flex items-center justify-between px-3 py-2 rounded-md border border-neutral-100 bg-neutral-50">
            <span className="text-xs text-neutral-500">Created</span>
            <span className="text-xs font-medium text-neutral-700">
              {formatDate(story.created_at)}
            </span>
          </div>
          <div className="flex items-center justify-between px-3 py-2 rounded-md border border-neutral-100 bg-neutral-50">
            <span className="text-xs text-neutral-500">Last modified</span>
            <span className="text-xs font-medium text-neutral-700">
              {formatDate(story.updated_at)}
            </span>
          </div>
        </div>
      </div>

      {/* Legacy section */}
      {primaryLegacy && (
        <div className="space-y-2">
          <Label className="text-xs font-medium text-neutral-500 uppercase tracking-wide">
            Legacy
          </Label>
          <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-md border border-neutral-100 bg-neutral-50">
            <BookOpen className="h-4 w-4 text-neutral-400 shrink-0" />
            <div className="min-w-0">
              <div className="text-sm font-medium text-neutral-700 truncate">
                {primaryLegacy.legacy_name}
              </div>
              {story.legacies.length > 1 && (
                <div className="text-xs text-neutral-400 mt-0.5">
                  +{story.legacies.length - 1} more{' '}
                  {story.legacies.length - 1 === 1 ? 'legacy' : 'legacies'}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
