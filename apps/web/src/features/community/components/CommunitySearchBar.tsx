import { Search, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type TabValue = 'all' | 'joined' | 'discover';

interface CommunitySearchBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  selectedTab: TabValue;
  onTabChange: (tab: TabValue) => void;
  joinedCount: number;
  onCreateClick: () => void;
}

export default function CommunitySearchBar({
  searchQuery,
  onSearchChange,
  selectedTab,
  onTabChange,
  joinedCount,
  onCreateClick,
}: CommunitySearchBarProps) {
  const tabs: { value: TabValue; label: string }[] = [
    { value: 'all', label: 'All Communities' },
    { value: 'joined', label: `My Communities (${joinedCount})` },
    { value: 'discover', label: 'Discover' },
  ];

  return (
    <>
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between mb-8">
        <div className="relative flex-1 w-full max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-5 text-neutral-400" />
          <Input
            placeholder="Search communities..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button
          onClick={onCreateClick}
          className="gap-2 bg-theme-primary hover:bg-theme-primary-dark w-full md:w-auto"
        >
          <Plus className="size-4" />
          Create Community
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => onTabChange(tab.value)}
            className={`px-4 py-2 border-b-2 transition-colors ${
              selectedTab === tab.value
                ? 'border-theme-primary text-theme-primary'
                : 'border-transparent text-neutral-600 hover:text-neutral-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </>
  );
}
