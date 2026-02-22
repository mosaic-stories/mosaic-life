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

export interface DeleteLegacyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  legacyName: string;
  isPending: boolean;
  onConfirm: () => void;
}

export default function DeleteLegacyDialog({
  open,
  onOpenChange,
  legacyName,
  isPending,
  onConfirm,
}: DeleteLegacyDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Legacy</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete "{legacyName}"? This action cannot be undone.
            All stories and media associated with this legacy will be permanently deleted.
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
                Delete Legacy
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
