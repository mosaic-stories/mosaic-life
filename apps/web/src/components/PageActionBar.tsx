import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

interface PageActionBarProps {
  backLabel: string;
  backTo: string;
  children?: React.ReactNode;
}

export default function PageActionBar({ backLabel, backTo, children }: PageActionBarProps) {
  return (
    <div className="border-b bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2 flex items-center justify-between gap-4">
        <Link
          to={backTo}
          className="flex items-center gap-2 text-sm text-neutral-600 hover:text-neutral-900 transition-colors min-w-0"
        >
          <ArrowLeft className="size-4 shrink-0" />
          <span className="truncate">{backLabel}</span>
        </Link>
        {children && (
          <div className="flex items-center gap-2 shrink-0">
            {children}
          </div>
        )}
      </div>
    </div>
  );
}
