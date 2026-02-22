import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import LegacyMultiSelect from '@/features/legacy/components/LegacyMultiSelect';
import { StoryEditor } from '@/features/editor';
import type { LegacyAssociationInput } from '@/features/story/api/stories';

interface StoryEditFormProps {
  title: string;
  onTitleChange: (title: string) => void;
  content: string;
  onContentChange: (content: string) => void;
  visibility: 'public' | 'private' | 'personal';
  onVisibilityChange: (visibility: 'public' | 'private' | 'personal') => void;
  selectedLegacies: LegacyAssociationInput[];
  onLegaciesChange: (legacies: LegacyAssociationInput[]) => void;
  isMutating: boolean;
  legacyId?: string;
}

export default function StoryEditForm({
  title,
  onTitleChange,
  content,
  onContentChange,
  visibility,
  onVisibilityChange,
  selectedLegacies,
  onLegaciesChange,
  isMutating,
  legacyId,
}: StoryEditFormProps) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <label className="text-sm text-neutral-600">Legacies *</label>
        <LegacyMultiSelect
          value={selectedLegacies}
          onChange={onLegaciesChange}
          requirePrimary={true}
          disabled={isMutating}
        />
        <p className="text-xs text-neutral-500">
          Select one or more legacies and mark one as primary.
        </p>
      </div>

      <div className="space-y-2">
        <label className="text-sm text-neutral-600">Story Title *</label>
        <Input
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="Give your story a title..."
          className="text-lg"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm text-neutral-600">Visibility</label>
        <div className="flex gap-2">
          <Button
            variant={visibility === 'public' ? 'default' : 'outline'}
            size="sm"
            onClick={() => onVisibilityChange('public')}
          >
            Public
          </Button>
          <Button
            variant={visibility === 'private' ? 'default' : 'outline'}
            size="sm"
            onClick={() => onVisibilityChange('private')}
          >
            Members Only
          </Button>
          <Button
            variant={visibility === 'personal' ? 'default' : 'outline'}
            size="sm"
            onClick={() => onVisibilityChange('personal')}
          >
            Personal
          </Button>
        </div>
        <p className="text-xs text-neutral-500">
          {visibility === 'public' && 'Anyone can read this story'}
          {visibility === 'private' && 'Only legacy members can read this story'}
          {visibility === 'personal' && 'Only you can see this story'}
        </p>
      </div>

      <div className="space-y-2">
        <label className="text-sm text-neutral-600">Your Story *</label>
        <StoryEditor
          content={content}
          onChange={onContentChange}
          placeholder="Start writing your story here..."
          legacyId={legacyId}
        />
      </div>
    </div>
  );
}
