import { Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export interface DeleteStoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storyTitle: string;
  versionCount: number;
  isPending: boolean;
  onConfirm: () => void;
}

export default function DeleteStoryDialog({
  open,
  onOpenChange,
  storyTitle,
  versionCount,
  isPending,
  onConfirm,
}: DeleteStoryDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Story</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete &ldquo;{storyTitle}&rdquo;? This
            story has{' '}
            <strong>
              {versionCount} {versionCount === 1 ? 'version' : 'versions'}
            </strong>{' '}
            that will all be permanently deleted. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isPending}
            className="bg-red-600 hover:bg-red-700"
          >
            {isPending ? (
              <>
                <Loader2 className="size-4 mr-2 animate-spin" />
                Deleting...
              </>
            ) : (
              <>
                <Trash2 className="size-4 mr-2" />
                Delete Story
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
