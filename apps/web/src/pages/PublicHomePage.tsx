import { ArrowRight, BookHeart, Sparkles, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import Footer from '@/components/Footer';
import { useExploreLegacies } from '@/features/legacy/hooks/useLegacies';
import { SEOHead, getOrganizationSchema } from '@/components/seo';
import { HeaderSlot } from '@/components/header';
import ThemeSelector from '@/components/ThemeSelector';
import { useTheme } from '@/lib/hooks/useTheme';
import { useAuthModal } from '@/lib/hooks/useAuthModal';
import LegacyCard from '@/components/legacy/LegacyCard';

export default function PublicHomePage() {
  const { currentTheme, setTheme } = useTheme();
  const openAuthModal = useAuthModal((s) => s.open);
  const { data: exploreLegacies, isLoading: exploreLoading } = useExploreLegacies(20);

  return (
    <div className="min-h-screen flex flex-col">
      <SEOHead
        title="Honoring Lives Through Shared Stories"
        description="Create meaningful digital tributes for memorials, retirements, graduations, and living legacies. Preserve memories, share stories, and celebrate what makes each person special."
        path="/"
        ogType="website"
        structuredData={getOrganizationSchema()}
      />
      <HeaderSlot>
        <ThemeSelector currentTheme={currentTheme} onThemeChange={setTheme} />
      </HeaderSlot>

      {/* Hero Section */}
      <section className="max-w-7xl mx-auto px-6 py-20">
        <div className="max-w-3xl mx-auto text-center space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-theme-accent-light border border-theme-accent">
            <Sparkles className="size-4 text-theme-primary" />
            <span className="text-sm text-theme-primary-dark">Digital tributes powered by AI</span>
          </div>
          <h1 className="text-neutral-900">Honor the lives and milestones that matter most</h1>
          <p className="text-neutral-600">
            Create meaningful digital tributes for memorials, retirements, graduations, and living legacies.
            Preserve memories, share stories, and celebrate what makes each person special.
          </p>
          <div className="flex gap-4 justify-center pt-4">
            <Button
              size="lg"
              className="gap-2 bg-theme-primary hover:bg-theme-primary-dark"
              onClick={openAuthModal}
            >
              Create a Legacy
              <ArrowRight className="size-4" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => document.getElementById('explore-legacies')?.scrollIntoView({ behavior: 'smooth' })}
            >
              See Examples
            </Button>
          </div>
        </div>
      </section>

      {/* Explore Legacies */}
      <section id="explore-legacies" className="bg-white py-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center space-y-3 mb-8">
            <h2 className="text-neutral-900">Explore Legacies</h2>
            <p className="text-neutral-600 max-w-2xl mx-auto">
              See how people are creating meaningful tributes for every occasion
            </p>
          </div>

          {exploreLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-8 animate-spin text-theme-primary" />
            </div>
          )}

          {!exploreLoading && exploreLegacies && exploreLegacies.length > 0 && (
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {exploreLegacies.map((legacy) => (
                <LegacyCard key={legacy.id} legacy={legacy} showVisibility />
              ))}
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

      {/* CTA Section */}
      <section className="py-20">
        <div className="max-w-4xl mx-auto px-6">
          <Card className="bg-gradient-to-br from-theme-gradient-from to-theme-gradient-to border border-theme-accent p-12 text-center">
            <div className="space-y-6">
              <h2 className="text-neutral-900">Start creating today</h2>
              <p className="text-neutral-600 max-w-xl mx-auto">
                Whether you&apos;re honoring a loved one, celebrating a milestone, or preserving memories for the future, Mosaic Life helps you tell the story that matters.
              </p>
              <Button size="lg" className="gap-2" onClick={openAuthModal}>
                Create Your First Legacy
                <ArrowRight className="size-4" />
              </Button>
            </div>
          </Card>
        </div>
      </section>

      <Footer />
    </div>
  );
}
