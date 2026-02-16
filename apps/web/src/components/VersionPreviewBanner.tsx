import { Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from './ui/alert-dialog';
import { getSourceLabel } from '@/lib/utils/versionLabels';

interface VersionPreviewBannerProps {
  versionNumber: number;
  source: string;
  createdAt: string;
  isActive: boolean;
  onRestore: () => void;
  isRestoring: boolean;
}

export default function VersionPreviewBanner({
  versionNumber,
  source,
  createdAt,
  isActive,
  onRestore,
  isRestoring,
}: VersionPreviewBannerProps) {
  const timeAgo = formatDistanceToNow(new Date(createdAt), { addSuffix: true });

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 mb-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-blue-800">
            Viewing version {versionNumber}
          </span>
          <Badge variant="secondary" className="text-[10px]">
            {getSourceLabel(source)}
          </Badge>
          <span className="text-xs text-blue-600">{timeAgo}</span>
        </div>

        {!isActive && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" disabled={isRestoring}>
                {isRestoring ? (
                  <>
                    <Loader2 className="size-4 animate-spin mr-1" />
                    Restoring...
                  </>
                ) : (
                  'Restore this version'
                )}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will create a new version with the content from version{' '}
                  {versionNumber}. The current active version will be preserved in
                  the history.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={onRestore}>
                  Restore
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </div>
  );
}
