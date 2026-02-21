import { Plus, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useState } from 'react';
import Footer from '@/components/Footer';
import CreateCommunityModal from './CreateCommunityModal';
import { SEOHead } from '@/components/seo';
import { communities } from './communities';
import CommunityHero from './CommunityHero';
import CommunitySearchBar from './CommunitySearchBar';
import CommunityCard from './CommunityCard';
import TrendingTopicsSection from './TrendingTopicsSection';

export default function Community() {
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedTab, setSelectedTab] = useState<'all' | 'joined' | 'discover'>('all');

  const filteredCommunities = communities.filter(community => {
    const matchesSearch = community.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         community.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTab = selectedTab === 'all' ? true :
                      selectedTab === 'joined' ? community.isJoined :
                      !community.isJoined;
    return matchesSearch && matchesTab;
  });

  const joinedCount = communities.filter(c => c.isJoined).length;

  return (
    <div className="min-h-screen bg-[rgb(var(--theme-background))] transition-colors duration-300 flex flex-col">
      <SEOHead
        title="Community"
        description="Connect with others, share experiences, and find support in communities dedicated to honoring life's meaningful moments. Join grief support circles, memorial groups, and celebration communities."
        path="/community"
      />
      <main className="flex-1">
        <CommunityHero />

        {/* Search, Tabs, and Communities Grid */}
        <section className="max-w-7xl mx-auto px-6 py-12">
          <CommunitySearchBar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            selectedTab={selectedTab}
            onTabChange={setSelectedTab}
            joinedCount={joinedCount}
            onCreateClick={() => setIsCreateModalOpen(true)}
          />

          {filteredCommunities.length === 0 ? (
            <Card className="p-12 text-center">
              <Users className="size-12 text-neutral-300 mx-auto mb-4" />
              <h3 className="text-neutral-900 mb-2">No communities found</h3>
              <p className="text-sm text-neutral-600 mb-4">
                Try adjusting your search or create a new community.
              </p>
              <Button onClick={() => setIsCreateModalOpen(true)} className="gap-2">
                <Plus className="size-4" />
                Create Community
              </Button>
            </Card>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredCommunities.map((community) => (
                <CommunityCard key={community.id} community={community} />
              ))}
            </div>
          )}
        </section>

        <TrendingTopicsSection />

        {/* CTA Section */}
        <section className="py-16">
          <div className="max-w-4xl mx-auto px-6">
            <Card className="bg-gradient-to-br from-[rgb(var(--theme-gradient-from))] to-[rgb(var(--theme-gradient-to))] border border-[rgb(var(--theme-accent))] p-12 text-center">
              <div className="space-y-6">
                <Users className="size-12 text-[rgb(var(--theme-primary))] mx-auto" />
                <h2 className="text-neutral-900">Start Your Own Community</h2>
                <p className="text-neutral-600 max-w-xl mx-auto">
                  Create a dedicated space for people to connect around a shared experience, cause, or interest.
                  Whether public or private, your community can be a place of support and connection.
                </p>
                <Button
                  size="lg"
                  className="gap-2 bg-[rgb(var(--theme-primary))] hover:bg-[rgb(var(--theme-primary-dark))]"
                  onClick={() => setIsCreateModalOpen(true)}
                >
                  <Plus className="size-4" />
                  Create Your Community
                </Button>
              </div>
            </Card>
          </div>
        </section>
      </main>

      <Footer />

      <CreateCommunityModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
      />
    </div>
  );
}
