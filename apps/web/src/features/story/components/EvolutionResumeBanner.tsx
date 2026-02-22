import { Button } from '@/components/ui/button';

interface EvolutionResumeBannerProps {
  onContinue: () => void;
}

export default function EvolutionResumeBanner({ onContinue }: EvolutionResumeBannerProps) {
  return (
    <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 flex items-center justify-between">
      <span className="text-sm text-purple-700">
        You have a story evolution in progress.
      </span>
      <Button
        variant="ghost"
        size="sm"
        onClick={onContinue}
      >
        Continue &rarr;
      </Button>
    </div>
  );
}
