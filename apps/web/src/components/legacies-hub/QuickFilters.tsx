import { cn } from '@/components/ui/utils';

export interface FilterOption {
  key: string;
  label: string;
  count?: number;
}

interface QuickFiltersProps {
  options: FilterOption[];
  activeKey: string;
  onChange: (key: string) => void;
}

export default function QuickFilters({ options, activeKey, onChange }: QuickFiltersProps) {
  return (
    <div className="flex gap-2 flex-wrap" role="group" aria-label="Quick filters">
      {options.map((option) => (
        <button
          key={option.key}
          onClick={() => onChange(option.key)}
          aria-pressed={activeKey === option.key}
          className={cn(
            'px-4 py-1.5 rounded-full text-sm font-medium transition-colors',
            activeKey === option.key
              ? 'bg-theme-primary text-white'
              : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200',
          )}
        >
          {option.label}
          {option.count !== undefined && (
            <span className="ml-1.5 text-xs opacity-75">{option.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}
