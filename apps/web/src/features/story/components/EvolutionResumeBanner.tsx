import { Button } from '@/components/ui/button';
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
} from '@/components/ui/alert-dialog';

interface EvolutionResumeBannerProps {
  onContinue: () => void;
  onDiscard: () => void;
  isDiscarding?: boolean;
}

export default function EvolutionResumeBanner({
  onContinue,
  onDiscard,
  isDiscarding = false,
}: EvolutionResumeBannerProps) {
  return (
    <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 flex items-center justify-between">
      <span className="text-sm text-purple-700">
        You have a story evolution in progress.
      </span>
      <div className="flex items-center gap-2">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              disabled={isDiscarding}
            >
              Discard
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Discard this evolution session?</AlertDialogTitle>
              <AlertDialogDescription>
                This will discard the session. The original story will be unchanged.
                This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={onDiscard}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Discard session
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <Button
          variant="ghost"
          size="sm"
          onClick={onContinue}
          disabled={isDiscarding}
        >
          Continue &rarr;
        </Button>
      </div>
    </div>
  );
}
