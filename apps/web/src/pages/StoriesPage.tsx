import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PenLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import Footer from '@/components/Footer';
import StoryStatsBar from '@/components/stories-hub/StoryStatsBar';
import TopLegaciesChips from '@/components/stories-hub/TopLegaciesChips';
import AllStoriesTabContent from '@/components/stories-hub/AllStoriesTabContent';
import DraftsTabContent from '@/components/stories-hub/DraftsTabContent';
import StoryActivityTabContent from '@/components/stories-hub/StoryActivityTabContent';
import LegacyPickerDialog from '@/components/stories-hub/LegacyPickerDialog';

const DEFAULT_TAB = 'all-stories';
const DEFAULT_FILTERS: Record<string, string> = {
  'all-stories': 'all',
  drafts: 'all',
  activity: 'all',
};
const VALID_FILTERS: Record<string, string[]> = {
  'all-stories': ['all', 'mine', 'shared', 'favorites'],
  drafts: ['all'],
  activity: ['all', 'mine'],
};

export default function StoriesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [pickerOpen, setPickerOpen] = useState(false);

  const activeTab = searchParams.get('tab') || DEFAULT_TAB;
  const rawFilter = searchParams.get('filter');
  const defaultFilter = DEFAULT_FILTERS[activeTab] || 'all';
  const validFilters = VALID_FILTERS[activeTab] ?? [];
  const activeFilter = rawFilter && validFilters.includes(rawFilter) ? rawFilter : defaultFilter;

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
              <h1 className="text-2xl font-bold text-neutral-900">Stories</h1>
              <p className="text-neutral-600 text-sm">
                Your stories, drafts, and writing activity.
              </p>
            </div>
            <Button
              onClick={() => setPickerOpen(true)}
              className="gap-2 bg-theme-primary hover:bg-theme-primary-dark"
            >
              <PenLine className="size-4" />
              Write a Story
            </Button>
          </div>

          {/* Stats */}
          <StoryStatsBar />

          {/* Top Legacies */}
          <TopLegaciesChips />

          {/* Tabbed Content */}
          <Tabs value={activeTab} onValueChange={handleTabChange}>
            <TabsList>
              <TabsTrigger value="all-stories">All Stories</TabsTrigger>
              <TabsTrigger value="drafts">Drafts</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
            </TabsList>

            <TabsContent value="all-stories">
              <AllStoriesTabContent
                activeFilter={activeFilter}
                onFilterChange={handleFilterChange}
              />
            </TabsContent>

            <TabsContent value="drafts">
              <DraftsTabContent />
            </TabsContent>

            <TabsContent value="activity">
              <StoryActivityTabContent
                activeFilter={activeFilter}
                onFilterChange={handleFilterChange}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <LegacyPickerDialog open={pickerOpen} onOpenChange={setPickerOpen} />
      <Footer />
    </div>
  );
}
