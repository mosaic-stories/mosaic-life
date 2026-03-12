import { Search, ArrowUpDown, Grid3X3, List } from 'lucide-react';
import QuickFilters from './QuickFilters';
import type { FilterOption } from './QuickFilters';
import { cn } from '@/components/ui/utils';

export interface SortOption {
  value: string;
  label: string;
}

export type ViewMode = 'grid' | 'list';

interface ToolbarProps {
  filterOptions: FilterOption[];
  activeFilter: string;
  onFilterChange: (key: string) => void;
  sortOptions: SortOption[];
  sortValue: string;
  onSortChange: (value: string) => void;
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
}

export default function Toolbar({
  filterOptions,
  activeFilter,
  onFilterChange,
  sortOptions,
  sortValue,
  onSortChange,
  searchValue,
  onSearchChange,
  searchPlaceholder,
  viewMode,
  onViewModeChange,
}: ToolbarProps) {
  return (
    <div className="flex flex-wrap justify-between items-center gap-4">
      <QuickFilters options={filterOptions} activeKey={activeFilter} onChange={onFilterChange} />

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <ArrowUpDown className="size-3.5 text-neutral-400" />
          <select
            value={sortValue}
            onChange={(e) => onSortChange(e.target.value)}
            className="border border-stone-200 rounded-lg px-3 py-1.5 text-sm text-neutral-700 bg-white cursor-pointer outline-none focus:ring-2 focus:ring-theme-primary/20"
          >
            {sortOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 bg-white border border-stone-200 rounded-lg px-3 py-1.5 w-52">
          <Search className="size-4 text-neutral-400" />
          <input
            placeholder={searchPlaceholder ?? 'Search...'}
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            className="border-none outline-none flex-1 text-sm text-neutral-900 bg-transparent placeholder:text-neutral-400"
          />
        </div>

        <div className="flex bg-white border border-stone-200 rounded-lg overflow-hidden">
          <button
            onClick={() => onViewModeChange('grid')}
            className={cn('p-2 flex', viewMode === 'grid' ? 'bg-stone-100' : 'hover:bg-stone-50')}
            aria-label="Grid view"
          >
            <Grid3X3 className={cn('size-4', viewMode === 'grid' ? 'text-neutral-700' : 'text-neutral-400')} />
          </button>
          <button
            onClick={() => onViewModeChange('list')}
            className={cn('p-2 flex', viewMode === 'list' ? 'bg-stone-100' : 'hover:bg-stone-50')}
            aria-label="List view"
          >
            <List className={cn('size-4', viewMode === 'list' ? 'text-neutral-700' : 'text-neutral-400')} />
          </button>
        </div>
      </div>
    </div>
  );
}
