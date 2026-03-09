import { Loader2, ArrowRight } from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import Footer from '@/components/Footer';
import { useLegacies } from '@/features/legacy/hooks/useLegacies';
import ContextualGreeting from '@/components/dashboard/ContextualGreeting';
import LegacyCard from '@/components/legacy/LegacyCard';
import StoryPromptCard from '@/features/story-prompts/components/StoryPromptCard';
import RecentStoriesList from '@/components/dashboard/RecentStoriesList';
import QuickActions from '@/components/dashboard/QuickActions';
import SidebarActivity from '@/components/dashboard/SidebarActivity';
import SidebarFavorites from '@/components/dashboard/SidebarFavorites';

export default function DashboardPage() {
  const navigate = useNavigate();
  const { data: myLegaciesData, isLoading: myLegaciesLoading } = useLegacies('all', { enabled: true });
  const myLegacies = myLegaciesData?.items;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Hero */}
      <ContextualGreeting />

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 pb-16 w-full">
        <div className="grid lg:grid-cols-[1fr_340px] gap-8 mt-8">

          {/* LEFT COLUMN */}
          <div className="space-y-8">
            <StoryPromptCard />

            {/* My Legacies */}
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-serif font-medium tracking-tight">My Legacies</h2>
                <span
                  onClick={() => navigate('/legacies')}
                  className="text-xs text-theme-primary font-medium cursor-pointer hover:underline"
                >
                  View all
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {myLegaciesLoading && (
                  <div className="col-span-full flex items-center justify-center py-12">
                    <Loader2 className="size-6 animate-spin text-theme-primary" />
                  </div>
                )}

                {!myLegaciesLoading && myLegacies?.slice(0, 2).map((legacy) => (
                  <LegacyCard key={legacy.id} legacy={legacy} />
                ))}
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
          <div className="space-y-5 lg:sticky lg:top-20 lg:self-start">
            <QuickActions />
            <SidebarActivity />
            <SidebarFavorites />
          </div>

        </div>
      </div>

      <Footer />
    </div>
  );
}
