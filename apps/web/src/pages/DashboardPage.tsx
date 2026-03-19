import { Loader2, ArrowRight, Plus, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import Footer from '@/components/Footer';
import { Card } from '@/components/ui/card';
import { useLegacies } from '@/features/legacy/hooks/useLegacies';
import ContextualGreeting from '@/components/dashboard/ContextualGreeting';
import LegacyCard from '@/components/legacy/LegacyCard';
import StoryPromptCard from '@/features/story-prompts/components/StoryPromptCard';
import RecentStoriesList from '@/components/dashboard/RecentStoriesList';
import QuickActions from '@/components/dashboard/QuickActions';
import SidebarActivity from '@/components/dashboard/SidebarActivity';
import SidebarFavorites from '@/components/dashboard/SidebarFavorites';
import PeopleSearch from '@/features/user-search/components/PeopleSearch';

export default function DashboardPage() {
  const { data: myLegaciesData, isLoading: myLegaciesLoading } = useLegacies('all', { enabled: true });
  const myLegacies = myLegaciesData?.items;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Hero */}
      <ContextualGreeting />

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 pb-16 w-full">
        <div className="grid lg:grid-cols-[minmax(0,1fr)_340px] gap-8 mt-8">

          {/* LEFT COLUMN */}
          <div className="min-w-0 space-y-8">
            <StoryPromptCard />

            {/* My Legacies */}
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-serif font-medium tracking-tight">My Legacies</h2>
                <Link
                  to="/legacies"
                  className="text-xs text-theme-primary font-medium hover:underline"
                >
                  View all
                </Link>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {myLegaciesLoading && (
                  <div className="col-span-full flex items-center justify-center py-12">
                    <Loader2 className="size-6 animate-spin text-theme-primary" />
                  </div>
                )}

                {!myLegaciesLoading && myLegacies?.slice(0, 2).map((legacy) => (
                  <LegacyCard key={legacy.id} legacy={legacy} hideContextBadge />
                ))}

                {!myLegaciesLoading && (!myLegacies || myLegacies.length === 0) && (
                  <Link to="/legacy/new" aria-label="Create a Legacy">
                    <Card className="group flex aspect-[4/3] items-center justify-center border-2 border-dashed border-neutral-300 bg-neutral-50 transition-colors hover:border-theme-primary hover:bg-white hover:shadow-lg">
                      <div className="text-center">
                        <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-full bg-white text-theme-primary shadow-sm transition-transform group-hover:scale-105">
                          <Plus className="size-7" />
                        </div>
                        <div className="text-sm font-medium text-neutral-800">Create a Legacy</div>
                        <div className="mt-1 text-xs text-neutral-500">Start a new memory space</div>
                      </div>
                    </Card>
                  </Link>
                )}
              </div>

              {!myLegaciesLoading && myLegacies && myLegacies.length > 2 && (
                <div className="mt-4 text-center">
                  <Link
                    to="/legacies"
                    className="text-sm text-theme-primary hover:text-theme-primary-dark font-medium inline-flex items-center gap-1"
                  >
                    View all {myLegacies.length} legacies
                    <ArrowRight className="size-4" />
                  </Link>
                </div>
              )}
            </section>

            <RecentStoriesList />
          </div>

          {/* RIGHT SIDEBAR */}
          <div className="min-w-0 space-y-5 lg:sticky lg:top-20 lg:self-start">
            <QuickActions />

            {/* Find People */}
            <Card className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Users className="size-4 text-theme-primary" />
                <h3 className="text-sm font-medium text-neutral-900">Find People</h3>
              </div>
              <PeopleSearch variant="compact" />
            </Card>

            <SidebarActivity />
            <SidebarFavorites />
          </div>

        </div>
      </div>

      <Footer />
    </div>
  );
}
