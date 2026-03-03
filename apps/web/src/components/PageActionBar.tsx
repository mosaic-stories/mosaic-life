import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

interface PageActionBarProps {
  backLabel: string;
  /** Provide backTo for a link, or onBack for a button (e.g. navigate(-1)). */
  backTo?: string;
  onBack?: () => void;
  children?: React.ReactNode;
}

export default function PageActionBar({ backLabel, backTo, onBack, children }: PageActionBarProps) {
  const backContent = (
    <>
      <ArrowLeft className="size-4 shrink-0" />
      <span className="truncate">{backLabel}</span>
    </>
  );

  const backElement = backTo ? (
    <Link
      to={backTo}
      className="flex items-center gap-2 text-sm text-neutral-600 hover:text-neutral-900 transition-colors min-w-0"
    >
      {backContent}
    </Link>
  ) : (
    <button
      onClick={onBack}
      className="flex items-center gap-2 text-sm text-neutral-600 hover:text-neutral-900 transition-colors min-w-0"
    >
      {backContent}
    </button>
  );

  return (
    <div className="border-b bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2 flex items-center justify-between gap-4">
        {backElement}
        {children && (
          <div className="flex items-center gap-2 shrink-0">
            {children}
          </div>
        )}
      </div>
    </div>
  );
}
