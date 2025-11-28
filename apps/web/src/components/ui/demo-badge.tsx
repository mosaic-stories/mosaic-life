import { Badge } from './badge';

interface DemoBadgeProps {
  className?: string;
}

/**
 * DemoBadge - Visual indicator for features that use mock/demo data
 *
 * Used throughout the app to clearly indicate which features are
 * demonstrating functionality with placeholder data rather than
 * connecting to real backend APIs.
 */
export function DemoBadge({ className = '' }: DemoBadgeProps) {
  return (
    <Badge className={`bg-amber-100 text-amber-800 border-amber-300 text-xs ${className}`}>
      Demo
    </Badge>
  );
}

export default DemoBadge;
