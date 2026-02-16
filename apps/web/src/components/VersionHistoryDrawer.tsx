import { Loader2, AlertTriangle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from './ui/sheet';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';
import { Card } from './ui/card';
import type { VersionSummary, VersionListResponse } from '@/lib/api/versions';

interface VersionHistoryDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: VersionListResponse | undefined;
  isLoading: boolean;
  selectedVersion: number | null;
  onSelectVersion: (versionNumber: number) => void;
  onApproveDraft: () => void;
  onDiscardDraft: () => void;
  isDraftActionPending: boolean;
}

function getSourceLabel(source: string): string {
  switch (source) {
    case 'edit':
      return 'Manual edit';
    case 'ai_generate':
      return 'AI enhancement';
    case 'restoration':
      return 'Restoration';
    case 'creation':
      return 'Original';
    default:
      return source;
  }
}

function DraftZone({
  draft,
  selected,
  onSelect,
  onApprove,
  onDiscard,
  isPending,
}: {
  draft: VersionSummary;
  selected: boolean;
  onSelect: () => void;
  onApprove: () => void;
  onDiscard: () => void;
  isPending: boolean;
}) {
  return (
    <Card
      className={`p-4 border-amber-200 bg-amber-50 cursor-pointer ${
        selected ? 'ring-2 ring-amber-400' : ''
      }`}
      onClick={onSelect}
      data-selected={selected}
    >
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-amber-300 text-amber-700">
            Draft
          </Badge>
          <span className="text-xs text-neutral-500">
            {getSourceLabel(draft.source)}
          </span>
        </div>
        {draft.change_summary && (
          <p className="text-sm text-neutral-700 line-clamp-1">
            {draft.change_summary}
          </p>
        )}
        {draft.stale && (
          <p className="text-xs text-amber-600 flex items-center gap-1">
            <AlertTriangle className="size-3" />
            Created based on an older version
          </p>
        )}
        <div className="flex gap-2 pt-1">
          <Button
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onApprove();
            }}
            disabled={isPending}
          >
            Approve
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-red-600 hover:text-red-700 hover:bg-red-50"
            onClick={(e) => {
              e.stopPropagation();
              onDiscard();
            }}
            disabled={isPending}
          >
            Discard
          </Button>
        </div>
      </div>
    </Card>
  );
}

function VersionEntry({
  version,
  selected,
  onSelect,
}: {
  version: VersionSummary;
  selected: boolean;
  onSelect: () => void;
}) {
  const isActive = version.status === 'active';

  return (
    <button
      className={`w-full text-left p-3 rounded-lg border transition-colors ${
        selected
          ? 'border-blue-300 bg-blue-50'
          : 'border-transparent hover:bg-neutral-50'
      }`}
      onClick={onSelect}
      data-selected={selected}
    >
      <div className="flex items-start gap-3">
        <div
          className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold ${
            isActive
              ? 'bg-green-100 text-green-700'
              : 'bg-neutral-100 text-neutral-600'
          }`}
        >
          v{version.version_number}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-[10px]">
              {getSourceLabel(version.source)}
            </Badge>
            {isActive && (
              <Badge
                variant="default"
                className="text-[10px] bg-green-600"
              >
                Active
              </Badge>
            )}
          </div>
          {version.change_summary && (
            <p className="text-sm text-neutral-700 mt-1 line-clamp-1">
              {version.change_summary}
            </p>
          )}
          <p className="text-xs text-neutral-400 mt-1">
            {formatDistanceToNow(new Date(version.created_at), {
              addSuffix: true,
            })}
          </p>
        </div>
      </div>
    </button>
  );
}

export default function VersionHistoryDrawer({
  open,
  onOpenChange,
  data,
  isLoading,
  selectedVersion,
  onSelectVersion,
  onApproveDraft,
  onDiscardDraft,
  isDraftActionPending,
}: VersionHistoryDrawerProps) {
  const draft = data?.versions.find((v) => v.status === 'draft');
  const nonDraftVersions = data?.versions.filter((v) => v.status !== 'draft') ?? [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[380px] sm:max-w-[380px] p-0">
        <SheetHeader className="p-4 border-b">
          <SheetTitle>Version History</SheetTitle>
          <SheetDescription className="sr-only">
            Browse and restore previous versions of this story
          </SheetDescription>
        </SheetHeader>

        {/* Warning banner */}
        {data?.warning && (
          <div className="mx-4 mt-3 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700">
            {data.warning}
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-6 animate-spin text-neutral-400" />
            <span className="ml-2 text-sm text-neutral-500">Loading versions...</span>
          </div>
        ) : (
          <ScrollArea className="flex-1 overflow-auto">
            <div className="p-4 space-y-4">
              {/* Draft zone */}
              {draft && (
                <DraftZone
                  draft={draft}
                  selected={selectedVersion === draft.version_number}
                  onSelect={() => onSelectVersion(draft.version_number)}
                  onApprove={onApproveDraft}
                  onDiscard={onDiscardDraft}
                  isPending={isDraftActionPending}
                />
              )}

              {/* Version list */}
              <div className="space-y-1">
                {nonDraftVersions.map((version) => (
                  <VersionEntry
                    key={version.version_number}
                    version={version}
                    selected={selectedVersion === version.version_number}
                    onSelect={() => onSelectVersion(version.version_number)}
                  />
                ))}
              </div>

              {/* Load more */}
              {data && data.total > data.versions.length && (
                <div className="text-center pt-2">
                  <Button variant="ghost" size="sm">
                    Load more
                  </Button>
                </div>
              )}
            </div>
          </ScrollArea>
        )}
      </SheetContent>
    </Sheet>
  );
}
