import { 
  BookHeart, 
  Plus, 
  Users, 
  Lock, 
  Globe,
  MessageCircle,
  Search,
  Heart,
  Shield,
  Lightbulb,
  Sparkles,
  Clock,
  TrendingUp,
  ArrowRight
} from 'lucide-react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { useState } from 'react';
import ThemeSelector from './ThemeSelector';
import UserProfileDropdown from './UserProfileDropdown';
import Footer from './Footer';
import CreateCommunityModal from './CreateCommunityModal';
import SearchBar from './SearchBar';

interface CommunityProps {
  onNavigate: (view: string) => void;
  onSelectLegacy?: (legacyId: string) => void;
  currentTheme: string;
  onThemeChange: (themeId: string) => void;
  user: { name: string; email: string; avatarUrl?: string } | null;
  onAuthClick: () => void;
  onSignOut: () => void;
}

interface CommunityItem {
  id: string;
  name: string;
  description: string;
  memberCount: number;
  type: 'public' | 'private';
  category: string;
  isJoined: boolean;
  recentActivity: string;
  image?: string;
}

export default function Community({ onNavigate, onSelectLegacy, currentTheme, onThemeChange, user, onAuthClick, onSignOut }: CommunityProps) {
  const handleSearchSelect = (type: string, id: string) => {
    if (type === 'legacy' && onSelectLegacy) {
      onSelectLegacy(id);
    } else if (type === 'community') {
      onNavigate('community');
    } else if (type === 'story' && onSelectLegacy) {
      onSelectLegacy(id);
    }
  };
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedTab, setSelectedTab] = useState<'all' | 'joined' | 'discover'>('all');

  // Mock communities data
  const communities: CommunityItem[] = [
    {
      id: '1',
      name: 'Remembering Our Veterans',
      description: 'A space to honor and share stories of military veterans and their service to our country.',
      memberCount: 342,
      type: 'public',
      category: 'Memorial',
      isJoined: true,
      recentActivity: '2 hours ago',
      image: '🎖️'
    },
    {
      id: '2',
      name: 'Celebrating Teachers',
      description: 'Share stories about educators who made a difference in your life or the lives of others.',
      memberCount: 189,
      type: 'public',
      category: 'Tribute',
      isJoined: true,
      recentActivity: '4 hours ago',
      image: '📚'
    },
    {
      id: '3',
      name: 'Grief Support Circle',
      description: 'A private, compassionate space for those navigating loss. Share your journey and find comfort.',
      memberCount: 127,
      type: 'private',
      category: 'Support',
      isJoined: true,
      recentActivity: '1 hour ago',
      image: '🕊️'
    },
    {
      id: '4',
      name: 'Retirement Stories',
      description: 'Celebrate career milestones and share wisdom from decades of professional experience.',
      memberCount: 256,
      type: 'public',
      category: 'Celebration',
      isJoined: false,
      recentActivity: '5 hours ago',
      image: '🎉'
    },
    {
      id: '5',
      name: 'Preserving Family History',
      description: 'Tips, tools, and stories for documenting your family legacy for future generations.',
      memberCount: 423,
      type: 'public',
      category: 'Learning',
      isJoined: false,
      recentActivity: '3 hours ago',
      image: '👨‍👩‍👧‍👦'
    },
    {
      id: '6',
      name: 'Cancer Warriors Memorial',
      description: 'Private community honoring those who fought cancer. Share memories and support each other.',
      memberCount: 94,
      type: 'private',
      category: 'Support',
      isJoined: false,
      recentActivity: '6 hours ago',
      image: '💜'
    },
    {
      id: '7',
      name: 'Grandparent Stories',
      description: 'Share the wisdom, humor, and love of grandparents—the keepers of family traditions.',
      memberCount: 512,
      type: 'public',
      category: 'Memorial',
      isJoined: true,
      recentActivity: '30 minutes ago',
      image: '👴'
    },
    {
      id: '8',
      name: 'First Responders Tribute',
      description: 'Honoring police officers, firefighters, EMTs, and all who serve their communities.',
      memberCount: 276,
      type: 'public',
      category: 'Tribute',
      isJoined: false,
      recentActivity: '2 hours ago',
      image: '🚒'
    }
  ];

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
      {/* Header */}
      <header className="bg-white/90 backdrop-blur-sm border-b sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <button 
              onClick={() => onNavigate('home')}
              className="flex items-center gap-2 hover:opacity-80 transition-opacity flex-shrink-0"
            >
              <BookHeart className="size-6 text-[rgb(var(--theme-primary))]" />
              <span className="tracking-tight text-neutral-900">Mosaic Life</span>
            </button>

            <div className="flex-1 max-w-md hidden md:block">
              <SearchBar onSelectResult={handleSearchSelect} compact />
            </div>
            
            <div className="flex items-center gap-6 flex-shrink-0">
              <nav className="hidden md:flex items-center gap-4">
                <button 
                  onClick={() => onNavigate('home')}
                  className="text-neutral-600 hover:text-neutral-900 transition-colors"
                >
                  Home
                </button>
                <button 
                  onClick={() => onNavigate('about')}
                  className="text-neutral-600 hover:text-neutral-900 transition-colors"
                >
                  About
                </button>
                <button 
                  onClick={() => onNavigate('how-it-works')}
                  className="text-neutral-600 hover:text-neutral-900 transition-colors"
                >
                  How It Works
                </button>
                <button 
                  onClick={() => onNavigate('community')}
                  className="text-neutral-900"
                >
                  Community
                </button>
              </nav>
              <div className="flex items-center gap-3">
                <ThemeSelector currentTheme={currentTheme} onThemeChange={onThemeChange} />
                {user ? (
                  <UserProfileDropdown user={user} onNavigate={onNavigate} onSignOut={onSignOut} />
                ) : (
                  <Button size="sm" onClick={onAuthClick}>Sign In</Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="bg-gradient-to-br from-[rgb(var(--theme-gradient-from))] to-[rgb(var(--theme-gradient-to))] py-12">
          <div className="max-w-7xl mx-auto px-6">
            <div className="text-center space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/80 backdrop-blur-sm border border-[rgb(var(--theme-accent))]">
                <Users className="size-4 text-[rgb(var(--theme-primary))]" />
                <span className="text-sm text-[rgb(var(--theme-primary-dark))]">Connect & Support</span>
              </div>
              <h1 className="text-neutral-900">Community</h1>
              <p className="text-neutral-600 max-w-2xl mx-auto text-lg">
                Connect with others, share experiences, and find support in spaces dedicated to honoring life's meaningful moments.
              </p>
            </div>
          </div>
        </section>

        {/* Community Guidelines */}
        <section className="max-w-7xl mx-auto px-6 -mt-6 relative z-10">
          <Card className="p-6 md:p-8 bg-white shadow-lg border-2 border-[rgb(var(--theme-accent))]">
            <div className="flex items-start gap-4">
              <div className="size-12 rounded-full bg-[rgb(var(--theme-accent-light))] flex items-center justify-center flex-shrink-0">
                <Shield className="size-6 text-[rgb(var(--theme-primary))]" />
              </div>
              <div className="flex-1 space-y-4">
                <div>
                  <h2 className="text-neutral-900 mb-2">Community Guidelines</h2>
                  <p className="text-sm text-neutral-600">
                    Our community is built on compassion and mutual support. Please follow these guidelines to keep this a safe, welcoming space for everyone.
                  </p>
                </div>
                
                <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="flex items-start gap-3 p-4 rounded-lg bg-red-50 border border-red-100">
                    <Heart className="size-5 text-red-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-sm text-neutral-900 mb-1">Respect</h4>
                      <p className="text-xs text-neutral-600 leading-relaxed">
                        Respect others' space and privacy. Don't be rude, insensitive, mean, or mocking.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-4 rounded-lg bg-blue-50 border border-blue-100">
                    <Lightbulb className="size-5 text-blue-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-sm text-neutral-900 mb-1">Understanding</h4>
                      <p className="text-xs text-neutral-600 leading-relaxed">
                        People may be going through difficult times. Don't bother them or make them uncomfortable.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-4 rounded-lg bg-green-50 border border-green-100">
                    <Sparkles className="size-5 text-green-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-sm text-neutral-900 mb-1">Kindness</h4>
                      <p className="text-xs text-neutral-600 leading-relaxed">
                        Always be kind. A little compassion goes a long way in supporting others.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-4 rounded-lg bg-purple-50 border border-purple-100">
                    <MessageCircle className="size-5 text-purple-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-sm text-neutral-900 mb-1">Language</h4>
                      <p className="text-xs text-neutral-600 leading-relaxed">
                        Do not use hateful, insensitive, or profane language. Keep discussions respectful.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </section>

        {/* Search and Create */}
        <section className="max-w-7xl mx-auto px-6 py-12">
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between mb-8">
            <div className="relative flex-1 w-full max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-5 text-neutral-400" />
              <Input
                placeholder="Search communities..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button 
              onClick={() => setIsCreateModalOpen(true)}
              className="gap-2 bg-[rgb(var(--theme-primary))] hover:bg-[rgb(var(--theme-primary-dark))] w-full md:w-auto"
            >
              <Plus className="size-4" />
              Create Community
            </Button>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 mb-6 border-b">
            <button
              onClick={() => setSelectedTab('all')}
              className={`px-4 py-2 border-b-2 transition-colors ${
                selectedTab === 'all'
                  ? 'border-[rgb(var(--theme-primary))] text-[rgb(var(--theme-primary))]'
                  : 'border-transparent text-neutral-600 hover:text-neutral-900'
              }`}
            >
              All Communities
            </button>
            <button
              onClick={() => setSelectedTab('joined')}
              className={`px-4 py-2 border-b-2 transition-colors ${
                selectedTab === 'joined'
                  ? 'border-[rgb(var(--theme-primary))] text-[rgb(var(--theme-primary))]'
                  : 'border-transparent text-neutral-600 hover:text-neutral-900'
              }`}
            >
              My Communities ({joinedCount})
            </button>
            <button
              onClick={() => setSelectedTab('discover')}
              className={`px-4 py-2 border-b-2 transition-colors ${
                selectedTab === 'discover'
                  ? 'border-[rgb(var(--theme-primary))] text-[rgb(var(--theme-primary))]'
                  : 'border-transparent text-neutral-600 hover:text-neutral-900'
              }`}
            >
              Discover
            </button>
          </div>

          {/* Communities Grid */}
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
                <Card 
                  key={community.id} 
                  className="p-6 space-y-4 hover:shadow-lg transition-all cursor-pointer group"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="size-12 rounded-lg bg-[rgb(var(--theme-accent-light))] flex items-center justify-center text-2xl">
                        {community.image}
                      </div>
                      <div>
                        <h3 className="text-neutral-900 group-hover:text-[rgb(var(--theme-primary))] transition-colors">
                          {community.name}
                        </h3>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="secondary" className="text-xs">
                            {community.category}
                          </Badge>
                          {community.type === 'private' ? (
                            <Lock className="size-3 text-neutral-400" />
                          ) : (
                            <Globe className="size-3 text-neutral-400" />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <p className="text-sm text-neutral-600 leading-relaxed line-clamp-2">
                    {community.description}
                  </p>

                  <div className="flex items-center justify-between pt-2 border-t">
                    <div className="flex items-center gap-4 text-xs text-neutral-500">
                      <div className="flex items-center gap-1">
                        <Users className="size-3" />
                        <span>{community.memberCount} members</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="size-3" />
                        <span>{community.recentActivity}</span>
                      </div>
                    </div>
                  </div>

                  {community.isJoined ? (
                    <Button variant="outline" size="sm" className="w-full gap-2">
                      <MessageCircle className="size-4" />
                      View Discussions
                    </Button>
                  ) : (
                    <Button 
                      size="sm" 
                      className="w-full gap-2 bg-[rgb(var(--theme-primary))] hover:bg-[rgb(var(--theme-primary-dark))]"
                    >
                      {community.type === 'private' ? 'Request to Join' : 'Join Community'}
                      <ArrowRight className="size-4" />
                    </Button>
                  )}
                </Card>
              ))}
            </div>
          )}
        </section>

        {/* Featured Section */}
        <section className="bg-white py-16">
          <div className="max-w-7xl mx-auto px-6">
            <div className="flex items-center gap-2 mb-8">
              <TrendingUp className="size-5 text-[rgb(var(--theme-primary))]" />
              <h2 className="text-neutral-900">Trending Topics</h2>
            </div>
            
            <div className="grid md:grid-cols-3 gap-6">
              <Card className="p-6 space-y-3">
                <div className="text-3xl">💭</div>
                <h3 className="text-neutral-900">How to start a difficult conversation</h3>
                <p className="text-sm text-neutral-600">
                  Tips for talking about end-of-life planning with loved ones.
                </p>
                <div className="flex items-center gap-2 text-xs text-neutral-500">
                  <MessageCircle className="size-3" />
                  <span>143 replies</span>
                </div>
              </Card>

              <Card className="p-6 space-y-3">
                <div className="text-3xl">📸</div>
                <h3 className="text-neutral-900">Best practices for digitizing old photos</h3>
                <p className="text-sm text-neutral-600">
                  Community members share their favorite tools and techniques.
                </p>
                <div className="flex items-center gap-2 text-xs text-neutral-500">
                  <MessageCircle className="size-3" />
                  <span>89 replies</span>
                </div>
              </Card>

              <Card className="p-6 space-y-3">
                <div className="text-3xl">✍️</div>
                <h3 className="text-neutral-900">Writing through grief</h3>
                <p className="text-sm text-neutral-600">
                  How storytelling helps in the healing process.
                </p>
                <div className="flex items-center gap-2 text-xs text-neutral-500">
                  <MessageCircle className="size-3" />
                  <span>201 replies</span>
                </div>
              </Card>
            </div>
          </div>
        </section>

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

      <Footer onNavigate={onNavigate} />
      
      <CreateCommunityModal 
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onNavigate={onNavigate}
      />
    </div>
  );
}
