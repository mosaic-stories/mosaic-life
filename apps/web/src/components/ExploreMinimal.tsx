import { Search, BookHeart, MessageSquare, Image } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import ThemeSelector from './ThemeSelector';
import UserProfileDropdown from './UserProfileDropdown';
import { NotificationBell } from './notifications';
import { legacies } from '../lib/mockData';
import { useState } from 'react';

interface ExploreMinimalProps {
  onNavigate: (view: string) => void;
  onSelectLegacy: (id: string) => void;
  currentTheme: string;
  onThemeChange: (theme: string) => void;
  user: { name: string; email: string; avatarUrl?: string } | null;
  onAuthClick: () => void;
  onSignOut: () => void;
}

export default function ExploreMinimal({
  onNavigate,
  onSelectLegacy,
  currentTheme,
  onThemeChange,
  user,
  onAuthClick,
  onSignOut
}: ExploreMinimalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<string>('all');

  const filters = [
    { id: 'all', label: 'All' },
    { id: 'memorial', label: 'Memorial' },
    { id: 'retirement', label: 'Retirement' },
    { id: 'graduation', label: 'Graduation' },
    { id: 'living-tribute', label: 'Living' }
  ];

  const handleViewLegacy = (id: string) => {
    onSelectLegacy(id);
    onNavigate('profile-minimal');
  };

  // Filter public legacies
  const publicLegacies = legacies.filter(l => 
    (selectedFilter === 'all' || l.context === selectedFilter) &&
    (searchQuery === '' || l.name.toLowerCase().includes(searchQuery.toLowerCase()))
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
              onClick={() => onNavigate('community-minimal')}
              className="text-sm text-neutral-600 hover:text-[rgb(var(--theme-primary))]"
            >
              Communities
            </button>
            <button
              onClick={() => onNavigate('home')}
              className="text-xs px-3 py-1.5 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-700 transition-colors"
            >
              Full Version
            </button>
            <ThemeSelector currentTheme={currentTheme} onThemeChange={onThemeChange} />
            {user ? (
              <>
                <NotificationBell />
                <UserProfileDropdown user={user} onNavigate={onNavigate} onSignOut={onSignOut} />
              </>
            ) : (
              <Button onClick={onAuthClick} size="sm">Sign In</Button>
            )}
          </div>
        </div>
      </nav>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-neutral-900 mb-2">Explore</h1>
          <p className="text-neutral-600">
            {user ? 'Discover public tributes' : 'Browse sample tributes - No sign in required'}
          </p>
        </div>

        {/* Search & Filter */}
        <div className="bg-white rounded-2xl p-6 border border-[rgb(var(--theme-border))] mb-8">
          <div className="flex gap-4 mb-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-neutral-400" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search tributes..."
                className="pl-10"
              />
            </div>
          </div>

          {/* Filters */}
          <div className="flex gap-2 flex-wrap">
            {filters.map(filter => (
              <button
                key={filter.id}
                onClick={() => setSelectedFilter(filter.id)}
                className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                  selectedFilter === filter.id
                    ? 'bg-[rgb(var(--theme-primary))] text-white'
                    : 'border border-[rgb(var(--theme-border))] hover:border-[rgb(var(--theme-primary))]'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        {/* Results */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {publicLegacies.map((legacy) => (
            <button
              key={legacy.id}
              onClick={() => handleViewLegacy(legacy.id)}
              className="bg-white border border-[rgb(var(--theme-border))] rounded-2xl overflow-hidden hover:border-[rgb(var(--theme-primary))] transition-all hover:shadow-lg text-left"
            >
              {/* Image */}
              <div className="aspect-square bg-[rgb(var(--theme-bg))] overflow-hidden">
                <img 
                  src={legacy.profileImage} 
                  alt={legacy.name}
                  className="w-full h-full object-cover"
                />
              </div>

              {/* Info */}
              <div className="p-6">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="text-neutral-900">{legacy.name}</h3>
                  <Badge variant="outline" className="text-xs ml-2">
                    {legacy.context.replace('-', ' ')}
                  </Badge>
                </div>
                <p className="text-sm text-neutral-500 mb-4">{legacy.dates}</p>
                {legacy.tagline && (
                  <p className="text-sm text-neutral-600 mb-4 line-clamp-2">{legacy.tagline}</p>
                )}

                {/* Stats */}
                <div className="flex items-center gap-4 text-xs text-neutral-500">
                  <span className="flex items-center gap-1">
                    <MessageSquare className="size-3" />
                    {legacy.stories?.length || 0}
                  </span>
                  <span className="flex items-center gap-1">
                    <Image className="size-3" />
                    {legacy.media?.length || 0}
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Empty State */}
        {publicLegacies.length === 0 && (
          <div className="text-center py-20">
            <div className="size-16 rounded-full bg-[rgb(var(--theme-bg))] flex items-center justify-center mx-auto mb-4">
              <Search className="size-8 text-[rgb(var(--theme-primary))]" />
            </div>
            <p className="text-neutral-600">No tributes found</p>
          </div>
        )}
      </div>
    </div>
  );
}