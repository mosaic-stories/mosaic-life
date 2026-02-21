import { Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface VersionHistoryButtonProps {
  versionCount: number | null;
  onClick: () => void;
}

export default function VersionHistoryButton({
  versionCount,
  onClick,
}: VersionHistoryButtonProps) {
  if (!versionCount || versionCount <= 1) return null;

  return (
    <Button
      variant="ghost"
      size="sm"
      className="gap-2"
      onClick={onClick}
      aria-label="History"
    >
      <Clock className="size-4" />
      History
    </Button>
  );
}
