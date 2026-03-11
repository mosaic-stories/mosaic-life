import { X } from 'lucide-react';

interface TagPillProps {
  label: string;
  onRemove?: () => void;
}

export default function TagPill({ label, onRemove }: TagPillProps) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-stone-600 bg-stone-100 px-2.5 py-1 rounded-full">
      {label}
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="text-stone-400 hover:text-stone-600 transition-colors"
        >
          <X size={10} />
        </button>
      )}
    </span>
  );
}
