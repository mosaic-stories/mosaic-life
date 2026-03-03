import { useNavigate } from 'react-router-dom';
import { Users, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useLegacies } from '@/features/legacy/hooks/useLegacies';
import { rewriteBackendUrlForDev } from '@/lib/url';

interface LegacyPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function LegacyPickerDialog({ open, onOpenChange }: LegacyPickerDialogProps) {
  const navigate = useNavigate();
  const { data, isLoading } = useLegacies('all', { enabled: open });

  const handleSelect = (legacyId: string) => {
    onOpenChange(false);
    navigate(`/legacy/${legacyId}/story/new`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Choose a Legacy</DialogTitle>
          <DialogDescription>
            Select which legacy this story is about.
          </DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-6 animate-spin text-theme-primary" />
          </div>
        )}

        {!isLoading && data && (
          <div className="max-h-[300px] overflow-y-auto space-y-1">
            {data.items.map((legacy) => (
              <button
                key={legacy.id}
                onClick={() => handleSelect(legacy.id)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-neutral-100 transition-colors text-left"
              >
                <div className="size-10 rounded-full overflow-hidden bg-neutral-100 flex-shrink-0">
                  {legacy.profile_image_url ? (
                    <img
                      src={rewriteBackendUrlForDev(legacy.profile_image_url)}
                      alt={legacy.name}
                      className="size-full object-cover"
                    />
                  ) : (
                    <div className="size-full flex items-center justify-center">
                      <Users className="size-4 text-neutral-300" />
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-neutral-900 truncate">{legacy.name}</p>
                </div>
              </button>
            ))}

            {data.items.length === 0 && (
              <p className="text-sm text-neutral-500 text-center py-4">
                No legacies found. Create a legacy first.
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
