import type { ComponentType } from 'react';
import { Eye } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { StoryEditor } from '@/features/editor';
import type { VersionDetail } from '@/features/story/api/versions';
import VersionPreviewBanner from './VersionPreviewBanner';
import StoryViewHeader from './StoryViewHeader';

interface StoryViewerProps {
  displayTitle: string;
  displayContent: string;
  visibilityIcon: ComponentType<{ className?: string }>;
  visibilityLabel: string;
  authorName?: string;
  createdAt?: string;
  associatedLegaciesLabel: string | null;
  canEdit: boolean;
  onEditClick: () => void;
  /** Version preview state */
  isPreviewing: boolean;
  previewData?: VersionDetail;
  isPreviewActive: boolean;
  onRestore: () => void;
  isRestoring: boolean;
}

export default function StoryViewer({
  displayTitle,
  displayContent,
  visibilityIcon,
  visibilityLabel,
  authorName,
  createdAt,
  associatedLegaciesLabel,
  canEdit,
  onEditClick,
  isPreviewing,
  previewData,
  isPreviewActive,
  onRestore,
  isRestoring,
}: StoryViewerProps) {
  return (
    <div className="space-y-8">
      {/* Version Preview Banner */}
      {isPreviewing && previewData && (
        <VersionPreviewBanner
          versionNumber={previewData.version_number}
          source={previewData.source}
          createdAt={previewData.created_at}
          isActive={isPreviewActive}
          onRestore={onRestore}
          isRestoring={isRestoring}
        />
      )}

      {/* Story Header */}
      <StoryViewHeader
        visibilityIcon={visibilityIcon}
        visibilityLabel={visibilityLabel}
        authorName={authorName}
        createdAt={createdAt}
        associatedLegaciesLabel={associatedLegaciesLabel}
        title={displayTitle}
      />

      {/* Story Content */}
      <Card className="p-8 bg-white">
        <StoryEditor content={displayContent} readOnly />
      </Card>

      {/* View mode info */}
      {canEdit && (
        <div className="flex items-center justify-center gap-2 text-sm text-neutral-500">
          <Eye className="size-4" />
          <span>Viewing mode</span>
          <span className="mx-1">-</span>
          <button
            onClick={onEditClick}
            className="text-[rgb(var(--theme-primary))] hover:underline"
          >
            Click to edit
          </button>
        </div>
      )}
    </div>
  );
}
