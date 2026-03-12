import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/utils';
import Footer from '@/components/Footer';
import StatsBar from '@/components/legacies-hub/StatsBar';
import LegaciesTabContent from '@/components/legacies-hub/LegaciesTabContent';
import StoriesTabContent from '@/components/legacies-hub/StoriesTabContent';
import ActivityTabContent from '@/components/legacies-hub/ActivityTabContent';
import { useStats } from '@/features/settings/hooks/useSettings';
import type { ViewMode } from '@/components/legacies-hub/Toolbar';

const DEFAULT_TAB = 'legacies';
const DEFAULT_VIEW_MODE: ViewMode = 'grid';
const VALID_VIEW_MODES: ViewMode[] = ['grid', 'list'];
const DEFAULT_FILTERS: Record<string, string> = {
  legacies: 'all',
  stories: 'all',
  activity: 'all',
};
const VALID_FILTERS: Record<string, string[]> = {
  legacies: ['all', 'created', 'connected', 'favorites'],
  stories: ['all', 'mine', 'favorites', 'public', 'private'],
  activity: ['all', 'mine'],
};
const DEFAULT_SORTS: Record<string, string> = {
  legacies: 'recent',
  stories: 'recent',
  activity: 'recent',
};
const VALID_SORTS: Record<string, string[]> = {
  legacies: ['recent', 'stories', 'members', 'alpha'],
  stories: ['recent', 'edited', 'loved', 'longest', 'alpha'],
  activity: ['recent'],
};

export default function LegaciesPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: stats } = useStats();

  const activeTab = searchParams.get('tab') || DEFAULT_TAB;
  const rawFilter = searchParams.get('filter');
  const defaultFilter = DEFAULT_FILTERS[activeTab] || 'all';
  const validFilters = VALID_FILTERS[activeTab] ?? [];
  const activeFilter = rawFilter && validFilters.includes(rawFilter) ? rawFilter : defaultFilter;
  const rawViewMode = searchParams.get('view');
  const viewMode = rawViewMode && VALID_VIEW_MODES.includes(rawViewMode as ViewMode)
    ? (rawViewMode as ViewMode)
    : DEFAULT_VIEW_MODE;
  const rawSort = searchParams.get('sort');
  const defaultSort = DEFAULT_SORTS[activeTab] || 'recent';
  const validSorts = VALID_SORTS[activeTab] ?? [];
  const sortBy = rawSort && validSorts.includes(rawSort) ? rawSort : defaultSort;
  const searchQuery = searchParams.get('search') || '';

  const updateSearchParams = (updates: Record<string, string | null>) => {
    const nextParams = new URLSearchParams(searchParams);

    Object.entries(updates).forEach(([key, value]) => {
      if (!value) {
        nextParams.delete(key);
        return;
      }

      nextParams.set(key, value);
    });

    setSearchParams(nextParams);
  };

  const handleTabChange = (tab: string) => {
    updateSearchParams({
      tab,
      filter: DEFAULT_FILTERS[tab] || 'all',
      sort: DEFAULT_SORTS[tab] || 'recent',
    });
  };

  const handleFilterChange = (filter: string) => {
    updateSearchParams({ tab: activeTab, filter });
  };

  const handleViewModeChange = (nextViewMode: ViewMode) => {
    updateSearchParams({ view: nextViewMode === DEFAULT_VIEW_MODE ? null : nextViewMode });
  };

  const handleSortChange = (nextSort: string) => {
    updateSearchParams({ sort: nextSort === defaultSort ? null : nextSort });
  };

  const handleSearchChange = (nextSearch: string) => {
    updateSearchParams({ search: nextSearch.trim() ? nextSearch : null });
  };

  const tabs = [
    { id: 'legacies', label: 'Legacies', count: stats?.legacies_count },
    { id: 'stories', label: 'Stories', count: stats?.stories_count },
    { id: 'activity', label: 'Activity', count: undefined },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1">
        {/* Gradient header zone */}
        <div className="bg-gradient-to-b from-stone-100 to-stone-50 border-b border-stone-200">
          <div className="max-w-7xl mx-auto px-6 pt-6 pb-0">
            {/* Breadcrumb */}
            <div className="flex items-center gap-1 text-xs text-neutral-400 mb-4">
              <span>Home</span>
              <ChevronRight className="size-3" />
              <span className="text-neutral-600 font-medium">Legacies</span>
            </div>

            {/* Header row */}
            <div className="flex items-start justify-between mb-6">
              <div className="space-y-1">
                <h1 className="text-2xl font-bold text-neutral-900">Your Legacies</h1>
                <p className="text-neutral-500 text-sm">
                  The stories and memories that keep them close.
                </p>
              </div>
              <Button
                onClick={() => navigate('/legacy/new')}
                className="gap-2 bg-theme-primary hover:bg-theme-primary-dark"
              >
                <Plus className="size-4" />
                New Legacy
              </Button>
            </div>

            {/* Stats */}
            <StatsBar />

            {/* Tab bar */}
            <div role="tablist" className="flex items-end gap-1 mt-6">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className={cn(
                    'px-5 pb-3 text-sm transition-colors flex items-center gap-2',
                    activeTab === tab.id
                      ? 'border-b-2 border-theme-primary font-semibold text-neutral-900'
                      : 'border-b-2 border-transparent text-neutral-400 hover:text-neutral-600',
                  )}
                >
                  {tab.label}
                  {tab.count != null && (
                    <span
                      className={cn(
                        'text-xs font-semibold px-2 py-0.5 rounded-full',
                        activeTab === tab.id
                          ? 'bg-theme-primary text-white'
                          : 'bg-stone-200 text-neutral-500',
                      )}
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Tab content */}
        <div className="max-w-7xl mx-auto px-6 py-8">
          {activeTab === 'legacies' && (
            <LegaciesTabContent
              activeFilter={activeFilter}
              onFilterChange={handleFilterChange}
              viewMode={viewMode}
              onViewModeChange={handleViewModeChange}
              sortBy={sortBy}
              onSortChange={handleSortChange}
              searchQuery={searchQuery}
              onSearchChange={handleSearchChange}
            />
          )}
          {activeTab === 'stories' && (
            <StoriesTabContent
              activeFilter={activeFilter}
              onFilterChange={handleFilterChange}
              viewMode={viewMode}
              onViewModeChange={handleViewModeChange}
              sortBy={sortBy}
              onSortChange={handleSortChange}
              searchQuery={searchQuery}
              onSearchChange={handleSearchChange}
            />
          )}
          {activeTab === 'activity' && (
            <ActivityTabContent
              activeFilter={activeFilter}
              onFilterChange={handleFilterChange}
            />
          )}
        </div>
      </div>

      <Footer />
    </div>
  );
}
