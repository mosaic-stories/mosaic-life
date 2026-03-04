import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import Footer from '@/components/Footer';
import ConnectionsStatsBar from '@/components/connections-hub/ConnectionsStatsBar';
import TopConnectionsChips from '@/components/connections-hub/TopConnectionsChips';
import FavoritePersonasChips from '@/components/connections-hub/FavoritePersonasChips';
import PersonasTabContent from '@/components/connections-hub/PersonasTabContent';
import PeopleTabContent from '@/components/connections-hub/PeopleTabContent';
import ConnectionsActivityTabContent from '@/components/connections-hub/ConnectionsActivityTabContent';
import NewConversationDialog from '@/components/connections-hub/NewConversationDialog';

const DEFAULT_TAB = 'personas';
const DEFAULT_FILTERS: Record<string, string> = {
  personas: 'all',
  people: 'all',
  activity: 'all',
};
// Static whitelists for tabs with a fixed set of filter values.
// Tabs absent from this map (e.g. "personas") accept any filter value since
// their options are data-driven from the personas API.
const STATIC_VALID_FILTERS: Record<string, string[]> = {
  people: ['all', 'co_creators', 'collaborators'],
  activity: ['all', 'mine'],
};

export default function ConnectionsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [pickerOpen, setPickerOpen] = useState(false);

  const activeTab = searchParams.get('tab') || DEFAULT_TAB;
  const rawFilter = searchParams.get('filter');
  const defaultFilter = DEFAULT_FILTERS[activeTab] || 'all';
  const staticValidFilters = STATIC_VALID_FILTERS[activeTab];
  // For tabs with a static whitelist, validate the filter value.
  // For data-driven tabs (personas), accept any non-null filter from the URL.
  const activeFilter =
    rawFilter && (!staticValidFilters || staticValidFilters.includes(rawFilter))
      ? rawFilter
      : defaultFilter;

  const handleTabChange = (tab: string) => {
    setSearchParams({ tab, filter: DEFAULT_FILTERS[tab] || 'all' });
  };

  const handleFilterChange = (filter: string) => {
    setSearchParams({ tab: activeTab, filter });
  };

  const handlePersonaChipClick = (personaId: string) => {
    setSearchParams({ tab: 'personas', filter: personaId });
  };

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1">
        <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h1 className="text-2xl font-bold text-neutral-900">Connections</h1>
              <p className="text-neutral-600 text-sm">
                Your personas, people, and conversations.
              </p>
            </div>
            <Button
              onClick={() => setPickerOpen(true)}
              className="gap-2 bg-theme-primary hover:bg-theme-primary-dark"
            >
              <MessageCircle className="size-4" />
              New Chat
            </Button>
          </div>

          {/* Stats */}
          <ConnectionsStatsBar />

          {/* Top Connections */}
          <TopConnectionsChips />

          {/* Favorite Personas */}
          <FavoritePersonasChips onPersonaClick={handlePersonaChipClick} />

          {/* Tabbed Content */}
          <Tabs value={activeTab} onValueChange={handleTabChange}>
            <TabsList>
              <TabsTrigger value="personas">Personas</TabsTrigger>
              <TabsTrigger value="people">People</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
            </TabsList>

            <TabsContent value="personas">
              <PersonasTabContent
                activeFilter={activeFilter}
                onFilterChange={handleFilterChange}
              />
            </TabsContent>

            <TabsContent value="people">
              <PeopleTabContent
                activeFilter={activeFilter}
                onFilterChange={handleFilterChange}
              />
            </TabsContent>

            <TabsContent value="activity">
              <ConnectionsActivityTabContent
                activeFilter={activeFilter}
                onFilterChange={handleFilterChange}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <NewConversationDialog open={pickerOpen} onOpenChange={setPickerOpen} />
      <Footer />
    </div>
  );
}
