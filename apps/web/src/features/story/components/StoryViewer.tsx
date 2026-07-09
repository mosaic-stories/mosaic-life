import type { ComponentType } from 'react';
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
  /** Version preview state */
  isPreviewing: boolean;
  previewData?: VersionDetail;
  isPreviewActive: boolean;
  onRestore: () => void;
  isRestoring: boolean;
  /** Unfinished evolution draft resume affordance */
  hasActiveEvolution?: boolean;
  onResumeDraft?: () => void;
}

export default function StoryViewer({
  displayTitle,
  displayContent,
  visibilityIcon,
  visibilityLabel,
  authorName,
  createdAt,
  associatedLegaciesLabel,
  isPreviewing,
  previewData,
  isPreviewActive,
  onRestore,
  isRestoring,
  hasActiveEvolution = false,
  onResumeDraft,
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
        hasActiveEvolution={hasActiveEvolution}
        onResumeDraft={onResumeDraft}
      />

      {/* Story Content */}
      <StoryEditor content={displayContent} readOnly />
    </div>
  );
}
