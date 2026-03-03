import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Loader2, Users, BookHeart, Globe, Lock } from 'lucide-react';
import type { VisibilityFilter } from '@/features/legacy/api/legacies';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import Footer from '@/components/Footer';
import { useLegacies, useExploreLegacies } from '@/features/legacy/hooks/useLegacies';
import { formatLegacyDates, getLegacyContext } from '@/features/legacy/api/legacies';
import { rewriteBackendUrlForDev } from '@/lib/url';
import FavoriteButton from '@/features/favorites/components/FavoriteButton';
import { useFavoriteCheck } from '@/features/favorites/hooks/useFavorites';

export default function LegaciesPage() {
  const navigate = useNavigate();
  const [visibilityFilter, setVisibilityFilter] = useState<VisibilityFilter>('all');
  const { data: myLegacies, isLoading: myLegaciesLoading } = useLegacies({ enabled: true });
  const { data: exploreLegacies, isLoading: exploreLoading } = useExploreLegacies(20, visibilityFilter);

  const exploreLegacyIds = exploreLegacies?.map((l) => l.id) ?? [];
  const { data: legacyFavoriteData } = useFavoriteCheck('legacy', exploreLegacyIds);

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
      {/* My Legacies */}
      <section className="bg-neutral-50 py-16">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-center justify-between mb-8">
            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-neutral-900">My Legacies</h1>
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

            {!myLegaciesLoading && myLegacies?.map((legacy) => {
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
                <p className="text-sm text-neutral-600 text-center">Honor someone special with a digital legacy</p>
              </div>
            </Card>
          </div>
        </div>
      </section>

      {/* Explore Legacies */}
      <section className="bg-white py-16">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center space-y-3 mb-8">
            <h2 className="text-neutral-900">Explore Legacies</h2>
            <p className="text-neutral-600 max-w-2xl mx-auto">
              Discover public tributes and see how others are celebrating lives
            </p>
          </div>

          <div className="flex justify-center gap-2 mb-8">
            <button
              onClick={() => setVisibilityFilter('all')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors ${
                visibilityFilter === 'all'
                  ? 'bg-theme-primary text-white'
                  : 'border border-neutral-200 hover:border-theme-primary'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setVisibilityFilter('public')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors ${
                visibilityFilter === 'public'
                  ? 'bg-theme-primary text-white'
                  : 'border border-neutral-200 hover:border-theme-primary'
              }`}
            >
              <Globe className="size-4" />
              Public
            </button>
            <button
              onClick={() => setVisibilityFilter('private')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors ${
                visibilityFilter === 'private'
                  ? 'bg-theme-primary text-white'
                  : 'border border-neutral-200 hover:border-theme-primary'
              }`}
            >
              <Lock className="size-4" />
              Private
            </button>
          </div>

          {exploreLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-8 animate-spin text-theme-primary" />
            </div>
          )}

          {!exploreLoading && exploreLegacies && exploreLegacies.length > 0 && (
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {exploreLegacies.map((legacy) => {
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
                        <div className="flex items-center gap-1">
                          <FavoriteButton
                            entityType="legacy"
                            entityId={legacy.id}
                            isFavorited={legacyFavoriteData?.favorites[legacy.id] ?? false}
                            favoriteCount={legacy.favorite_count ?? 0}
                          />
                          <Badge variant="outline" className={contextColors[context] || 'bg-neutral-100 text-neutral-800'}>
                            {contextLabels[context] || context}
                          </Badge>
                        </div>
                      </div>
                      {legacy.biography && (
                        <p className="text-sm text-neutral-600 line-clamp-2">{legacy.biography}</p>
                      )}
                      <div className="flex items-center gap-4 pt-2 text-sm text-neutral-500">
                        <span>{memberCount} {memberCount === 1 ? 'member' : 'members'}</span>
                        <span className="flex items-center gap-1">
                          {legacy.visibility === 'public' ? (
                            <><Globe className="size-3" /> Public</>
                          ) : (
                            <><Lock className="size-3" /> Private</>
                          )}
                        </span>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}

          {!exploreLoading && (!exploreLegacies || exploreLegacies.length === 0) && (
            <div className="text-center py-12">
              <BookHeart className="size-12 mx-auto text-neutral-300 mb-4" />
              <p className="text-neutral-600">No legacies to explore yet.</p>
              <p className="text-sm text-neutral-500 mt-1">Be the first to create a legacy!</p>
            </div>
          )}
        </div>
      </section>

      <Footer />
    </div>
  );
}
