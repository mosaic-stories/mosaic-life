import { Plus, Loader2, ArrowRight } from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import Footer from '@/components/Footer';
import { useLegacies } from '@/features/legacy/hooks/useLegacies';
import RecentActivitySection from '@/features/activity/components/RecentActivitySection';
import RecentlyViewedSection from '@/features/activity/components/RecentlyViewedSection';
import FavoritesSection from '@/features/favorites/components/FavoritesSection';
import ContextualGreeting from '@/components/dashboard/ContextualGreeting';
import LegacyCard from '@/components/legacy/LegacyCard';

export default function DashboardPage() {
  const navigate = useNavigate();
  const { data: myLegacies, isLoading: myLegaciesLoading } = useLegacies({ enabled: true });

  return (
    <div className="min-h-screen flex flex-col">
      <ContextualGreeting />

      <RecentlyViewedSection
        entityType="legacy"
        title="Recently Viewed Legacies"
        description="Legacies you've visited recently"
      />

      {/* My Legacies */}
      <section className="bg-neutral-50 py-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-center justify-between mb-8">
            <div className="space-y-2">
              <h2 className="text-neutral-900">My Legacies</h2>
              <p className="text-neutral-600">The tributes you've created and manage</p>
            </div>
            <Button
              onClick={() => navigate('/legacy/new')}
              className="gap-2 bg-theme-primary hover:bg-theme-primary-dark"
            >
              <Plus className="size-4" />
              Create New
            </Button>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {myLegaciesLoading && (
              <div className="col-span-full flex items-center justify-center py-12">
                <Loader2 className="size-6 animate-spin text-theme-primary" />
              </div>
            )}

            {!myLegaciesLoading && myLegacies?.slice(0, 2).map((legacy) => (
              <LegacyCard key={legacy.id} legacy={legacy} />
            ))}

            {/* Create New Card */}
            <Card
              className="overflow-hidden hover:shadow-lg transition-shadow cursor-pointer group border-2 border-dashed border-neutral-300 hover:border-theme-primary bg-neutral-50 hover:bg-white"
              onClick={() => navigate('/legacy/new')}
            >
              <div className="aspect-[4/3] flex items-center justify-center bg-gradient-to-br from-theme-gradient-from to-theme-gradient-to">
                <div className="text-center space-y-3">
                  <div className="size-16 rounded-full bg-white/80 flex items-center justify-center mx-auto">
                    <Plus className="size-8 text-theme-primary" />
                  </div>
                  <p className="text-neutral-700">Create New Legacy</p>
                </div>
              </div>
              <div className="p-5 space-y-3">
                <h3 className="text-neutral-900 text-center">Start a New Tribute</h3>
                <p className="text-sm text-neutral-600 text-center">
                  Honor someone special with a digital legacy
                </p>
              </div>
            </Card>
          </div>

          {!myLegaciesLoading && myLegacies && myLegacies.length > 2 && (
            <div className="mt-6 text-center">
              <Link
                to="/legacies"
                className="text-sm text-theme-primary hover:text-theme-primary-dark font-medium inline-flex items-center gap-1"
              >
                View all {myLegacies.length} legacies
                <ArrowRight className="size-4" />
              </Link>
            </div>
          )}
        </div>
      </section>

      <RecentlyViewedSection
        entityType="story"
        title="Recently Viewed Stories"
        description="Stories you've read recently"
      />

      <RecentActivitySection />

      <FavoritesSection />

      <Footer />
    </div>
  );
}
