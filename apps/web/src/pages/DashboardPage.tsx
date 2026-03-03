import { Plus, Loader2, Users, ArrowRight } from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import Footer from '@/components/Footer';
import { useLegacies } from '@/features/legacy/hooks/useLegacies';
import { formatLegacyDates, getLegacyContext } from '@/features/legacy/api/legacies';
import { rewriteBackendUrlForDev } from '@/lib/url';
import RecentActivitySection from '@/features/activity/components/RecentActivitySection';
import RecentlyViewedSection from '@/features/activity/components/RecentlyViewedSection';
import FavoritesSection from '@/features/favorites/components/FavoritesSection';
import ContextualGreeting from '@/components/dashboard/ContextualGreeting';

export default function DashboardPage() {
  const navigate = useNavigate();
  const { data: myLegacies, isLoading: myLegaciesLoading } = useLegacies({ enabled: true });

  const contextLabels: Record<string, string> = {
    'memorial': 'In Memoriam',
    'living-tribute': 'Living Tribute',
  };

  const contextColors: Record<string, string> = {
    'memorial': 'bg-amber-100 text-amber-800 border-amber-200',
    'living-tribute': 'bg-purple-100 text-purple-800 border-purple-200',
  };

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

            {!myLegaciesLoading && myLegacies?.slice(0, 2).map((legacy) => {
              const dates = formatLegacyDates(legacy);
              const context = getLegacyContext(legacy);
              const memberCount = legacy.members?.length || 0;

              return (
                <Card
                  key={legacy.id}
                  className="overflow-hidden hover:shadow-lg transition-shadow cursor-pointer group"
                  onClick={() => navigate(`/legacy/${legacy.id}`)}
                >
                  <div className="aspect-[4/3] overflow-hidden bg-neutral-100 flex items-center justify-center">
                    {legacy.profile_image_url ? (
                      <img
                        src={rewriteBackendUrlForDev(legacy.profile_image_url)}
                        alt={legacy.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Users className="size-12 text-neutral-300" />
                    )}
                  </div>
                  <div className="p-5 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1 flex-1">
                        <h3 className="text-neutral-900">{legacy.name}</h3>
                        {dates && <p className="text-sm text-neutral-500">{dates}</p>}
                      </div>
                      <Badge variant="outline" className={contextColors[context] || 'bg-neutral-100 text-neutral-800'}>
                        {contextLabels[context] || context}
                      </Badge>
                    </div>
                    {legacy.biography && (
                      <p className="text-sm text-neutral-600 line-clamp-2">{legacy.biography}</p>
                    )}
                    <div className="flex items-center gap-4 pt-2 text-sm text-neutral-500">
                      <span>{memberCount} {memberCount === 1 ? 'member' : 'members'}</span>
                    </div>
                  </div>
                </Card>
              );
            })}

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
