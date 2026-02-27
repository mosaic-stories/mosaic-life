import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useVersions } from '@/features/story/hooks/useVersions';
import { getSourceLabel } from '@/lib/utils/versionLabels';
import { useEvolveWorkspaceStore } from '../store/useEvolveWorkspaceStore';
import { formatDistanceToNow } from 'date-fns';

interface VersionsToolProps {
  storyId: string;
}

export function VersionsTool({ storyId }: VersionsToolProps) {
  const { data, isLoading } = useVersions(storyId, true);
  const setViewMode = useEvolveWorkspaceStore((s) => s.setViewMode);

  if (isLoading) {
    return <div className="p-4 text-sm text-neutral-400">Loading versions...</div>;
  }

  const versions = data?.versions ?? [];

  if (versions.length === 0) {
    return (
      <div className="p-4 text-sm text-neutral-400">
        No versions yet. Save changes or run an AI rewrite to create versions.
      </div>
    );
  }

  return (
    <div className="p-3 space-y-2">
      {versions.map((version) => (
        <div
          key={version.version_number}
          className="flex items-center justify-between p-2 rounded-md border bg-neutral-50 text-sm"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs shrink-0">
                v{version.version_number}
              </Badge>
              {version.status === 'active' && (
                <Badge className="text-xs bg-emerald-100 text-emerald-700">Active</Badge>
              )}
              {version.status === 'draft' && (
                <Badge className="text-xs bg-amber-100 text-amber-700">Draft</Badge>
              )}
            </div>
            <p className="text-xs text-neutral-500 mt-1">
              {getSourceLabel(version.source)} &middot;{' '}
              {formatDistanceToNow(new Date(version.created_at), { addSuffix: true })}
            </p>
            {version.change_summary && (
              <p className="text-xs text-neutral-400 mt-0.5 line-clamp-2">
                {version.change_summary}
              </p>
            )}
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setViewMode('diff');
            }}
            className="shrink-0 text-xs"
          >
            Compare
          </Button>
        </div>
      ))}
    </div>
  );
}
