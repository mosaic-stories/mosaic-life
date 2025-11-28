import { Search, Users, Lock, Globe, Plus, BookHeart } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import ThemeSelector from './ThemeSelector';
import UserProfileDropdown from './UserProfileDropdown';
import { useState } from 'react';

interface CommunityMinimalProps {
  onNavigate: (view: string) => void;
  onSelectLegacy: (id: string) => void;
  currentTheme: string;
  onThemeChange: (theme: string) => void;
  user: { name: string; email: string; avatarUrl?: string } | null;
  onAuthClick: () => void;
  onSignOut: () => void;
}

export default function CommunityMinimal({
  onNavigate,
  onSelectLegacy,
  currentTheme,
  onThemeChange,
  user,
  onAuthClick,
  onSignOut
}: CommunityMinimalProps) {
  const [searchQuery, setSearchQuery] = useState('');

  // Mock communities data
  const communities = [
    {
      id: '1',
      name: 'Veterans Memorial',
      description: 'Honoring those who served',
      members: 234,
      tributes: 156,
      isPublic: true
    },
    {
      id: '2',
      name: 'Class of 2020',
      description: 'Celebrating our graduates',
      members: 89,
      tributes: 45,
      isPublic: true
    },
    {
      id: '3',
      name: 'Family Circle',
      description: 'Private family tributes',
      members: 12,
      tributes: 8,
      isPublic: false
    },
    {
      id: '4',
      name: 'Healthcare Heroes',
      description: 'Dedicated caregivers',
      members: 178,
      tributes: 92,
      isPublic: true
    }
  ];

  const filteredCommunities = communities.filter(c =>
    searchQuery === '' || 
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-white to-[rgb(var(--theme-bg))]">
      {/* Navigation */}
      <nav className="border-b bg-white/90 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <button 
            onClick={() => onNavigate('home-minimal')}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <BookHeart className="size-6 text-[rgb(var(--theme-primary))]" />
            <span className="tracking-tight">Mosaic Life</span>
          </button>
          
          <div className="flex items-center gap-4">
            <button 
              onClick={() => onNavigate('my-legacies-minimal')}
              className="text-sm text-neutral-600 hover:text-[rgb(var(--theme-primary))]"
            >
              My Tributes
            </button>
            <button 
              onClick={() => onNavigate('explore-minimal')}
              className="text-sm text-neutral-600 hover:text-[rgb(var(--theme-primary))]"
            >
              Explore
            </button>
            <button
              onClick={() => onNavigate('community')}
              className="text-xs px-3 py-1.5 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-700 transition-colors"
            >
              Full Version
            </button>
            <ThemeSelector currentTheme={currentTheme} onThemeChange={onThemeChange} />
            {user ? (
              <UserProfileDropdown user={user} onNavigate={onNavigate} onSignOut={onSignOut} />
            ) : (
              <Button onClick={onAuthClick} size="sm">Sign In</Button>
            )}
          </div>
        </div>
      </nav>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-neutral-900 mb-2">Communities</h1>
            <p className="text-neutral-600">
              {user ? 'Join groups, share tributes' : 'Browse communities - No sign in required'}
            </p>
          </div>
          <Button 
            onClick={() => user ? undefined : onAuthClick()}
            className="bg-[rgb(var(--theme-primary))] hover:bg-[rgb(var(--theme-primary-dark))] text-white gap-2"
          >
            <Plus className="size-4" />
            {user ? 'New Community' : 'Sign In to Create'}
          </Button>
        </div>

        {/* Search */}
        <div className="bg-white rounded-2xl p-4 border border-[rgb(var(--theme-border))] mb-8">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-neutral-400" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search communities..."
              className="pl-10"
            />
          </div>
        </div>

        {/* Communities Grid */}
        <div className="grid md:grid-cols-2 gap-6">
          {filteredCommunities.map((community) => (
            <div
              key={community.id}
              className="bg-white border border-[rgb(var(--theme-border))] rounded-2xl p-6 hover:border-[rgb(var(--theme-primary))] transition-all hover:shadow-lg"
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-start gap-3">
                  <div className="size-12 rounded-xl bg-[rgb(var(--theme-bg))] flex items-center justify-center">
                    <Users className="size-6 text-[rgb(var(--theme-primary))]" />
                  </div>
                  <div>
                    <h3 className="text-neutral-900 mb-1">{community.name}</h3>
                    <p className="text-sm text-neutral-600">{community.description}</p>
                  </div>
                </div>
                <Badge variant="outline" className="flex items-center gap-1">
                  {community.isPublic ? (
                    <>
                      <Globe className="size-3" />
                      Public
                    </>
                  ) : (
                    <>
                      <Lock className="size-3" />
                      Private
                    </>
                  )}
                </Badge>
              </div>

              {/* Stats */}
              <div className="flex items-center gap-6 mb-4 text-sm text-neutral-600">
                <span className="flex items-center gap-2">
                  <Users className="size-4" />
                  {community.members} members
                </span>
                <span className="flex items-center gap-2">
                  <BookHeart className="size-4" />
                  {community.tributes} tributes
                </span>
              </div>

              {/* Action */}
              <Button 
                size="sm"
                variant="outline"
                className="w-full"
              >
                Join Community
              </Button>
            </div>
          ))}
        </div>

        {/* Empty State */}
        {filteredCommunities.length === 0 && (
          <div className="text-center py-20">
            <div className="size-16 rounded-full bg-[rgb(var(--theme-bg))] flex items-center justify-center mx-auto mb-4">
              <Search className="size-8 text-[rgb(var(--theme-primary))]" />
            </div>
            <p className="text-neutral-600">No communities found</p>
          </div>
        )}

        {/* Info Box */}
        <div className="mt-12 bg-white rounded-2xl p-8 border border-[rgb(var(--theme-border))]">
          <h3 className="text-neutral-900 mb-3">About Communities</h3>
          <ul className="space-y-2 text-sm text-neutral-600">
            <li>• Join communities to connect with others</li>
            <li>• Share tributes within groups</li>
            <li>• Create public or private communities</li>
            <li>• Collaborate on collective memories</li>
          </ul>
        </div>
      </div>
    </div>
  );
}