import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { useVersions } from '@/features/story/hooks/useVersions';
import { getVersion } from '@/features/story/api/versions';
import { getSourceLabel } from '@/lib/utils/versionLabels';
import { useEvolveWorkspaceStore } from '../store/useEvolveWorkspaceStore';
import { formatDistanceToNow } from 'date-fns';

interface VersionsToolProps {
  storyId: string;
  currentContent: string;
}

export function VersionsTool({ storyId, currentContent }: VersionsToolProps) {
  const { data, isLoading } = useVersions(storyId, true);
  const rewriteState = useEvolveWorkspaceStore((s) => s.rewriteState);
  const compareState = useEvolveWorkspaceStore((s) => s.compareState);
  const compareVersionNumber = useEvolveWorkspaceStore((s) => s.compareVersionNumber);
  const startCompare = useEvolveWorkspaceStore((s) => s.startCompare);
  const [loadingVersion, setLoadingVersion] = useState<number | null>(null);

  const handleCompare = async (versionNumber: number) => {
    setLoadingVersion(versionNumber);
    try {
      const detail = await getVersion(storyId, versionNumber);
      startCompare(versionNumber, detail.content, currentContent);
    } catch (err) {
      console.error('Failed to load version for comparison:', err);
    } finally {
      setLoadingVersion(null);
    }
  };

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

  const isCompareDisabled = rewriteState !== 'idle';

  return (
    <div className="p-3 space-y-2">
      {versions.map((version) => {
        const isActive = version.status === 'active';
        const isCurrentlyCompared =
          compareState === 'comparing' && compareVersionNumber === version.version_number;
        const isLoadingThis = loadingVersion === version.version_number;

        return (
          <div
            key={version.version_number}
            className={`flex items-center justify-between p-2 rounded-md border text-sm ${
              isCurrentlyCompared
                ? 'border-theme-primary bg-theme-primary/5'
                : 'bg-neutral-50'
            }`}
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
              variant={isCurrentlyCompared ? 'default' : 'ghost'}
              onClick={() => handleCompare(version.version_number)}
              disabled={isCompareDisabled || isActive || isLoadingThis}
              className="shrink-0 text-xs"
            >
              {isLoadingThis ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : isCurrentlyCompared ? (
                'Comparing'
              ) : (
                'Compare'
              )}
            </Button>
          </div>
        );
      })}
    </div>
  );
}
