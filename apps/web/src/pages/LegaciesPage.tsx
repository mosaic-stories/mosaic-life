import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import Footer from '@/components/Footer';
import StatsBar from '@/components/legacies-hub/StatsBar';
import RecentlyViewedChips from '@/components/legacies-hub/RecentlyViewedChips';
import LegaciesTabContent from '@/components/legacies-hub/LegaciesTabContent';
import StoriesTabContent from '@/components/legacies-hub/StoriesTabContent';
import ActivityTabContent from '@/components/legacies-hub/ActivityTabContent';

const DEFAULT_TAB = 'legacies';
const DEFAULT_FILTERS: Record<string, string> = {
  legacies: 'all',
  stories: 'mine',
  activity: 'all',
};

export default function LegaciesPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const activeTab = searchParams.get('tab') || DEFAULT_TAB;
  const activeFilter = searchParams.get('filter') || DEFAULT_FILTERS[activeTab] || 'all';

  const handleTabChange = (tab: string) => {
    setSearchParams({ tab, filter: DEFAULT_FILTERS[tab] || 'all' });
  };

  const handleFilterChange = (filter: string) => {
    setSearchParams({ tab: activeTab, filter });
  };

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1">
        <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h1 className="text-2xl font-bold text-neutral-900">Legacies</h1>
              <p className="text-neutral-600 text-sm">
                Your collection of legacies, stories, and connections.
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

          {/* Recently Viewed */}
          <RecentlyViewedChips />

          {/* Tabbed Content */}
          <Tabs value={activeTab} onValueChange={handleTabChange}>
            <TabsList>
              <TabsTrigger value="legacies">Legacies</TabsTrigger>
              <TabsTrigger value="stories">Stories</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
            </TabsList>

            <TabsContent value="legacies">
              <LegaciesTabContent
                activeFilter={activeFilter}
                onFilterChange={handleFilterChange}
              />
            </TabsContent>

            <TabsContent value="stories">
              <StoriesTabContent
                activeFilter={activeFilter}
                onFilterChange={handleFilterChange}
              />
            </TabsContent>

            <TabsContent value="activity">
              <ActivityTabContent
                activeFilter={activeFilter}
                onFilterChange={handleFilterChange}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <Footer />
    </div>
  );
}
